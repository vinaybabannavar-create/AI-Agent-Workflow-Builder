'use client'

import React, { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  PauseCircle,
  RotateCcw,
  Check,
  XCircle,
  Zap,
  Code,
  Sparkles,
  ArrowDown
} from 'lucide-react'

export interface StepRunItem {
  id: string
  workflow_step_id: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'retrying' | 'skipped'
  input?: any
  output?: any
  error?: string
  attempt_count: number
  approved_by?: string
  approved_at?: string
  workflow_step: {
    name: string
    type: string
    order_index: number
  }
}

interface LiveRunStreamProps {
  runId: string
  overallStatus: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  stepRuns: StepRunItem[]
  onApproveStep: (stepRunId: string, comment?: string) => Promise<void>
  userRole: 'owner' | 'editor' | 'viewer'
}

export function LiveRunStream({
  runId,
  overallStatus,
  stepRuns,
  onApproveStep,
  userRole,
}: LiveRunStreamProps) {
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [selectedOutputStepId, setSelectedOutputStepId] = useState<string | null>(null)

  const handleApprove = async (stepRunId: string) => {
    if (userRole === 'viewer') {
      alert('Access Denied: Viewers cannot approve workflow steps!')
      return
    }
    setApprovingId(stepRunId)
    try {
      await onApproveStep(stepRunId, comment)
      setComment('')
    } catch (e: any) {
      alert(`Approval error: ${e.message}`)
    } finally {
      setApprovingId(null)
    }
  }

  const getStatusBadge = (status: StepRunItem['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        )
      case 'running':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 animate-pulse cyan-glow">
            <Zap className="h-3.5 w-3.5 animate-spin text-cyan-400" /> Executing Node...
          </span>
        )
      case 'paused':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-bounce amber-glow">
            <PauseCircle className="h-3.5 w-3.5" /> Paused (Awaiting Approval)
          </span>
        )
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <XCircle className="h-3.5 w-3.5" /> Failed
          </span>
        )
      case 'retrying':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <RotateCcw className="h-3.5 w-3.5 animate-spin" /> Retrying...
          </span>
        )
      case 'skipped':
        return (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-slate-800 text-slate-500">
            Skipped
          </span>
        )
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Clock className="h-3.5 w-3.5" /> Pending
          </span>
        )
    }
  }

  const selectedStepRun = stepRuns.find((sr) => sr.id === selectedOutputStepId) || stepRuns[0]

  return (
    <div className="space-y-6">
      {/* Status Banner Header */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-white">Live Execution Subscription Stream</h3>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                Run ID: {runId.slice(0, 10)}...
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time WebSocket step state updates from Hasura GraphQL Engine.
            </p>
          </div>
        </div>

        <div>
          <span
            className={`text-xs font-extrabold px-4 py-2 rounded-xl border ${
              overallStatus === 'completed'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : overallStatus === 'paused'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 amber-glow'
                : overallStatus === 'failed'
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 cyan-glow'
            }`}
          >
            STATUS: {overallStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Execution Timeline & Data Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step Stream List */}
        <div className="lg:col-span-7 space-y-4">
          {stepRuns.map((sr, idx) => (
            <React.Fragment key={sr.id}>
              {idx > 0 && (
                <div className="flex justify-center">
                  <ArrowDown className="h-4 w-4 text-cyan-500/40" />
                </div>
              )}

              <div
                onClick={() => setSelectedOutputStepId(sr.id)}
                className={`glass-panel rounded-2xl p-5 border transition-all duration-300 cursor-pointer ${
                  sr.status === 'paused'
                    ? 'border-amber-500/80 bg-amber-950/20 shadow-xl shadow-amber-500/10'
                    : sr.status === 'running'
                    ? 'border-cyan-500/80 bg-cyan-950/20 shadow-xl shadow-cyan-500/10'
                    : selectedOutputStepId === sr.id
                    ? 'border-slate-600 bg-slate-900/90'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3.5">
                    <div className="h-9 w-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-300">
                      0{idx + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-100 text-sm">
                        {sr.workflow_step.name}
                      </h4>
                      <p className="text-xs text-slate-400 capitalize mt-0.5">
                        {sr.workflow_step.type.replace('_', ' ')} • Attempt #{sr.attempt_count || 1}
                      </p>
                    </div>
                  </div>

                  <div>{getStatusBadge(sr.status)}</div>
                </div>

                {/* Paused Gate Approval Panel */}
                {sr.status === 'paused' && (
                  <div className="mt-4 pt-4 border-t border-amber-500/30 bg-amber-500/5 -mx-5 -mb-5 p-5 rounded-b-2xl">
                    <div className="flex items-start gap-2.5 mb-3">
                      <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <h5 className="text-xs font-extrabold text-amber-200">
                          Workflow Paused — Human Gate Approval Required
                        </h5>
                        <p className="text-xs text-amber-300/80 mt-0.5">
                          Only an Owner or Editor in this organization can clear this gate to resume execution.
                        </p>
                      </div>
                    </div>

                    {userRole !== 'viewer' ? (
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="text"
                          placeholder="Optional approval note/comment..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className="flex-1 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                        <button
                          onClick={() => handleApprove(sr.id)}
                          disabled={approvingId === sr.id}
                          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                        >
                          <Check className="h-4 w-4" />
                          {approvingId === sr.id ? 'Approving...' : 'Approve & Resume'}
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-amber-400/90 font-medium italic mt-2">
                        🔒 You are currently logged in as Viewer. Switch to Owner or Editor to approve.
                      </div>
                    )}
                  </div>
                )}

                {/* Step Error */}
                {sr.error && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-300">
                    Error: {sr.error}
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Step Payload Inspector Drawer */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-5 border border-slate-800/80 h-fit space-y-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Code className="h-4 w-4 text-cyan-400" /> Real-time Step Data Inspector
          </h4>

          {selectedStepRun ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">
                  Active Node: <span className="text-white font-bold">{selectedStepRun.workflow_step.name}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono block">
                  Status: {selectedStepRun.status.toUpperCase()}
                </span>
              </div>

              {selectedStepRun.output && (
                <div>
                  <label className="text-xs font-bold text-emerald-400 block mb-1.5">Output Data Payload (JSON)</label>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-64 shadow-inner">
                    {JSON.stringify(selectedStepRun.output, null, 2)}
                  </pre>
                </div>
              )}

              {selectedStepRun.input && (
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1.5">Input Context (JSON)</label>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-44 shadow-inner">
                    {JSON.stringify(selectedStepRun.input, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Click any step node in the timeline to view JSON input/output data.</p>
          )}
        </div>
      </div>
    </div>
  )
}
