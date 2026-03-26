const ACTION_KINDS = Object.freeze({
  EXPLORE_PROJECT_CONTEXT: 'explore_project_context',
  LOAD_BRAINSTORMING_SKILL: 'load_brainstorming_skill',
  WRITE_DESIGN_DOC: 'write_design_doc',
  RUN_SPEC_REVIEW_LOOP: 'run_spec_review_loop',
  GENERATE_IMPLEMENTATION_PLAN: 'generate_implementation_plan',
  PERSIST_LOCAL_CHECKPOINT: 'persist_local_checkpoint',
  DESIGN_APPROVAL: 'design_approval',
  SPEC_REVIEW: 'spec_review',
  DELIVERABLE_CHANGE: 'deliverable_change',
  EXTERNAL_SIDE_EFFECT: 'external_side_effect'
});

const DEFAULT_AUTOMATION_POLICY = Object.freeze({
  automaticHiddenActions: [
    ACTION_KINDS.EXPLORE_PROJECT_CONTEXT,
    ACTION_KINDS.LOAD_BRAINSTORMING_SKILL,
    ACTION_KINDS.WRITE_DESIGN_DOC,
    ACTION_KINDS.RUN_SPEC_REVIEW_LOOP,
    ACTION_KINDS.GENERATE_IMPLEMENTATION_PLAN,
    ACTION_KINDS.PERSIST_LOCAL_CHECKPOINT
  ],
  confirmationActions: [
    ACTION_KINDS.DESIGN_APPROVAL,
    ACTION_KINDS.SPEC_REVIEW,
    ACTION_KINDS.DELIVERABLE_CHANGE,
    ACTION_KINDS.EXTERNAL_SIDE_EFFECT
  ],
  userFacingStyle: 'non_technical'
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeActionKind(action) {
  if (typeof action === 'string' && action.trim()) {
    return action.trim();
  }
  if (action && typeof action === 'object' && typeof action.kind === 'string' && action.kind.trim()) {
    return action.kind.trim();
  }
  return 'unknown';
}

function evaluateWorkflowActionBoundary(action, policy) {
  const resolvedPolicy = policy && typeof policy === 'object'
    ? {
        automaticHiddenActions: Array.isArray(policy.automaticHiddenActions)
          ? policy.automaticHiddenActions.slice()
          : DEFAULT_AUTOMATION_POLICY.automaticHiddenActions.slice(),
        confirmationActions: Array.isArray(policy.confirmationActions)
          ? policy.confirmationActions.slice()
          : DEFAULT_AUTOMATION_POLICY.confirmationActions.slice(),
        userFacingStyle: policy.userFacingStyle || DEFAULT_AUTOMATION_POLICY.userFacingStyle
      }
    : clone(DEFAULT_AUTOMATION_POLICY);
  const kind = normalizeActionKind(action);

  if (resolvedPolicy.automaticHiddenActions.includes(kind)) {
    return {
      kind,
      requiresConfirmation: false,
      visibility: 'hidden',
      userFacingStyle: resolvedPolicy.userFacingStyle,
      reason: 'internal_automation'
    };
  }

  if (resolvedPolicy.confirmationActions.includes(kind)) {
    return {
      kind,
      requiresConfirmation: true,
      visibility: 'decision',
      userFacingStyle: resolvedPolicy.userFacingStyle,
      reason: kind === ACTION_KINDS.EXTERNAL_SIDE_EFFECT
        ? 'external_side_effect'
        : 'meaningful_product_decision'
    };
  }

  return {
    kind,
    requiresConfirmation: false,
    visibility: 'hidden',
    userFacingStyle: resolvedPolicy.userFacingStyle,
    reason: 'unspecified_internal_action'
  };
}

function buildBoundaryConfirmationQuestion(evaluation, overrides) {
  const resolved = evaluation && typeof evaluation === 'object'
    ? evaluation
    : evaluateWorkflowActionBoundary(null);
  const config = overrides && typeof overrides === 'object' ? overrides : {};

  if (resolved.kind === ACTION_KINDS.DELIVERABLE_CHANGE) {
    return {
      type: 'question',
      questionType: 'confirm',
      questionId: config.questionId || 'workflow-confirm-deliverable-change',
      title: config.title || 'The final result would change shape. Should the workflow continue?',
      description: config.description || 'The next step would change the kind of result this session is preparing. Confirm before the workflow switches direction.',
      options: [
        { id: 'yes', label: 'Yes, switch it', description: 'Continue with the updated result shape.' },
        { id: 'no', label: 'Keep the current result', description: 'Stay with the current output shape.' }
      ],
      allowTextOverride: false,
      metadata: {
        workflowAction: resolved.kind,
        workflowBoundary: resolved.reason
      }
    };
  }

  if (resolved.kind === ACTION_KINDS.EXTERNAL_SIDE_EFFECT) {
    return {
      type: 'question',
      questionType: 'confirm',
      questionId: config.questionId || 'workflow-confirm-external-action',
      title: config.title || 'This step would affect something outside the current workspace. Continue?',
      description: config.description || 'Confirm before the workflow writes to a remote or external system.',
      options: [
        { id: 'yes', label: 'Yes, continue', description: 'Allow the external action to run.' },
        { id: 'no', label: 'No, stop here', description: 'Keep the workflow local only.' }
      ],
      allowTextOverride: false,
      metadata: {
        workflowAction: resolved.kind,
        workflowBoundary: resolved.reason
      }
    };
  }

  if (resolved.kind === ACTION_KINDS.DESIGN_APPROVAL) {
    return {
      type: 'question',
      questionType: 'confirm',
      questionId: config.questionId || 'workflow-confirm-design',
      title: config.title || 'Does this direction look right so far?',
      description: config.description || 'Confirm the direction before the workflow turns it into a fuller draft.',
      options: [
        { id: 'yes', label: 'Yes, continue', description: 'Turn this direction into the next draft.' },
        { id: 'no', label: 'Needs adjustment', description: 'Capture what should change first.' }
      ],
      allowTextOverride: false,
      metadata: {
        workflowAction: resolved.kind,
        workflowBoundary: resolved.reason
      }
    };
  }

  return {
    type: 'question',
    questionType: 'confirm',
    questionId: config.questionId || 'workflow-confirm-spec-review',
    title: config.title || 'Review the drafted document',
    description: config.description || 'Confirm whether the drafted document is ready for the next step.',
    options: [
      { id: 'yes', label: 'Looks right, continue', description: 'Proceed with the current draft.' },
      { id: 'no', label: 'Needs changes first', description: 'Capture changes before continuing.' }
    ],
    allowTextOverride: false,
    metadata: {
      workflowAction: resolved.kind,
      workflowBoundary: resolved.reason
    }
  };
}

module.exports = {
  ACTION_KINDS,
  DEFAULT_AUTOMATION_POLICY,
  buildBoundaryConfirmationQuestion,
  evaluateWorkflowActionBoundary
};
