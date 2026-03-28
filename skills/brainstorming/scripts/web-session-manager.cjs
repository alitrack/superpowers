const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  createCodexRuntimeAdapter,
  createFakeCodexRuntimeAdapter,
  normalizeStrategyState
} = require('./codex-runtime-adapter.cjs');
const { createLocalWorkflowEngine } = require('./workflow-artifact-engine.cjs');
const { createWorkflowCheckpointStore } = require('./workflow-checkpoint-store.cjs');
const {
  ACTION_KINDS,
  DEFAULT_AUTOMATION_POLICY,
  buildBoundaryConfirmationQuestion,
  evaluateWorkflowActionBoundary
} = require('./workflow-policy.cjs');
const { createResearchAssetStore } = require('./research-asset-store.cjs');
const {
  WORKSPACE_STATUS,
  BUNDLE_STATUS,
  REVIEW_REQUEST_STATUS,
  normalizeReviewRequest,
  normalizeAuditEntry
} = require('./research-asset-model.cjs');

const DEFAULT_FLOW_ID = 'structured-demo';
const WORKFLOW_MODES = Object.freeze({
  CONVERSATION: 'conversation',
  FULL_SKILL: 'full_skill'
});
const WORKFLOW_STATUS = Object.freeze({
  CONVERSATION: 'conversation',
  QUESTIONING: 'questioning',
  RUNNING: 'running_hidden_step',
  AWAITING_USER: 'awaiting_user',
  BLOCKED: 'blocked',
  COMPLETE: 'complete'
});
const INTERNAL_STAGES = Object.freeze({
  CONVERSATION: 'conversation',
  ASK_QUESTIONS: 'ask-clarifying-questions',
  PROPOSE_APPROACHES: 'propose-approaches',
  PRESENT_DESIGN: 'present-design',
  WRITE_DESIGN_DOC: 'write-design-doc',
  REVIEW_SPEC_LOOP: 'review-spec-loop',
  AWAITING_SPEC_REVIEW: 'awaiting-spec-review',
  AWAITING_SPEC_REVISION: 'awaiting-spec-revision-notes',
  WRITE_PLAN: 'write-plan',
  COMPLETE: 'complete',
  BLOCKED: 'blocked'
});
const DEFAULT_REVIEW_RETRY_BUDGET = 3;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeSeedPrompt(initialPrompt) {
  return typeof initialPrompt === 'string' && initialPrompt.trim()
    ? initialPrompt.trim()
    : null;
}

function normalizeWorkflowMode(mode) {
  return mode === WORKFLOW_MODES.FULL_SKILL
    ? WORKFLOW_MODES.FULL_SKILL
    : WORKFLOW_MODES.CONVERSATION;
}

function slugify(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'brainstorm-workflow';
}

function currentDatePrefix() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeProvenanceEntry(entry) {
  return entry && typeof entry === 'object' ? clone(entry) : null;
}

function ensureSessionProvenance(session) {
  if (!session.provenance || typeof session.provenance !== 'object') {
    session.provenance = {
      questions: [],
      finalResult: null
    };
  }
  if (!Array.isArray(session.provenance.questions)) {
    session.provenance.questions = [];
  }
  return session.provenance;
}

function recordMessageProvenance(session, message) {
  const provenance = normalizeProvenanceEntry(message && message.provenance);
  if (!provenance) {
    return;
  }
  const sessionProvenance = ensureSessionProvenance(session);
  if (message.type === 'question') {
    const exists = sessionProvenance.questions.some((entry) => (
      entry.questionId === message.questionId
      && entry.timestamp === provenance.timestamp
    ));
    if (!exists) {
      sessionProvenance.questions.push({
        questionId: message.questionId,
        title: message.title,
        ...provenance
      });
    }
    return;
  }
  if (message.type === 'summary' || message.type === 'artifact_ready') {
    sessionProvenance.finalResult = provenance;
  }
}

function appendMarkdownSection(lines, title, items, fallbackText) {
  lines.push(`## ${title}`);
  lines.push('');
  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push(`- ${fallbackText}`);
  }
  lines.push('');
}

function cloneAutomationPolicy() {
  return clone(DEFAULT_AUTOMATION_POLICY);
}

function createChecklistTemplate() {
  return [
    { id: 'explore-project-context', title: 'Explore project context', status: 'pending' },
    { id: 'offer-visual-companion', title: 'Offer visual companion', status: 'pending', optional: true },
    { id: 'ask-clarifying-questions', title: 'Ask clarifying questions', status: 'pending' },
    { id: 'propose-approaches', title: 'Propose 2-3 approaches', status: 'pending' },
    { id: 'present-design', title: 'Present design', status: 'pending' },
    { id: 'write-design-doc', title: 'Write design doc', status: 'pending' },
    { id: 'spec-review-loop', title: 'Spec review loop', status: 'pending' },
    { id: 'user-reviews-spec', title: 'User reviews written spec', status: 'pending' },
    { id: 'write-plan', title: 'Transition to implementation planning', status: 'pending' }
  ];
}

function buildVisibleStage(id, overrides) {
  const definitions = {
    'clarify-problem': {
      id: 'clarify-problem',
      title: 'Clarify the problem',
      description: 'Answer one focused question at a time so the system can shape the draft.'
    },
    'compare-directions': {
      id: 'compare-directions',
      title: 'Compare possible directions',
      description: 'Review the current options so the session can narrow toward the strongest path.'
    },
    'confirm-design': {
      id: 'confirm-design',
      title: 'Confirm the direction',
      description: 'Choose the path that should become the working direction for the draft.'
    },
    'draft-document': {
      id: 'draft-document',
      title: 'Prepare the draft',
      description: 'The system is turning the converged direction into a fuller document.'
    },
    'review-spec': {
      id: 'review-spec',
      title: 'Review the drafted document',
      description: 'Check the draft and confirm whether it is ready to continue into the implementation plan.'
    },
    'refine-spec': {
      id: 'refine-spec',
      title: 'Adjust the drafted document',
      description: 'Capture the changes needed before the implementation plan is generated.'
    },
    'review-blocked': {
      id: 'review-blocked',
      title: 'The draft needs more direction',
      description: 'The system could not confidently finish the draft on its own. Add guidance so it can continue.'
    },
    'draft-plan': {
      id: 'draft-plan',
      title: 'Prepare the implementation plan',
      description: 'The system is turning the approved document into a concrete implementation plan.'
    },
    'plan-ready': {
      id: 'plan-ready',
      title: 'Spec and plan are ready',
      description: 'The workflow finished with a reviewable design spec and implementation plan.'
    }
  };
  return {
    ...(definitions[id] || {
      id,
      title: id,
      description: ''
    }),
    ...(overrides || {})
  };
}

function createInitialReviewState() {
  return {
    retryBudget: DEFAULT_REVIEW_RETRY_BUDGET,
    attemptCount: 0,
    status: 'pending',
    issues: [],
    recommendations: []
  };
}

function createInitialWorkflowState(mode) {
  const resolvedMode = normalizeWorkflowMode(mode);
  return {
    mode: resolvedMode,
    status: resolvedMode === WORKFLOW_MODES.FULL_SKILL ? WORKFLOW_STATUS.QUESTIONING : WORKFLOW_STATUS.CONVERSATION,
    internalStage: resolvedMode === WORKFLOW_MODES.FULL_SKILL ? INTERNAL_STAGES.ASK_QUESTIONS : INTERNAL_STAGES.CONVERSATION,
    visibleStage: resolvedMode === WORKFLOW_MODES.FULL_SKILL
      ? buildVisibleStage('clarify-problem')
      : null,
    automationPolicy: cloneAutomationPolicy(),
    approvalCheckpoints: [],
    checkpoints: [],
    hiddenActivity: [],
    blocked: null,
    skillChecklist: createChecklistTemplate(),
    visualAssist: {
      status: 'not_needed',
      offered: false,
      accepted: null,
      reason: 'No visual-only checkpoint has been requested in this V1 flow.'
    },
    specArtifact: null,
    planArtifact: null,
    bundleArtifact: null,
    review: createInitialReviewState()
  };
}

function ensureWorkflowCollections(workflow) {
  if (!Array.isArray(workflow.approvalCheckpoints)) {
    workflow.approvalCheckpoints = [];
  }
  if (!Array.isArray(workflow.checkpoints)) {
    workflow.checkpoints = [];
  }
  if (!Array.isArray(workflow.hiddenActivity)) {
    workflow.hiddenActivity = [];
  }
  if (!Array.isArray(workflow.skillChecklist)) {
    workflow.skillChecklist = createChecklistTemplate();
  }
  if (!workflow.automationPolicy || typeof workflow.automationPolicy !== 'object') {
    workflow.automationPolicy = cloneAutomationPolicy();
  }
  if (!workflow.visualAssist || typeof workflow.visualAssist !== 'object') {
    workflow.visualAssist = {
      status: 'not_needed',
      offered: false,
      accepted: null,
      reason: 'No visual-only checkpoint has been requested in this V1 flow.'
    };
  }
  if (!workflow.review || typeof workflow.review !== 'object') {
    workflow.review = createInitialReviewState();
  } else {
    workflow.review = {
      retryBudget: typeof workflow.review.retryBudget === 'number'
        ? workflow.review.retryBudget
        : DEFAULT_REVIEW_RETRY_BUDGET,
      attemptCount: typeof workflow.review.attemptCount === 'number'
        ? workflow.review.attemptCount
        : 0,
      status: workflow.review.status || 'pending',
      issues: Array.isArray(workflow.review.issues) ? workflow.review.issues : [],
      recommendations: Array.isArray(workflow.review.recommendations) ? workflow.review.recommendations : []
    };
  }
}

function updateChecklistStatus(workflow, checklistId, status, details) {
  const entry = workflow.skillChecklist.find((item) => item.id === checklistId);
  if (!entry) {
    return;
  }
  entry.status = status;
  if (details) {
    Object.assign(entry, details);
  }
}

function mapQuestioningStage(strategyState, currentMessage) {
  const state = normalizeStrategyState(strategyState);
  const intent = currentMessage && currentMessage.metadata && currentMessage.metadata.brainstormIntent
    ? currentMessage.metadata.brainstormIntent
    : null;

  if (state.phase === 'diverge'
    || (state.phase === 'converge' && state.nextLearningGoal === 'choose-the-most-important-decision-criterion')) {
    return {
      internalStage: INTERNAL_STAGES.PROPOSE_APPROACHES,
      visibleStage: buildVisibleStage('compare-directions')
    };
  }

  if (intent === 'commit_path' || (state.phase === 'converge' && state.nextLearningGoal === 'commit-to-a-path')) {
    return {
      internalStage: INTERNAL_STAGES.PRESENT_DESIGN,
      visibleStage: buildVisibleStage('confirm-design')
    };
  }

  return {
    internalStage: INTERNAL_STAGES.ASK_QUESTIONS,
    visibleStage: buildVisibleStage('clarify-problem')
  };
}

function recordWorkflowEvent(workflow, event) {
  workflow.hiddenActivity.push({
    timestamp: new Date().toISOString(),
    ...(event || {})
  });
}

function recordApprovalCheckpoint(workflow, checkpoint) {
  workflow.approvalCheckpoints.push({
    timestamp: new Date().toISOString(),
    ...(checkpoint || {})
  });
}

