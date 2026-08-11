import { NextRequest, NextResponse } from 'next/server'
import {
  hasuraAdminQuery,
  verifyOrgMembership,
  updateStepRun,
  updateWorkflowRun,
  callLLM,
  callHttpRequest,
  callDbWrite,
  callNotify,
  evaluateCondition,
  getUserIdFromHeader,
  incrementQuota,
  sleep,
} from '@/lib/workflow-engine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { input, session_variables } = body
    const { step_run_id, comment } = input

    const userId =
      session_variables?.['x-hasura-user-id'] ||
      getUserIdFromHeader(req.headers.get('authorization'))

    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. Fetch step_run, workflow_run, workflow, and all steps ──
    const data = await hasuraAdminQuery(`
      query GetStepRunContext($step_run_id: uuid!) {
        step_runs_by_pk(id: $step_run_id) {
          id
          status
          input
          workflow_step_id
          workflow_run {
            id
            workflow_id
            status
            workflow {
              id
              org_id
              steps(order_by: { order_index: asc }) {
                id name type config order_index
              }
            }
            step_runs(order_by: { workflow_step: { order_index: asc } }) {
              id workflow_step_id status input output
            }
          }
        }
      }
    `, { step_run_id })

    const stepRun = data.step_runs_by_pk
    if (!stepRun) {
      return NextResponse.json({ message: 'Step run not found' }, { status: 404 })
    }

    if (stepRun.status !== 'paused') {
      return NextResponse.json(
        { message: `Step run is not paused (current status: ${stepRun.status})` },
        { status: 400 }
      )
    }

    const workflowRun = stepRun.workflow_run
    const workflow = workflowRun.workflow

    // ── 2. Layer 2 Permission Check: Verify approver is owner/editor in org ──
    const { role } = await verifyOrgMembership(userId, workflow.id)
    if (role === 'viewer') {
      return NextResponse.json(
        { message: 'Access denied: Viewers cannot approve workflow steps' },
        { status: 403 }
      )
    }

    // ── 3. Mark the approval gate step completed ──────────────────
    await updateStepRun(step_run_id, {
      status: 'completed',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      output: { approved: true, comment: comment || 'Approved', approved_by: userId },
      completed_at: new Date().toISOString(),
    })

    // ── 4. Resume workflow execution from the next step ───────────
    const steps = workflow.steps
    const currentStepIndex = steps.findIndex(
      (s: any) => s.id === stepRun.workflow_step_id
    )

    let prevOutput = { approved: true, comment: comment || 'Approved' }
    let runCompleted = true

    for (let i = currentStepIndex + 1; i < steps.length; i++) {
      const step = steps[i]
      const existingStepRun = workflowRun.step_runs.find(
        (sr: any) => sr.workflow_step_id === step.id
      )

      const activeStepRunId = existingStepRun ? existingStepRun.id : (
        await hasuraAdminQuery(`
          mutation InsertStepRun($object: step_runs_insert_input!) {
            insert_step_runs_one(object: $object) { id }
          }
        `, {
          object: {
            workflow_run_id: workflowRun.id,
            workflow_step_id: step.id,
            status: 'pending',
          }
        })
      ).insert_step_runs_one.id

      await updateWorkflowRun(workflowRun.id, { current_step_index: i, status: 'running' })
      await updateStepRun(activeStepRunId, {
        status: 'running',
        input: prevOutput,
        started_at: new Date().toISOString(),
      })

      // Layer 2 check for privileged step types
      if (['db_write', 'notify'].includes(step.type) && role !== 'owner') {
        await updateStepRun(activeStepRunId, {
          status: 'failed',
          error: `Step type "${step.type}" requires owner role`,
          completed_at: new Date().toISOString(),
        })
        await updateWorkflowRun(workflowRun.id, {
          status: 'failed',
          error: `Insufficient permissions for step type: ${step.type}`,
          completed_at: new Date().toISOString(),
        })
        return NextResponse.json({
          step_run_id,
          status: 'failed',
          message: `Step "${step.name}" requires owner role`,
        })
      }

      // Next approval gate hit
      if (step.type === 'approval_gate') {
        await updateStepRun(activeStepRunId, {
          status: 'paused',
          input: prevOutput,
        })
        await updateWorkflowRun(workflowRun.id, { status: 'paused' })
        runCompleted = false
        return NextResponse.json({
          step_run_id: activeStepRunId,
          status: 'paused',
          message: `Run resumed and paused at subsequent approval gate: "${step.name}"`,
        })
      }

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
            if (branch === 'false' && step.config.skip_remaining_on_false) {
              await updateStepRun(activeStepRunId, {
                status: 'completed',
                output,
                completed_at: new Date().toISOString(),
              })
              await updateWorkflowRun(workflowRun.id, {
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              await incrementQuota(workflow.org_id)
              return NextResponse.json({
                step_run_id,
                status: 'completed',
                message: 'Step approved and workflow finished (branch skipped remaining steps)',
              })
            }
            break
          }
        }

        await updateStepRun(activeStepRunId, {
          status: 'completed',
          output,
          completed_at: new Date().toISOString(),
        })
        prevOutput = output
      } catch (err: any) {
        await updateStepRun(activeStepRunId, {
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        })
        await updateWorkflowRun(workflowRun.id, {
          status: 'failed',
          error: `Step "${step.name}" failed: ${err.message}`,
          completed_at: new Date().toISOString(),
        })
        return NextResponse.json({
          step_run_id,
          status: 'failed',
          message: `Step "${step.name}" failed: ${err.message}`,
        })
      }
    }

    if (runCompleted) {
      await updateWorkflowRun(workflowRun.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      await incrementQuota(workflow.org_id)
    }

    return NextResponse.json({
      step_run_id,
      status: 'approved',
      message: 'Step approved and workflow execution resumed successfully',
    })
  } catch (err: any) {
    console.error('[approve-step] error:', err)
    return NextResponse.json(
      { message: err.message || 'Internal server error' },
      { status: err.message?.includes('denied') ? 403 : 500 }
    )
  }
}
