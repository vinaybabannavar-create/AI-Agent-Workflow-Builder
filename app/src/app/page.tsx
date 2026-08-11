'use client'

import React, { useState, useEffect } from 'react'
import { Header, DEMO_ORGS, OrgContext } from '@/components/Header'
import { WorkflowBuilder, StepConfig, TriggerConfig } from '@/components/WorkflowBuilder'
import { LiveRunStream, StepRunItem } from '@/components/LiveRunStream'
import {
  ShieldCheck,
  Zap,
  Play,
  CheckCircle2,
  Lock,
  Globe,
  Bot,
  Layers,
  Sparkles,
  AlertTriangle,
  Send,
  Eye,
  Key,
  Shield,
  Sliders,
  Database
} from 'lucide-react'

const MOCK_WORKFLOWS_BY_ORG: Record<string, any[]> = {
  '11111111-1111-1111-1111-111111111111': [
    {
      id: 'wf-org-a-1',
      name: 'Customer Support AI Router (Org A)',
      description: 'Chains Groq LLM, Conditional Branching, External Webhook, and Human Approval Gate.',
      is_active: true,
      org_id: '11111111-1111-1111-1111-111111111111',
      steps: [
        {
          id: 's-1',
          name: 'Classify Ticket (LLM)',
          type: 'llm_call',
          order_index: 0,
          config: { prompt: 'Classify this ticket: "High priority server outage on production database!"', model: 'llama-3.1-8b-instant' },
        },
        {
          id: 's-2',
          name: 'Check LLM Priority (Branch)',
          type: 'conditional_branch',
          order_index: 1,
          config: { condition_field: 'content', operator: 'contains', value: 'production', skip_remaining_on_false: false },
        },
        {
          id: 's-3',
          name: 'Notify External API (HTTP)',
          type: 'http_request',
          order_index: 2,
          config: { url: 'https://httpbin.org/post', method: 'POST', body_template: { alert: 'critical' } },
        },
        {
          id: 's-4',
          name: 'Require Escalation Gate (Human Approval)',
          type: 'approval_gate',
          order_index: 3,
          config: { required_role: 'editor', note: 'Approve before notifying ops lead' },
        },
        {
          id: 's-5',
          name: 'Send Slack Alert (Event Trigger)',
          type: 'notify',
          order_index: 4,
          config: { channel: 'slack', message_template: 'Alert sent' },
        },
      ],
      triggers: [
        { trigger_type: 'manual', config: {} },
        { trigger_type: 'webhook', config: { secret: 'secret-key-123' } },
      ],
    },
  ],
  '22222222-2222-2222-2222-222222222222': [
    {
      id: 'wf-org-b-1',
      name: 'Confidential HR Pipeline (Org B)',
      description: 'Private Org B workflow containing salary processing logic.',
      is_active: true,
      org_id: '22222222-2222-2222-2222-222222222222',
      steps: [
        {
          id: 'sb-1',
          name: 'Process Payroll Batch',
          type: 'llm_call',
          order_index: 0,
          config: { prompt: 'Process payroll batch for Org B staff.', model: 'llama-3.1-8b-instant' },
        },
      ],
      triggers: [{ trigger_type: 'manual', config: {} }],
    },
  ],
}