function recordWorkflowCheckpoint(workflow, checkpointStore, session, context) {
  const evaluation = evaluateWorkflowActionBoundary(ACTION_KINDS.PERSIST_LOCAL_CHECKPOINT, workflow.automationPolicy);
  recordWorkflowEvent(workflow, {
    kind: 'checkpoint-requested',
    stageId: context && context.stageId ? context.stageId : 'workflow-checkpoint',
    boundary: evaluation.reason
  });
  const checkpoint = checkpointStore.captureCheckpoint(session, context || {});
  workflow.checkpoints.push(checkpoint);
  recordWorkflowEvent(workflow, {
    kind: 'checkpoint-created',
    stageId: checkpoint.stageId,
    provider: checkpoint.provider,
    relativePath: checkpoint.relativePath
  });
  return checkpoint;
}

function refreshWorkflowChecklist(session) {
  const workflow = session && session.workflow && typeof session.workflow === 'object'
    ? session.workflow
    : null;
  if (!workflow || workflow.mode !== WORKFLOW_MODES.FULL_SKILL) {
    return;
  }

  const state = normalizeStrategyState(session.strategyState);
  const currentQuestionId = session.currentQuestionId || '';
  const hasSummary = Boolean(session.summary);
  const hasSpec = Boolean(workflow.specArtifact);
  const hasPlan = Boolean(workflow.planArtifact);
  const isBlocked = workflow.status === WORKFLOW_STATUS.BLOCKED;

  updateChecklistStatus(workflow, 'explore-project-context', 'completed');
  updateChecklistStatus(workflow, 'offer-visual-companion', workflow.visualAssist.status || 'not_needed');
  updateChecklistStatus(workflow, 'ask-clarifying-questions', hasSummary ? 'completed' : 'in_progress');
  updateChecklistStatus(
    workflow,
    'propose-approaches',
    (state.phase === 'diverge' || state.phase === 'converge' || hasSummary) ? (hasSummary ? 'completed' : 'in_progress') : 'pending'
  );
  updateChecklistStatus(
    workflow,
    'present-design',
    hasSummary
      ? 'completed'
      : (workflow.visibleStage && workflow.visibleStage.id === 'confirm-design' ? 'in_progress' : 'pending')
  );
  updateChecklistStatus(
    workflow,
    'write-design-doc',
    hasSpec
      ? 'completed'
      : ([INTERNAL_STAGES.WRITE_DESIGN_DOC, INTERNAL_STAGES.REVIEW_SPEC_LOOP].includes(workflow.internalStage) ? 'in_progress' : 'pending')
  );
  updateChecklistStatus(
    workflow,
    'spec-review-loop',
    isBlocked
      ? 'blocked'
      : (workflow.review && workflow.review.attemptCount > 0
        ? (workflow.review.status === 'approved' ? 'completed' : 'in_progress')
        : 'pending')
  );
  updateChecklistStatus(
    workflow,
    'user-reviews-spec',
    hasPlan
      ? 'completed'
      : ((currentQuestionId === 'workflow-review-spec' || currentQuestionId === 'workflow-revise-spec') ? 'in_progress' : (hasSpec ? 'completed' : 'pending'))
  );
  updateChecklistStatus(
    workflow,
    'write-plan',
    hasPlan
      ? 'completed'
      : (workflow.internalStage === INTERNAL_STAGES.WRITE_PLAN ? 'in_progress' : 'pending')
  );
}

function ensureWorkflow(session) {
  const mode = normalizeWorkflowMode(session && session.workflowMode);
  if (!session.workflow || typeof session.workflow !== 'object') {
    session.workflow = createInitialWorkflowState(mode);
  }
  session.workflow.mode = mode;
  if (typeof session.workflow.status !== 'string') {
    session.workflow.status = mode === WORKFLOW_MODES.FULL_SKILL ? WORKFLOW_STATUS.QUESTIONING : WORKFLOW_STATUS.CONVERSATION;
  }
  if (typeof session.workflow.internalStage !== 'string') {
    session.workflow.internalStage = mode === WORKFLOW_MODES.FULL_SKILL ? INTERNAL_STAGES.ASK_QUESTIONS : INTERNAL_STAGES.CONVERSATION;
  }
  if (mode === WORKFLOW_MODES.FULL_SKILL && !session.workflow.visibleStage) {
    session.workflow.visibleStage = buildVisibleStage('clarify-problem');
  }
  ensureWorkflowCollections(session.workflow);
  refreshWorkflowChecklist(session);
  return session.workflow;
}

function buildWorkflowBundleMarkdown(session) {
  const workflow = ensureWorkflow(session);
  const lines = [
    '# Spec and Plan Bundle',
    '',
    `- Session ID: ${session.id}`,
    `- Workflow Mode: ${workflow.mode}`,
    workflow.visibleStage ? `- Current Stage: ${workflow.visibleStage.title}` : null,
    session.seedPrompt ? `- Seed Prompt: ${session.seedPrompt}` : null,
    '',
    '## Design Spec',
    '',
    workflow.specArtifact
      ? `- ${workflow.specArtifact.title} (${workflow.specArtifact.relativePath})`
      : '- No design spec generated yet.',
    '',
    '## Implementation Plan',
    '',
    workflow.planArtifact
      ? `- ${workflow.planArtifact.title} (${workflow.planArtifact.relativePath})`
      : '- No implementation plan generated yet.',
    ''
  ].filter(Boolean);

  if (workflow.specArtifact && workflow.specArtifact.previewText) {
    lines.push('## Spec Preview');
    lines.push('');
    lines.push(workflow.specArtifact.previewText);
    lines.push('');
  }

  if (workflow.planArtifact && workflow.planArtifact.previewText) {
    lines.push('## Plan Preview');
    lines.push('');
    lines.push(workflow.planArtifact.previewText);
    lines.push('');
  }

  return lines.join('\n');
}

function createWorkflowReviewQuestion(workflow, reviewPrompt) {
  const evaluation = evaluateWorkflowActionBoundary(ACTION_KINDS.SPEC_REVIEW, workflow.automationPolicy);
  const question = buildBoundaryConfirmationQuestion(evaluation, {
    questionId: 'workflow-review-spec',
    title: reviewPrompt && reviewPrompt.title
      ? reviewPrompt.title
      : 'Review the drafted workflow document',
    description: reviewPrompt && reviewPrompt.description
      ? reviewPrompt.description
      : 'Review the drafted document and confirm whether it is accurate enough to continue into the implementation plan.'
  });
  question.options = question.options.map((option) => {
    if (option.id === 'yes' && reviewPrompt && reviewPrompt.approveLabel) {
      return { ...option, label: reviewPrompt.approveLabel };
    }
    if (option.id === 'no' && reviewPrompt && reviewPrompt.reviseLabel) {
      return { ...option, label: reviewPrompt.reviseLabel };
    }
    return option;
  });
  question.metadata = {
    ...(question.metadata || {}),
    workflowStage: workflow.visibleStage ? workflow.visibleStage.id : 'review-spec'
  };
  return question;
}

function createWorkflowRevisionQuestion(workflow, overrides) {
  const resolved = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    type: 'question',
    questionType: 'ask_text',
    questionId: 'workflow-revise-spec',
    title: resolved.title || 'What should change before the implementation plan is drafted?',
    description: resolved.description || 'Describe the adjustments you want in the draft so the system can update it before continuing.',
    options: [],
    allowTextOverride: true,
    textOverrideLabel: resolved.textOverrideLabel || 'Describe the changes you want',
    metadata: {
      workflowAction: 'revise_spec',
      workflowStage: workflow.visibleStage ? workflow.visibleStage.id : 'refine-spec'
    }
  };
}

function createWorkflowArtifactRecord(baseDir, subDir, title, fileName, markdown) {
  const dirPath = path.join(baseDir, 'docs', 'superpowers', subDir);
  ensureDir(dirPath);
  const filePath = path.join(dirPath, fileName);
  fs.writeFileSync(filePath, markdown);
  return {
    title,
    fileName,
    filePath,
    relativePath: path.relative(baseDir, filePath).replace(/\\/g, '/'),
    previewText: markdown
  };
}

function buildArtifactMarkdown(session, summary) {
  const deliverable = summary && summary.deliverable && typeof summary.deliverable === 'object'
    ? summary.deliverable
    : null;
  const synthesis = summary && summary.synthesis && typeof summary.synthesis === 'object'
    ? summary.synthesis
    : null;
  const lines = [
    '# Structured Brainstorming Result',
    '',
    `- Session ID: ${session.id}`,
    `- Completion Mode: ${session.completionMode}`,
    session.seedPrompt ? `- Seed Prompt: ${session.seedPrompt}` : null,
    `- Updated At: ${session.updatedAt}`,
    ''
  ].filter(Boolean);

  if (deliverable && Array.isArray(deliverable.sections)) {
    for (const section of deliverable.sections) {
      appendMarkdownSection(
        lines,
        section.title,
        section.items,
        `Missing section: ${section.title}`
      );
    }
  } else if (synthesis) {
    appendMarkdownSection(
      lines,
      'Recommendation',
      synthesis.recommendation ? [`Choose: ${synthesis.recommendation}`] : [],
      'No single path has been committed yet.'
    );
    appendMarkdownSection(
      lines,
      'Problem Framing',
      synthesis.problemFrame ? [synthesis.problemFrame] : [],
      'The problem framing is still being clarified.'
    );
    appendMarkdownSection(
      lines,
      'Decision Rule',
      synthesis.decisionCriterion ? [synthesis.decisionCriterion] : [],
      'No explicit decision criterion was chosen.'
    );
    appendMarkdownSection(
      lines,
      'Explored Approaches',
      synthesis.exploredDirections,
      'No distinct directions were captured.'
    );
    appendMarkdownSection(
      lines,
      'Why This Path Currently Wins',
      synthesis.reasoning,
      'The session has not yet produced a decisive recommendation.'
    );
    appendMarkdownSection(
      lines,
      'Design / Execution Draft',
      synthesis.recommendation
        ? [
            `Start with "${synthesis.recommendation}" as the primary path.`,
            synthesis.decisionCriterion
              ? `Use "${synthesis.decisionCriterion}" as the decision rule for the next draft.`
              : 'Define an explicit decision rule before locking the next draft.'
          ]
        : [],
      'No design draft was synthesized.'
    );
    appendMarkdownSection(
      lines,
      'Risks / Open Questions',
      synthesis.alternatives.length > 0
        ? [`Validate whether ${synthesis.alternatives.join('; ')} should replace the current recommendation.`]
        : [],
      'No explicit risks or open questions were captured.'
    );
    appendMarkdownSection(
      lines,
      'Next Actions',
      synthesis.nextValidation,
      'No next actions were captured.'
    );
  } else {
    lines.push('## Summary');
    lines.push('');
    lines.push(summary.text);
    lines.push('');
  }

  lines.push('## Answers');
  lines.push('');
  for (const entry of summary.answers || []) {
    lines.push(`- ${entry.questionId}: ${entry.answer}`);
  }

  lines.push('');
  return lines.join('\n');
}

function getFinishedResultSource(session) {
  if (session && session.summary && typeof session.summary === 'object') {
    return session.summary;
  }
  const message = session && session.currentMessage && typeof session.currentMessage === 'object'
    ? session.currentMessage
    : null;
  if (message && (message.type === 'summary' || message.type === 'artifact_ready')) {
    return message;
  }
  return null;
}

