'use client'

import React, { useState } from 'react'
import {
  Play,
  Plus,
  Trash2,
  Bot,
  Globe,
  Database,
  Bell,
  GitBranch,
  ShieldCheck,
  Zap,
  Settings,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  ArrowRight,
  MoveDown,
  CheckCircle2,
  Lock,
  Layers,
  ChevronRight
} from 'lucide-react'

export interface StepConfig {
  id: string
  name: string
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate'
  order_index: number
  config: any
}

export interface TriggerConfig {
  id?: string
  trigger_type: 'manual' | 'webhook' | 'scheduled' | 'db_event'
  config: any
}

interface WorkflowBuilderProps {
  workflowId: string
  workflowName: string
  userRole: 'owner' | 'editor' | 'viewer'
  initialSteps?: StepConfig[]
  initialTriggers?: TriggerConfig[]
  onRunWorkflow: (payload?: any) => void
  onSaveWorkflow: (steps: StepConfig[], triggers: TriggerConfig[]) => void
  isRunning?: boolean
}

const STEP_TYPES = [
  {
    type: 'llm_call',
    label: 'LLM Call (AI)',
    icon: Bot,
    color: 'from-purple-500 to-indigo-600',
    borderColor: 'border-purple-500/50',
    bgColor: 'bg-purple-950/40',
    textColor: 'text-purple-400',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    restricted: false,
    desc: 'Calls Groq Llama 3 LLM model for natural language reasoning.',
  },
  {
    type: 'conditional_branch',
    label: 'Branch Condition',
    icon: GitBranch,
    color: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500/50',
    bgColor: 'bg-emerald-950/40',
    textColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    restricted: false,
    desc: 'If/else evaluation based on output of previous step.',
  },
  {
    type: 'http_request',
    label: 'HTTP Webhook',
    icon: Globe,
    color: 'from-blue-500 to-cyan-600',
    borderColor: 'border-blue-500/50',
    bgColor: 'bg-blue-950/40',
    textColor: 'text-blue-400',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    restricted: false,
    desc: 'Executes generic REST API call with automatic 3x retry on failure.',
  },
  {
    type: 'approval_gate',
    label: 'Human Gate',
    icon: ShieldCheck,
    color: 'from-amber-500 to-orange-600',
    borderColor: 'border-amber-500/50',
    bgColor: 'bg-amber-950/40',
    textColor: 'text-amber-300',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    restricted: false,
    desc: 'Pauses execution until an authorized Owner or Editor approves.',
  },
  {
    type: 'db_write',
    label: 'DB Write',
    icon: Database,
    color: 'from-rose-500 to-pink-600',
    borderColor: 'border-rose-500/50',
    bgColor: 'bg-rose-950/40',
    textColor: 'text-rose-400',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    restricted: true,
    desc: 'Saves step result directly into PostgreSQL tables (Owner only).',
  },
  {
    type: 'notify',
    label: 'Event Alert',
    icon: Bell,
    color: 'from-cyan-500 to-sky-600',
    borderColor: 'border-cyan-500/50',
    bgColor: 'bg-cyan-950/40',
    textColor: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    restricted: true,
    desc: 'Triggers Hasura Event Trigger for Slack/Email alert (Owner only).',
  },
]

