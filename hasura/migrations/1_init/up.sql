-- =============================================
-- AI Agent Workflow Builder — Database Schema
-- =============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- ORGANIZATIONS
-- =============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  quota_limit INT NOT NULL DEFAULT 100,
  quota_used INT NOT NULL DEFAULT 0,
  quota_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- ORG MEMBERS (links Hasura Auth users to orgs)
-- =============================================
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,  -- references auth.users(id) managed by nhost
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);

-- =============================================
-- WORKFLOWS
-- =============================================
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,  -- user_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_org_id ON workflows(org_id);

-- =============================================
-- WORKFLOW STEPS
-- =============================================
CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'llm_call',
    'http_request',
    'db_write',
    'notify',
    'conditional_branch',
    'approval_gate'
  )),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);

-- =============================================
-- WORKFLOW TRIGGERS
-- =============================================
CREATE TABLE workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'manual',
    'webhook',
    'scheduled',
    'db_event'
  )),
  config JSONB NOT NULL DEFAULT '{}',  -- e.g. cron expression, webhook secret, table name
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);

-- =============================================
-- WORKFLOW RUNS
-- =============================================
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'paused', 'completed', 'failed'
  )),
  triggered_by UUID,  -- user_id, null for automated triggers
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_payload JSONB DEFAULT '{}',
  current_step_index INT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);

-- =============================================
-- STEP RUNS
-- =============================================
CREATE TABLE step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'paused', 'completed', 'failed', 'retrying', 'skipped'
  )),
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  error TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  approved_by UUID,   -- user_id
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_step_runs_workflow_run_id ON step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_status ON step_runs(status);

-- =============================================
-- COMPUTED VIEW: org usage this month
-- =============================================
CREATE VIEW org_usage_this_month AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.quota_limit,
  o.quota_used,
  COUNT(wr.id) AS runs_this_month,
  AVG(EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))) AS avg_run_duration_seconds
FROM organizations o
LEFT JOIN workflows w ON w.org_id = o.id
LEFT JOIN workflow_runs wr ON wr.workflow_id = w.id
  AND wr.started_at >= DATE_TRUNC('month', NOW())
GROUP BY o.id, o.name, o.quota_limit, o.quota_used;

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_steps_updated_at
  BEFORE UPDATE ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