function normalizeFinishedResultSections(source) {
  const deliverable = source && source.deliverable && typeof source.deliverable === 'object'
    ? source.deliverable
    : null;
  const sections = Array.isArray(deliverable && deliverable.sections)
    ? deliverable.sections
    : [];

  if (sections.length > 0) {
    return sections.map((section, index) => ({
      id: section.id || slugify(section.title || `section-${index + 1}`),
      title: section.title || `Section ${index + 1}`,
      items: Array.isArray(section.items) ? section.items.filter(Boolean) : []
    }));
  }

  if (source && typeof source.text === 'string' && source.text.trim()) {
    return [{
      id: 'summary',
      title: 'Summary',
      items: [source.text.trim()]
    }];
  }

  return [];
}

function findFinishedSection(sections, title) {
  return sections.find((section) => section.title === title) || null;
}

function firstFinishedItem(section) {
  return section && Array.isArray(section.items) && section.items.length > 0
    ? section.items[0]
    : null;
}

function buildFinishedResultSupportingArtifacts(session) {
  const workflow = ensureWorkflow(session);
  const artifacts = [];

  if (session.artifact && session.artifact.path) {
    artifacts.push({
      kind: 'bundle',
      label: session.artifact.artifactType === 'workflow_bundle' ? 'Result Bundle' : 'Current Artifact',
      title: session.artifact.title,
      path: session.artifact.path,
      previewText: session.artifact.previewText || session.artifact.text || ''
    });
  }

  if (workflow.specArtifact) {
    artifacts.push({
      kind: 'spec',
      label: 'Design Spec',
      title: workflow.specArtifact.title,
      path: workflow.specArtifact.relativePath,
      previewText: workflow.specArtifact.previewText || ''
    });
  }

  if (workflow.planArtifact) {
    artifacts.push({
      kind: 'plan',
      label: 'Implementation Plan',
      title: workflow.planArtifact.title,
      path: workflow.planArtifact.relativePath,
      previewText: workflow.planArtifact.previewText || ''
    });
  }

  return artifacts;
}

function buildFinishedResultSnapshot(session) {
  const source = getFinishedResultSource(session);
  if (!source) {
    return null;
  }

  const deliverable = source.deliverable && typeof source.deliverable === 'object'
    ? clone(source.deliverable)
    : null;
  const synthesis = source.synthesis && typeof source.synthesis === 'object'
    ? clone(source.synthesis)
    : (deliverable && deliverable.synthesis && typeof deliverable.synthesis === 'object'
      ? clone(deliverable.synthesis)
      : null);
  const sections = normalizeFinishedResultSections(source);

  if (sections.length === 0) {
    return null;
  }

  const recommendation = firstFinishedItem(findFinishedSection(sections, 'Recommendation'))
    || (synthesis && synthesis.recommendation ? `Choose: ${synthesis.recommendation}` : null)
    || source.title
    || 'Finished result';
  const rationale = firstFinishedItem(findFinishedSection(sections, 'Why This Path Currently Wins'))
    || firstFinishedItem(findFinishedSection(sections, 'Problem Framing'))
    || (typeof source.text === 'string' ? source.text.trim() : '');

  return {
    title: source.title || (deliverable && deliverable.title) || recommendation || 'Finished result',
    recommendationTitle: recommendation,
    recommendationSummary: rationale,
    sections,
    deliverable,
    synthesis,
    exportPaths: {
      jsonPath: `/api/sessions/${session.id}/result`,
      markdownPath: `/api/sessions/${session.id}/result.md`
    },
    supportingArtifacts: buildFinishedResultSupportingArtifacts(session)
  };
}

function syncFinishedResult(session) {
  const finishedResult = buildFinishedResultSnapshot(session);
  session.finishedResult = finishedResult ? clone(finishedResult) : null;

  if (!session.currentMessage || !session.finishedResult) {
    return;
  }

  if (session.currentMessage.type === 'summary' || session.currentMessage.type === 'artifact_ready') {
    session.currentMessage.finishedResult = clone(session.finishedResult);
    session.currentMessage.resultExportPaths = clone(session.finishedResult.exportPaths);
    if (session.finishedResult.deliverable) {
      session.currentMessage.deliverable = clone(session.finishedResult.deliverable);
    }
    if (session.finishedResult.synthesis) {
      session.currentMessage.synthesis = clone(session.finishedResult.synthesis);
    }
  }
}

