'use client'

import React from 'react'
import Link from 'next/link'
import { Bot, Shield, Zap, Users, Sparkles, ChevronDown } from 'lucide-react'

export type OrgContext = {
  id: string
  name: string
  slug: string
  role: 'owner' | 'editor' | 'viewer'
  quota_limit: number
  quota_used: number
}

export const DEMO_ORGS: OrgContext[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Acme AI Labs (Org A)',
    slug: 'acme-org-a',
    role: 'owner',
    quota_limit: 100,
    quota_used: 14,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Beta Tech (Org B)',
    slug: 'beta-org-b',
    role: 'owner',
    quota_limit: 50,
    quota_used: 48,
  },
]

interface HeaderProps {
  currentOrg: OrgContext
  onOrgChange: (org: OrgContext) => void
  currentUserRole?: 'owner' | 'editor' | 'viewer'
  onRoleChange?: (role: 'owner' | 'editor' | 'viewer') => void
}

export function Header({ currentOrg, onOrgChange, currentUserRole = 'owner', onRoleChange }: HeaderProps) {
  const usagePercentage = Math.min(100, Math.round((currentOrg.quota_used / currentOrg.quota_limit) * 100))

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 px-6 py-3.5 shadow-2xl">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Tagline */}
        <Link href="/" className="flex items-center space-x-3.5 group">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:scale-105 transition-transform duration-300">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-xl tracking-tight text-white flex items-center gap-2">
                AgentFlow
              </h1>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">
                Enterprise Mini-n8n
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous AI Agent Workflow Orchestrator</p>
          </div>
        </Link>

        {/* Controls: Org Switcher, Role Simulator, Usage Quota */}
        <div className="flex items-center space-x-4">
          {/* Org Selector */}
          <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-700/60 rounded-xl px-3.5 py-1.5 shadow-inner">
            <Users className="h-4 w-4 text-cyan-400" />
            <select
              value={currentOrg.id}
              onChange={(e) => {
                const selected = DEMO_ORGS.find((o) => o.id === e.target.value)
                if (selected) onOrgChange(selected)
              }}
              className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
            >
              {DEMO_ORGS.map((org) => (
                <option key={org.id} value={org.id} className="bg-slate-950 text-white">
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role Switcher */}
          {onRoleChange && (
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 rounded-xl px-3.5 py-1.5 shadow-inner">
              <Shield className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">Role:</span>
              <select
                value={currentUserRole}
                onChange={(e) => onRoleChange(e.target.value as 'owner' | 'editor' | 'viewer')}
                className="bg-transparent text-xs font-bold cursor-pointer text-amber-300 focus:outline-none"
              >
                <option value="owner" className="bg-slate-950 text-amber-300">Owner (Full Admin)</option>
                <option value="editor" className="bg-slate-950 text-cyan-300">Editor (No Member Admin)</option>
                <option value="viewer" className="bg-slate-950 text-slate-400">Viewer (Read-Only)</option>
              </select>
            </div>
          )}

          {/* Quota Progress Indicator */}
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-1.5 min-w-[190px]">
            <Zap className={`h-4 w-4 ${usagePercentage > 85 ? 'text-amber-400 animate-bounce' : 'text-cyan-400'}`} />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-400">Monthly Quota</span>
                <span className={usagePercentage > 85 ? 'text-amber-400' : 'text-slate-200'}>
                  {currentOrg.quota_used} / {currentOrg.quota_limit}
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 ${
                    usagePercentage > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                  }`}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