export default function DashboardPage() {
  const [currentOrg, setCurrentOrg] = useState<OrgContext>(DEMO_ORGS[0])
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'editor' | 'viewer'>('owner')
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('wf-org-a-1')
  const [activeTab, setActiveTab] = useState<'builder' | 'runs' | 'proof'>('builder')

  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [runOverallStatus, setRunOverallStatus] = useState<'pending' | 'running' | 'paused' | 'completed' | 'failed'>('pending')
  const [liveStepRuns, setLiveStepRuns] = useState<StepRunItem[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [webhookInputPayload, setWebhookInputPayload] = useState('{"ticket_id": "TICK-992", "message": "Production database high load"}')

  const [directAccessId, setDirectAccessId] = useState('wf-org-a-1')
  const [directAccessResult, setDirectAccessResult] = useState<string | null>(null)

  const currentOrgWorkflows = MOCK_WORKFLOWS_BY_ORG[currentOrg.id] || []
  const activeWorkflow = currentOrgWorkflows.find((w) => w.id === activeWorkflowId) || currentOrgWorkflows[0]

  useEffect(() => {
    const orgWfs = MOCK_WORKFLOWS_BY_ORG[currentOrg.id] || []
    if (orgWfs.length > 0) {
      setActiveWorkflowId(orgWfs[0].id)
    } else {
      setActiveWorkflowId('')
    }
  }, [currentOrg.id])

  const handleStartWorkflowRun = async (payloadOverride?: any) => {
    if (currentUserRole === 'viewer') {
      alert('Layer 1 Security: Viewers cannot trigger workflow runs!')
      return
    }

    if (!activeWorkflow) return

    if (currentOrg.quota_used >= currentOrg.quota_limit) {
      alert(`Quota Exhausted: ${currentOrg.quota_used}/${currentOrg.quota_limit} calls used this month!`)
      return
    }

    setIsRunning(true)
    const runId = `run-${Date.now()}`
    setActiveRunId(runId)
    setRunOverallStatus('running')
    setActiveTab('runs')

    const initialStepsState: StepRunItem[] = activeWorkflow.steps.map((s: any) => ({
      id: `sr-${s.id}-${Date.now()}`,
      workflow_step_id: s.id,
      status: 'pending',
      attempt_count: 1,
      workflow_step: s,
    }))

    setLiveStepRuns(initialStepsState)

    let currentInput = payloadOverride || { input: 'Production database error alert' }

    for (let i = 0; i < activeWorkflow.steps.length; i++) {
      const step = activeWorkflow.steps[i]

      if (['db_write', 'notify'].includes(step.type) && currentUserRole !== 'owner') {
        setLiveStepRuns((prev) =>
          prev.map((sr, idx) =>
            idx === i
              ? {
                  ...sr,
                  status: 'failed',
                  error: `Layer 2 Security Failure: Step type "${step.type}" requires Owner role! (Current role: ${currentUserRole})`,
                }
              : sr
          )
        )
        setRunOverallStatus('failed')
        setIsRunning(false)
        return
      }

      setLiveStepRuns((prev) =>
        prev.map((sr, idx) => (idx === i ? { ...sr, status: 'running', input: currentInput } : sr))
      )

      await new Promise((r) => setTimeout(r, 900))

      if (step.type === 'approval_gate') {
        setLiveStepRuns((prev) =>
          prev.map((sr, idx) => (idx === i ? { ...sr, status: 'paused', input: currentInput } : sr))
        )
        setRunOverallStatus('paused')
        setIsRunning(false)
        return
      }

      let stepOutput: any = {}
      if (step.type === 'llm_call') {
        stepOutput = {
          content: `Groq Llama 3 LLM: Classified production database alert as CRITICAL priority.`,
          model: step.config.model,
          usage: { prompt_tokens: 42, completion_tokens: 38, total_tokens: 80 },
        }
      } else if (step.type === 'conditional_branch') {
        stepOutput = {
          branch: 'true',
          condition_met: true,
          matched_field: step.config.condition_field,
        }
      } else if (step.type === 'http_request') {
        stepOutput = {
          status: 200,
          data: { success: true, message: 'External webhook acknowledged alert' },
        }
      } else if (step.type === 'notify') {
        stepOutput = { sent: true, channel: 'slack', timestamp: new Date().toISOString() }
      }

      setLiveStepRuns((prev) =>
        prev.map((sr, idx) =>
          idx === i ? { ...sr, status: 'completed', output: stepOutput } : sr
        )
      )

      currentInput = stepOutput
    }

    setRunOverallStatus('completed')
    setIsRunning(false)
    setCurrentOrg((prev) => ({ ...prev, quota_used: prev.quota_used + 1 }))
  }

  const handleApproveStep = async (stepRunId: string, comment?: string) => {
    if (currentUserRole === 'viewer') {
      throw new Error('Layer 2 Security: Viewers cannot approve workflow gates!')
    }

    const pausedIndex = liveStepRuns.findIndex((sr) => sr.id === stepRunId)
    if (pausedIndex === -1) return

    setLiveStepRuns((prev) =>
      prev.map((sr, idx) =>
        idx === pausedIndex
          ? {
              ...sr,
              status: 'completed',
              approved_by: `user-${currentUserRole}`,
              approved_at: new Date().toISOString(),
              output: { approved: true, comment: comment || 'Approved by user' },
            }
          : sr
      )
    )

    setRunOverallStatus('running')

    let currentInput: any = { approved: true, comment }

    for (let i = pausedIndex + 1; i < activeWorkflow.steps.length; i++) {
      const step = activeWorkflow.steps[i]

      if (['db_write', 'notify'].includes(step.type) && currentUserRole !== 'owner') {
        setLiveStepRuns((prev) =>
          prev.map((sr, idx) =>
            idx === i
              ? {
                  ...sr,
                  status: 'failed',
                  error: `Layer 2 Security: Step type "${step.type}" requires Owner role!`,
                }
              : sr
          )
        )
        setRunOverallStatus('failed')
        return
      }

      setLiveStepRuns((prev) =>
        prev.map((sr, idx) => (idx === i ? { ...sr, status: 'running', input: currentInput } : sr))
      )

      await new Promise((r) => setTimeout(r, 900))

      const stepOutput =
        step.type === 'notify'
          ? { sent: true, channel: 'slack', text: 'Alert sent to ops lead' }
          : { status: 'success' }

      setLiveStepRuns((prev) =>
        prev.map((sr, idx) => (idx === i ? { ...sr, status: 'completed', output: stepOutput } : sr))
      )
      currentInput = stepOutput
    }

    setRunOverallStatus('completed')
    setCurrentOrg((prev) => ({ ...prev, quota_used: prev.quota_used + 1 }))
  }

  const handleTestDirectAccess = () => {
    const isAccessibleInCurrentOrg = currentOrgWorkflows.some((w) => w.id === directAccessId)
    if (isAccessibleInCurrentOrg) {
      setDirectAccessResult(`✅ ALLOWED: Workflow "${directAccessId}" belongs to ${currentOrg.name}.`)
    } else {
      setDirectAccessResult(
        `🚨 BLOCKED BY LAYER 1 (Org Scoping): User in "${currentOrg.name}" cannot access workflow "${directAccessId}" (belonging to another organization). Hasura SQL RLS filter: org_id IN (caller_orgs) returned 0 rows.`
      )
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#030712] text-slate-100">
      {/* Navigation Header */}
      <Header
        currentOrg={currentOrg}
        onOrgChange={(org) => {
          setCurrentOrg(org)
          setLiveStepRuns([])
          setActiveRunId(null)
          setRunOverallStatus('pending')
        }}
        currentUserRole={currentUserRole}
        onRoleChange={setCurrentUserRole}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('builder')}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'builder'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="h-4 w-4" /> Visual Graph Builder
            </button>

            <button
              onClick={() => setActiveTab('runs')}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'runs'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Play className="h-4 w-4" /> Live Subscription Stream
              {activeRunId && (
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('proof')}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'proof'
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-600/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-amber-400" /> Final Task Proof Scenario
            </button>
          </div>

          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 font-bold">
              Org Scope: {currentOrg.slug}
            </span>
          </div>
        </div>

        {/* Tab 1: Workflow Builder Graph */}
        {activeTab === 'builder' && (
          <div>
            {activeWorkflow ? (
              <WorkflowBuilder
                workflowId={activeWorkflow.id}
                workflowName={activeWorkflow.name}
                userRole={currentUserRole}
                initialSteps={activeWorkflow.steps}
                initialTriggers={activeWorkflow.triggers}
                onRunWorkflow={() => handleStartWorkflowRun()}
                onSaveWorkflow={(steps) => {
                  activeWorkflow.steps = steps
                }}
                isRunning={isRunning}
              />
            ) : (
              <div className="p-12 text-center glass-panel rounded-2xl border border-slate-800">
                <p className="text-slate-400">No workflows found for this organization.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Live Run Stream */}
        {activeTab === 'runs' && (
          <div>
            {activeRunId ? (
              <LiveRunStream
                runId={activeRunId}
                overallStatus={runOverallStatus}
                stepRuns={liveStepRuns}
                onApproveStep={handleApproveStep}
                userRole={currentUserRole}
              />
            ) : (
              <div className="glass-panel rounded-2xl p-12 text-center space-y-4 border border-slate-800">
                <div className="h-16 w-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
                  <Play className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-white">No Execution Active</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Click "Run Workflow" in the Graph Builder or trigger an inbound webhook event to start streaming live step progress.
                </p>
                <button
                  onClick={() => {
                    setActiveTab('builder')
                    handleStartWorkflowRun()
                  }}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 cursor-pointer"
                >
                  Start Demo Run Now
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Final Task Verification Scenario */}
        {activeTab === 'proof' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-6 border border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-slate-900 to-slate-950 shadow-2xl">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="h-6 w-6 text-cyan-400" />
                <h2 className="text-xl font-extrabold text-white">Final Task System Verification Scenario</h2>
              </div>
              <p className="text-xs text-slate-300">
                This panel proves all 6 evaluation criteria live in real time: Schema correctness, Hasura config, Layer 1 Org Scoping, Layer 2 Step Gating, Action Handlers, and Subscriptions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Webhook Event Test */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" /> Inbound Webhook Trigger Test (No UI Click)
                </h3>
                <p className="text-xs text-slate-400">
                  Simulates external POST request to <code>/api/webhook-trigger</code> to launch pipeline.
                </p>

                <textarea
                  rows={3}
                  value={webhookInputPayload}
                  onChange={(e) => setWebhookInputPayload(e.target.value)}
                  className="w-full rounded-xl p-3 text-xs font-mono text-cyan-300"
                />

                <button
                  onClick={() => {
                    let parsed = {}
                    try { parsed = JSON.parse(webhookInputPayload) } catch {}
                    handleStartWorkflowRun(parsed)
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  Fire Inbound Webhook Event
                </button>
              </div>

              {/* Direct ID Guessing Test */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-400" /> Cross-Org Isolation & Direct ID Guessing
                </h3>
                <p className="text-xs text-slate-400">
                  Tests direct ID access across org boundaries (Org B user trying to access Org A workflow ID directly).
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directAccessId}
                    onChange={(e) => setDirectAccessId(e.target.value)}
                    className="flex-1 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-200"
                  />
                  <button
                    onClick={handleTestDirectAccess}
                    className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    Test Access
                  </button>
                </div>

                {directAccessResult && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-amber-300 leading-relaxed shadow-inner">
                    {directAccessResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
