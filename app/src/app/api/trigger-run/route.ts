import { NextRequest, NextResponse } from 'next/server'
import {
  hasuraAdminQuery,
  verifyOrgMembership,
  checkAndIncrementQuota,
  incrementQuota,
  updateStepRun,
  updateWorkflowRun,
  callLLM,
  callHttpRequest,
  callDbWrite,
  callNotify,
  evaluateCondition,
  getUserIdFromHeader,
  sleep,
} from '@/lib/workflow-engine'

export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse Hasura Action payload ──────────────────────────
    const body = await req.json()
    const { input, session_variables } = body
    const { workflow_id, payload } = input

    const userId =
      session_variables?.['x-hasura-user-id'] ||
      getUserIdFromHeader(req.headers.get('authorization'))

    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // ── 2. Layer 1: Verify org membership + role ─────────────────
    const { workflow, role } = await verifyOrgMembership(userId, workflow_id)

    if (role === 'viewer') {
      return NextResponse.json(
        { message: 'Viewers cannot trigger workflow runs' },
        { status: 403 }
      )
    }

    // ── 3. Check quota ───────────────────────────────────────────
    await checkAndIncrementQuota(workflow.org_id)

    // ── 4. Load workflow steps ───────────────────────────────────
    const stepsData = await hasuraAdminQuery(`
      query GetSteps($workflow_id: uuid!) {
        workflow_steps(
          where: { workflow_id: { _eq: $workflow_id } }
          order_by: { order_index: asc }
        ) {
          id name type config order_index
        }
      }
    `, { workflow_id })

    const steps = stepsData.workflow_steps

    // ── 5. Create workflow_run ────────────────────────────────────
    const runData = await hasuraAdminQuery(`
      mutation CreateRun($workflow_id: uuid!, $triggered_by: uuid!, $payload: jsonb) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflow_id
          status: "running"
          triggered_by: $triggered_by
          trigger_type: "manual"
          trigger_payload: $payload
          current_step_index: 0
        }) { id }
      }
    `, {
      workflow_id,
      triggered_by: userId,
      payload: payload ? JSON.parse(payload) : {},
    })

    const workflowRunId = runData.insert_workflow_runs_one.id

    // ── 6. Create step_runs (all pending) ────────────────────────
    const stepRunsData = await hasuraAdminQuery(`
      mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
        insert_step_runs(objects: $objects) {
          returning { id workflow_step_id }
        }
      }
    `, {
      objects: steps.map((s: any) => ({
        workflow_run_id: workflowRunId,
        workflow_step_id: s.id,
        status: 'pending',
        input: {},
        output: {},
      })),
    })

    const stepRuns: { id: string; workflow_step_id: string }[] =
      stepRunsData.insert_step_runs.returning

    // ── 7. Execute steps sequentially ────────────────────────────
    let prevOutput: any = payload ? JSON.parse(payload) : {}

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const stepRun = stepRuns.find((sr) => sr.workflow_step_id === step.id)!

      // Update workflow run current step
      await updateWorkflowRun(workflowRunId, { current_step_index: i })

      // Mark step as running
      await updateStepRun(stepRun.id, {
        status: 'running',
        input: prevOutput,
        started_at: new Date().toISOString(),
        attempt_count: 1,
      })

      // ── Layer 2: step-type permission gating ──────────────────
      if (['db_write', 'notify'].includes(step.type) && role !== 'owner') {
        await updateStepRun(stepRun.id, {
          status: 'failed',
          error: `Step type "${step.type}" requires owner role`,
          completed_at: new Date().toISOString(),
        })
        await updateWorkflowRun(workflowRunId, {
          status: 'failed',
          error: `Insufficient permissions for step type: ${step.type}`,
          completed_at: new Date().toISOString(),
        })
        return NextResponse.json({
          workflow_run_id: workflowRunId,
          status: 'failed',
          message: `Step "${step.name}" requires owner role`,
        })
      }

      // ── approval_gate: pause here ──────────────────────────────
      if (step.type === 'approval_gate') {
        await updateStepRun(stepRun.id, {
          status: 'paused',
          input: prevOutput,
        })
        await updateWorkflowRun(workflowRunId, { status: 'paused' })

        return NextResponse.json({
          workflow_run_id: workflowRunId,
          status: 'paused',
          message: `Run paused at approval gate: "${step.name}". Awaiting approval.`,
        })
      }

      // ── Execute step ──────────────────────────────────────────
      try {
        let output: any

        switch (step.type) {
          case 'llm_call':
            output = await callLLM(step.config, prevOutput)
            break
          case 'http_request':
            output = await callHttpRequest(step.config, prevOutput)
            break
          case 'db_write':
            output = await callDbWrite(step.config, prevOutput)
            break
          case 'notify':
            output = await callNotify(step.config, prevOutput)
            break
          case 'conditional_branch': {
            const branch = evaluateCondition(step.config, prevOutput)
            output = { branch, condition_met: branch === 'true', prev: prevOutput }
            // If branch is false and step has skip_on_false, skip remaining
            if (branch === 'false' && step.config.skip_remaining_on_false) {
              await updateStepRun(stepRun.id, {
                status: 'completed',
                output,
                completed_at: new Date().toISOString(),
              })
              // Skip all remaining steps
              for (let j = i + 1; j < steps.length; j++) {
                const futureStepRun = stepRuns.find((sr) => sr.workflow_step_id === steps[j].id)
                if (futureStepRun) {
                  await updateStepRun(futureStepRun.id, { status: 'skipped' })
                }
              }
              await updateWorkflowRun(workflowRunId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              await incrementQuota(workflow.org_id)
              return NextResponse.json({
                workflow_run_id: workflowRunId,
                status: 'completed',
                message: 'Workflow completed (branch skipped remaining steps)',
              })
            }
            break
          }
          default:
            throw new Error(`Unknown step type: ${step.type}`)
        }

        await updateStepRun(stepRun.id, {
          status: 'completed',
          output,
          completed_at: new Date().toISOString(),
        })

        prevOutput = output
      } catch (err: any) {
        // Retry logic (attempt_count tracked)
        const maxAttempts = 3
        let attempt = 1
        let succeeded = false
        let lastError = err.message

        while (attempt < maxAttempts && !succeeded) {
          attempt++
          await updateStepRun(stepRun.id, { status: 'retrying', attempt_count: attempt })
          await sleep(1000 * attempt)

          try {
            let output: any
            if (step.type === 'llm_call') output = await callLLM(step.config, prevOutput, attempt)
            else if (step.type === 'http_request') output = await callHttpRequest(step.config, prevOutput, attempt)
            else throw new Error(lastError)

            await updateStepRun(stepRun.id, {
              status: 'completed',
              output,
              attempt_count: attempt,
              completed_at: new Date().toISOString(),
            })
            prevOutput = output
            succeeded = true
          } catch (retryErr: any) {
            lastError = retryErr.message
          }
        }

        if (!succeeded) {
          await updateStepRun(stepRun.id, {
            status: 'failed',
            error: lastError,
            attempt_count: attempt,
            completed_at: new Date().toISOString(),
          })
          await updateWorkflowRun(workflowRunId, {
            status: 'failed',
            error: `Step "${step.name}" failed: ${lastError}`,
            completed_at: new Date().toISOString(),
          })
          return NextResponse.json({
            workflow_run_id: workflowRunId,
            status: 'failed',
            message: `Step "${step.name}" failed after ${attempt} attempts: ${lastError}`,
          })
        }
      }
    }

    // ── 8. Mark run completed + increment quota ───────────────────
    await updateWorkflowRun(workflowRunId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    await incrementQuota(workflow.org_id)

    return NextResponse.json({
      workflow_run_id: workflowRunId,
      status: 'completed',
      message: 'Workflow completed successfully',
    })
  } catch (err: any) {
    console.error('[trigger-run] error:', err)
    return NextResponse.json(
      { message: err.message || 'Internal server error' },
      { status: err.message?.includes('denied') ? 403 : 500 }
    )
  }
}
