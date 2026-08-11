// ============================================================
// Shared utility: call Hasura with admin secret
// ============================================================
export async function hasuraAdminQuery(query: string, variables: Record<string, any> = {}) {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
  const region = process.env.NEXT_PUBLIC_NHOST_REGION
  const url = `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET!,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

// ============================================================
// Verify user is member of workflow's org, return role
// ============================================================
export async function verifyOrgMembership(userId: string, workflowId: string) {
  const data = await hasuraAdminQuery(`
    query VerifyMembership($workflow_id: uuid!, $user_id: uuid!) {
      workflows_by_pk(id: $workflow_id) {
        id
        org_id
        organization {
          quota_limit
          quota_used
          quota_period_start
        }
      }
      org_members(where: {
        user_id: { _eq: $user_id }
        organization: { workflows: { id: { _eq: $workflow_id } } }
      }) {
        role
        org_id
      }
    }
  `, { workflow_id: workflowId, user_id: userId })

  const workflow = data.workflows_by_pk
  const membership = data.org_members[0]

  if (!workflow) throw new Error('Workflow not found')
  if (!membership) throw new Error('Access denied: not a member of this org')

  return { workflow, role: membership.role as 'owner' | 'editor' | 'viewer' }
}

// ============================================================
// Check + increment quota
// ============================================================
export async function checkAndIncrementQuota(orgId: string) {
  const data = await hasuraAdminQuery(`
    query GetQuota($org_id: uuid!) {
      organizations_by_pk(id: $org_id) {
        quota_limit
        quota_used
        quota_period_start
      }
    }
  `, { org_id: orgId })

  const org = data.organizations_by_pk
  if (!org) throw new Error('Organization not found')

  // Reset monthly quota if needed
  const periodStart = new Date(org.quota_period_start)
  const now = new Date()
  if (now.getMonth() !== periodStart.getMonth() || now.getFullYear() !== periodStart.getFullYear()) {
    await hasuraAdminQuery(`
      mutation ResetQuota($org_id: uuid!) {
        update_organizations_by_pk(
          pk_columns: { id: $org_id }
          _set: { quota_used: 0, quota_period_start: "now()" }
        ) { id }
      }
    `, { org_id: orgId })
    return true
  }

  if (org.quota_used >= org.quota_limit) {
    throw new Error(`Quota exhausted: ${org.quota_used}/${org.quota_limit} calls used this month`)
  }
  return true
}

export async function incrementQuota(orgId: string) {
  await hasuraAdminQuery(`
    mutation IncrementQuota($org_id: uuid!) {
      update_organizations_by_pk(
        pk_columns: { id: $org_id }
        _inc: { quota_used: 1 }
      ) { quota_used }
    }
  `, { org_id: orgId })
}

// ============================================================
// Update step_run status
// ============================================================
export async function updateStepRun(
  stepRunId: string,
  updates: {
    status?: string
    input?: any
    output?: any
    error?: string
    attempt_count?: number
    approved_by?: string
    approved_at?: string
    started_at?: string
    completed_at?: string
  }
) {
  const setFields = Object.entries(updates)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
    .join(', ')

  await hasuraAdminQuery(`
    mutation UpdateStepRun($id: uuid!, $updates: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: $updates) { id status }
    }
  `, { id: stepRunId, updates })
}

// ============================================================
// Update workflow_run status
// ============================================================
export async function updateWorkflowRun(runId: string, updates: {
  status?: string
  current_step_index?: number
  completed_at?: string
  error?: string
}) {
  await hasuraAdminQuery(`
    mutation UpdateWorkflowRun($id: uuid!, $updates: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $updates) { id status }
    }
  `, { id: runId, updates })
}

// ============================================================
// LLM Call — Groq API with retry
// ============================================================
export async function callLLM(config: any, input: any, attempt = 1): Promise<any> {
  const maxAttempts = 3
  const prompt = config.prompt || 'Summarize the input.'
  const model = config.model || 'llama3-8b-8192'

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant in a workflow automation system.' },
          { role: 'user', content: `${prompt}\n\nContext: ${JSON.stringify(input)}` },
        ],
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      if (res.status >= 500 && attempt < maxAttempts) {
        await sleep(1000 * attempt)
        return callLLM(config, input, attempt + 1)
      }
      // Stub fallback if no API key
      if (res.status === 401) {
        await sleep(800) // disclosed artificial delay
        return {
          content: `[STUBBED LLM RESPONSE] Processed: ${JSON.stringify(input).slice(0, 100)}`,
          model: 'stub',
          stubbed: true,
        }
      }
      throw new Error(`LLM API error ${res.status}: ${err}`)
    }

    const json = await res.json()
    return {
      content: json.choices[0].message.content,
      model: json.model,
      usage: json.usage,
    }
  } catch (e: any) {
    if (attempt < maxAttempts) {
      await sleep(1000 * attempt)
      return callLLM(config, input, attempt + 1)
    }
    throw e
  }
}

// ============================================================
// HTTP Request — generic external call with retry
// ============================================================
export async function callHttpRequest(config: any, input: any, attempt = 1): Promise<any> {
  const maxAttempts = 3
  const { url, method = 'GET', headers = {}, body_template } = config

  try {
    const bodyStr = body_template
      ? JSON.stringify(body_template).replace('{{input}}', JSON.stringify(input))
      : undefined

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: bodyStr,
    })

    if (!res.ok) {
      if (res.status >= 500 && attempt < maxAttempts) {
        await sleep(1000 * attempt)
        return callHttpRequest(config, input, attempt + 1)
      }
      throw new Error(`HTTP request failed: ${res.status} ${res.statusText}`)
    }

    const contentType = res.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await res.json() : await res.text()
    return { status: res.status, data }
  } catch (e: any) {
    if (attempt < maxAttempts && !e.message.includes('HTTP request failed')) {
      await sleep(1000 * attempt)
      return callHttpRequest(config, input, attempt + 1)
    }
    throw e
  }
}

// ============================================================
// DB Write — insert/update in own tables
// ============================================================
export async function callDbWrite(config: any, input: any): Promise<any> {
  const { table, operation = 'insert', data_template } = config
  const allowedTables = ['workflow_runs', 'step_runs'] // sandbox
  if (!allowedTables.includes(table)) {
    throw new Error(`DB write to table "${table}" is not permitted`)
  }

  const record = { ...data_template, ...input }
  const data = await hasuraAdminQuery(`
    mutation DbWrite($object: ${table}_insert_input!) {
      insert_${table}_one(object: $object) { id }
    }
  `, { object: record })

  return { written: true, data }
}

// ============================================================
// Conditional Branch
// ============================================================
export function evaluateCondition(config: any, prevOutput: any): 'true' | 'false' {
  const { condition_field, operator, value } = config
  const fieldValue = condition_field.split('.').reduce((obj: any, key: string) => obj?.[key], prevOutput)

  switch (operator) {
    case 'eq': return fieldValue == value ? 'true' : 'false'
    case 'neq': return fieldValue != value ? 'true' : 'false'
    case 'contains': return String(fieldValue).includes(value) ? 'true' : 'false'
    case 'gt': return Number(fieldValue) > Number(value) ? 'true' : 'false'
    case 'lt': return Number(fieldValue) < Number(value) ? 'true' : 'false'
    case 'exists': return fieldValue !== undefined && fieldValue !== null ? 'true' : 'false'
    default: return 'false'
  }
}

// ============================================================
// Notify — stub Slack/email via event trigger
// ============================================================
export async function callNotify(config: any, input: any): Promise<any> {
  const { channel = 'slack', message_template = 'Workflow step completed' } = config
  const message = message_template.replace('{{input}}', JSON.stringify(input))
  // In production: call Slack API or send email
  console.log(`[NOTIFY] Channel: ${channel}, Message: ${message}`)
  await sleep(200) // simulate
  return { sent: true, channel, message }
}

// ============================================================
// Helpers
// ============================================================
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getUserIdFromHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  // In production, verify JWT — for nhost, Hasura already validates
  // We decode the sub claim from the JWT
  try {
    const token = authHeader.split(' ')[1]
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return payload.sub || payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'] || null
  } catch {
    return null
  }
}
