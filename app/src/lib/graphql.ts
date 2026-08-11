import { gql } from '@apollo/client'

// ============================================================
// FRAGMENTS
// ============================================================

export const STEP_RUN_FRAGMENT = gql`
  fragment StepRunFields on step_runs {
    id
    status
    input
    output
    error
    attempt_count
    approved_by
    approved_at
    started_at
    completed_at
    workflow_step {
      id
      name
      type
      order_index
      config
    }
  }
`

export const WORKFLOW_RUN_FRAGMENT = gql`
  fragment WorkflowRunFields on workflow_runs {
    id
    status
    trigger_type
    triggered_by
    started_at
    completed_at
    current_step_index
    error
  }
`

// ============================================================
// QUERIES
// ============================================================

export const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($org_id: uuid!) {
    workflows(
      where: { org_id: { _eq: $org_id } }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      is_active
      created_at
      updated_at
      steps(order_by: { order_index: asc }) {
        id
        name
        type
        order_index
        config
      }
      triggers {
        id
        trigger_type
        config
        is_active
      }
      runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        completed_at
        trigger_type
      }
    }
  }
`

export const GET_WORKFLOW_DETAIL = gql`
  query GetWorkflowDetail($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      is_active
      org_id
      created_by
      created_at
      updated_at
      organization {
        id
        name
        quota_limit
        quota_used
      }
      steps(order_by: { order_index: asc }) {
        id
        name
        type
        order_index
        config
        created_at
      }
      triggers {
        id
        trigger_type
        config
        is_active
      }
      runs(order_by: { started_at: desc }, limit: 5) {
        id
        status
        started_at
        completed_at
        trigger_type
        triggered_by
      }
    }
  }
`

export const GET_WORKFLOW_RUN = gql`
  query GetWorkflowRun($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      ...WorkflowRunFields
      workflow {
        id
        name
        org_id
      }
      step_runs(order_by: { workflow_step: { order_index: asc } }) {
        ...StepRunFields
      }
    }
  }
  ${WORKFLOW_RUN_FRAGMENT}
  ${STEP_RUN_FRAGMENT}
`

export const GET_USER_ORGS = gql`
  query GetUserOrgs($user_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id } }) {
      id
      role
      org_id
      organization {
        id
        name
        slug
        quota_limit
        quota_used
        quota_period_start
      }
    }
  }
`

export const GET_ORG_USAGE = gql`
  query GetOrgUsage($org_id: uuid!) {
    org_usage_this_month(where: { org_id: { _eq: $org_id } }) {
      org_id
      org_name
      quota_limit
      quota_used
      runs_this_month
      avg_run_duration_seconds
    }
  }
`

// ============================================================
// MUTATIONS
// ============================================================

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow(
    $org_id: uuid!
    $name: String!
    $description: String
    $created_by: uuid!
  ) {
    insert_workflows_one(
      object: {
        org_id: $org_id
        name: $name
        description: $description
        created_by: $created_by
      }
    ) {
      id
      name
      description
      created_at
    }
  }
`

export const UPDATE_WORKFLOW = gql`
  mutation UpdateWorkflow(
    $id: uuid!
    $name: String!
    $description: String
    $is_active: Boolean
  ) {
    update_workflows_by_pk(
      pk_columns: { id: $id }
      _set: { name: $name, description: $description, is_active: $is_active }
    ) {
      id
      name
      description
      is_active
      updated_at
    }
  }
`

export const UPSERT_WORKFLOW_STEPS = gql`
  mutation UpsertWorkflowSteps($steps: [workflow_steps_insert_input!]!) {
    insert_workflow_steps(
      objects: $steps
      on_conflict: {
        constraint: workflow_steps_pkey
        update_columns: [name, type, config, order_index]
      }
    ) {
      returning {
        id
        name
        type
        order_index
        config
      }
    }
  }
`

export const DELETE_WORKFLOW_STEP = gql`
  mutation DeleteWorkflowStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`

export const UPSERT_WORKFLOW_TRIGGER = gql`
  mutation UpsertWorkflowTrigger(
    $workflow_id: uuid!
    $trigger_type: String!
    $config: jsonb!
  ) {
    insert_workflow_triggers_one(
      object: {
        workflow_id: $workflow_id
        trigger_type: $trigger_type
        config: $config
      }
      on_conflict: {
        constraint: workflow_triggers_pkey
        update_columns: [trigger_type, config, is_active]
      }
    ) {
      id
      trigger_type
      config
      is_active
    }
  }
`

export const CREATE_ORG = gql`
  mutation CreateOrg($name: String!, $slug: String!, $user_id: uuid!) {
    insert_organizations_one(object: { name: $name, slug: $slug }) {
      id
      name
      slug
    }
  }
`

// ============================================================
// ACTIONS (via GraphQL mutations mapped to Hasura Actions)
// ============================================================

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflow_id: String!, $payload: String) {
    triggerWorkflowRun(input: { workflow_id: $workflow_id, payload: $payload }) {
      workflow_run_id
      status
      message
    }
  }
`

export const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: String!, $comment: String) {
    approveStep(input: { step_run_id: $step_run_id, comment: $comment }) {
      step_run_id
      status
      message
    }
  }
`

// ============================================================
// SUBSCRIPTIONS
// ============================================================

export const SUBSCRIBE_STEP_RUNS = gql`
  subscription SubscribeStepRuns($workflow_run_id: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflow_run_id } }
      order_by: { workflow_step: { order_index: asc } }
    ) {
      ...StepRunFields
    }
  }
  ${STEP_RUN_FRAGMENT}
`

export const SUBSCRIBE_WORKFLOW_RUN = gql`
  subscription SubscribeWorkflowRun($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      ...WorkflowRunFields
    }
  }
  ${WORKFLOW_RUN_FRAGMENT}
`
