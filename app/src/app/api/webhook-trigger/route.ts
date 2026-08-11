import { NextRequest, NextResponse } from 'next/server'
import {
  hasuraAdminQuery,
  checkAndIncrementQuota,
  incrementQuota,
  updateStepRun,
  updateWorkflowRun,
  callLLM,
  callHttpRequest,
  callDbWrite,
  callNotify,
  evaluateCondition,
} from '@/lib/workflow-engine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { input, workflow_id: queryWorkflowId, secret: querySecret } = body

    const workflowId = input?.workflow_id || queryWorkflowId || body.workflow_id
    const secret = input?.secret || querySecret || body.secret || req.headers.get('x-webhook-secret')
    const payload = input?.payload ? JSON.parse(input.payload) : (body.payload || body)

    if (!workflowId) {
      return NextResponse.json({ message: 'Missing workflow_id' }, { status: 400 })
    }

    // ── 1. Fetch workflow trigger config & check secret ────────────
    const data = await hasuraAdminQuery(`
      query GetWebhookTrigger($workflow_id: uuid!) {
        workflows_by_pk(id: $workflow_id) {
          id
          org_id
          is_active
          triggers(where: { trigger_type: { _eq: "webhook" }, is_active: { _eq: true } }) {
            id
            config
          }
          steps(order_by: { order_index: asc }) {
            id name type config order_index
          }
        }
      }
    `, { workflow_id: workflowId })

    const workflow = data.workflows_by_pk
    if (!workflow || !workflow.is_active) {
      return NextResponse.json({ message: 'Workflow not found or inactive' }, { status: 404 })
    }

    const trigger = workflow.triggers[0]
    if (!trigger) {
      return NextResponse.json({ message: 'Webhook trigger not configured or active for this workflow' }, { status: 400 })
    }

    const expectedSecret = trigger.config?.secret || process.env.WEBHOOK_SECRET
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ message: 'Invalid webhook secret' }, { status: 401 })
    }

    // ── 2. Quota check ─────────────────────────────────────────────
    await checkAndIncrementQuota(workflow.org_id)

    // ── 3. Create workflow_run ──────────────────────────────────────
    const runData = await hasuraAdminQuery(`
      mutation CreateWebhookRun($workflow_id: uuid!, $payload: jsonb) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflow_id
          status: "running"
          trigger_type: "webhook"
          trigger_payload: $payload
          current_step_index: 0
        }) { id }
      }
    `, { workflow_id: workflowId, payload })

    const workflowRunId = runData.insert_workflow_runs_one.id

    // ── 4. Create step runs & execute ──────────────────────────────
    const steps = workflow.steps
    const stepRunsData = await hasuraAdminQuery(`
      mutation CreateWebhookStepRuns($objects: [step_runs_insert_input!]!) {
        insert_step_runs(objects: $objects) {
          returning { id workflow_step_id }
        }
      }
    `, {
      objects: steps.map((s: any) => ({
        workflow_run_id: workflowRunId,
        workflow_step_id: s.id,
        status: 'pending',
      })),
    })

    const stepRuns: { id: string; workflow_step_id: string }[] =
      stepRunsData.insert_step_runs.returning

    let prevOutput = payload

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const stepRun = stepRuns.find((sr) => sr.workflow_step_id === step.id)!

      await updateWorkflowRun(workflowRunId, { current_step_index: i })
      await updateStepRun(stepRun.id, {
        status: 'running',
        input: prevOutput,
        started_at: new Date().toISOString(),
      })

      if (step.type === 'approval_gate') {
        await updateStepRun(stepRun.id, { status: 'paused', input: prevOutput })
        await updateWorkflowRun(workflowRunId, { status: 'paused' })
        return NextResponse.json({
          workflow_run_id: workflowRunId,
          status: 'paused',
          message: `Webhook run paused at approval gate: "${step.name}"`,
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
              await updateStepRun(stepRun.id, {
                status: 'completed',
                output,
                completed_at: new Date().toISOString(),
              })
              await updateWorkflowRun(workflowRunId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              await incrementQuota(workflow.org_id)
              return NextResponse.json({
                workflow_run_id: workflowRunId,
                status: 'completed',
                message: 'Webhook trigger completed (branch skipped remaining steps)',
              })
            }
            break
          }
        }

        await updateStepRun(stepRun.id, {
          status: 'completed',
          output,
          completed_at: new Date().toISOString(),
        })
        prevOutput = output
      } catch (err: any) {
        await updateStepRun(stepRun.id, {
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        })
        await updateWorkflowRun(workflowRunId, {
          status: 'failed',
          error: err.message,
          completed_at: new Date().toISOString(),
        })
        return NextResponse.json({
          workflow_run_id: workflowRunId,
          status: 'failed',
          message: err.message,
        })
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
      message: 'Webhook workflow run started and completed',
    })
  } catch (err: any) {
    console.error('[webhook-trigger] error:', err)
    return NextResponse.json({ message: err.message }, { status: 500 })
  }
}