export function WorkflowBuilder({
  workflowId,
  workflowName,
  userRole,
  initialSteps = [],
  initialTriggers = [{ trigger_type: 'manual', config: {} }],
  onRunWorkflow,
  onSaveWorkflow,
  isRunning = false,
}: WorkflowBuilderProps) {
  const [steps, setSteps] = useState<StepConfig[]>(
    initialSteps.length > 0
      ? initialSteps
      : [
          {
            id: 'step-1',
            name: 'Classify Ticket (LLM)',
            type: 'llm_call',
            order_index: 0,
            config: { prompt: 'Classify this ticket: "High priority server outage on production database!"', model: 'llama-3.1-8b-instant' },
          },
          {
            id: 'step-2',
            name: 'Check LLM Priority (Branch)',
            type: 'conditional_branch',
            order_index: 1,
            config: { condition_field: 'content', operator: 'contains', value: 'production', skip_remaining_on_false: false },
          },
          {
            id: 'step-3',
            name: 'Notify External API (HTTP)',
            type: 'http_request',
            order_index: 2,
            config: { url: 'https://httpbin.org/post', method: 'POST', body_template: { alert: 'critical' } },
          },
          {
            id: 'step-4',
            name: 'Require Escalation Gate (Human Approval)',
            type: 'approval_gate',
            order_index: 3,
            config: { required_role: 'editor', note: 'Approve before notifying ops lead' },
          },
          {
            id: 'step-5',
            name: 'Send Slack Alert (Event Trigger)',
            type: 'notify',
            order_index: 4,
            config: { channel: 'slack', message_template: 'Alert sent' },
          },
        ]
  )

  const [triggers, setTriggers] = useState<TriggerConfig[]>(initialTriggers)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(steps[0]?.id || null)

  // Zoom & Viewport canvas controls
  const [zoomLevel, setZoomLevel] = useState<number>(100)

  const isReadonly = userRole === 'viewer'

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(150, Math.max(50, prev + delta)))
  }

  const addStep = (type: StepConfig['type']) => {
    if (isReadonly) return
    const stepInfo = STEP_TYPES.find((s) => s.type === type)
    if (stepInfo?.restricted && userRole !== 'owner') {
      alert(`Permission Denied: Step type "${stepInfo.label}" requires Owner role.`)
      return
    }

    const newStep: StepConfig = {
      id: `step-${Date.now()}`,
      name: `New ${stepInfo?.label || 'Step'}`,
      type,
      order_index: steps.length,
      config:
        type === 'llm_call'
          ? { prompt: 'Analyze input payload', model: 'llama-3.1-8b-instant' }
          : type === 'http_request'
          ? { url: 'https://httpbin.org/post', method: 'POST' }
          : type === 'conditional_branch'
          ? { condition_field: 'status', operator: 'contains', value: '200' }
          : type === 'approval_gate'
          ? { note: 'Review prior output before proceeding' }
          : type === 'db_write'
          ? { table: 'step_runs', operation: 'insert' }
          : { channel: 'slack', message_template: 'Alert: step finished' },
    }
    const updated = [...steps, newStep]
    setSteps(updated)
    setSelectedStepId(newStep.id)
    onSaveWorkflow(updated, triggers)
  }

  const removeStep = (id: string) => {
    if (isReadonly) return
    const updated = steps.filter((s) => s.id !== id).map((s, idx) => ({ ...s, order_index: idx }))
    setSteps(updated)
    if (selectedStepId === id) setSelectedStepId(updated[0]?.id || null)
    onSaveWorkflow(updated, triggers)
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (isReadonly) return
    const newIdx = direction === 'up' ? index - 1 : index + 1
    if (newIdx < 0 || newIdx >= steps.length) return
    const updated = [...steps]
    const temp = updated[index]
    updated[index] = updated[newIdx]
    updated[newIdx] = temp
    const reordered = updated.map((s, idx) => ({ ...s, order_index: idx }))
    setSteps(reordered)
    onSaveWorkflow(reordered, triggers)
  }

  const updateStepConfig = (id: string, newConfig: any, newName?: string) => {
    if (isReadonly) return
    const updated = steps.map((s) => (s.id === id ? { ...s, config: newConfig, name: newName || s.name } : s))
    setSteps(updated)
    onSaveWorkflow(updated, triggers)
  }

  const selectedStep = steps.find((s) => s.id === selectedStepId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Visual Canvas Node Orchestrator */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        {/* Canvas Toolbar */}
        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between border border-slate-800/80 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {workflowName}
              </h2>
              <p className="text-xs text-slate-400">
                {steps.length} Nodes Configured • Drag & Drop Sequence Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Canvas Zoom Controls */}
            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => handleZoom(-10)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono font-medium text-cyan-400 px-2 min-w-[45px] text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => handleZoom(10)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer border-l border-slate-800"
                title="Reset Zoom"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Run Button */}
            {!isReadonly ? (
              <button
                onClick={() => onRunWorkflow()}
                disabled={isRunning || steps.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <Play className={`h-4 w-4 ${isRunning ? 'animate-spin' : 'fill-white'}`} />
                {isRunning ? 'Executing Agent Pipeline...' : 'Run Workflow'}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/30 text-xs text-amber-400">
                <Lock className="h-3.5 w-3.5" />
                <span>Viewer Read-Only</span>
              </div>
            )}
          </div>
        </div>

        {/* Add Step Node Palette */}
        {!isReadonly && (
          <div className="glass-panel rounded-2xl p-4 border border-slate-800/80 bg-slate-950/60">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Add Step Node to Graph
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {STEP_TYPES.map((st) => {
                const Icon = st.icon
                const isLocked = st.restricted && userRole !== 'owner'
                return (
                  <button
                    key={st.type}
                    onClick={() => addStep(st.type as any)}
                    disabled={isLocked}
                    className={`group relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      isLocked
                        ? 'opacity-40 cursor-not-allowed bg-slate-900/40 border-slate-800 text-slate-500'
                        : `${st.bgColor} ${st.borderColor} hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/10 hover:scale-[1.02] cursor-pointer`
                    }`}
                  >
                    <div className={`p-2 rounded-lg bg-slate-900 border border-slate-800 ${st.textColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        {st.label}
                        {st.restricted && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                            Owner
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{st.desc}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Visual Graph Viewport (Interactive Zoomable Grid) */}
        <div
          className="glass-panel rounded-2xl p-6 border border-slate-800 canvas-grid-pattern relative min-h-[500px] overflow-auto transition-transform duration-200"
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
        >
          {/* Start Trigger Node */}
          <div className="flex justify-center mb-6">
            <div className="px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/10">
              <Zap className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span>ENTRY TRIGGER: Webhook / Manual Event</span>
            </div>
          </div>

          {/* Node Flow Chain */}
          <div className="space-y-6 max-w-2xl mx-auto">
            {steps.map((step, index) => {
              const stepTypeInfo = STEP_TYPES.find((t) => t.type === step.type)
              const Icon = stepTypeInfo?.icon || Bot
              const isSelected = step.id === selectedStepId

              return (
                <React.Fragment key={step.id}>
                  {/* Connector Line */}
                  {index > 0 && (
                    <div className="flex flex-col items-center my-2">
                      <div className="h-6 w-0.5 bg-gradient-to-b from-cyan-500 to-blue-500 opacity-60" />
                      <MoveDown className="h-4 w-4 text-cyan-400 -mt-1 animate-bounce" />
                    </div>
                  )}

                  {/* Step Card Node */}
                  <div
                    onClick={() => setSelectedStepId(step.id)}
                    className={`relative glass-card rounded-2xl p-5 border transition-all duration-300 cursor-pointer ${
                      isSelected
                        ? `border-cyan-400 ring-2 ring-cyan-500/30 bg-slate-900/95 shadow-xl shadow-cyan-500/10 scale-[1.01]`
                        : `border-slate-800/90 hover:border-slate-700 bg-slate-900/60 hover:scale-[1.005]`
                    }`}
                  >
                    {/* Top Node Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3.5">
                        <div className="h-7 w-7 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-cyan-400">
                          0{index + 1}
                        </div>

                        <div className={`p-2.5 rounded-xl border ${stepTypeInfo?.bgColor} ${stepTypeInfo?.borderColor}`}>
                          <Icon className={`h-5 w-5 ${stepTypeInfo?.textColor}`} />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-100 text-sm">{step.name}</h4>
                            <span
                              className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${stepTypeInfo?.badgeBg}`}
                            >
                              {stepTypeInfo?.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 font-mono">
                            {step.type === 'llm_call' && `Prompt: "${step.config?.prompt}"`}
                            {step.type === 'http_request' && `${step.config?.method || 'POST'} ${step.config?.url}`}
                            {step.type === 'conditional_branch' && `If ${step.config?.condition_field} ${step.config?.operator} "${step.config?.value}"`}
                            {step.type === 'approval_gate' && `Requires Human Approval before continuing`}
                            {step.type === 'db_write' && `Target Table: ${step.config?.table}`}
                            {step.type === 'notify' && `Alert Channel: ${step.config?.channel}`}
                          </p>
                        </div>
                      </div>

                      {/* Controls */}
                      {!isReadonly && (
                        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => moveStep(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveStep(index, 'down')}
                            disabled={index === steps.length - 1}
                            className="p-1.5 text-slate-500 hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => removeStep(step.id)}
                            className="p-1.5 text-rose-500/70 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>

      {/* Step Inspector & Configuration Panel */}
      <div className="lg:col-span-4 glass-panel rounded-2xl p-5 border border-slate-800/80 h-fit space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <Settings className="h-4 w-4 text-cyan-400" /> Node Inspector & Config
        </h3>

        {selectedStep ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Node Title</label>
              <input
                type="text"
                disabled={isReadonly}
                value={selectedStep.name}
                onChange={(e) => updateStepConfig(selectedStep.id, selectedStep.config, e.target.value)}
                className="w-full rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
              />
            </div>

            {selectedStep.type === 'llm_call' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">LLM Model Engine</label>
                  <select
                    disabled={isReadonly}
                    value={selectedStep.config?.model || 'llama3-8b-8192'}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, model: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-sm text-slate-100 cursor-pointer"
                  >
                    <option value="llama3-8b-8192">Groq Llama 3 8B (Fast)</option>
                    <option value="llama3-70b-8192">Groq Llama 3 70B (Deep Reasoning)</option>
                    <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">System Prompt Instructions</label>
                  <textarea
                    disabled={isReadonly}
                    rows={4}
                    value={selectedStep.config?.prompt || ''}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, prompt: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-300 focus:outline-none"
                  />
                </div>
              </>
            )}

            {selectedStep.type === 'http_request' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">HTTP Method</label>
                  <select
                    disabled={isReadonly}
                    value={selectedStep.config?.method || 'POST'}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, method: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">API Endpoint URL</label>
                  <input
                    type="text"
                    disabled={isReadonly}
                    value={selectedStep.config?.url || ''}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, url: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
              </>
            )}

            {selectedStep.type === 'conditional_branch' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Field to Inspect</label>
                  <input
                    type="text"
                    disabled={isReadonly}
                    value={selectedStep.config?.condition_field || 'content'}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, condition_field: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-xs font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Operator</label>
                  <select
                    disabled={isReadonly}
                    value={selectedStep.config?.operator || 'contains'}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, operator: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="contains">Contains String</option>
                    <option value="eq">Equals</option>
                    <option value="exists">Exists / Non-null</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Expected Match Value</label>
                  <input
                    type="text"
                    disabled={isReadonly}
                    value={selectedStep.config?.value || ''}
                    onChange={(e) =>
                      updateStepConfig(selectedStep.id, { ...selectedStep.config, value: e.target.value })
                    }
                    className="w-full rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-300"
                  />
                </div>
              </>
            )}

            {selectedStep.type === 'approval_gate' && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Gate Approval Note</label>
                <textarea
                  disabled={isReadonly}
                  rows={3}
                  value={selectedStep.config?.note || ''}
                  onChange={(e) =>
                    updateStepConfig(selectedStep.id, { ...selectedStep.config, note: e.target.value })
                  }
                  className="w-full rounded-xl px-3.5 py-2 text-sm text-slate-100"
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">Select a node in the visual graph to inspect configuration.</p>
        )}
      </div>
    </div>
  )
}