function createSessionManager(options) {
  const dataDir = options.dataDir;
  const sessionsDir = path.join(dataDir, 'sessions');
  const artifactsDir = path.join(dataDir, 'artifacts');
  const researchAssetStore = options.researchAssetStore || createResearchAssetStore({ dataDir });
  const runtimeAdapter = options.runtimeAdapter || createCodexRuntimeAdapter(options.runtimeOptions || {});
  const fallbackRuntimeAdapter = options.fallbackRuntimeAdapter || createFakeCodexRuntimeAdapter();
  const defaultCwd = options.cwd || process.cwd();
  const workflowEngine = options.workflowEngine || createLocalWorkflowEngine();
  const checkpointStore = options.checkpointStore || createWorkflowCheckpointStore({ dataDir, cwd: defaultCwd });
  const reviewRetryBudget = typeof options.reviewRetryBudget === 'number'
    ? options.reviewRetryBudget
    : DEFAULT_REVIEW_RETRY_BUDGET;
  const runtimeSubmitTimeoutMs = typeof options.runtimeSubmitTimeoutMs === 'number'
    ? options.runtimeSubmitTimeoutMs
    : 18000;

  ensureDir(sessionsDir);
  ensureDir(artifactsDir);

  function sessionFile(sessionId) {
    return path.join(sessionsDir, `${sessionId}.json`);
  }

  function persistSession(session) {
    syncFinishedResult(session);
    refreshWorkflowChecklist(session);
    fs.writeFileSync(sessionFile(session.id), JSON.stringify(session, null, 2) + '\n');
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function ensureResearchState(session) {
    if (!session.research || typeof session.research !== 'object') {
      session.research = {
        workspaceId: null,
        workspace: null,
        bundles: [],
        reviewRequests: [],
        checkpoints: []
      };
    }
    return session.research;
  }

  function requireResearchWorkspace(session) {
    const research = ensureResearchState(session);
    if (!research.workspace) {
      throw new Error(`No research workspace for session: ${session.id}`);
    }
    return research.workspace;
  }

  function persistResearchWorkspace(session, workspace) {
    const research = ensureResearchState(session);
    const normalized = researchAssetStore.saveWorkspace({
      sessionId: session.id,
      ...(research.workspace || {}),
      ...(workspace || {})
    });
    research.workspaceId = normalized.id;
    research.workspace = normalized;
    session.updatedAt = nowIso();
    persistSession(session);
    return normalized;
  }

  function appendResearchCheckpoint(session, triggerType, summary) {
    const research = ensureResearchState(session);
    const checkpoint = checkpointStore.captureCheckpoint(session, {
      stageId: triggerType,
      label: summary || triggerType,
      reason: 'research-lifecycle'
    });
    if (research.workspace) {
      research.workspace.checkpoints = Array.isArray(research.workspace.checkpoints)
        ? research.workspace.checkpoints
        : [];
      research.workspace.checkpoints.push({
        id: checkpoint.id,
        triggerType,
        relativePath: checkpoint.relativePath,
        createdAt: checkpoint.createdAt
      });
      researchAssetStore.saveWorkspace(research.workspace);
    }
    research.checkpoints.push({
      id: checkpoint.id,
      triggerType,
      relativePath: checkpoint.relativePath,
      createdAt: checkpoint.createdAt
    });
    return checkpoint;
  }

  function loadSession(sessionId) {
    const filePath = sessionFile(sessionId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const session = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const workflow = ensureWorkflow(session);
    workflow.review.retryBudget = reviewRetryBudget;
    return session;
  }

  function createArtifact(session, summary, artifactMarkdown) {
    const title = `${session.id}.md`;
    const filePath = path.join(artifactsDir, title);
    fs.writeFileSync(filePath, artifactMarkdown || buildArtifactMarkdown(session, summary));
    return {
      artifactType: 'markdown',
      title,
      filePath,
      path: `/api/sessions/${session.id}/artifacts/current`,
      text: summary && summary.synthesis
        ? 'Structured brainstorming artifact is ready with recommendation, alternatives, and rationale.'
        : 'Structured brainstorming artifact is ready.',
      previewText: summary && typeof summary.text === 'string' ? summary.text : null
    };
  }

  function createWorkflowBundleArtifact(session) {
    const title = `${session.id}-bundle.md`;
    const filePath = path.join(artifactsDir, title);
    fs.writeFileSync(filePath, buildWorkflowBundleMarkdown(session));
    return {
      artifactType: 'workflow_bundle',
      title,
      filePath,
      path: `/api/sessions/${session.id}/artifacts/current`,
      text: 'The design spec and implementation plan are ready together in one bundle.',
      previewText: [
        session.workflow && session.workflow.specArtifact
          ? `Design Spec: ${session.workflow.specArtifact.title}`
          : null,
        session.workflow && session.workflow.planArtifact
          ? `Implementation Plan: ${session.workflow.planArtifact.title}`
          : null
      ].filter(Boolean).join('\n')
    };
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      Promise.resolve(promise).then((value) => {
        clearTimeout(timer);
        resolve(value);
      }, (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function setWorkflowStage(workflow, status, internalStage, visibleStage) {
    const priorVisibleId = workflow.visibleStage && workflow.visibleStage.id ? workflow.visibleStage.id : null;
    const nextVisibleId = visibleStage && visibleStage.id ? visibleStage.id : null;
    const changed = workflow.status !== status
      || workflow.internalStage !== internalStage
      || priorVisibleId !== nextVisibleId;

    workflow.status = status;
    workflow.internalStage = internalStage;
    workflow.visibleStage = visibleStage ? clone(visibleStage) : null;

    if (changed) {
      recordWorkflowEvent(workflow, {
        kind: 'stage-transition',
        status,
        internalStage,
        visibleStageId: nextVisibleId
      });
    }
  }

  function syncWorkflowWithRuntimeState(session) {
    const workflow = ensureWorkflow(session);
    if (workflow.mode !== WORKFLOW_MODES.FULL_SKILL) {
      return;
    }

    if (!session.currentMessage) {
      refreshWorkflowChecklist(session);
      return;
    }

    if (session.currentMessage.type === 'question') {
      const mapped = mapQuestioningStage(session.strategyState, session.currentMessage);
      workflow.blocked = null;
      setWorkflowStage(workflow, WORKFLOW_STATUS.QUESTIONING, mapped.internalStage, mapped.visibleStage);
    } else if (session.currentMessage.type === 'summary') {
      workflow.blocked = null;
      setWorkflowStage(workflow, WORKFLOW_STATUS.RUNNING, INTERNAL_STAGES.WRITE_DESIGN_DOC, buildVisibleStage('draft-document'));
    }

    refreshWorkflowChecklist(session);
  }

  function summarizeReviewFeedback(review) {
    const lines = [];
    const issues = Array.isArray(review && review.issues) ? review.issues : [];
    const recommendations = Array.isArray(review && review.recommendations) ? review.recommendations : [];
    if (issues.length > 0) {
      lines.push('Issues to address:');
      for (const issue of issues) {
        lines.push(`- ${issue}`);
      }
    }
    if (recommendations.length > 0) {
      lines.push('Recommendations to apply:');
      for (const item of recommendations) {
        lines.push(`- ${item}`);
      }
    }
    return lines.join('\n');
  }

  async function runWorkflowSpecDraft(session, revisionNotes) {
    const workflow = ensureWorkflow(session);
    workflow.review.retryBudget = reviewRetryBudget;
    workflow.blocked = null;

    while (workflow.review.attemptCount < reviewRetryBudget) {
      const attempt = workflow.review.attemptCount + 1;
      const internalStage = attempt === 1
        ? INTERNAL_STAGES.WRITE_DESIGN_DOC
        : INTERNAL_STAGES.REVIEW_SPEC_LOOP;

      setWorkflowStage(workflow, WORKFLOW_STATUS.RUNNING, internalStage, buildVisibleStage('draft-document'));
      recordWorkflowEvent(workflow, {
        kind: 'hidden-action',
        action: ACTION_KINDS.WRITE_DESIGN_DOC,
        boundary: evaluateWorkflowActionBoundary(ACTION_KINDS.WRITE_DESIGN_DOC, workflow.automationPolicy).reason,
        attempt
      });
      if (attempt > 1) {
        recordWorkflowEvent(workflow, {
          kind: 'hidden-action',
          action: ACTION_KINDS.RUN_SPEC_REVIEW_LOOP,
          boundary: evaluateWorkflowActionBoundary(ACTION_KINDS.RUN_SPEC_REVIEW_LOOP, workflow.automationPolicy).reason,
          attempt
        });
      }
      recordWorkflowCheckpoint(workflow, checkpointStore, session, {
        stageId: internalStage,
        label: attempt === 1 ? 'Before drafting the document' : `Before review retry ${attempt}`,
        reason: attempt === 1 ? 'draft-design-doc' : 'auto-review-retry'
      });

      const draft = await workflowEngine.createSpecDraft({
        session: clone(session),
        summary: clone(session.summary),
        specArtifact: clone(workflow.specArtifact),
        review: clone(workflow.review),
        revisionNotes: revisionNotes || summarizeReviewFeedback(workflow.review) || null,
        cwd: defaultCwd
      });

      workflow.specArtifact = createWorkflowArtifactRecord(
        defaultCwd,
        'specs',
        draft.specArtifact.title,
        draft.specArtifact.fileName,
        draft.specArtifact.markdown
      );
      workflow.review = {
        retryBudget: reviewRetryBudget,
        attemptCount: attempt,
        status: draft.review && draft.review.status ? draft.review.status : 'approved',
        issues: draft.review && Array.isArray(draft.review.issues) ? draft.review.issues : [],
        recommendations: draft.review && Array.isArray(draft.review.recommendations) ? draft.review.recommendations : []
      };

      recordWorkflowEvent(workflow, {
        kind: 'review-result',
        action: ACTION_KINDS.RUN_SPEC_REVIEW_LOOP,
        attempt,
        reviewStatus: workflow.review.status,
        issueCount: workflow.review.issues.length
      });

      if (workflow.review.status !== 'issues_found') {
        setWorkflowStage(workflow, WORKFLOW_STATUS.AWAITING_USER, INTERNAL_STAGES.AWAITING_SPEC_REVIEW, buildVisibleStage('review-spec'));
        recordWorkflowCheckpoint(workflow, checkpointStore, session, {
          stageId: 'review-spec',
          label: 'Draft ready for review',
          reason: 'await-user-review'
        });
        session.currentQuestionId = 'workflow-review-spec';
        session.currentMessage = createWorkflowReviewQuestion(workflow, draft.reviewPrompt);
        refreshWorkflowChecklist(session);
        return;
      }

      revisionNotes = summarizeReviewFeedback(workflow.review);
    }

    workflow.blocked = {
      kind: 'spec-review-loop',
      message: 'The drafted document still needs more direction before it can continue.',
      canResume: true
    };
    setWorkflowStage(workflow, WORKFLOW_STATUS.BLOCKED, INTERNAL_STAGES.BLOCKED, buildVisibleStage('review-blocked'));
    recordWorkflowCheckpoint(workflow, checkpointStore, session, {
      stageId: 'review-blocked',
      label: 'Draft blocked for user guidance',
      reason: 'needs-user-guidance'
    });
    session.currentQuestionId = 'workflow-revise-spec';
    session.currentMessage = createWorkflowRevisionQuestion(workflow, {
      title: 'The draft needs a bit more direction',
      description: 'The system could not confidently finish the draft on its own. Describe what should change, and it will try again.'
    });
    refreshWorkflowChecklist(session);
  }

  async function runWorkflowPlanDraft(session) {
    const workflow = ensureWorkflow(session);
    workflow.blocked = null;
    setWorkflowStage(workflow, WORKFLOW_STATUS.RUNNING, INTERNAL_STAGES.WRITE_PLAN, buildVisibleStage('draft-plan'));
    recordWorkflowEvent(workflow, {
      kind: 'hidden-action',
      action: ACTION_KINDS.GENERATE_IMPLEMENTATION_PLAN,
      boundary: evaluateWorkflowActionBoundary(ACTION_KINDS.GENERATE_IMPLEMENTATION_PLAN, workflow.automationPolicy).reason
    });
    recordWorkflowCheckpoint(workflow, checkpointStore, session, {
      stageId: INTERNAL_STAGES.WRITE_PLAN,
      label: 'Before drafting implementation plan',
      reason: 'draft-implementation-plan'
    });

    const draft = await workflowEngine.createPlan({
      session: clone(session),
      summary: clone(session.summary),
      specArtifact: clone(workflow.specArtifact),
      cwd: defaultCwd
    });

    const planArtifact = createWorkflowArtifactRecord(
      defaultCwd,
      'plans',
      draft.planArtifact.title,
      draft.planArtifact.fileName,
      draft.planArtifact.markdown
    );

    workflow.planArtifact = planArtifact;
    setWorkflowStage(workflow, WORKFLOW_STATUS.COMPLETE, INTERNAL_STAGES.COMPLETE, buildVisibleStage('plan-ready'));
    session.currentQuestionId = null;
    session.artifact = createWorkflowBundleArtifact(session);
    workflow.bundleArtifact = clone(session.artifact);
    recordWorkflowCheckpoint(workflow, checkpointStore, session, {
      stageId: 'plan-ready',
      label: 'Spec and plan bundle ready',
      reason: 'workflow-complete'
    });
    session.currentMessage = {
      type: 'artifact_ready',
      artifactType: draft.completion && draft.completion.artifactType
        ? draft.completion.artifactType
        : session.artifact.artifactType,
      title: draft.completion && draft.completion.title
        ? draft.completion.title
        : session.artifact.title,
      path: session.artifact.path,
      text: draft.completion && draft.completion.text
        ? draft.completion.text
        : session.artifact.text,
      artifactPreviewText: session.artifact.previewText,
      generatedArtifacts: [
        workflow.specArtifact
          ? {
              label: 'Design spec',
              title: workflow.specArtifact.title,
              path: workflow.specArtifact.relativePath
            }
          : null,
        workflow.planArtifact
          ? {
              label: 'Implementation plan',
              title: workflow.planArtifact.title,
              path: workflow.planArtifact.relativePath
            }
          : null,
        {
          label: 'Result bundle',
          title: session.artifact.title,
          path: session.artifact.path
        }
      ].filter(Boolean),
      nextActions: [
        'Review the result sheet and confirm the generated package matches your intent.',
        'Read the generated design spec and implementation plan before deciding whether to revise or implement.',
        'If you want a different direction, start a new brainstorming round from the composer at the top.'
      ],
      deliverable: session.summary && session.summary.deliverable ? clone(session.summary.deliverable) : null,
      synthesis: session.summary && session.summary.synthesis ? clone(session.summary.synthesis) : null
    };
    refreshWorkflowChecklist(session);
  }

  function applyRuntimeMessage(session, runtimeState) {
    session.backendMode = runtimeState.backendMode;
    session.providerSession = runtimeState.providerSession || null;
    session.strategyState = normalizeStrategyState(runtimeState.strategyState);
    session.currentQuestionId = runtimeState.currentQuestionId || null;
    session.history = runtimeState.history || [];
    ensureSessionProvenance(session);
    ensureWorkflow(session);

    if (runtimeState.currentMessage.type === 'summary') {
      session.summary = clone(runtimeState.currentMessage);
      recordMessageProvenance(session, runtimeState.currentMessage);
      if (session.completionMode === 'artifact' && session.workflow.mode !== WORKFLOW_MODES.FULL_SKILL) {
        session.artifact = createArtifact(session, runtimeState.currentMessage);
        session.currentMessage = {
          type: 'artifact_ready',
          artifactType: session.artifact.artifactType,
          title: session.artifact.title,
          path: session.artifact.path,
          text: session.artifact.text,
          artifactPreviewText: session.artifact.previewText,
          deliverable: runtimeState.currentMessage.deliverable ? clone(runtimeState.currentMessage.deliverable) : null,
          provenance: runtimeState.currentMessage.provenance ? clone(runtimeState.currentMessage.provenance) : null
        };
      } else {
        session.currentMessage = clone(runtimeState.currentMessage);
      }
      syncWorkflowWithRuntimeState(session);
      return;
    }

    if (runtimeState.currentMessage.type === 'artifact_ready') {
      const markdown = runtimeState.currentMessage.artifactMarkdown || null;
      session.artifact = createArtifact(session, session.summary || {
        text: runtimeState.currentMessage.text || '',
        answers: session.history.map((entry) => ({
          questionId: entry.questionId,
          answer: entry.answer
        }))
      }, markdown);
      session.currentMessage = {
        type: 'artifact_ready',
        artifactType: session.artifact.artifactType,
        title: runtimeState.currentMessage.title || session.artifact.title,
        path: session.artifact.path,
        text: runtimeState.currentMessage.text || session.artifact.text,
        artifactPreviewText: runtimeState.currentMessage.artifactPreviewText || session.artifact.previewText,
        deliverable: runtimeState.currentMessage.deliverable ? clone(runtimeState.currentMessage.deliverable) : null,
        provenance: runtimeState.currentMessage.provenance ? clone(runtimeState.currentMessage.provenance) : null
      };
      recordMessageProvenance(session, session.currentMessage);
      syncWorkflowWithRuntimeState(session);
      return;
    }

    session.currentMessage = clone(runtimeState.currentMessage);
    recordMessageProvenance(session, session.currentMessage);
    syncWorkflowWithRuntimeState(session);
  }

  async function createSession(input) {
    const now = new Date().toISOString();
    const flowId = input && input.flowId ? input.flowId : DEFAULT_FLOW_ID;
    const completionMode = input && input.completionMode ? input.completionMode : 'artifact';
    const seedPrompt = normalizeSeedPrompt(input && input.initialPrompt);
    const workflowMode = normalizeWorkflowMode(input && input.workflowMode);
    const sessionId = createId();
    let runtimeState;
    try {
      runtimeState = await runtimeAdapter.createSession({
        sessionId,
        flowId,
        completionMode,
        initialPrompt: seedPrompt,
        cwd: input && input.cwd ? input.cwd : defaultCwd
      });
    } catch (error) {
      if (workflowMode !== WORKFLOW_MODES.FULL_SKILL) {
        throw error;
      }
      runtimeState = await fallbackRuntimeAdapter.createSession({
        sessionId,
        flowId,
        completionMode,
        initialPrompt: seedPrompt,
        cwd: input && input.cwd ? input.cwd : defaultCwd
      });
    }

    const session = {
      id: sessionId,
      flowId,
      completionMode,
      workflowMode,
      seedPrompt,
      createdAt: now,
      updatedAt: now,
      backendMode: runtimeState.backendMode,
      providerSession: runtimeState.providerSession || null,
      strategyState: normalizeStrategyState(runtimeState.strategyState),
      currentQuestionId: runtimeState.currentQuestionId || null,
      history: runtimeState.history || [],
      currentMessage: runtimeState.currentMessage,
      summary: null,
      artifact: null,
      workflow: createInitialWorkflowState(workflowMode),
      research: {
        workspaceId: null,
        workspace: null,
        bundles: [],
        reviewRequests: [],
        checkpoints: []
      },
      provenance: {
        questions: [],
        finalResult: null
      }
    };

    applyRuntimeMessage(session, runtimeState);
    if (workflowMode === WORKFLOW_MODES.FULL_SKILL) {
      const workflow = ensureWorkflow(session);
      recordWorkflowEvent(workflow, {
        kind: 'hidden-action',
        action: ACTION_KINDS.EXPLORE_PROJECT_CONTEXT,
        boundary: evaluateWorkflowActionBoundary(ACTION_KINDS.EXPLORE_PROJECT_CONTEXT, workflow.automationPolicy).reason
      });
      recordWorkflowEvent(workflow, {
        kind: 'hidden-action',
        action: ACTION_KINDS.LOAD_BRAINSTORMING_SKILL,
        boundary: evaluateWorkflowActionBoundary(ACTION_KINDS.LOAD_BRAINSTORMING_SKILL, workflow.automationPolicy).reason
      });
    }
    persistSession(session);
    return clone(session);
  }

  function listSessions() {
    return fs.readdirSync(sessionsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => {
        const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, entry), 'utf-8'));
        ensureWorkflow(session);
        return session;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => ({
        id: session.id,
        flowId: session.flowId,
        backendMode: session.backendMode || null,
        completionMode: session.completionMode,
        workflowMode: normalizeWorkflowMode(session.workflowMode),
        workflowStage: session.workflow && session.workflow.visibleStage
          ? session.workflow.visibleStage.id
          : null,
        workflowStageLabel: session.workflow && session.workflow.visibleStage
          ? session.workflow.visibleStage.title
          : null,
        seedPrompt: session.seedPrompt || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        currentMessageType: session.currentMessage ? session.currentMessage.type : null
      }));
  }

  function getSession(sessionId) {
    return clone(loadSession(sessionId));
  }

  function getFinishedResult(sessionId) {
    const session = loadSession(sessionId);
    syncFinishedResult(session);
    if (!session.finishedResult) {
      throw new Error(`No finished result for session: ${sessionId}`);
    }
    return clone(session.finishedResult);
  }

  function getFinishedResultMarkdown(sessionId) {
    const session = loadSession(sessionId);
    const source = getFinishedResultSource(session);
    if (!source) {
      throw new Error(`No finished result for session: ${sessionId}`);
    }
    return buildArtifactMarkdown(session, source);
  }

  function getSessionProvenance(sessionId) {
    const session = loadSession(sessionId);
    ensureSessionProvenance(session);
    return clone(session.provenance);
  }

  function getSessionInspection(sessionId) {
    const session = loadSession(sessionId);
    const workflow = ensureWorkflow(session);
    return clone({
      sessionId: session.id,
      backendMode: session.backendMode || null,
      workflow: {
        mode: workflow.mode,
        status: workflow.status,
        internalStage: workflow.internalStage,
        visibleStage: workflow.visibleStage,
        blocked: workflow.blocked,
        automationPolicy: workflow.automationPolicy,
        approvalCheckpoints: workflow.approvalCheckpoints,
        checkpoints: workflow.checkpoints,
        hiddenActivity: workflow.hiddenActivity,
        skillChecklist: workflow.skillChecklist,
        review: workflow.review,
        specArtifact: workflow.specArtifact,
        planArtifact: workflow.planArtifact,
        bundleArtifact: workflow.bundleArtifact
      },
      provenance: session.provenance || {
        questions: [],
        finalResult: null
      }
    });
  }

  async function submitAnswer(sessionId, answer) {
    const session = loadSession(sessionId);
    const workflow = ensureWorkflow(session);
    if (!session.currentMessage || session.currentMessage.type !== 'question') {
      return clone(session);
    }

    if (workflow.mode === WORKFLOW_MODES.FULL_SKILL) {
      if (session.currentMessage.questionId === 'workflow-review-spec') {
        session.updatedAt = new Date().toISOString();
        if (Array.isArray(answer.optionIds) && answer.optionIds.includes('yes')) {
          recordApprovalCheckpoint(workflow, {
            kind: ACTION_KINDS.SPEC_REVIEW,
            decision: 'approved',
            questionId: session.currentMessage.questionId
          });
          await runWorkflowPlanDraft(session);
        } else {
          recordApprovalCheckpoint(workflow, {
            kind: ACTION_KINDS.SPEC_REVIEW,
            decision: 'needs_changes',
            questionId: session.currentMessage.questionId
          });
          workflow.blocked = null;
          setWorkflowStage(workflow, WORKFLOW_STATUS.AWAITING_USER, INTERNAL_STAGES.AWAITING_SPEC_REVISION, buildVisibleStage('refine-spec'));
          session.currentQuestionId = 'workflow-revise-spec';
          session.currentMessage = createWorkflowRevisionQuestion(workflow);
        }
        persistSession(session);
        return clone(session);
      }

      if (session.currentMessage.questionId === 'workflow-revise-spec') {
        session.updatedAt = new Date().toISOString();
        workflow.blocked = null;
        workflow.review = createInitialReviewState();
        await runWorkflowSpecDraft(session, answer.text || answer.rawInput || '');
        persistSession(session);
        return clone(session);
      }
    }

    const runtimeSnapshot = {
      sessionId: session.id,
      backendMode: session.backendMode,
      providerSession: session.providerSession,
      strategyState: session.strategyState,
      currentQuestionId: session.currentQuestionId,
      history: session.history || [],
      currentMessage: session.currentMessage
    };
    let next;
    try {
      next = await withTimeout(
        runtimeAdapter.submitAnswer(runtimeSnapshot, answer),
        runtimeSubmitTimeoutMs,
        'runtime submitAnswer'
      );
    } catch (error) {
      if (workflow.mode !== WORKFLOW_MODES.FULL_SKILL) {
        throw error;
      }
      recordWorkflowEvent(workflow, {
        kind: 'runtime-fallback',
        action: 'submit-answer',
        fromBackendMode: session.backendMode || 'unknown',
        error: error.message
      });
      try {
        next = await fallbackRuntimeAdapter.submitAnswer({
          ...runtimeSnapshot,
          backendMode: 'fake',
          providerSession: null
        }, answer);
      } catch (fallbackError) {
        const fallbackPrompt = answer && (answer.text || answer.rawInput)
          ? (answer.text || answer.rawInput)
          : (session.seedPrompt || '');
        recordWorkflowEvent(workflow, {
          kind: 'runtime-fallback-reseed',
          action: 'submit-answer',
          error: fallbackError.message
        });
        next = await fallbackRuntimeAdapter.createSession({
          sessionId: session.id,
          flowId: session.flowId,
          completionMode: session.completionMode,
          initialPrompt: fallbackPrompt,
          cwd: defaultCwd
        });
        next.history = [{
          questionId: session.currentQuestionId,
          question: session.currentMessage && session.currentMessage.title
            ? session.currentMessage.title
            : session.currentQuestionId,
          answer: fallbackPrompt
        }];
      }
    }

    session.updatedAt = new Date().toISOString();
    applyRuntimeMessage(session, next);
    if (workflow.mode === WORKFLOW_MODES.FULL_SKILL && session.currentMessage && session.currentMessage.type === 'summary') {
      recordApprovalCheckpoint(workflow, {
        kind: ACTION_KINDS.DESIGN_APPROVAL,
        decision: 'captured_in_question_flow',
        questionId: answer && answer.questionId ? answer.questionId : null
      });
      await runWorkflowSpecDraft(session, null);
    }
    persistSession(session);
    return clone(session);
  }

  function getArtifactContent(sessionId) {
    const session = loadSession(sessionId);
    if (!session.artifact || !session.artifact.filePath) {
      throw new Error(`No artifact for session: ${sessionId}`);
    }
    return fs.readFileSync(session.artifact.filePath, 'utf-8');
  }

  function attachResearchWorkspace(sessionId, input) {
    const session = loadSession(sessionId);
    const research = ensureResearchState(session);
    const workspace = persistResearchWorkspace(session, {
      id: research.workspace && research.workspace.id ? research.workspace.id : undefined,
      title: input && input.title ? input.title : 'Research Workspace',
      team: input && input.team ? input.team : null,
      owner: input && input.owner ? input.owner : null,
      status: research.workspace && research.workspace.status
        ? research.workspace.status
        : WORKSPACE_STATUS.ACTIVE
    });
    return clone(workspace);
  }

  function getWorkspaceOrThrow(workspaceId) {
    const workspace = researchAssetStore.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Unknown workspace: ${workspaceId}`);
    }
    return workspace;
  }

  function createWorkspaceCheckpointSession(workspace) {
    return {
      id: workspace.sessionId || `research-workspace-${workspace.id}`,
      updatedAt: nowIso(),
      currentQuestionId: workspace.rootQuestionId || null,
      history: [],
      seedPrompt: workspace.title || null,
      workflow: createInitialWorkflowState(WORKFLOW_MODES.FULL_SKILL)
    };
  }

  function appendWorkspaceCheckpoint(workspace, triggerType, summary) {
    const checkpoint = checkpointStore.captureCheckpoint(createWorkspaceCheckpointSession(workspace), {
      stageId: triggerType,
      label: summary || triggerType,
      reason: 'research-lifecycle'
    });
    const nextCheckpoints = Array.isArray(workspace.checkpoints)
      ? workspace.checkpoints.slice()
      : [];
    nextCheckpoints.push({
      id: checkpoint.id,
      triggerType,
      relativePath: checkpoint.relativePath,
      createdAt: checkpoint.createdAt
    });
    return researchAssetStore.saveWorkspace({
      ...workspace,
      checkpoints: nextCheckpoints
    });
  }

  function assertHumanConfirmation(context, action) {
    const actorKind = String(context && context.actorKind ? context.actorKind : 'human').trim().toLowerCase();
    if (actorKind === 'agent' && !Boolean(context && context.confirmedByHuman)) {
      const error = new Error(`Human confirmation required for ${action}`);
      error.code = 'HUMAN_CONFIRMATION_REQUIRED';
      throw error;
    }
  }

  function updateSessionResearchWorkspace(workspace) {
    if (!workspace || !workspace.sessionId) {
      return;
    }
    try {
      const session = loadSession(workspace.sessionId);
      const research = ensureResearchState(session);
      research.workspaceId = workspace.id;
      research.workspace = clone(workspace);
      session.updatedAt = nowIso();
      persistSession(session);
    } catch (_error) {
      // Standalone workspace operations should not fail because a linked session no longer exists.
    }
  }

  function addRootResearchQuestion(sessionId, input) {
    const session = loadSession(sessionId);
    const workspace = requireResearchWorkspace(session);
    if (workspace.rootQuestionId) {
      throw new Error('Workspace must keep a single root research question');
    }
    const timestamp = nowIso();
    const question = {
      id: createId(),
      title: input && input.title ? input.title : 'Research Question',
      problemStatement: input && input.problemStatement ? input.problemStatement : (input && input.title ? input.title : ''),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const updated = persistResearchWorkspace(session, {
      ...workspace,
      rootQuestionId: question.id,
      researchQuestion: question
    });
    return clone(updated.researchQuestion);
  }

  function reviseWorkspaceEvidenceSource(workspaceId, evidenceId, patch, context) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    const evidenceItems = Array.isArray(workspace.evidence) ? workspace.evidence : [];
    const evidence = evidenceItems.find((item) => item.id === evidenceId);
    if (!evidence) {
      throw new Error(`Unknown evidence: ${evidenceId}`);
    }

    const timestamp = nowIso();
    const nextEvidence = evidenceItems.slice();
    const index = nextEvidence.findIndex((item) => item.id === evidenceId);
    const sourceFields = ['source', 'sourceFingerprint', 'sourceLocator', 'capturedAt', 'collector'];
    const sourceChanged = sourceFields.some((field) => Object.prototype.hasOwnProperty.call(patch || {}, field));
    let revisedEvidence;

    if (sourceChanged && ['verified', 'accepted'].includes(evidence.status)) {
      revisedEvidence = {
        ...evidence,
        ...(patch || {}),
        id: createId(),
        status: 'collected',
        verifiedAt: null,
        verifiedBy: null,
        acceptedAt: null,
        acceptedBy: null,
        supersedesEvidenceId: evidence.id,
        revisedFromEvidenceId: evidence.id,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      nextEvidence.push(revisedEvidence);
    } else {
      revisedEvidence = {
        ...evidence,
        ...(patch || {}),
        updatedAt: timestamp
      };
      nextEvidence[index] = revisedEvidence;
    }

    const updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      evidence: nextEvidence
    });
    appendWorkspaceAudit(updatedWorkspace, {
      action: 'evidence_revised',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'Evidence',
      targetId: revisedEvidence.id,
      before: { evidenceId: evidence.id, status: evidence.status },
      after: { evidenceId: revisedEvidence.id, status: revisedEvidence.status },
      reason: context && context.reason ? context.reason : '',
      details: {
        sourceChanged,
        revisedFromEvidenceId: sourceChanged && ['verified', 'accepted'].includes(evidence.status) ? evidence.id : null
      }
    });
    updateSessionResearchWorkspace(updatedWorkspace);
    return clone(revisedEvidence);
  }

  function verifyWorkspaceEvidence(workspaceId, evidenceId, context) {
    assertHumanConfirmation(context, 'evidence verification');
    const workspace = getWorkspaceOrThrow(workspaceId);
    const evidenceItems = Array.isArray(workspace.evidence) ? workspace.evidence : [];
    const evidence = evidenceItems.find((item) => item.id === evidenceId);
    if (!evidence) {
      throw new Error(`Unknown evidence: ${evidenceId}`);
    }
    if (evidence.status === 'accepted') {
      throw new Error('Accepted evidence cannot move back to Verified');
    }

    const timestamp = nowIso();
    const nextEvidence = evidenceItems.map((item) => (
      item.id === evidenceId
        ? {
            ...item,
            status: 'verified',
            verifiedAt: timestamp,
            verifiedBy: context && context.actorId ? context.actorId : null,
            updatedAt: timestamp
          }
        : item
    ));
    const updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      evidence: nextEvidence
    });
    appendWorkspaceAudit(updatedWorkspace, {
      action: 'evidence_verified',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'Evidence',
      targetId: evidenceId,
      before: { status: evidence.status },
      after: { status: 'verified' },
      reason: context && context.reason ? context.reason : '',
      details: {}
    });
    updateSessionResearchWorkspace(updatedWorkspace);
    return clone(updatedWorkspace.evidence.find((item) => item.id === evidenceId));
  }

  function acceptWorkspaceEvidence(workspaceId, evidenceId, context) {
    assertHumanConfirmation(context, 'evidence acceptance');
    const workspace = getWorkspaceOrThrow(workspaceId);
    const evidenceItems = Array.isArray(workspace.evidence) ? workspace.evidence : [];
    const evidence = evidenceItems.find((item) => item.id === evidenceId);
    if (!evidence || evidence.status !== 'verified') {
      throw new Error('Evidence must be Verified before it can be Accepted');
    }

    const timestamp = nowIso();
    let updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      evidence: evidenceItems.map((item) => (
        item.id === evidenceId
          ? {
              ...item,
              status: 'accepted',
              acceptedAt: timestamp,
              acceptedBy: context && context.actorId ? context.actorId : null,
              updatedAt: timestamp
            }
          : item
      ))
    });
    updatedWorkspace = appendWorkspaceCheckpoint(updatedWorkspace, 'evidence_accepted', 'Evidence accepted');
    appendWorkspaceAudit(updatedWorkspace, {
      action: 'evidence_accepted',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'Evidence',
      targetId: evidenceId,
      before: { status: evidence.status },
      after: { status: 'accepted' },
      reason: context && context.reason ? context.reason : '',
      details: {}
    });
    updateSessionResearchWorkspace(updatedWorkspace);
    return clone(updatedWorkspace.evidence.find((item) => item.id === evidenceId));
  }

  function confirmJudgment(workspaceId, judgmentId, context) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    const judgmentItems = Array.isArray(workspace.judgments) ? workspace.judgments : [];
    const judgment = judgmentItems.find((item) => item.id === judgmentId);
    if (!judgment) {
      throw new Error(`Unknown judgment: ${judgmentId}`);
    }

    const acceptedEvidenceIds = new Set(
      (workspace.evidence || [])
        .filter((item) => item.status === 'accepted')
        .map((item) => item.id)
    );
    if (
      !Array.isArray(judgment.evidenceRefs)
      || judgment.evidenceRefs.length === 0
      || !judgment.evidenceRefs.every((id) => acceptedEvidenceIds.has(id))
    ) {
      const error = new Error('Judgment must reference Accepted Evidence before it can be Confirmed');
      error.code = 'INVALID_JUDGMENT_PROMOTION';
      throw error;
    }

    const timestamp = nowIso();
    let updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      judgments: judgmentItems.map((item) => (
        item.id === judgmentId
          ? {
              ...item,
              status: 'confirmed',
              confirmedAt: timestamp,
              confirmedBy: context && context.actorId ? context.actorId : null,
              updatedAt: timestamp
            }
          : item
      ))
    });
    updatedWorkspace = appendWorkspaceCheckpoint(updatedWorkspace, 'judgment_confirmed_or_superseded', 'Judgment confirmed');
    appendWorkspaceAudit(updatedWorkspace, {
      action: 'judgment_confirmed',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'Judgment',
      targetId: judgmentId,
      before: { status: judgment.status || null },
      after: { status: 'confirmed' },
      reason: context && context.reason ? context.reason : '',
      details: {
        evidenceRefs: judgment.evidenceRefs || []
      }
    });
    updateSessionResearchWorkspace(updatedWorkspace);
    return clone(updatedWorkspace.judgments.find((item) => item.id === judgmentId));
  }

  function markWorkspaceReadyForPublish(workspaceId, context) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    const validation = computePublishValidation({
      ...workspace,
      status: WORKSPACE_STATUS.READY_FOR_PUBLISH
    });
    if (!validation.ok) {
      const error = new Error(`Workspace failed publish validation: ${validation.errorCodes.join(', ')}`);
      error.code = 'PUBLISH_VALIDATION_FAILED';
      error.validation = validation;
      throw error;
    }

    let updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      status: WORKSPACE_STATUS.READY_FOR_PUBLISH
    });
    updatedWorkspace = appendWorkspaceCheckpoint(updatedWorkspace, 'workspace_ready_for_publish', 'Workspace ready for publish');
    appendWorkspaceAudit(updatedWorkspace, {
      action: 'workspace_ready_for_publish',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'Workspace',
      targetId: workspace.id,
      before: { status: workspace.status },
      after: { status: WORKSPACE_STATUS.READY_FOR_PUBLISH },
      reason: context && context.reason ? context.reason : '',
      details: {}
    });
    updateSessionResearchWorkspace(updatedWorkspace);
    return {
      workspace: clone(updatedWorkspace),
      validation
    };
  }

  function acceptEvidence(sessionId, evidenceId) {
    const session = loadSession(sessionId);
    const workspace = requireResearchWorkspace(session);
    const updatedEvidence = acceptWorkspaceEvidence(workspace.id, evidenceId, {});
    const refreshedWorkspace = researchAssetStore.getWorkspace(workspace.id);
    const research = ensureResearchState(session);
    research.workspace = refreshedWorkspace;
    research.workspaceId = refreshedWorkspace ? refreshedWorkspace.id : null;
    appendResearchCheckpoint(session, 'evidence_accepted', 'Evidence accepted');
    persistSession(session);
    return clone(updatedEvidence);
  }

  function validateWorkspaceForPublish(sessionId) {
    const session = loadSession(sessionId);
    const workspace = requireResearchWorkspace(session);
    return computePublishValidation(workspace);
  }

  function computePublishValidation(workspace) {
    const errorCodes = [];
    const warningCodes = [];
    const acceptedEvidence = (workspace.evidence || []).filter((item) => item.status === 'accepted');
    const acceptedEvidenceIds = new Set(acceptedEvidence.map((item) => item.id));
    const confirmedJudgments = (workspace.judgments || []).filter((item) => item.status === 'confirmed');
    const activeHypotheses = (workspace.hypotheses || []).filter((item) => item.status === 'active');
    const conclusion = workspace.conclusion || null;
    const conclusionTracksActiveRisk = typeof workspace.conclusionOpenRisksMentionActiveBranches === 'boolean'
      ? workspace.conclusionOpenRisksMentionActiveBranches
      : Boolean(conclusion && conclusion.openRisksMentionActiveBranches);

    if (!workspace.rootQuestionId || !workspace.researchQuestion) {
      errorCodes.push('root-question-missing');
    }
    if (confirmedJudgments.length === 0) {
      errorCodes.push('confirmed-judgment-missing');
    }
    if (confirmedJudgments.some((item) => (
      !Array.isArray(item.evidenceRefs)
      || item.evidenceRefs.length === 0
      || !item.evidenceRefs.every((id) => acceptedEvidenceIds.has(id))
    ))) {
      errorCodes.push('judgment-missing-accepted-evidence');
    }
    if (acceptedEvidence.some((item) => !item.sourceFingerprint || !item.sourceLocator || !item.capturedAt || !item.collector)) {
      errorCodes.push('evidence-metadata-missing');
    }
    if (
      !conclusion
      || conclusion.status !== 'ready'
      || !Array.isArray(conclusion.judgmentRefs)
      || conclusion.judgmentRefs.length === 0
      || !Array.isArray(conclusion.openRisks)
      || conclusion.openRisks.length === 0
      || !Array.isArray(conclusion.nextActions)
      || conclusion.nextActions.length === 0
    ) {
      errorCodes.push('conclusion-not-ready');
    }
    if (workspace.status !== WORKSPACE_STATUS.READY_FOR_PUBLISH) {
      errorCodes.push('workspace-not-ready-for-publish');
    }
    if (activeHypotheses.length > 0 && !conclusionTracksActiveRisk) {
      warningCodes.push('active-branch-risk-missing');
    }
    if ((workspace.evidence || []).some((item) => item.status === 'reviewed')) {
      warningCodes.push('reviewed-evidence-unresolved');
    }

    return {
      ok: errorCodes.length === 0,
      errorCodes: Array.from(new Set(errorCodes)).sort(),
      warningCodes: Array.from(new Set(warningCodes)).sort(),
      workspaceId: workspace.id
    };
  }

  function appendWorkspaceAudit(workspace, payload) {
    const entry = researchAssetStore.appendAuditEntry(workspace.id, normalizeAuditEntry({
      workspaceId: workspace.id,
      ...payload
    }));
    workspace.auditRefs = Array.isArray(workspace.auditRefs) ? workspace.auditRefs : [];
    workspace.auditRefs.push(entry.id);
    researchAssetStore.saveWorkspace(workspace);
    return entry;
  }

  function linkReviewRequestToWorkspace(workspace, reviewRequestId) {
    if (!workspace || !reviewRequestId) {
      return workspace;
    }
    const reviewRequests = Array.isArray(workspace.reviewRequests)
      ? workspace.reviewRequests.slice()
      : [];
    if (!reviewRequests.includes(reviewRequestId)) {
      reviewRequests.push(reviewRequestId);
    }
    return researchAssetStore.saveWorkspace({
      ...workspace,
      reviewRequests
    });
  }

  function resolveWorkspaceForReviewRequest(reviewRequest) {
    if (!reviewRequest) {
      return null;
    }
    if (reviewRequest.workspaceId) {
      return researchAssetStore.getWorkspace(reviewRequest.workspaceId);
    }
    const bundleId = reviewRequest.bundleId || reviewRequest.targetId;
    if (bundleId && reviewRequest.targetType === 'ResearchAssetBundle') {
      const bundle = researchAssetStore.getBundle(bundleId);
      if (bundle && bundle.workspaceId) {
        return researchAssetStore.getWorkspace(bundle.workspaceId);
      }
    }
    return null;
  }

  function assertAllowed(role, action) {
    const resolvedRole = String(role || '').trim().toLowerCase();
    const permissions = {
      owner: new Set([
        'publish',
        'revoke_publish',
        'audit:view',
        'review-request:create',
        'review-request:view',
        'review-request:resolve',
        'review-request:reject',
        'workspace:view',
        'hypothesis:park',
        'hypothesis:supersede',
        'evidence_verify',
        'evidence_accept',
        'export',
        'cross_team_share',
        'workspace:clone'
      ]),
      editor: new Set([
        'publish',
        'review-request:create',
        'review-request:view',
        'review-request:resolve',
        'review-request:reject',
        'workspace:view',
        'hypothesis:park',
        'hypothesis:supersede',
        'evidence_verify',
        'evidence_accept',
        'workspace:clone'
      ]),
      viewer: new Set(['workspace:view']),
      auditor: new Set(['audit:view', 'review-request:view', 'workspace:view'])
    };
    const allowed = permissions[resolvedRole];
    if (!allowed || !allowed.has(action)) {
      const error = new Error(`Forbidden for role ${role || 'unknown'} on action ${action}`);
      error.code = 'FORBIDDEN';
      throw error;
    }
  }

  function listResearchAssets() {
    return researchAssetStore.listBundles();
  }

  function listResearchWorkspaces() {
    return researchAssetStore.listWorkspaces();
  }

  function getResearchWorkspace(workspaceId) {
    return clone(getWorkspaceOrThrow(workspaceId));
  }

  function getWorkspacePublishReview(workspaceId) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    const validation = computePublishValidation(workspace);
    const openReviewRequests = listReviewRequests({
      workspaceId,
      status: REVIEW_REQUEST_STATUS.OPEN
    });
    const publishedBundles = researchAssetStore.listBundles()
      .filter((item) => item.workspaceId === workspaceId)
      .sort((left, right) => (right.version || 0) - (left.version || 0));
    const nextVersion = publishedBundles.length > 0
      ? Math.max(...publishedBundles.map((item) => item.version || 0)) + 1
      : 1;
    return {
      workspace: clone(workspace),
      validation,
      nextVersion,
      openReviewRequests: clone(openReviewRequests),
      publishedBundles: clone(publishedBundles)
    };
  }

  function getResearchAsset(bundleId) {
    const bundle = researchAssetStore.getBundle(bundleId);
    if (!bundle) {
      throw new Error(`Unknown research asset: ${bundleId}`);
    }
    return clone(bundle);
  }

  function listAuditEntries(query) {
    const workspaceId = query && query.workspaceId ? query.workspaceId : null;
    return researchAssetStore.listAuditEntries(workspaceId);
  }

  function listReviewRequests(query) {
    let items = researchAssetStore.listReviewRequests();
    if (query && query.workspaceId) {
      items = items.filter((item) => item.workspaceId === query.workspaceId);
    }
    if (query && query.status) {
      items = items.filter((item) => item.status === query.status);
    }
    if (query && query.targetType) {
      items = items.filter((item) => item.targetType === query.targetType);
    }
    if (query && query.targetId) {
      items = items.filter((item) => item.targetId === query.targetId);
    }
    return items;
  }

  function createReviewRequest(input) {
    const targetType = input && input.targetType ? input.targetType : null;
    const targetId = input && input.targetId ? input.targetId : null;
    if (targetType === 'Workspace' && input.type === 'publish-approval') {
      const workspace = researchAssetStore.getWorkspace(targetId);
      if (!workspace || workspace.status !== WORKSPACE_STATUS.READY_FOR_PUBLISH) {
        const error = new Error('Workspace must be ready for publish before approval can be requested');
        error.code = 'INVALID_REVIEW_REQUEST';
        throw error;
      }
    }
    const created = researchAssetStore.saveReviewRequest(normalizeReviewRequest({
      requestType: input && input.type ? input.type : null,
      targetType,
      targetId,
      workspaceId: targetType === 'Workspace' ? targetId : (input && input.workspaceId ? input.workspaceId : null),
      bundleId: targetType === 'ResearchAssetBundle' ? targetId : (input && input.bundleId ? input.bundleId : null),
      requestedBy: input && input.requestedBy ? input.requestedBy : null,
      assigneeId: input && input.assigneeId ? input.assigneeId : null,
      status: REVIEW_REQUEST_STATUS.OPEN,
      statusHistory: [{
        status: REVIEW_REQUEST_STATUS.OPEN,
        at: nowIso(),
        by: input && input.requestedBy ? input.requestedBy : null,
        note: ''
      }],
      metadata: input && input.metadata ? input.metadata : {}
    }));
    const workspace = resolveWorkspaceForReviewRequest(created);
    if (workspace) {
      const linkedWorkspace = linkReviewRequestToWorkspace(workspace, created.id);
      updateSessionResearchWorkspace(linkedWorkspace);
    }
    return clone(created);
  }

  function decideReviewRequest(requestId, status, context) {
    const existing = researchAssetStore.getReviewRequest(requestId);
    if (!existing) {
      throw new Error(`Unknown review request: ${requestId}`);
    }
    if (![REVIEW_REQUEST_STATUS.RESOLVED, REVIEW_REQUEST_STATUS.REJECTED].includes(status)) {
      const error = new Error(`Unsupported review request status: ${status}`);
      error.code = 'INVALID_REVIEW_REQUEST';
      throw error;
    }
    if (existing.status !== REVIEW_REQUEST_STATUS.OPEN) {
      const error = new Error('Only open review requests can be updated');
      error.code = 'INVALID_REVIEW_REQUEST';
      throw error;
    }

    const timestamp = nowIso();
    const resolutionNote = context && typeof context.reason === 'string' ? context.reason : '';
    const statusHistory = Array.isArray(existing.statusHistory)
      ? existing.statusHistory.slice()
      : [];
    statusHistory.push({
      status,
      at: timestamp,
      by: context && context.actorId ? context.actorId : null,
      note: resolutionNote
    });

    const workspace = resolveWorkspaceForReviewRequest(existing);
    const updated = researchAssetStore.updateReviewRequest(requestId, {
      status,
      workspaceId: existing.workspaceId || (workspace && workspace.id) || null,
      resolvedAt: timestamp,
      resolvedBy: context && context.actorId ? context.actorId : null,
      resolutionNote,
      statusHistory
    });
    if (!updated) {
      throw new Error(`Unknown review request: ${requestId}`);
    }
    if (workspace) {
      const linkedWorkspace = linkReviewRequestToWorkspace(workspace, updated.id);
      appendWorkspaceAudit(linkedWorkspace, {
        action: status === REVIEW_REQUEST_STATUS.RESOLVED
          ? 'review_request_resolved'
          : 'review_request_rejected',
        actorId: context && context.actorId ? context.actorId : null,
        actorRole: context && context.actorRole ? context.actorRole : null,
        targetType: 'ReviewRequest',
        targetId: updated.id,
        before: { status: existing.status },
        after: { status: updated.status },
        reason: resolutionNote,
        details: {
          requestType: updated.requestType,
          reviewTargetType: updated.targetType,
          reviewTargetId: updated.targetId,
          assigneeId: updated.assigneeId
        }
      });
      updateSessionResearchWorkspace(linkedWorkspace);
    }
    return clone(updated);
  }

  function resolveReviewRequest(requestId, context) {
    return decideReviewRequest(requestId, REVIEW_REQUEST_STATUS.RESOLVED, context);
  }

  function rejectReviewRequest(requestId, context) {
    return decideReviewRequest(requestId, REVIEW_REQUEST_STATUS.REJECTED, context);
  }

  function transitionHypothesis(workspaceId, hypothesisId, nextStatus, context) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    const hypotheses = Array.isArray(workspace.hypotheses) ? workspace.hypotheses : [];
    const hypothesis = hypotheses.find((item) => item.id === hypothesisId);
    if (!hypothesis) {
      throw new Error(`Unknown hypothesis: ${hypothesisId}`);
    }
    if (hypothesis.status === nextStatus) {
      const error = new Error(`Hypothesis is already ${nextStatus}`);
      error.code = 'INVALID_HYPOTHESIS_TRANSITION';
      throw error;
    }

    const timestamp = nowIso();
    const reason = context && typeof context.reason === 'string' ? context.reason : '';
    const nextHypotheses = hypotheses.map((item) => {
      if (item.id !== hypothesisId) {
        return item;
      }
      const updated = {
        ...item,
        status: nextStatus,
        updatedAt: timestamp
      };
      if (nextStatus === 'parked') {
        updated.parkedAt = timestamp;
        updated.parkedBy = context && context.actorId ? context.actorId : null;
        updated.parkedReason = reason;
      } else {
        updated.supersededAt = timestamp;
        updated.supersededBy = context && context.actorId ? context.actorId : null;
        updated.supersededReason = reason;
        updated.supersededByHypothesisId = context && context.supersededByHypothesisId
          ? String(context.supersededByHypothesisId)
          : (item.supersededByHypothesisId || null);
      }
      return updated;
    });

    let updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      hypotheses: nextHypotheses
    });
    updatedWorkspace = appendWorkspaceCheckpoint(
      updatedWorkspace,
      'hypothesis_parked_or_superseded',
      nextStatus === 'parked' ? 'Hypothesis parked' : 'Hypothesis superseded'
    );
    appendWorkspaceAudit(updatedWorkspace, {
      action: nextStatus === 'parked' ? 'hypothesis_parked' : 'hypothesis_superseded',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'Hypothesis',
      targetId: hypothesisId,
      before: { status: hypothesis.status || null },
      after: { status: nextStatus },
      reason,
      details: {
        title: hypothesis.title || null,
        supersededByHypothesisId: nextStatus === 'superseded'
          ? (context && context.supersededByHypothesisId ? String(context.supersededByHypothesisId) : null)
          : null
      }
    });
    updateSessionResearchWorkspace(updatedWorkspace);
    return clone(updatedWorkspace.hypotheses.find((item) => item.id === hypothesisId));
  }

  function parkHypothesis(workspaceId, hypothesisId, context) {
    return transitionHypothesis(workspaceId, hypothesisId, 'parked', context);
  }

  function supersedeHypothesis(workspaceId, hypothesisId, context) {
    return transitionHypothesis(workspaceId, hypothesisId, 'superseded', context);
  }

  function cloneResearchAsset(bundleId, input) {
    const bundle = researchAssetStore.getBundle(bundleId);
    if (!bundle) {
      throw new Error(`Unknown research asset: ${bundleId}`);
    }
    const sourceWorkspace = bundle.workspaceId ? researchAssetStore.getWorkspace(bundle.workspaceId) : null;
    const sourceQuestion = bundle.researchQuestion || (sourceWorkspace && sourceWorkspace.researchQuestion) || null;
    const sourceJudgments = Array.isArray(bundle.includedJudgments) && bundle.includedJudgments.length > 0
      ? bundle.includedJudgments
      : ((sourceWorkspace && Array.isArray(sourceWorkspace.judgments))
          ? sourceWorkspace.judgments.filter((item) => item.status === 'confirmed')
          : []);
    const sourceHypotheses = Array.isArray(bundle.includedHypotheses) && bundle.includedHypotheses.length > 0
      ? bundle.includedHypotheses
      : ((sourceWorkspace && Array.isArray(sourceWorkspace.hypotheses)) ? sourceWorkspace.hypotheses : []);
    const sourceConclusion = bundle.conclusion || (sourceWorkspace && sourceWorkspace.conclusion) || null;

    const evidenceIdMap = new Map();
    const clonedEvidence = (bundle.includedEvidence || []).map((item) => {
      const nextId = createId();
      evidenceIdMap.set(item.id, nextId);
      return {
        ...clone(item),
        id: nextId,
        status: 'accepted'
      };
    });
    const judgmentIdMap = new Map();
    const clonedJudgments = sourceJudgments.map((item) => {
      const nextId = createId();
      judgmentIdMap.set(item.id, nextId);
      return {
        ...clone(item),
        id: nextId,
        evidenceRefs: Array.isArray(item.evidenceRefs)
          ? item.evidenceRefs.map((id) => evidenceIdMap.get(id) || id)
          : []
      };
    });
    const clonedQuestion = sourceQuestion
      ? {
          ...clone(sourceQuestion),
          id: createId()
        }
      : null;
    const clonedConclusion = sourceConclusion
      ? {
          ...clone(sourceConclusion),
          id: createId(),
          judgmentRefs: Array.isArray(sourceConclusion.judgmentRefs)
            ? sourceConclusion.judgmentRefs.map((id) => judgmentIdMap.get(id) || id)
            : []
        }
      : null;

    let workspace = researchAssetStore.saveWorkspace({
      title: input && input.title ? input.title : `${bundle.title || 'Research Asset'} Working Copy`,
      team: input && input.team ? input.team : bundle.team,
      owner: input && input.owner ? input.owner : null,
      sessionId: input && input.sessionId ? input.sessionId : null,
      status: WORKSPACE_STATUS.ACTIVE,
      sourceBundleId: bundle.id,
      rootQuestionId: clonedQuestion ? clonedQuestion.id : bundle.rootQuestionId,
      researchQuestion: clonedQuestion,
      hypotheses: clone(sourceHypotheses),
      evidence: clonedEvidence,
      judgments: clonedJudgments,
      conclusion: clonedConclusion,
      permissions: clone(bundle.permissions || {})
    });
    workspace = appendWorkspaceCheckpoint(workspace, 'workspace_cloned_from_bundle', 'Workspace cloned from published bundle');
    updateSessionResearchWorkspace(workspace);
    return clone(workspace);
  }

  function publishWorkspace(workspaceId, context) {
    assertHumanConfirmation(context, 'workspace publish');
    const workspace = getWorkspaceOrThrow(workspaceId);
    const validation = computePublishValidation(workspace);
    if (!validation.ok) {
      const error = new Error(`Workspace failed publish validation: ${validation.errorCodes.join(', ')}`);
      error.code = 'PUBLISH_VALIDATION_FAILED';
      error.validation = validation;
      throw error;
    }

    const existingBundles = researchAssetStore.listBundles()
      .filter((item) => item.workspaceId === workspace.id)
      .sort((left, right) => (left.version || 0) - (right.version || 0));
    const existingVersions = existingBundles.map((item) => item.version || 0);
    const nextVersion = (existingVersions.length ? Math.max(...existingVersions) : 0) + 1;
    const confirmedJudgments = (workspace.judgments || []).filter((item) => item.status === 'confirmed');
    const referencedEvidenceIds = new Set(confirmedJudgments.flatMap((item) => item.evidenceRefs || []));
    const includedEvidence = (workspace.evidence || []).filter((item) => item.status === 'accepted' && referencedEvidenceIds.has(item.id));
    const excludedEvidence = (workspace.evidence || [])
      .filter((item) => item.status !== 'accepted')
      .map((item) => item.id);
    const includedHypotheses = (workspace.hypotheses || [])
      .filter((item) => ['active', 'parked', 'superseded'].includes(item.status));

    existingBundles
      .filter((item) => item.status === BUNDLE_STATUS.PUBLISHED)
      .forEach((item) => {
        researchAssetStore.updateBundle(item.id, {
          status: BUNDLE_STATUS.SUPERSEDED,
          supersededByVersion: nextVersion
        });
      });

    const bundle = researchAssetStore.saveBundle({
      workspaceId: workspace.id,
      rootQuestionId: workspace.rootQuestionId,
      title: workspace.title,
      team: workspace.team,
      version: nextVersion,
      status: BUNDLE_STATUS.PUBLISHED,
      permissions: workspace.permissions || {},
      sourceWorkspace: {
        id: workspace.id,
        title: workspace.title,
        status: workspace.status
      },
      publishSummary: context && context.reason ? context.reason : '',
      researchQuestion: clone(workspace.researchQuestion),
      includedHypotheses,
      includedEvidence,
      includedJudgments: confirmedJudgments,
      conclusion: clone(workspace.conclusion),
      excludedEvidence,
      checkpointRefs: (workspace.checkpoints || []).map((item) => item.id || item),
      auditRefs: (workspace.auditRefs || []).slice(),
      sharedWithTeams: []
    });

    const updatedWorkspace = researchAssetStore.saveWorkspace({
      ...workspace,
      latestBundleId: bundle.id
    });
    const audit = appendWorkspaceAudit(updatedWorkspace, {
      action: 'publish',
      actorId: context && context.actorId ? context.actorId : null,
      actorRole: context && context.actorRole ? context.actorRole : null,
      targetType: 'ResearchAssetBundle',
      targetId: bundle.id,
      assetVersion: bundle.version,
      before: { workspaceStatus: workspace.status },
      after: { bundleStatus: bundle.status, version: bundle.version },
      reason: context && context.reason ? context.reason : '',
      details: {
        publishSummary: bundle.publishSummary,
        checkpointRefs: bundle.checkpointRefs,
        includedEvidenceIds: includedEvidence.map((item) => item.id)
      }
    });
    bundle.auditRefs = Array.isArray(bundle.auditRefs) ? bundle.auditRefs : [];
    bundle.auditRefs.push(audit.id);
    const finalBundle = researchAssetStore.updateBundle(bundle.id, { auditRefs: bundle.auditRefs }) || bundle;
    updateSessionResearchWorkspace(updatedWorkspace);
    return {
      bundle: clone(finalBundle),
      validation
    };
  }

  function exportResearchAsset(bundleId, context) {
    assertHumanConfirmation(context, 'asset export');
    const bundle = getResearchAsset(bundleId);
    const workspace = bundle.workspaceId ? researchAssetStore.getWorkspace(bundle.workspaceId) : null;
    if (workspace) {
      appendWorkspaceAudit(workspace, {
        action: 'export',
        actorId: context && context.actorId ? context.actorId : null,
        actorRole: context && context.actorRole ? context.actorRole : null,
        targetType: 'ResearchAssetBundle',
        targetId: bundleId,
        assetVersion: bundle.version,
        before: null,
        after: { exportedAt: nowIso(), format: 'json' },
        reason: context && context.reason ? context.reason : '',
        details: {
          format: 'json'
        }
      });
    }
    return {
      exportedAt: nowIso(),
      format: 'json',
      asset: clone(bundle)
    };
  }

  function shareResearchAsset(bundleId, targetTeam, context) {
    assertHumanConfirmation(context, 'cross-team share');
    if (!targetTeam) {
      const error = new Error('targetTeam is required for cross-team sharing');
      error.code = 'INVALID_SHARE_REQUEST';
      throw error;
    }
    const bundle = researchAssetStore.getBundle(bundleId);
    if (!bundle) {
      throw new Error(`Unknown research asset: ${bundleId}`);
    }
    const nextSharedTeams = Array.from(new Set([...(bundle.sharedWithTeams || []), String(targetTeam)]));
    const updated = researchAssetStore.updateBundle(bundleId, {
      sharedWithTeams: nextSharedTeams
    });
    const workspace = bundle.workspaceId ? researchAssetStore.getWorkspace(bundle.workspaceId) : null;
    if (workspace) {
      appendWorkspaceAudit(workspace, {
        action: 'cross_team_share',
        actorId: context && context.actorId ? context.actorId : null,
        actorRole: context && context.actorRole ? context.actorRole : null,
        targetType: 'ResearchAssetBundle',
        targetId: bundleId,
        assetVersion: bundle.version,
        before: { sharedWithTeams: bundle.sharedWithTeams || [] },
        after: { sharedWithTeams: nextSharedTeams },
        reason: context && context.reason ? context.reason : '',
        details: {
          targetTeam: String(targetTeam)
        }
      });
    }
    return clone(updated);
  }

  function revokeResearchAsset(bundleId, context) {
    const bundle = researchAssetStore.getBundle(bundleId);
    if (!bundle) {
      throw new Error(`Unknown research asset: ${bundleId}`);
    }
    const updated = researchAssetStore.updateBundle(bundleId, {
      status: BUNDLE_STATUS.ARCHIVED
    });
    const workspace = researchAssetStore.getWorkspace(bundle.workspaceId);
    if (workspace) {
      appendWorkspaceAudit(workspace, {
        action: 'revoke_publish',
        actorId: context && context.actorId ? context.actorId : null,
        actorRole: context && context.actorRole ? context.actorRole : null,
        targetType: 'ResearchAssetBundle',
        targetId: bundleId,
        assetVersion: bundle.version,
        before: { bundleStatus: bundle.status },
        after: { bundleStatus: updated.status },
        reason: context && context.reason ? context.reason : '',
        details: {}
      });
    }
    return clone(updated);
  }

  return {
    createSession,
    listSessions,
    getSession,
    getFinishedResult,
    getFinishedResultMarkdown,
    getSessionInspection,
    getSessionProvenance,
    submitAnswer,
    getArtifactContent,
    attachResearchWorkspace,
    addRootResearchQuestion,
    acceptEvidence,
    reviseWorkspaceEvidenceSource,
    verifyWorkspaceEvidence,
    acceptWorkspaceEvidence,
    confirmJudgment,
    markWorkspaceReadyForPublish,
    validateWorkspaceForPublish,
    listResearchWorkspaces,
    getResearchWorkspace,
    getWorkspacePublishReview,
    listResearchAssets,
    getResearchAsset,
    listAuditEntries,
    listReviewRequests,
    createReviewRequest,
    resolveReviewRequest,
    rejectReviewRequest,
    cloneResearchAsset,
    parkHypothesis,
    supersedeHypothesis,
    publishWorkspace,
    exportResearchAsset,
    shareResearchAsset,
    revokeResearchAsset,
    assertAllowed
  };
}

module.exports = {
  DEFAULT_FLOW_ID,
  WORKFLOW_MODES,
  createSessionManager
};
