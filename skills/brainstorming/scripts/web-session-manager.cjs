const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  createCodexRuntimeAdapter,
  createFakeCodexRuntimeAdapter,
  normalizeStrategyState
} = require('./codex-runtime-adapter.cjs');
const structuredHost = require('./structured-host.cjs');
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
const DEFAULT_RUNTIME_CREATE_TIMEOUT_MS = 45000;
const DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS = 45000;
const DEFAULT_PROCESSING_LEASE_TIMEOUT_MS = 180000;
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

function readPositiveIntEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
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

function readArtifactMarkdownFile(session) {
  if (
    !session
    || !session.artifact
    || typeof session.artifact.filePath !== 'string'
    || !fs.existsSync(session.artifact.filePath)
  ) {
    return null;
  }
  return fs.readFileSync(session.artifact.filePath, 'utf-8');
}

function extractMarkdownTitle(markdown) {
  if (typeof markdown !== 'string') {
    return null;
  }
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function markdownBodyToItems(body) {
  const normalized = typeof body === 'string' ? body.trim() : '';
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseArtifactMarkdownContent(markdown, fallbackTitle) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return null;
  }

  const lines = markdown.split(/\r?\n/);
  const title = extractMarkdownTitle(markdown) || (typeof fallbackTitle === 'string' && fallbackTitle.trim()
    ? fallbackTitle.trim()
    : 'Finished result');
  const sections = [];
  let currentTitle = null;
  let currentLines = [];
  let titleConsumed = false;

  function flushSection() {
    const items = markdownBodyToItems(currentLines.join('\n'));
    if (!currentTitle && items.length === 0) {
      currentLines = [];
      return;
    }
    sections.push({
      id: slugify(currentTitle || `section-${sections.length + 1}`),
      title: currentTitle || `Section ${sections.length + 1}`,
      items: items.length > 0 ? items : ['']
    });
    currentLines = [];
  }

  for (const line of lines) {
    if (!titleConsumed && /^#\s+/.test(line)) {
      titleConsumed = true;
      continue;
    }
    const h2Match = line.match(/^##\s+(.+?)\s*$/);
    if (h2Match) {
      if (currentTitle || currentLines.length > 0) {
        flushSection();
      }
      currentTitle = h2Match[1].trim();
      continue;
    }
    currentLines.push(line);
  }

  if (currentTitle || currentLines.length > 0) {
    flushSection();
  }

  const normalizedSections = sections.filter((section) => (
    Array.isArray(section.items) && section.items.some((item) => String(item || '').trim())
  ));
  const finalSections = normalizedSections.length > 0
    ? normalizedSections
    : [{
        id: 'document',
        title: 'Document',
        items: markdownBodyToItems(
          lines.filter((line) => !/^#\s+/.test(line)).join('\n')
        )
      }];
  const summary = finalSections.length > 0 && finalSections[0].items.length > 0
    ? finalSections[0].items[0]
    : '';

  return {
    title,
    summary,
    sections: finalSections,
    deliverable: {
      isComplete: true,
      completionGateVersion: 'artifact-markdown-fallback-v1',
      title,
      sections: clone(finalSections)
    }
  };
}

function isGenericArtifactTitle(title) {
  return !title || title.trim() === 'Brainstorming artifact';
}

function isGenericArtifactText(text) {
  return !text || text.trim() === 'Artifact is ready.';
}

function buildArtifactMarkdown(session, summary) {
  const deliverable = summary && summary.deliverable && typeof summary.deliverable === 'object'
    ? summary.deliverable
    : null;
  const synthesis = summary && summary.synthesis && typeof summary.synthesis === 'object'
    ? summary.synthesis
    : null;
  const title = summary && typeof summary.title === 'string' && summary.title.trim()
    ? summary.title.trim()
    : (synthesis && synthesis.recommendation
      ? `Recommendation: ${synthesis.recommendation}`
      : 'Brainstorming Result');
  const lines = [
    `# ${title}`,
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

  const artifactMarkdownFallback = !source.deliverable && !source.synthesis
    ? parseArtifactMarkdownContent(
        readArtifactMarkdownFile(session),
        isGenericArtifactTitle(source.title) ? null : source.title
      )
    : null;
  const deliverable = source.deliverable && typeof source.deliverable === 'object'
    ? clone(source.deliverable)
    : (artifactMarkdownFallback && artifactMarkdownFallback.deliverable
      ? clone(artifactMarkdownFallback.deliverable)
      : null);
  const synthesis = source.synthesis && typeof source.synthesis === 'object'
    ? clone(source.synthesis)
    : (deliverable && deliverable.synthesis && typeof deliverable.synthesis === 'object'
      ? clone(deliverable.synthesis)
      : null);
  const sections = artifactMarkdownFallback && Array.isArray(artifactMarkdownFallback.sections)
    ? clone(artifactMarkdownFallback.sections)
    : null;
  const resolvedSections = sections || normalizeFinishedResultSections({
    ...source,
    deliverable,
    synthesis
  });

  if (resolvedSections.length === 0) {
    return null;
  }

  const recommendation = firstFinishedItem(findFinishedSection(resolvedSections, 'Recommendation'))
    || (synthesis && synthesis.recommendation ? `Choose: ${synthesis.recommendation}` : null)
    || (artifactMarkdownFallback ? artifactMarkdownFallback.title : null)
    || source.title
    || 'Finished result';
  const rationale = firstFinishedItem(findFinishedSection(resolvedSections, 'Why This Path Currently Wins'))
    || firstFinishedItem(findFinishedSection(resolvedSections, 'Problem Framing'))
    || (artifactMarkdownFallback ? artifactMarkdownFallback.summary : '')
    || (typeof source.text === 'string' ? source.text.trim() : '');

  return {
    title: (artifactMarkdownFallback && artifactMarkdownFallback.title)
      || (isGenericArtifactTitle(source.title) ? null : source.title)
      || (deliverable && deliverable.title)
      || recommendation
      || 'Finished result',
    recommendationTitle: recommendation,
    recommendationSummary: rationale,
    sections: resolvedSections,
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
    if (session.currentMessage.type === 'artifact_ready') {
      if (isGenericArtifactTitle(session.currentMessage.title) && session.finishedResult.title) {
        session.currentMessage.title = session.finishedResult.title;
      }
      if (isGenericArtifactText(session.currentMessage.text) && session.finishedResult.recommendationSummary) {
        session.currentMessage.text = session.finishedResult.recommendationSummary;
      }
      if (
        (!session.currentMessage.artifactPreviewText || !session.currentMessage.artifactPreviewText.trim())
        && session.finishedResult.recommendationSummary
      ) {
        session.currentMessage.artifactPreviewText = session.finishedResult.recommendationSummary;
      }
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
  const runtimeCreateTimeoutMs = typeof options.runtimeCreateTimeoutMs === 'number'
    ? options.runtimeCreateTimeoutMs
    : (readPositiveIntEnv('BRAINSTORM_RUNTIME_CREATE_TIMEOUT_MS') || DEFAULT_RUNTIME_CREATE_TIMEOUT_MS);
  const runtimeSubmitTimeoutMs = typeof options.runtimeSubmitTimeoutMs === 'number'
    ? options.runtimeSubmitTimeoutMs
    : (readPositiveIntEnv('BRAINSTORM_RUNTIME_SUBMIT_TIMEOUT_MS') || DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS);
  const processingLeaseTimeoutMs = typeof options.processingLeaseTimeoutMs === 'number'
    ? options.processingLeaseTimeoutMs
    : (readPositiveIntEnv('BRAINSTORM_PROCESSING_LEASE_TIMEOUT_MS') || DEFAULT_PROCESSING_LEASE_TIMEOUT_MS);
  const processingHeartbeatIntervalMs = typeof options.processingHeartbeatIntervalMs === 'number'
    ? options.processingHeartbeatIntervalMs
    : Math.max(10, Math.min(5000, Math.floor(processingLeaseTimeoutMs / 3)));
  const allowFakeRuntimeFallback = Boolean(options.allowFakeRuntimeFallback);
  const backgroundProcessing = Boolean(options.backgroundProcessing);
  const managerLeaseOwnerId = createId();
  const runningJobs = new Map();

  ensureDir(sessionsDir);
  ensureDir(artifactsDir);

  function sessionFile(sessionId) {
    return path.join(sessionsDir, `${sessionId}.json`);
  }

  function persistSession(session) {
    ensureSessionProcessing(session);
    ensureBranchSelection(session);
    ensureSessionNodeLog(session);
    refreshRoundGraph(session);
    syncFinishedResult(session);
    refreshWorkflowChecklist(session);
    fs.writeFileSync(sessionFile(session.id), JSON.stringify(session, null, 2) + '\n');
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createIdleProcessingState() {
    return {
      state: 'idle',
      action: null,
      jobId: null,
      leaseOwnerId: null,
      queuedAt: null,
      startedAt: null,
      heartbeatAt: null,
      updatedAt: null,
      finishedAt: null,
      attemptCount: 0,
      pendingInput: null,
      error: null,
      supersededByJobId: null
    };
  }

  function clonePendingInput(value) {
    if (value == null) {
      return null;
    }
    return (value && typeof value === 'object') ? clone(value) : value;
  }

  function ensureSessionProcessing(session) {
    const source = session && session.processing && typeof session.processing === 'object'
      ? session.processing
      : {};
    const next = createIdleProcessingState();
    next.state = source.state === 'running' || source.state === 'retryable' || source.state === 'cancelled'
      ? source.state
      : 'idle';
    next.action = source.action === 'create' || source.action === 'submit'
      ? source.action
      : null;
    next.jobId = typeof source.jobId === 'string' && source.jobId.trim()
      ? source.jobId.trim()
      : null;
    next.leaseOwnerId = typeof source.leaseOwnerId === 'string' && source.leaseOwnerId.trim()
      ? source.leaseOwnerId.trim()
      : null;
    next.queuedAt = typeof source.queuedAt === 'string' ? source.queuedAt : null;
    next.startedAt = typeof source.startedAt === 'string' ? source.startedAt : null;
    next.heartbeatAt = typeof source.heartbeatAt === 'string' ? source.heartbeatAt : null;
    next.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : null;
    next.finishedAt = typeof source.finishedAt === 'string' ? source.finishedAt : null;
    next.attemptCount = typeof source.attemptCount === 'number' && source.attemptCount >= 0
      ? source.attemptCount
      : 0;
    next.pendingInput = clonePendingInput(source.pendingInput);
    next.error = source.error && typeof source.error === 'object'
      ? {
          message: typeof source.error.message === 'string' ? source.error.message : '',
          code: typeof source.error.code === 'string' ? source.error.code : null
        }
      : null;
    next.supersededByJobId = typeof source.supersededByJobId === 'string' && source.supersededByJobId.trim()
      ? source.supersededByJobId.trim()
      : null;
    session.processing = next;
    return next;
  }

  function beginSessionProcessing(session, action, pendingInput) {
    const previous = ensureSessionProcessing(session);
    const jobId = createId();
    const queuedAt = nowIso();
    session.processing = {
      state: 'running',
      action,
      jobId,
      leaseOwnerId: managerLeaseOwnerId,
      queuedAt,
      startedAt: null,
      heartbeatAt: queuedAt,
      updatedAt: queuedAt,
      finishedAt: null,
      attemptCount: previous.action === action ? previous.attemptCount : 0,
      pendingInput: clonePendingInput(pendingInput),
      error: null,
      supersededByJobId: null
    };
    session.updatedAt = queuedAt;
    return session.processing;
  }

  function createProcessingError(error, fallbackMessage, fallbackCode) {
    return {
      message: error && error.message ? error.message : fallbackMessage,
      code: error && error.code ? error.code : (fallbackCode || null)
    };
  }

  function isCurrentProcessingJob(session, action, expectedJobId) {
    const processing = ensureSessionProcessing(session);
    return Boolean(
      processing.state === 'running'
      && processing.action === action
      && processing.jobId === expectedJobId
    );
  }

  function loadSessionIfJobCurrent(sessionId, action, expectedJobId) {
    try {
      const session = loadSession(sessionId);
      return isCurrentProcessingJob(session, action, expectedJobId) ? session : null;
    } catch (error) {
      if (/Unknown session/.test(error.message || '')) {
        return null;
      }
      throw error;
    }
  }

  function markSessionProcessingStarted(session, expectedJobId) {
    const processing = ensureSessionProcessing(session);
    if (processing.state !== 'running' || processing.jobId !== expectedJobId) {
      return false;
    }
    processing.startedAt = processing.startedAt || nowIso();
    processing.leaseOwnerId = managerLeaseOwnerId;
    processing.heartbeatAt = nowIso();
    processing.updatedAt = nowIso();
    processing.attemptCount += 1;
    session.updatedAt = nowIso();
    return true;
  }

  function clearSessionProcessing(session, expectedJobId) {
    const processing = ensureSessionProcessing(session);
    if (expectedJobId && processing.jobId && processing.jobId !== expectedJobId) {
      return false;
    }
    session.processing = createIdleProcessingState();
    session.updatedAt = nowIso();
    return true;
  }

  function markSessionProcessingRetryable(session, expectedJobId, error) {
    const processing = ensureSessionProcessing(session);
    if (expectedJobId && processing.jobId && processing.jobId !== expectedJobId) {
      return false;
    }
    const finishedAt = nowIso();
    processing.state = 'retryable';
    processing.leaseOwnerId = null;
    processing.heartbeatAt = finishedAt;
    processing.finishedAt = finishedAt;
    processing.updatedAt = finishedAt;
    processing.error = createProcessingError(error, 'Background processing failed', 'BACKGROUND_PROCESSING_FAILED');
    session.updatedAt = finishedAt;
    return true;
  }

  function markSessionProcessingCancelled(session, expectedJobId) {
    const processing = ensureSessionProcessing(session);
    if (expectedJobId && processing.jobId && processing.jobId !== expectedJobId) {
      return false;
    }
    const cancelledAt = nowIso();
    processing.state = 'cancelled';
    processing.leaseOwnerId = null;
    processing.heartbeatAt = cancelledAt;
    processing.finishedAt = cancelledAt;
    processing.updatedAt = cancelledAt;
    processing.error = null;
    session.updatedAt = cancelledAt;
    return true;
  }

  function isSessionProcessingStale(session) {
    const processing = ensureSessionProcessing(session);
    if (
      processing.state !== 'running'
      || !processing.action
      || !processing.jobId
    ) {
      return false;
    }
    const activeJob = runningJobs.get(session.id);
    if (activeJob && activeJob.jobId === processing.jobId) {
      return false;
    }
    const heartbeatSource = processing.heartbeatAt || processing.updatedAt || processing.startedAt || processing.queuedAt;
    const heartbeatAtMs = Date.parse(heartbeatSource || '');
    if (!Number.isFinite(heartbeatAtMs)) {
      return true;
    }
    return (Date.now() - heartbeatAtMs) > processingLeaseTimeoutMs;
  }

  function reconcileSessionProcessingLifecycle(session) {
    if (!backgroundProcessing) {
      return false;
    }
    if (!isSessionProcessingStale(session)) {
      return false;
    }
    return markSessionProcessingRetryable(session, ensureSessionProcessing(session).jobId, {
      code: 'PROCESSING_STALE',
      message: 'The background task stopped updating. Retry or cancel this round.'
    });
  }

  function persistSessionWithJobGuard(session, expectedJobId, action) {
    if (!expectedJobId) {
      persistSession(session);
      return true;
    }
    const current = loadSessionIfJobCurrent(session.id, action, expectedJobId);
    if (!current) {
      return false;
    }
    session.processing = clone(current.processing);
    persistSession(session);
    return true;
  }

  function touchSessionProcessingHeartbeat(sessionId, action, expectedJobId) {
    const session = loadSessionIfJobCurrent(sessionId, action, expectedJobId);
    if (!session) {
      return false;
    }
    const processing = ensureSessionProcessing(session);
    processing.leaseOwnerId = managerLeaseOwnerId;
    processing.heartbeatAt = nowIso();
    processing.updatedAt = nowIso();
    session.updatedAt = nowIso();
    persistSession(session);
    return true;
  }

  function startProcessingHeartbeat(sessionId, action, expectedJobId) {
    const timer = setInterval(() => {
      try {
        const touched = touchSessionProcessingHeartbeat(sessionId, action, expectedJobId);
        if (!touched) {
          clearInterval(timer);
        }
      } catch (error) {
        clearInterval(timer);
        console.error(error);
      }
    }, processingHeartbeatIntervalMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  }

  function buildCreatePendingInput(input, session) {
    return {
      flowId: session.flowId,
      completionMode: session.completionMode,
      initialPrompt: session.seedPrompt,
      cwd: input && input.cwd ? input.cwd : defaultCwd
    };
  }

  function createBaseSessionRecord(input, sessionId) {
    const now = nowIso();
    const flowId = input && input.flowId ? input.flowId : DEFAULT_FLOW_ID;
    const completionMode = input && input.completionMode ? input.completionMode : 'artifact';
    const seedPrompt = normalizeSeedPrompt(input && input.initialPrompt);
    const workflowMode = normalizeWorkflowMode(input && input.workflowMode);
    return {
      id: sessionId,
      flowId,
      completionMode,
      workflowMode,
      seedPrompt,
      createdAt: now,
      updatedAt: now,
      backendMode: null,
      providerSession: null,
      strategyState: normalizeStrategyState(null),
      currentQuestionId: null,
      history: [],
      currentMessage: null,
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
      },
      processing: createIdleProcessingState()
    };
  }

  function normalizeSessionStrategyState(session) {
    session.strategyState = normalizeStrategyState(session.strategyState);
    return session.strategyState;
  }

  function getQuestionOptions(question) {
    if (question && Array.isArray(question.options) && question.options.length > 0) {
      return question.options;
    }
    if (question && question.questionType === structuredHost.QUESTION_TYPES.CONFIRM) {
      return [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' }
      ];
    }
    return [];
  }

  function resolveAnswerLabel(question, answer) {
    const options = getQuestionOptions(question);
    const optionIds = Array.isArray(answer && answer.optionIds) ? answer.optionIds : [];
    const text = typeof (answer && answer.text) === 'string' ? answer.text.trim() : '';
    const rawInput = typeof (answer && answer.rawInput) === 'string' ? answer.rawInput.trim() : '';

    if (optionIds.length > 0) {
      const labels = optionIds.map((optionId) => {
        const option = options.find((item) => item.id === optionId);
        return option ? option.label : optionId;
      });
      if (text && answer && answer.answerMode === structuredHost.ANSWER_MODES.MIXED) {
        return labels.join(', ') + ' + ' + text;
      }
      return labels.join(', ');
    }

    return text || rawInput;
  }

  function createHistoryEntry(question, answer) {
    return {
      questionId: question && question.questionId ? question.questionId : null,
      question: question && question.title ? question.title : '',
      answer: resolveAnswerLabel(question, answer)
    };
  }

  function buildBranchRunId(parentQuestionNodeId, optionId) {
    return `branch-run-${parentQuestionNodeId || 'decision'}-${optionId || 'option'}`;
  }

  function buildBranchRunQuestion(branchRun) {
    return {
      type: 'question',
      questionType: structuredHost.QUESTION_TYPES.ASK_TEXT,
      questionId: `${branchRun.id}-detail`,
      title: `What is the strongest concrete version of "${branchRun.title}"?`,
      description: 'Capture the most convincing concrete shape of this branch before returning to the mainline decision.',
      options: [],
      allowTextOverride: true,
      textOverrideLabel: `Describe ${branchRun.title}`,
      metadata: {
        brainstormIntent: 'branch_run_detail',
        branchRunId: branchRun.id,
        branchSourceOptionId: branchRun.sourceOptionId,
        branchParentQuestionId: branchRun.parentQuestionId
      },
      history: Array.isArray(branchRun.history) ? clone(branchRun.history) : []
    };
  }

  function normalizeDetachedStrategyState(strategyState) {
    return normalizeStrategyState({
      ...(strategyState && typeof strategyState === 'object' ? strategyState : {}),
      branchRuns: [],
      selectedBranchRunId: null
    });
  }

  function cloneHistoryEntries(history) {
    return Array.isArray(history)
      ? history
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          questionId: typeof entry.questionId === 'string' ? entry.questionId : null,
          question: typeof entry.question === 'string' ? entry.question : '',
          answer: typeof entry.answer === 'string' ? entry.answer : ''
        }))
      : [];
  }

  function createFreshBranchProviderSession(backendMode, completionMode) {
    const resolvedCompletionMode = completionMode || 'artifact';
    if (backendMode === 'fake') {
      return {
        seeded: true,
        completionMode: resolvedCompletionMode
      };
    }
    if (backendMode === 'exec') {
      return {
        transcript: [],
        completionMode: resolvedCompletionMode
      };
    }
    if (backendMode === 'app-server') {
      return {
        completionMode: resolvedCompletionMode
      };
    }
    return null;
  }

  function resolveBranchSelectionEntries(question, answer) {
    const selectedOptions = resolveSelectedOptions(question, answer);
    if (selectedOptions.length > 0) {
      return selectedOptions.map((option) => ({
        id: option && option.id ? option.id : null,
        label: option && option.label ? option.label : (option && option.id ? option.id : null),
        description: option && option.description ? option.description : ''
      }));
    }

    const label = resolveAnswerLabel(question, answer);
    if (!label) {
      return [];
    }
    return [{
      id: slugify(label),
      label,
      description: ''
    }];
  }

  function isLegacyBranchDetailQuestion(message) {
    return Boolean(
      message
      && message.type === 'question'
      && message.metadata
      && message.metadata.brainstormIntent === 'branch_run_detail'
    );
  }

  function isRealBranchRun(branchRun) {
    return Boolean(
      branchRun
      && typeof branchRun === 'object'
      && branchRun.parentQuestionNodeId
      && branchRun.backendMode
      && branchRun.providerSession
    );
  }

  function buildRoundId(questionId, seenCounts) {
    const normalized = String(questionId || 'round')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'round';
    const nextCount = (seenCounts.get(normalized) || 0) + 1;
    seenCounts.set(normalized, nextCount);
    return nextCount === 1 ? `round-${normalized}` : `round-${normalized}-${nextCount}`;
  }

  function buildQuestionNodeId(questionId) {
    const normalized = String(questionId || 'current')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'current';
    return `question-${normalized}`;
  }

  function buildRoundBaseId(questionId) {
    const normalized = String(questionId || 'round')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'round';
    return `round-${normalized}`;
  }

  function buildResultNodeId(key) {
    const normalized = String(key || 'result')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'result';
    return `result-${normalized}`;
  }

  function buildUniqueNodeId(log, baseId) {
    const used = new Set((log.nodes || []).map((node) => node.id));
    if (!used.has(baseId)) {
      return baseId;
    }
    let index = 2;
    let candidate = `${baseId}-${index}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${baseId}-${index}`;
    }
    return candidate;
  }

  function buildUniqueRoundId(log, baseId) {
    const used = new Set((log.nodes || [])
      .map((node) => node && node.kind === 'question' ? node.roundId : null)
      .filter(Boolean));
    if (!used.has(baseId)) {
      return baseId;
    }
    let index = 2;
    let candidate = `${baseId}-${index}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${baseId}-${index}`;
    }
    return candidate;
  }

  function createEmptyNodeLog() {
    return {
      schemaVersion: 1,
      rootNodeId: 'topic-root',
      activeNodeId: null,
      mainlineActiveNodeId: null,
      nodes: [],
      edges: []
    };
  }

  function findNodeById(log, nodeId) {
    return (log && Array.isArray(log.nodes))
      ? log.nodes.find((node) => node.id === nodeId) || null
      : null;
  }

  function findLatestNode(log, predicate) {
    if (!log || !Array.isArray(log.nodes)) {
      return null;
    }
    for (let index = log.nodes.length - 1; index >= 0; index -= 1) {
      const node = log.nodes[index];
      if (predicate(node)) {
        return node;
      }
    }
    return null;
  }

  function findLatestQuestionNode(log, questionId, options) {
    const filters = options || {};
    const hasBranchRunIdFilter = Object.prototype.hasOwnProperty.call(filters, 'branchRunId');
    const hasParentNodeIdFilter = Object.prototype.hasOwnProperty.call(filters, 'parentNodeId');
    const hasLaneFilter = Object.prototype.hasOwnProperty.call(filters, 'lane');
    return findLatestNode(log, (node) => (
      node.kind === 'question'
      && node.questionId === questionId
      && (!hasLaneFilter || node.lane === filters.lane)
      && (!hasBranchRunIdFilter || (node.branchRunId || null) === filters.branchRunId)
      && (!hasParentNodeIdFilter || (node.parentNodeId || null) === filters.parentNodeId)
    ));
  }

  function findLatestNodeForBranchRun(log, branchRunId) {
    return findLatestNode(log, (node) => (node.branchRunId || null) === branchRunId);
  }

  function findQuestionNodeByRoundId(log, roundId) {
    return findLatestNode(log, (node) => (
      node
      && node.kind === 'question'
      && node.roundId === roundId
    ));
  }

  function findIncomingEdge(log, nodeId) {
    if (!log || !Array.isArray(log.edges)) {
      return null;
    }
    for (let index = log.edges.length - 1; index >= 0; index -= 1) {
      const edge = log.edges[index];
      if (edge.childNodeId === nodeId) {
        return edge;
      }
    }
    return null;
  }

  function findOutgoingEdges(log, nodeId) {
    return log && Array.isArray(log.edges)
      ? log.edges.filter((edge) => edge.parentNodeId === nodeId)
      : [];
  }

  function ensureTopicRootNode(log, session) {
    const existing = findNodeById(log, 'topic-root');
    if (existing) {
      return existing;
    }
    const prompt = session.seedPrompt || '';
    const node = {
      id: 'topic-root',
      kind: 'topic',
      lane: 'mainline',
      title: prompt || 'Brainstorm Topic',
      description: prompt,
      previewText: prompt,
      createdAt: session.createdAt || nowIso(),
      backendMode: session.backendMode || null
    };
    log.nodes.push(node);
    return node;
  }

  function createAnswerSnapshot(question, answer) {
    if (!question && !answer) {
      return null;
    }
    const optionIds = Array.isArray(answer && answer.optionIds)
      ? answer.optionIds.filter(Boolean)
      : [];
    const text = typeof (answer && answer.text) === 'string' && answer.text.trim()
      ? answer.text.trim()
      : null;
    const rawInput = typeof (answer && answer.rawInput) === 'string' && answer.rawInput.trim()
      ? answer.rawInput.trim()
      : (text || null);
    return {
      questionId: answer && answer.questionId
        ? answer.questionId
        : (question && question.questionId ? question.questionId : null),
      answerMode: answer && answer.answerMode
        ? answer.answerMode
        : normalizeAnswerMode(optionIds, answer || {}),
      optionIds,
      text,
      rawInput,
      label: question ? resolveAnswerLabel(question, answer || {}) : (text || rawInput)
    };
  }

  function createHistoryAnswerSnapshot(entry) {
    const text = entry && typeof entry.answer === 'string' ? entry.answer : null;
    return {
      questionId: entry && entry.questionId ? entry.questionId : null,
      answerMode: structuredHost.ANSWER_MODES.TEXT,
      optionIds: [],
      text,
      rawInput: text,
      label: text
    };
  }

  function createBranchOptionSnapshot(question, option) {
    return {
      questionId: question && question.questionId ? question.questionId : null,
      answerMode: structuredHost.ANSWER_MODES.OPTION,
      optionIds: option && option.id ? [option.id] : [],
      text: null,
      rawInput: option && option.id ? option.id : null,
      label: option && option.label ? option.label : (option && option.id ? option.id : null)
    };
  }

  function appendEdgeToNodeLog(log, input) {
    if (!input || !input.parentNodeId || !input.childNodeId) {
      return null;
    }
    const kind = input.kind || 'progression';
    const existing = (log.edges || []).find((edge) => (
      edge.parentNodeId === input.parentNodeId
      && edge.childNodeId === input.childNodeId
      && edge.kind === kind
    ));
    if (existing) {
      return existing;
    }
    const edge = {
      id: buildUniqueNodeId({ nodes: log.edges || [] }, `${kind}-${input.parentNodeId}-${input.childNodeId}`),
      parentNodeId: input.parentNodeId,
      childNodeId: input.childNodeId,
      kind,
      sourceAnswer: input.sourceAnswer ? clone(input.sourceAnswer) : null,
      createdAt: input.createdAt || nowIso()
    };
    log.edges.push(edge);
    return edge;
  }

  function appendQuestionNodeToLog(log, session, question, options) {
    const config = options || {};
    const parentNodeId = config.parentNodeId || log.rootNodeId;
    const branchRunId = config.branchRunId || null;
    const questionId = question && question.questionId ? question.questionId : null;
    const existing = findLatestQuestionNode(log, questionId, {
      parentNodeId,
      branchRunId
    });
    if (existing) {
      appendEdgeToNodeLog(log, {
        parentNodeId,
        childNodeId: existing.id,
        kind: config.edgeKind || (branchRunId ? 'branch' : 'progression'),
        sourceAnswer: config.sourceAnswer,
        createdAt: config.createdAt
      });
      if (config.setActive) {
        if (branchRunId) {
          log.activeNodeId = existing.id;
        } else {
          log.mainlineActiveNodeId = existing.id;
          log.activeNodeId = existing.id;
        }
      }
      return existing;
    }

    const baseNodeId = config.nodeId || buildQuestionNodeId(questionId || 'current');
    const nodeId = buildUniqueNodeId(log, baseNodeId);
    const roundId = branchRunId
      ? buildUniqueRoundId(log, config.roundId || branchRunId)
      : buildUniqueRoundId(log, config.roundId || buildRoundBaseId(questionId || 'current'));
    const node = {
      id: nodeId,
      kind: 'question',
      lane: branchRunId ? 'branch' : (config.lane || 'mainline'),
      roundId,
      parentNodeId,
      questionId,
      title: question && question.title ? question.title : 'Question',
      description: question && question.description ? question.description : '',
      previewText: question && question.description ? question.description : '',
      optionsSnapshot: clone(getQuestionOptions(question)),
      metadataSnapshot: question && question.metadata ? clone(question.metadata) : null,
      branchingSnapshot: question && question.branching ? clone(question.branching) : null,
      sourceAnswer: config.sourceAnswer ? clone(config.sourceAnswer) : null,
      branchRunId,
      sourceOptionId: config.sourceOptionId || null,
      historySnapshot: cloneHistoryEntries(session.history || []),
      strategyStateSnapshot: normalizeDetachedStrategyState(session.strategyState),
      createdAt: config.createdAt || nowIso(),
      backendMode: session.backendMode || null,
      messageSnapshot: clone({
        type: 'question',
        questionType: question && question.questionType ? question.questionType : null,
        questionId,
        title: question && question.title ? question.title : 'Question',
        description: question && question.description ? question.description : '',
        options: getQuestionOptions(question),
        allowTextOverride: Boolean(question && question.allowTextOverride),
        textOverrideLabel: question && question.textOverrideLabel ? question.textOverrideLabel : null,
        branching: question && question.branching ? clone(question.branching) : null,
        metadata: question && question.metadata ? clone(question.metadata) : null
      })
    };
    log.nodes.push(node);
    appendEdgeToNodeLog(log, {
      parentNodeId,
      childNodeId: node.id,
      kind: config.edgeKind || (branchRunId ? 'branch' : 'progression'),
      sourceAnswer: config.sourceAnswer,
      createdAt: config.createdAt
    });
    if (config.setActive) {
      if (branchRunId) {
        log.activeNodeId = node.id;
      } else {
        log.mainlineActiveNodeId = node.id;
        log.activeNodeId = node.id;
      }
    }
    return node;
  }

  function appendResultNodeToLog(log, session, message, options) {
    const config = options || {};
    const parentNodeId = config.parentNodeId || log.rootNodeId;
    const branchRunId = config.branchRunId || null;
    const resultType = message && message.type ? message.type : 'summary';
    const existing = findLatestNode(log, (node) => (
      node.kind === 'result'
      && node.parentNodeId === parentNodeId
      && (node.branchRunId || null) === branchRunId
      && node.resultType === resultType
      && node.title === (message && message.title ? message.title : 'Result')
    ));
    if (existing) {
      appendEdgeToNodeLog(log, {
        parentNodeId,
        childNodeId: existing.id,
        kind: config.edgeKind || 'result',
        sourceAnswer: config.sourceAnswer,
        createdAt: config.createdAt
      });
      if (config.setActive) {
        if (branchRunId) {
          log.activeNodeId = existing.id;
        } else {
          log.mainlineActiveNodeId = existing.id;
          log.activeNodeId = existing.id;
        }
      }
      return existing;
    }
    const baseNodeId = config.nodeId || buildResultNodeId(
      message && (message.questionId || message.title || message.type) ? (message.questionId || message.title || message.type) : 'result'
    );
    const node = {
      id: buildUniqueNodeId(log, baseNodeId),
      kind: 'result',
      lane: branchRunId ? 'branch' : (config.lane || 'mainline'),
      parentNodeId,
      title: message && message.title ? message.title : 'Result',
      description: message && message.text ? message.text : '',
      previewText: message && (message.artifactPreviewText || message.text) ? (message.artifactPreviewText || message.text) : '',
      resultType,
      sourceAnswer: config.sourceAnswer ? clone(config.sourceAnswer) : null,
      branchRunId,
      createdAt: config.createdAt || nowIso(),
      backendMode: session.backendMode || null,
      messageSnapshot: clone(message || { type: resultType, title: 'Result', text: '' })
    };
    log.nodes.push(node);
    appendEdgeToNodeLog(log, {
      parentNodeId,
      childNodeId: node.id,
      kind: config.edgeKind || 'result',
      sourceAnswer: config.sourceAnswer,
      createdAt: config.createdAt
    });
    if (config.setActive) {
      if (branchRunId) {
        log.activeNodeId = node.id;
      } else {
        log.mainlineActiveNodeId = node.id;
        log.activeNodeId = node.id;
      }
    }
    return node;
  }

  function syncNodeLogActiveNode(session) {
    const log = session.nodeLog;
    if (!log) {
      return null;
    }
    const state = normalizeSessionStrategyState(session);
    const selectedBranchRun = state.selectedBranchRunId
      ? state.branchRuns.find((branchRun) => branchRun.id === state.selectedBranchRunId) || null
      : null;

    if (selectedBranchRun) {
      if (selectedBranchRun.currentQuestionId) {
        const activeQuestion = findLatestQuestionNode(log, selectedBranchRun.currentQuestionId, {
          branchRunId: selectedBranchRun.id
        });
        if (activeQuestion) {
          log.activeNodeId = activeQuestion.id;
          return activeQuestion.id;
        }
      }
      const latestBranchNode = findLatestNodeForBranchRun(log, selectedBranchRun.id);
      if (latestBranchNode) {
        log.activeNodeId = latestBranchNode.id;
        return latestBranchNode.id;
      }
    }

    if (log.mainlineActiveNodeId && findNodeById(log, log.mainlineActiveNodeId)) {
      log.activeNodeId = log.mainlineActiveNodeId;
      return log.activeNodeId;
    }

    if (session.currentMessage && session.currentMessage.type === 'question') {
      const currentQuestionNode = findLatestQuestionNode(log, session.currentMessage.questionId, {
        lane: 'mainline'
      });
      if (currentQuestionNode) {
        log.mainlineActiveNodeId = currentQuestionNode.id;
        log.activeNodeId = currentQuestionNode.id;
        return currentQuestionNode.id;
      }
    }

    const latestMainlineNode = findLatestNode(log, (node) => node.lane === 'mainline' && node.id !== log.rootNodeId);
    if (latestMainlineNode) {
      log.mainlineActiveNodeId = latestMainlineNode.id;
      log.activeNodeId = latestMainlineNode.id;
      return latestMainlineNode.id;
    }

    log.activeNodeId = log.rootNodeId;
    return log.activeNodeId;
  }

  function buildLegacyNodeLog(session) {
    const log = createEmptyNodeLog();
    session.nodeLog = log;
    ensureTopicRootNode(log, session);

    const history = Array.isArray(session.history) ? session.history : [];
    let previousQuestionNode = null;
    history.forEach((entry, index) => {
      const question = {
        type: 'question',
        questionType: structuredHost.QUESTION_TYPES.ASK_TEXT,
        questionId: entry && entry.questionId ? entry.questionId : `historical-${index + 1}`,
        title: entry && entry.question ? entry.question : `Step ${index + 1}`,
        description: '',
        options: [],
        allowTextOverride: true
      };
      const parentNodeId = previousQuestionNode ? previousQuestionNode.id : log.rootNodeId;
      const sourceAnswer = previousQuestionNode && history[index - 1]
        ? createHistoryAnswerSnapshot(history[index - 1])
        : null;
      previousQuestionNode = appendQuestionNodeToLog(log, session, question, {
        lane: 'mainline',
        parentNodeId,
        sourceAnswer,
        edgeKind: previousQuestionNode ? 'progression' : 'seed'
      });
    });

    if (session.currentMessage) {
      const parentNodeId = previousQuestionNode ? previousQuestionNode.id : log.rootNodeId;
      const sourceAnswer = previousQuestionNode && history.length > 0
        ? createHistoryAnswerSnapshot(history[history.length - 1])
        : null;
      if (session.currentMessage.type === 'question') {
        appendQuestionNodeToLog(log, session, session.currentMessage, {
          lane: 'mainline',
          parentNodeId,
          sourceAnswer,
          edgeKind: previousQuestionNode ? 'progression' : 'seed',
          setActive: true
        });
      } else {
        appendResultNodeToLog(log, session, session.currentMessage, {
          lane: 'mainline',
          parentNodeId,
          sourceAnswer,
          edgeKind: 'result',
          setActive: true
        });
      }
    }

    const state = normalizeSessionStrategyState(session);
    state.branchRuns.forEach((branchRun) => {
      const parentQuestionNode = (branchRun.parentQuestionNodeId
        ? findNodeById(log, branchRun.parentQuestionNodeId)
        : null)
        || findLatestQuestionNode(log, branchRun.parentQuestionId, { lane: 'mainline' })
        || previousQuestionNode
        || findNodeById(log, log.rootNodeId);
      const branchQuestion = branchRun.currentMessage && branchRun.currentMessage.type === 'question'
        ? branchRun.currentMessage
        : null;
      let branchQuestionNode = null;

      if (branchQuestion) {
        branchQuestionNode = appendQuestionNodeToLog(log, session, {
          ...branchQuestion,
          questionId: branchRun.currentQuestionId || branchQuestion.questionId
        }, {
          lane: 'branch',
          parentNodeId: parentQuestionNode ? parentQuestionNode.id : log.rootNodeId,
          branchRunId: branchRun.id,
          roundId: branchRun.id,
          sourceOptionId: branchRun.sourceOptionId || null,
          sourceAnswer: createBranchOptionSnapshot({
            questionId: branchRun.parentQuestionId
          }, {
            id: branchRun.sourceOptionId || null,
            label: branchRun.sourceOptionLabel || branchRun.title || branchRun.sourceOptionId || null
          }),
          edgeKind: 'branch'
        });
      }

      const branchResultMessage = branchRun.currentMessage && branchRun.currentMessage.type === 'artifact_ready'
        ? branchRun.currentMessage
        : (
          branchRun.currentMessage && branchRun.currentMessage.type === 'summary'
            ? branchRun.currentMessage
            : (
              branchRun.resultSummary && branchRun.resultSummary.text
                ? {
                    type: 'summary',
                    title: branchRun.resultSummary.title || `${branchRun.title || branchRun.id} branch note`,
                    text: branchRun.resultSummary.text
                  }
                : null
            )
        );

      if (branchResultMessage) {
        const answerEntry = Array.isArray(branchRun.history) && branchRun.history.length > 0
          ? branchRun.history[branchRun.history.length - 1]
          : { questionId: branchRun.parentQuestionId, answer: branchRun.resultSummary ? branchRun.resultSummary.text : '' };
        appendResultNodeToLog(log, session, branchResultMessage, {
          lane: 'branch',
          parentNodeId: branchQuestionNode ? branchQuestionNode.id : (parentQuestionNode ? parentQuestionNode.id : log.rootNodeId),
          branchRunId: branchRun.id,
          sourceAnswer: createHistoryAnswerSnapshot(answerEntry),
          edgeKind: branchQuestionNode ? 'result' : 'branch'
        });
      }
    });

    syncNodeLogActiveNode(session);
    return log;
  }

  function ensureSessionNodeLog(session) {
    const valid = session.nodeLog
      && typeof session.nodeLog === 'object'
      && Array.isArray(session.nodeLog.nodes)
      && Array.isArray(session.nodeLog.edges);
    if (!valid) {
      return buildLegacyNodeLog(session);
    }
    session.nodeLog.rootNodeId = 'topic-root';
    if (!Array.isArray(session.nodeLog.nodes)) {
      session.nodeLog.nodes = [];
    }
    if (!Array.isArray(session.nodeLog.edges)) {
      session.nodeLog.edges = [];
    }
    if (typeof session.nodeLog.mainlineActiveNodeId !== 'string') {
      session.nodeLog.mainlineActiveNodeId = null;
    }
    ensureTopicRootNode(session.nodeLog, session);
    syncNodeLogActiveNode(session);
    return session.nodeLog;
  }

  function initializeSessionNodeLog(session) {
    const log = createEmptyNodeLog();
    session.nodeLog = log;
    ensureTopicRootNode(log, session);
    if (session.currentMessage) {
      if (session.currentMessage.type === 'question') {
        appendQuestionNodeToLog(log, session, session.currentMessage, {
          lane: 'mainline',
          parentNodeId: log.rootNodeId,
          edgeKind: 'seed',
          setActive: true
        });
      } else {
        appendResultNodeToLog(log, session, session.currentMessage, {
          lane: 'mainline',
          parentNodeId: log.rootNodeId,
          edgeKind: 'result',
          setActive: true
        });
      }
    }
    syncNodeLogActiveNode(session);
    return log;
  }

  function appendCurrentQuestionToMainline(session) {
    if (!session.currentMessage || session.currentMessage.type !== 'question') {
      return null;
    }
    const log = ensureSessionNodeLog(session);
    const latestMainlineQuestion = findLatestNode(log, (node) => node.lane === 'mainline' && node.kind === 'question');
    if (
      latestMainlineQuestion
      && latestMainlineQuestion.questionId === (session.currentMessage.questionId || null)
      && latestMainlineQuestion.title === (session.currentMessage.title || 'Question')
    ) {
      latestMainlineQuestion.description = session.currentMessage.description || '';
      latestMainlineQuestion.previewText = session.currentMessage.description || '';
      latestMainlineQuestion.optionsSnapshot = clone(getQuestionOptions(session.currentMessage));
      latestMainlineQuestion.metadataSnapshot = session.currentMessage.metadata ? clone(session.currentMessage.metadata) : null;
      latestMainlineQuestion.branchingSnapshot = session.currentMessage.branching ? clone(session.currentMessage.branching) : null;
      latestMainlineQuestion.historySnapshot = cloneHistoryEntries(session.history || []);
      latestMainlineQuestion.strategyStateSnapshot = normalizeDetachedStrategyState(session.strategyState);
      latestMainlineQuestion.messageSnapshot = clone({
        type: 'question',
        questionType: session.currentMessage.questionType || null,
        questionId: session.currentMessage.questionId || null,
        title: session.currentMessage.title || 'Question',
        description: session.currentMessage.description || '',
        options: getQuestionOptions(session.currentMessage),
        allowTextOverride: Boolean(session.currentMessage.allowTextOverride),
        textOverrideLabel: session.currentMessage.textOverrideLabel || null,
        branching: session.currentMessage.branching ? clone(session.currentMessage.branching) : null,
        metadata: session.currentMessage.metadata ? clone(session.currentMessage.metadata) : null
      });
      log.mainlineActiveNodeId = latestMainlineQuestion.id;
      log.activeNodeId = latestMainlineQuestion.id;
      return latestMainlineQuestion;
    }

    const parentNodeId = latestMainlineQuestion ? latestMainlineQuestion.id : log.rootNodeId;
    const sourceAnswer = Array.isArray(session.history) && session.history.length > 0
      ? createHistoryAnswerSnapshot(session.history[session.history.length - 1])
      : null;
    return appendQuestionNodeToLog(log, session, session.currentMessage, {
      lane: 'mainline',
      parentNodeId,
      sourceAnswer,
      edgeKind: parentNodeId === log.rootNodeId ? 'seed' : 'progression',
      setActive: true
    });
  }

  function appendMainlineNodeTransition(session, previousQuestion, answer) {
    const log = ensureSessionNodeLog(session);
    if (!previousQuestion || previousQuestion.type !== 'question') {
      syncNodeLogActiveNode(session);
      return log;
    }
    const parentQuestionNode = findLatestQuestionNode(log, previousQuestion.questionId, { lane: 'mainline' })
      || appendQuestionNodeToLog(log, session, previousQuestion, {
        lane: 'mainline',
        parentNodeId: log.rootNodeId,
        edgeKind: 'seed'
      });
    const sourceAnswer = createAnswerSnapshot(previousQuestion, answer);

    if (session.currentMessage && session.currentMessage.type === 'question') {
      appendQuestionNodeToLog(log, session, session.currentMessage, {
        lane: 'mainline',
        parentNodeId: parentQuestionNode.id,
        sourceAnswer,
        edgeKind: 'progression',
        setActive: true
      });
      return log;
    }

    if (session.currentMessage) {
      appendResultNodeToLog(log, session, session.currentMessage, {
        lane: 'mainline',
        parentNodeId: parentQuestionNode.id,
        sourceAnswer,
        edgeKind: 'result',
        setActive: true
      });
    }
    return log;
  }

  function appendBranchRunResult(session, branchRun, question, answer, resultSummary) {
    const log = ensureSessionNodeLog(session);
    const branchQuestionNode = findLatestQuestionNode(log, question && question.questionId ? question.questionId : null, {
      branchRunId: branchRun.id
    }) || appendQuestionNodeToLog(log, session, question, {
      lane: 'branch',
      parentNodeId: findNodeById(log, log.rootNodeId).id,
      branchRunId: branchRun.id,
      roundId: branchRun.id,
      sourceOptionId: branchRun.sourceOptionId || null,
      edgeKind: 'branch'
    });
    appendResultNodeToLog(log, session, {
      type: 'summary',
      title: resultSummary && resultSummary.title ? resultSummary.title : `${branchRun.title || branchRun.id} branch note`,
      text: resultSummary && resultSummary.text ? resultSummary.text : ''
    }, {
      lane: 'branch',
      parentNodeId: branchQuestionNode.id,
      branchRunId: branchRun.id,
      sourceAnswer: createAnswerSnapshot(question, answer),
      edgeKind: 'result',
      setActive: session.strategyState && session.strategyState.selectedBranchRunId === branchRun.id
    });
    syncNodeLogActiveNode(session);
    return log;
  }

  function resolveQuestionAnswerSummary(log, node) {
    const outgoing = findOutgoingEdges(log, node.id).filter((edge) => edge.sourceAnswer);
    const preferred = outgoing.find((edge) => edge.kind === 'progression' || edge.kind === 'result') || outgoing[0] || null;
    if (!preferred || !preferred.sourceAnswer) {
      return null;
    }
    return preferred.sourceAnswer.label
      || preferred.sourceAnswer.text
      || preferred.sourceAnswer.rawInput
      || null;
  }

  function resolveRoundIdFromActiveNode(log, activeNodeId, allowResultParent) {
    const activeNode = findNodeById(log, activeNodeId);
    if (!activeNode) {
      return null;
    }
    if (activeNode.kind === 'question') {
      return activeNode.roundId || null;
    }
    if (allowResultParent && activeNode.kind === 'result') {
      const parentNode = findNodeById(log, activeNode.parentNodeId);
      return parentNode && parentNode.kind === 'question'
        ? parentNode.roundId || null
        : null;
    }
    return null;
  }

  function refreshRoundGraph(session) {
    const log = ensureSessionNodeLog(session);
    const strategyState = normalizeSessionStrategyState(session);
    const branchRunById = new Map(
      (Array.isArray(strategyState.branchRuns) ? strategyState.branchRuns : [])
        .map((branchRun) => [branchRun.id, branchRun])
    );
    const activeRoundId = resolveRoundIdFromActiveNode(log, log.activeNodeId, true);
    const currentMainlineRoundId = resolveRoundIdFromActiveNode(log, log.mainlineActiveNodeId, false);

    const rounds = log.nodes
      .filter((node) => node.kind === 'question')
      .map((node) => {
        const parentNode = findNodeById(log, node.parentNodeId);
        const incomingEdge = findIncomingEdge(log, node.id);
        const branchRun = node.branchRunId ? branchRunById.get(node.branchRunId) : null;
        const previewText = branchRun && branchRun.resultSummary && branchRun.resultSummary.text
          ? branchRun.resultSummary.text
          : (node.previewText || node.description || '');
        const answerSummary = branchRun && branchRun.resultSummary && branchRun.resultSummary.text
          ? branchRun.resultSummary.text
          : resolveQuestionAnswerSummary(log, node);
        let status = 'complete';
        if (node.branchRunId) {
          if (
            branchRun
            && (
              branchRun.resultSummary
              || (branchRun.currentMessage && (
                branchRun.currentMessage.type === 'summary'
                || branchRun.currentMessage.type === 'artifact_ready'
              ))
            )
          ) {
            status = 'complete';
          } else if (strategyState.selectedBranchRunId === node.branchRunId) {
            status = 'active';
          } else {
            status = branchRun && branchRun.status ? branchRun.status : 'paused';
          }
        } else if (node.id === log.mainlineActiveNodeId) {
          status = strategyState.selectedBranchRunId ? 'available' : 'active';
        }
        return {
          id: node.roundId,
          kind: 'round',
          lane: node.lane,
          nodeId: node.id,
          parentRoundId: parentNode && parentNode.kind === 'question'
            ? parentNode.roundId
            : 'topic-root',
          questionId: node.questionId || null,
          title: node.title || 'Question',
          body: previewText,
          previewText,
          answerSummary,
          sourceAnswer: incomingEdge && incomingEdge.sourceAnswer
            ? {
                optionId: node.sourceOptionId || null,
                label: incomingEdge.sourceAnswer.label || null,
                questionId: incomingEdge.sourceAnswer.questionId || null,
                optionIds: Array.isArray(incomingEdge.sourceAnswer.optionIds)
                  ? clone(incomingEdge.sourceAnswer.optionIds)
                  : []
              }
            : (node.branchRunId
              ? {
                  optionId: node.sourceOptionId || null,
                  label: branchRun ? branchRun.title || branchRun.sourceOptionId || null : null
                }
              : null),
          status,
          isActive: activeRoundId === node.roundId,
          branchRunId: node.branchRunId || null,
          sourceOptionId: node.sourceOptionId || null,
          message: node.messageSnapshot ? clone(node.messageSnapshot) : null
        };
      });

    const representedBranchRunIds = new Set(
      rounds
        .map((round) => round && round.branchRunId ? round.branchRunId : null)
        .filter(Boolean)
    );

    strategyState.branchRuns.forEach((branchRun) => {
      if (!branchRun || representedBranchRunIds.has(branchRun.id)) {
        return;
      }
      const parentQuestionNode = branchRun.parentQuestionNodeId
        ? findNodeById(log, branchRun.parentQuestionNodeId)
        : findLatestQuestionNode(log, branchRun.parentQuestionId, { lane: 'mainline' });
      rounds.push({
        id: branchRun.id,
        kind: 'round',
        lane: 'branch',
        nodeId: null,
        parentRoundId: parentQuestionNode && parentQuestionNode.roundId
          ? parentQuestionNode.roundId
          : 'topic-root',
        questionId: branchRun.currentQuestionId || null,
        title: (branchRun.currentMessage && branchRun.currentMessage.title)
          || (branchRun.resultSummary && branchRun.resultSummary.title)
          || branchRun.title
          || 'Branch round',
        body: (branchRun.currentMessage && (branchRun.currentMessage.artifactPreviewText || branchRun.currentMessage.text || branchRun.currentMessage.description))
          || (branchRun.resultSummary && branchRun.resultSummary.text)
          || branchRun.description
          || '',
        previewText: (branchRun.currentMessage && (branchRun.currentMessage.artifactPreviewText || branchRun.currentMessage.text || branchRun.currentMessage.description))
          || (branchRun.resultSummary && branchRun.resultSummary.text)
          || branchRun.description
          || '',
        answerSummary: branchRun.resultSummary && branchRun.resultSummary.text
          ? branchRun.resultSummary.text
          : null,
        sourceAnswer: {
          optionId: branchRun.sourceOptionId || null,
          label: branchRun.sourceOptionLabel || branchRun.title || branchRun.sourceOptionId || null
        },
        sourceOptionId: branchRun.sourceOptionId || null,
        status: branchRun.status || 'paused',
        isActive: activeRoundId === branchRun.id,
        branchRunId: branchRun.id,
        message: branchRun.currentMessage && branchRun.currentMessage.type === 'question'
          ? clone(branchRun.currentMessage)
          : null
      });
    });

    session.roundGraph = {
      schemaVersion: 1,
      topicNodeId: log.rootNodeId,
      currentMainlineRoundId,
      activeRoundId: activeRoundId || strategyState.selectedBranchRunId || currentMainlineRoundId,
      rounds
    };
    return session.roundGraph;
  }

  function refreshBranchRunStatuses(strategyState) {
    const state = normalizeStrategyState(strategyState);
    const selectedId = state.selectedBranchRunId;
    state.branchRuns = state.branchRuns.map((branchRun) => {
      const branchMessageType = branchRun.currentMessage && branchRun.currentMessage.type
        ? branchRun.currentMessage.type
        : null;
      if (
        branchRun.resultSummary
        || branchMessageType === 'summary'
        || branchMessageType === 'artifact_ready'
      ) {
        return {
          ...branchRun,
          status: 'complete'
        };
      }
      if (selectedId && branchRun.id === selectedId) {
        return {
          ...branchRun,
          status: 'active'
        };
      }
      return {
        ...branchRun,
        status: branchRun.status === 'queued' ? 'queued' : 'paused'
      };
    });
    return state;
  }

  function ensureBranchSelection(session) {
    const state = normalizeSessionStrategyState(session);
    const selectedId = state.selectedBranchRunId;
    if (selectedId && !state.branchRuns.some((branchRun) => branchRun.id === selectedId)) {
      state.selectedBranchRunId = null;
    }
    session.strategyState = refreshBranchRunStatuses(state);
    return session.strategyState;
  }

  function getSelectedBranchRun(session) {
    const state = ensureBranchSelection(session);
    if (!state.selectedBranchRunId) {
      return null;
    }
    return state.branchRuns.find((branchRun) => branchRun.id === state.selectedBranchRunId) || null;
  }

  function buildBranchRunRecord(session, anchorNode, question, option, existingBranchRun) {
    const now = nowIso();
    const existing = existingBranchRun && typeof existingBranchRun === 'object'
      ? clone(existingBranchRun)
      : {};
    const anchorQuestion = anchorNode && anchorNode.messageSnapshot && anchorNode.messageSnapshot.type === 'question'
      ? clone(anchorNode.messageSnapshot)
      : clone(question || null);
    const anchorHistory = anchorNode && Array.isArray(anchorNode.historySnapshot)
      ? cloneHistoryEntries(anchorNode.historySnapshot)
      : cloneHistoryEntries(session.history || []);
    const anchorStrategyState = anchorNode && anchorNode.strategyStateSnapshot
      ? normalizeDetachedStrategyState(anchorNode.strategyStateSnapshot)
      : normalizeDetachedStrategyState(session.strategyState);
    const backendMode = existing.backendMode || session.backendMode || 'fake';

    return {
      ...existing,
      id: existing.id || buildBranchRunId(anchorNode && anchorNode.id, option && option.id),
      parentQuestionId: question && question.questionId ? question.questionId : null,
      parentQuestionNodeId: anchorNode && anchorNode.id ? anchorNode.id : null,
      sourceOptionId: option && option.id ? option.id : null,
      sourceOptionLabel: option && option.label ? option.label : (option && option.id ? option.id : null),
      title: option && option.label ? option.label : (existing.title || existing.id || 'Branch'),
      description: option && option.description ? option.description : (existing.description || ''),
      backendMode,
      providerSession: existing.providerSession || createFreshBranchProviderSession(backendMode, session.completionMode),
      strategyState: existing.strategyState
        ? normalizeDetachedStrategyState(existing.strategyState)
        : anchorStrategyState,
      currentQuestionId: existing.currentQuestionId || (anchorQuestion && anchorQuestion.questionId ? anchorQuestion.questionId : null),
      currentMessage: existing.currentMessage && !isLegacyBranchDetailQuestion(existing.currentMessage)
        ? clone(existing.currentMessage)
        : anchorQuestion,
      history: Array.isArray(existing.history) && existing.history.length > 0
        ? cloneHistoryEntries(existing.history)
        : anchorHistory,
      resultSummary: existing.resultSummary ? clone(existing.resultSummary) : null,
      summary: existing.summary ? clone(existing.summary) : null,
      artifact: existing.artifact ? clone(existing.artifact) : null,
      anchorQuestion,
      anchorHistory,
      anchorStrategyState,
      status: existing.status || 'queued',
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
  }

  async function submitRuntimeSnapshot(session, workflow, runtimeSnapshot, answer, action) {
    const usesFallbackRuntime = runtimeSnapshot.backendMode === 'fake';
    let next;
    try {
      if (usesFallbackRuntime) {
        next = await withTimeout(
          fallbackRuntimeAdapter.submitAnswer(runtimeSnapshot, answer),
          runtimeSubmitTimeoutMs,
          'fallback runtime submitAnswer'
        );
      } else {
        next = await withTimeout(
          runtimeAdapter.submitAnswer(runtimeSnapshot, answer),
          runtimeSubmitTimeoutMs,
          'runtime submitAnswer'
        );
      }
    } catch (error) {
      if (workflow.mode !== WORKFLOW_MODES.FULL_SKILL || !allowFakeRuntimeFallback) {
        throw error;
      }
      recordWorkflowEvent(workflow, {
        kind: 'runtime-fallback',
        action,
        fromBackendMode: runtimeSnapshot.backendMode || 'unknown',
        error: error.message
      });
      next = await fallbackRuntimeAdapter.submitAnswer({
        ...runtimeSnapshot,
        backendMode: 'fake',
        providerSession: createFreshBranchProviderSession('fake', session.completionMode),
        strategyState: normalizeDetachedStrategyState(runtimeSnapshot.strategyState)
      }, answer);
    }
    return next;
  }

  function applyBranchRuntimeState(branchRun, runtimeState) {
    const nextBranchRun = clone(branchRun);
    nextBranchRun.backendMode = runtimeState.backendMode || nextBranchRun.backendMode || null;
    nextBranchRun.providerSession = runtimeState.providerSession || null;
    nextBranchRun.strategyState = normalizeDetachedStrategyState(runtimeState.strategyState);
    nextBranchRun.history = cloneHistoryEntries(runtimeState.history || []);
    nextBranchRun.updatedAt = nowIso();
    nextBranchRun.currentQuestionId = runtimeState.currentQuestionId || null;
    nextBranchRun.currentMessage = runtimeState.currentMessage ? clone(runtimeState.currentMessage) : null;
    nextBranchRun.summary = null;
    nextBranchRun.artifact = null;

    if (runtimeState.currentMessage && runtimeState.currentMessage.type === 'question') {
      nextBranchRun.resultSummary = null;
      nextBranchRun.status = 'paused';
      return nextBranchRun;
    }

    if (runtimeState.currentMessage && runtimeState.currentMessage.type === 'summary') {
      nextBranchRun.summary = clone(runtimeState.currentMessage);
      nextBranchRun.resultSummary = {
        title: runtimeState.currentMessage.title || nextBranchRun.title || 'Branch summary',
        text: runtimeState.currentMessage.text || ''
      };
      nextBranchRun.status = 'complete';
      nextBranchRun.currentQuestionId = null;
      return nextBranchRun;
    }

    if (runtimeState.currentMessage && runtimeState.currentMessage.type === 'artifact_ready') {
      nextBranchRun.artifact = clone(runtimeState.currentMessage);
      nextBranchRun.resultSummary = {
        title: runtimeState.currentMessage.title || nextBranchRun.title || 'Branch artifact',
        text: runtimeState.currentMessage.artifactPreviewText || runtimeState.currentMessage.text || ''
      };
      nextBranchRun.status = 'complete';
      nextBranchRun.currentQuestionId = null;
      return nextBranchRun;
    }

    return nextBranchRun;
  }

  function appendBranchNodeTransition(session, branchRun, previousQuestion, answer, options) {
    const log = ensureSessionNodeLog(session);
    const config = options || {};
    const selectedBranchId = session.strategyState && session.strategyState.selectedBranchRunId
      ? session.strategyState.selectedBranchRunId
      : null;
    const anchorNode = branchRun.parentQuestionNodeId
      ? findNodeById(log, branchRun.parentQuestionNodeId)
      : null;
    const previousBranchQuestionNode = previousQuestion && previousQuestion.questionId
      ? findLatestQuestionNode(log, previousQuestion.questionId, { branchRunId: branchRun.id })
      : null;
    const parentNodeId = previousBranchQuestionNode
      ? previousBranchQuestionNode.id
      : ((config.parentNodeId && findNodeById(log, config.parentNodeId))
        ? config.parentNodeId
        : (anchorNode ? anchorNode.id : log.rootNodeId));
    const sourceAnswer = previousBranchQuestionNode
      ? createAnswerSnapshot(previousQuestion, answer)
      : createBranchOptionSnapshot(
          previousQuestion || branchRun.anchorQuestion || { questionId: branchRun.parentQuestionId },
          {
            id: branchRun.sourceOptionId || null,
            label: branchRun.sourceOptionLabel || branchRun.title || branchRun.sourceOptionId || null
          }
        );

    if (branchRun.currentMessage && branchRun.currentMessage.type === 'question') {
      appendQuestionNodeToLog(log, session, branchRun.currentMessage, {
        lane: 'branch',
        parentNodeId,
        branchRunId: branchRun.id,
        roundId: branchRun.id,
        sourceOptionId: branchRun.sourceOptionId || null,
        sourceAnswer,
        edgeKind: previousBranchQuestionNode ? 'progression' : 'branch',
        setActive: selectedBranchId === branchRun.id
      });
      syncNodeLogActiveNode(session);
      refreshRoundGraph(session);
      return;
    }

    if (
      branchRun.currentMessage
      && (branchRun.currentMessage.type === 'summary' || branchRun.currentMessage.type === 'artifact_ready')
    ) {
      appendResultNodeToLog(log, session, branchRun.currentMessage, {
        lane: 'branch',
        parentNodeId,
        branchRunId: branchRun.id,
        sourceAnswer,
        edgeKind: previousBranchQuestionNode ? 'result' : 'branch',
        setActive: selectedBranchId === branchRun.id
      });
      syncNodeLogActiveNode(session);
      refreshRoundGraph(session);
    }
  }

  async function createBranchRunsForSelection(session, anchorNode, question, selectedOptions, options) {
    const config = options || {};
    const state = normalizeSessionStrategyState(session);
    const nextBranchRuns = Array.isArray(state.branchRuns) ? clone(state.branchRuns) : [];
    const workflow = ensureWorkflow(session);
    const createdBranchIds = [];
    const transitions = [];

    for (const option of selectedOptions) {
      const branchRunId = buildBranchRunId(anchorNode && anchorNode.id, option && option.id);
      const existingIndex = nextBranchRuns.findIndex((branchRun) => branchRun.id === branchRunId);
      const existing = existingIndex >= 0 ? nextBranchRuns[existingIndex] : null;
      if (existing && isRealBranchRun(existing)) {
        createdBranchIds.push(existing.id);
        continue;
      }

      const branchRun = buildBranchRunRecord(session, anchorNode, question, option, existing);
      const branchAnswer = {
        type: 'answer',
        questionId: question && question.questionId ? question.questionId : null,
        answerMode: option && option.id
          ? structuredHost.ANSWER_MODES.OPTION
          : structuredHost.ANSWER_MODES.TEXT,
        optionIds: option && option.id ? [option.id] : [],
        text: option && option.id ? null : (option && option.label ? option.label : null),
        rawInput: option && option.id ? option.id : (option && option.label ? option.label : '')
      };
      const runtimeSnapshot = {
        sessionId: branchRun.id,
        seedPrompt: session.seedPrompt,
        backendMode: branchRun.backendMode || session.backendMode || 'fake',
        providerSession: branchRun.providerSession || createFreshBranchProviderSession(branchRun.backendMode || session.backendMode || 'fake', session.completionMode),
        strategyState: normalizeDetachedStrategyState(branchRun.anchorStrategyState),
        currentQuestionId: question && question.questionId ? question.questionId : null,
        history: cloneHistoryEntries(branchRun.anchorHistory),
        currentMessage: clone(question)
      };
      const nextRuntimeState = await submitRuntimeSnapshot(session, workflow, runtimeSnapshot, branchAnswer, 'branch-create');
      const nextBranchRun = applyBranchRuntimeState(branchRun, nextRuntimeState);

      if (existingIndex >= 0) {
        nextBranchRuns[existingIndex] = nextBranchRun;
      } else {
        nextBranchRuns.push(nextBranchRun);
      }
      createdBranchIds.push(nextBranchRun.id);
      transitions.push({
        branchRun: nextBranchRun,
        previousQuestion: question,
        answer: branchAnswer,
        parentNodeId: anchorNode && anchorNode.id ? anchorNode.id : null
      });
    }

    state.branchRuns = nextBranchRuns;
    if (config.selectBranchId) {
      state.selectedBranchRunId = config.selectBranchId;
    } else if (config.selectFirstCreated && createdBranchIds.length > 0) {
      state.selectedBranchRunId = createdBranchIds[0];
    } else if (config.clearSelection !== false) {
      state.selectedBranchRunId = null;
    }
    session.strategyState = refreshBranchRunStatuses(state);
    transitions.forEach((transition) => {
      appendBranchNodeTransition(session, transition.branchRun, transition.previousQuestion, transition.answer, {
        parentNodeId: transition.parentNodeId
      });
    });
    syncNodeLogActiveNode(session);
    refreshRoundGraph(session);
    return session.strategyState;
  }

  function setSelectedBranchRun(session, branchRunId) {
    const state = normalizeSessionStrategyState(session);
    if (branchRunId == null) {
      state.selectedBranchRunId = null;
      session.strategyState = refreshBranchRunStatuses(state);
      syncNodeLogActiveNode(session);
      refreshRoundGraph(session);
      return null;
    }

    const target = state.branchRuns.find((branchRun) => branchRun.id === branchRunId);
    if (!target) {
      throw new Error(`Unknown branch run: ${branchRunId}`);
    }

    state.selectedBranchRunId = branchRunId;
    session.strategyState = refreshBranchRunStatuses(state);
    syncNodeLogActiveNode(session);
    refreshRoundGraph(session);
    return target;
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

  function migrateLegacyBranchRuns(session) {
    const log = session && session.nodeLog && Array.isArray(session.nodeLog.nodes)
      ? session.nodeLog
      : null;
    if (!log) {
      return false;
    }
    const state = normalizeSessionStrategyState(session);
    let changed = false;
    state.branchRuns = state.branchRuns.map((branchRun) => {
      let nextBranchRun = branchRun;
      const parentQuestionNode = nextBranchRun.parentQuestionNodeId
        ? findNodeById(log, nextBranchRun.parentQuestionNodeId)
        : findLatestQuestionNode(log, nextBranchRun.parentQuestionId, { lane: 'mainline' });

      if (parentQuestionNode && !nextBranchRun.parentQuestionNodeId) {
        nextBranchRun = {
          ...nextBranchRun,
          parentQuestionNodeId: parentQuestionNode.id
        };
        changed = true;
      }
      if (parentQuestionNode && !nextBranchRun.anchorQuestion && parentQuestionNode.messageSnapshot) {
        nextBranchRun = {
          ...nextBranchRun,
          anchorQuestion: clone(parentQuestionNode.messageSnapshot)
        };
        changed = true;
      }
      if (parentQuestionNode && (!Array.isArray(nextBranchRun.anchorHistory) || nextBranchRun.anchorHistory.length === 0)) {
        nextBranchRun = {
          ...nextBranchRun,
          anchorHistory: cloneHistoryEntries(parentQuestionNode.historySnapshot || [])
        };
        changed = true;
      }
      if (parentQuestionNode && !nextBranchRun.anchorStrategyState && parentQuestionNode.strategyStateSnapshot) {
        nextBranchRun = {
          ...nextBranchRun,
          anchorStrategyState: normalizeDetachedStrategyState(parentQuestionNode.strategyStateSnapshot)
        };
        changed = true;
      }
      if (!nextBranchRun.sourceOptionLabel && (nextBranchRun.title || nextBranchRun.sourceOptionId)) {
        nextBranchRun = {
          ...nextBranchRun,
          sourceOptionLabel: nextBranchRun.title || nextBranchRun.sourceOptionId || null
        };
        changed = true;
      }
      return nextBranchRun;
    });
    if (changed) {
      session.strategyState = refreshBranchRunStatuses(state);
    }
    return changed;
  }

  function loadSession(sessionId) {
    const filePath = sessionFile(sessionId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const session = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    ensureSessionProcessing(session);
    const lifecycleChanged = reconcileSessionProcessingLifecycle(session);
    const workflow = ensureWorkflow(session);
    workflow.review.retryBudget = reviewRetryBudget;
    ensureSessionNodeLog(session);
    migrateLegacyBranchRuns(session);
    ensureBranchSelection(session);
    refreshRoundGraph(session);
    syncFinishedResult(session);
    if (lifecycleChanged) {
      persistSession(session);
    }
    return session;
  }

  function queueBackgroundJob(sessionId, action, expectedJobId, runner) {
    if (!backgroundProcessing || !sessionId || runningJobs.has(sessionId)) {
      return false;
    }

    const jobRecord = {
      sessionId,
      action,
      jobId: expectedJobId,
      heartbeatTimer: null
    };
    runningJobs.set(sessionId, jobRecord);

    setImmediate(() => {
      Promise.resolve()
        .then(async () => {
          let session;
          try {
            session = loadSession(sessionId);
          } catch (loadError) {
            if (!/Unknown session/.test(loadError.message || '')) {
              throw loadError;
            }
            return;
          }

          const processing = ensureSessionProcessing(session);
          if (
            processing.action !== action
            || processing.jobId !== expectedJobId
            || (processing.state !== 'running' && processing.state !== 'cancelled')
          ) {
            return;
          }

          if (processing.state === 'running') {
            markSessionProcessingStarted(session, expectedJobId);
            persistSession(session);
            jobRecord.heartbeatTimer = startProcessingHeartbeat(sessionId, action, expectedJobId);
          }
          await runner(session, processing);
        })
        .catch((error) => {
          try {
            const session = loadSession(sessionId);
            if (markSessionProcessingRetryable(session, expectedJobId, error)) {
              persistSession(session);
            }
          } catch (loadError) {
            if (!/Unknown session/.test(loadError.message || '')) {
              console.error(loadError);
            }
          }
        })
        .finally(() => {
          if (jobRecord.heartbeatTimer) {
            clearInterval(jobRecord.heartbeatTimer);
            jobRecord.heartbeatTimer = null;
          }
          const current = runningJobs.get(sessionId);
          if (current && current.jobId === expectedJobId) {
            runningJobs.delete(sessionId);
          }
        });
    });

    return true;
  }

  function ensureBackgroundJobForSession(session) {
    if (reconcileSessionProcessingLifecycle(session)) {
      persistSession(session);
    }
  }

  function createArtifact(session, summary, artifactMarkdown) {
    const title = `${session.id}.md`;
    const filePath = path.join(artifactsDir, title);
    fs.writeFileSync(filePath, artifactMarkdown || buildArtifactMarkdown(session, summary));
    const parsedArtifact = artifactMarkdown
      ? parseArtifactMarkdownContent(artifactMarkdown, summary && summary.title ? summary.title : null)
      : null;
    const previewText = parsedArtifact && parsedArtifact.summary
      ? parsedArtifact.summary
      : (summary && typeof summary.text === 'string' ? summary.text : null);
    return {
      artifactType: 'markdown',
      title,
      filePath,
      path: `/api/sessions/${session.id}/artifacts/current`,
      text: previewText || 'Artifact is ready.',
      previewText
    };
  }

  function createArtifactReadySource(session, message) {
    if (!message || message.type !== 'artifact_ready') {
      return null;
    }

    if (typeof message.artifactMarkdown === 'string' && message.artifactMarkdown.trim()) {
      return {
        title: message.title || session.id,
        text: message.text || '',
        answers: session.history.map((entry) => ({
          questionId: entry.questionId,
          answer: entry.answer
        })),
        artifactMarkdown: message.artifactMarkdown
      };
    }

    if (message.deliverable && typeof message.deliverable === 'object') {
      return {
        title: message.title || session.id,
        text: message.text || '',
        answers: session.history.map((entry) => ({
          questionId: entry.questionId,
          answer: entry.answer
        })),
        deliverable: clone(message.deliverable)
      };
    }

    return null;
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
      const timer = setTimeout(() => {
        const error = new Error(`${label} timed out after ${ms}ms`);
        error.code = 'RUNTIME_TIMEOUT';
        reject(error);
      }, ms);
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
        appendCurrentQuestionToMainline(session);
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
    appendCurrentQuestionToMainline(session);
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
    const previousStrategyState = normalizeStrategyState(session.strategyState);
    session.backendMode = runtimeState.backendMode;
    session.providerSession = runtimeState.providerSession || null;
    session.strategyState = normalizeStrategyState({
      ...runtimeState.strategyState,
      branchRuns: previousStrategyState.branchRuns,
      selectedBranchRunId: previousStrategyState.selectedBranchRunId
    });
    session.currentQuestionId = runtimeState.currentQuestionId || null;
    session.history = runtimeState.history || [];
    ensureSessionProvenance(session);
    ensureWorkflow(session);
    ensureBranchSelection(session);

    if (runtimeState.currentMessage.type === 'summary') {
      session.summary = clone(runtimeState.currentMessage);
      recordMessageProvenance(session, runtimeState.currentMessage);
      if (session.completionMode === 'artifact' && session.workflow.mode !== WORKFLOW_MODES.FULL_SKILL) {
        const summaryMarkdown = typeof runtimeState.currentMessage.summaryMarkdown === 'string'
          && runtimeState.currentMessage.summaryMarkdown.trim()
          ? runtimeState.currentMessage.summaryMarkdown
          : null;
        session.artifact = createArtifact(session, runtimeState.currentMessage, summaryMarkdown);
        session.currentMessage = {
          type: 'artifact_ready',
          artifactType: session.artifact.artifactType,
          title: runtimeState.currentMessage.title || session.artifact.title,
          path: session.artifact.path,
          text: runtimeState.currentMessage.text || session.artifact.text,
          artifactPreviewText: runtimeState.currentMessage.text || session.artifact.previewText,
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
      const artifactSource = createArtifactReadySource(session, runtimeState.currentMessage);
      if (!artifactSource) {
        throw new Error('Runtime returned artifact_ready without artifactMarkdown or deliverable content.');
      }
      const markdown = artifactSource.artifactMarkdown || null;
      session.artifact = createArtifact(session, artifactSource, markdown);
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

  async function executeRuntimeCreate(session, input) {
    let runtimeState;
    let runtimeCreationRecovery = null;
    try {
      runtimeState = await withTimeout(
        runtimeAdapter.createSession({
          sessionId: session.id,
          flowId: session.flowId,
          completionMode: session.completionMode,
          initialPrompt: session.seedPrompt,
          cwd: input && input.cwd ? input.cwd : defaultCwd
        }),
        runtimeCreateTimeoutMs,
        'runtime createSession'
      );
    } catch (error) {
      if (session.workflowMode !== WORKFLOW_MODES.FULL_SKILL || !allowFakeRuntimeFallback) {
        throw error;
      }
      runtimeCreationRecovery = {
        kind: 'runtime-fallback',
        action: 'create-session',
        fromBackendMode: 'unknown',
        error: error.message
      };
      runtimeState = await fallbackRuntimeAdapter.createSession({
        sessionId: session.id,
        flowId: session.flowId,
        completionMode: session.completionMode,
        initialPrompt: session.seedPrompt,
        cwd: input && input.cwd ? input.cwd : defaultCwd
      });
    }

    session.updatedAt = nowIso();
    session.backendMode = runtimeState.backendMode;
    session.providerSession = runtimeState.providerSession || null;
    session.strategyState = normalizeStrategyState(runtimeState.strategyState);
    session.currentQuestionId = runtimeState.currentQuestionId || null;
    session.history = runtimeState.history || [];
    session.currentMessage = runtimeState.currentMessage;
    applyRuntimeMessage(session, runtimeState);
    initializeSessionNodeLog(session);
    if (session.workflowMode === WORKFLOW_MODES.FULL_SKILL) {
      const workflow = ensureWorkflow(session);
      if (runtimeCreationRecovery) {
        recordWorkflowEvent(workflow, runtimeCreationRecovery);
      }
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
    return session;
  }

  function queueCreateProcessing(sessionId, expectedJobId) {
    return queueBackgroundJob(sessionId, 'create', expectedJobId, async (session) => {
      const processing = ensureSessionProcessing(session);
      const pendingInput = processing.pendingInput || {};
      await executeRuntimeCreate(session, pendingInput);
      if (!loadSessionIfJobCurrent(sessionId, 'create', expectedJobId)) {
        return;
      }
      clearSessionProcessing(session, expectedJobId);
      persistSession(session);
    });
  }

  async function createSessionSync(input) {
    const session = createBaseSessionRecord(input, createId());
    await executeRuntimeCreate(session, input);
    persistSession(session);
    return clone(session);
  }

  async function createSession(input) {
    if (!backgroundProcessing) {
      return createSessionSync(input);
    }

    const session = createBaseSessionRecord(input, createId());
    const processing = beginSessionProcessing(session, 'create', buildCreatePendingInput(input, session));
    persistSession(session);
    queueCreateProcessing(session.id, processing.jobId);
    return clone(session);
  }

  function listSessions() {
    return fs.readdirSync(sessionsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => loadSession(path.basename(entry, '.json')))
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
        currentMessageType: session.currentMessage ? session.currentMessage.type : null,
        processing: clone(session.processing)
      }));
  }

  function getSession(sessionId) {
    return clone(loadSession(sessionId));
  }

  function deleteSession(sessionId) {
    const filePath = sessionFile(sessionId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    const session = loadSession(sessionId);
    if (
      session.artifact
      && typeof session.artifact.filePath === 'string'
      && session.artifact.filePath.startsWith(artifactsDir)
      && fs.existsSync(session.artifact.filePath)
    ) {
      fs.unlinkSync(session.artifact.filePath);
    }

    fs.unlinkSync(filePath);
    const runningJob = runningJobs.get(sessionId);
    if (runningJob && runningJob.heartbeatTimer) {
      clearInterval(runningJob.heartbeatTimer);
    }
    runningJobs.delete(sessionId);
    return {
      id: sessionId,
      deleted: true
    };
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
    if (
      session.currentMessage
      && session.currentMessage.type === 'artifact_ready'
      && (!session.workflow || session.workflow.mode !== WORKFLOW_MODES.FULL_SKILL)
    ) {
      const artifactMarkdown = readArtifactMarkdownFile(session);
      if (artifactMarkdown && artifactMarkdown.trim()) {
        return artifactMarkdown;
      }
    }
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
      strategyState: normalizeStrategyState(session.strategyState),
      provenance: session.provenance || {
        questions: [],
        finalResult: null
      }
    });
  }

  function normalizeAnswerMode(optionIds, rawAnswer) {
    if (Array.isArray(optionIds) && optionIds.length > 1) {
      return structuredHost.ANSWER_MODES.OPTIONS;
    }
    if (Array.isArray(optionIds) && optionIds.length === 1) {
      return structuredHost.ANSWER_MODES.OPTION;
    }
    if (rawAnswer && typeof rawAnswer.text === 'string' && rawAnswer.text.trim()) {
      return structuredHost.ANSWER_MODES.TEXT;
    }
    return structuredHost.ANSWER_MODES.TEXT;
  }

  function toStandardAnswerPayload(question, input) {
    const optionIds = Array.isArray(input && input.optionIds)
      ? input.optionIds.filter(Boolean)
      : [];
    const text = typeof (input && input.text) === 'string' ? input.text : null;
    const rawInput = typeof (input && input.rawInput) === 'string'
      ? input.rawInput
      : (text || optionIds.join(', '));

    return {
      type: 'answer',
      questionId: question && question.questionId ? question.questionId : (input && input.questionId ? input.questionId : null),
      answerMode: normalizeAnswerMode(optionIds, input),
      optionIds,
      text,
      rawInput
    };
  }

  function resolveSelectedOptions(question, answer) {
    const options = getQuestionOptions(question);
    const optionIds = Array.isArray(answer && answer.optionIds) ? answer.optionIds : [];
    return optionIds
      .map((optionId) => options.find((option) => option.id === optionId))
      .filter(Boolean);
  }

  function resolveHistoricalBranchAnchorNode(session, answer) {
    const contextSelection = answer && answer.contextSelection && typeof answer.contextSelection === 'object'
      ? answer.contextSelection
      : null;
    if (!contextSelection || contextSelection.type !== 'mainline' || !contextSelection.nodeId) {
      return null;
    }
    const log = ensureSessionNodeLog(session);
    const anchorNode = findNodeById(log, contextSelection.nodeId);
    if (!anchorNode || anchorNode.kind !== 'question' || anchorNode.lane !== 'mainline') {
      return null;
    }
    if (anchorNode.id === log.mainlineActiveNodeId && !getSelectedBranchRun(session)) {
      return null;
    }
    return anchorNode;
  }

  function persistSubmitSession(session, submitContext) {
    const expectedJobId = submitContext && submitContext.expectedJobId
      ? submitContext.expectedJobId
      : null;
    return persistSessionWithJobGuard(session, expectedJobId, 'submit');
  }

  async function submitBranchMaterialization(session, workflow, input, submitContext) {
    const mainlineQuestion = session.currentMessage;
    const normalizedAnswer = toStandardAnswerPayload(mainlineQuestion, input);
    const selectedOptions = resolveBranchSelectionEntries(mainlineQuestion, normalizedAnswer);
    const minimum = mainlineQuestion
      && mainlineQuestion.branching
      && typeof mainlineQuestion.branching.minOptionCount === 'number'
      ? mainlineQuestion.branching.minOptionCount
      : 2;

    if (selectedOptions.length < minimum) {
      throw new Error(`Select at least ${minimum} options before exploring them as branches.`);
    }

    const log = ensureSessionNodeLog(session);
    const sourceQuestionNode = mainlineQuestion && mainlineQuestion.questionId
      ? (findLatestQuestionNode(log, mainlineQuestion.questionId, { lane: 'mainline' })
        || appendQuestionNodeToLog(log, session, mainlineQuestion, {
          lane: 'mainline',
          parentNodeId: log.rootNodeId,
          edgeKind: 'seed'
        }))
      : findNodeById(log, log.rootNodeId);
    const runtimeSnapshot = {
      sessionId: session.id,
      seedPrompt: session.seedPrompt,
      backendMode: session.backendMode,
      providerSession: session.providerSession,
      strategyState: session.strategyState,
      currentQuestionId: session.currentQuestionId,
      history: session.history || [],
      currentMessage: session.currentMessage
    };
    const usesFallbackRuntime = runtimeSnapshot.backendMode === 'fake';
    let next;
    try {
      if (usesFallbackRuntime) {
        next = await withTimeout(
          fallbackRuntimeAdapter.submitAnswer(runtimeSnapshot, normalizedAnswer),
          runtimeSubmitTimeoutMs,
          'fallback runtime submitAnswer'
        );
      } else {
        next = await withTimeout(
          runtimeAdapter.submitAnswer(runtimeSnapshot, normalizedAnswer),
          runtimeSubmitTimeoutMs,
          'runtime submitAnswer'
        );
      }
    } catch (error) {
      if (workflow.mode !== WORKFLOW_MODES.FULL_SKILL || !allowFakeRuntimeFallback) {
        throw error;
      }
      recordWorkflowEvent(workflow, {
        kind: 'runtime-fallback',
        action: 'branch-materialize',
        fromBackendMode: session.backendMode || 'unknown',
        error: error.message
      });
      next = await fallbackRuntimeAdapter.submitAnswer({
        ...runtimeSnapshot,
        backendMode: 'fake',
        providerSession: null
      }, normalizedAnswer);
    }

    session.updatedAt = new Date().toISOString();
    applyRuntimeMessage(session, next);
    appendMainlineNodeTransition(session, mainlineQuestion, normalizedAnswer);
    await createBranchRunsForSelection(session, sourceQuestionNode, mainlineQuestion, selectedOptions, {
      clearSelection: true
    });
    persistSubmitSession(session, submitContext);
    return clone(session);
  }

  async function submitBranchRunAnswer(session, branchRun, input, submitContext) {
    if (!branchRun.currentMessage || branchRun.currentMessage.type !== 'question') {
      return clone(session);
    }

    const normalizedAnswer = toStandardAnswerPayload(branchRun.currentMessage, input);
    const answerLabel = resolveAnswerLabel(branchRun.currentMessage, normalizedAnswer);
    if (!answerLabel) {
      throw new Error('Provide a branch answer before continuing.');
    }

    const state = normalizeSessionStrategyState(session);
    const index = state.branchRuns.findIndex((entry) => entry.id === branchRun.id);
    if (index < 0) {
      throw new Error(`Unknown branch run: ${branchRun.id}`);
    }

    if (!isRealBranchRun(branchRun) && isLegacyBranchDetailQuestion(branchRun.currentMessage)) {
      const nextBranchRun = clone(state.branchRuns[index]);
      nextBranchRun.history = (nextBranchRun.history || []).concat(createHistoryEntry(branchRun.currentMessage, normalizedAnswer));
      nextBranchRun.resultSummary = {
        title: `${nextBranchRun.title} branch note`,
        text: answerLabel
      };
      nextBranchRun.currentQuestionId = null;
      nextBranchRun.currentMessage = null;
      nextBranchRun.updatedAt = nowIso();
      nextBranchRun.status = 'complete';
      state.branchRuns[index] = nextBranchRun;
      session.strategyState = refreshBranchRunStatuses(state);
      appendBranchRunResult(session, nextBranchRun, branchRun.currentMessage, normalizedAnswer, nextBranchRun.resultSummary);
      session.updatedAt = nowIso();
      persistSubmitSession(session, submitContext);
      return clone(session);
    }

    const nextBranchRun = clone(state.branchRuns[index]);
    const runtimeSnapshot = {
      sessionId: nextBranchRun.id,
      seedPrompt: session.seedPrompt,
      backendMode: nextBranchRun.backendMode || session.backendMode || 'fake',
      providerSession: nextBranchRun.providerSession || createFreshBranchProviderSession(nextBranchRun.backendMode || session.backendMode || 'fake', session.completionMode),
      strategyState: normalizeDetachedStrategyState(nextBranchRun.strategyState || nextBranchRun.anchorStrategyState),
      currentQuestionId: branchRun.currentQuestionId || (branchRun.currentMessage && branchRun.currentMessage.questionId ? branchRun.currentMessage.questionId : null),
      history: cloneHistoryEntries(nextBranchRun.history),
      currentMessage: clone(branchRun.currentMessage)
    };
    const nextRuntimeState = await submitRuntimeSnapshot(session, ensureWorkflow(session), runtimeSnapshot, normalizedAnswer, 'branch-submit');
    const appliedBranchRun = applyBranchRuntimeState(nextBranchRun, nextRuntimeState);
    state.branchRuns[index] = appliedBranchRun;
    session.strategyState = refreshBranchRunStatuses(state);
    appendBranchNodeTransition(session, appliedBranchRun, branchRun.currentMessage, normalizedAnswer, {});
    session.updatedAt = nowIso();
    persistSubmitSession(session, submitContext);
    return clone(session);
  }

  async function submitHistoricalBranchAnswer(session, workflow, input, submitContext) {
    const anchorNode = resolveHistoricalBranchAnchorNode(session, input);
    if (!anchorNode || !anchorNode.messageSnapshot || anchorNode.messageSnapshot.type !== 'question') {
      return null;
    }
    const frozenQuestion = clone(anchorNode.messageSnapshot);
    const normalizedAnswer = toStandardAnswerPayload(frozenQuestion, input);
    const selectedOptions = resolveBranchSelectionEntries(frozenQuestion, normalizedAnswer);
    if (selectedOptions.length === 0) {
      throw new Error('Select at least one option before starting a branch from this historical question.');
    }
    await createBranchRunsForSelection(session, anchorNode, frozenQuestion, selectedOptions, {
      selectFirstCreated: true,
      clearSelection: false
    });
    session.updatedAt = nowIso();
    persistSubmitSession(session, submitContext);
    return clone(session);
  }

  function selectSessionBranchContext(sessionId, branchRunId) {
    const session = loadSession(sessionId);
    setSelectedBranchRun(session, branchRunId || null);
    session.updatedAt = nowIso();
    persistSession(session);
    return clone(session);
  }

  async function submitAnswerSync(sessionId, answer, submitContext) {
    const session = loadSession(sessionId);
    const workflow = ensureWorkflow(session);
    if (!session.currentMessage || session.currentMessage.type !== 'question') {
      return clone(session);
    }

    const selectedBranchRun = getSelectedBranchRun(session);
    if (answer && answer.type === 'branch_materialize') {
      return submitBranchMaterialization(session, workflow, answer, submitContext);
    }
    if (resolveHistoricalBranchAnchorNode(session, answer)) {
      return submitHistoricalBranchAnswer(session, workflow, answer, submitContext);
    }
    if (selectedBranchRun && selectedBranchRun.currentMessage && selectedBranchRun.currentMessage.type === 'question') {
      return submitBranchRunAnswer(session, selectedBranchRun, answer, submitContext);
    }

    if (workflow.mode === WORKFLOW_MODES.FULL_SKILL) {
      if (session.currentMessage.questionId === 'workflow-review-spec') {
        const previousQuestion = clone(session.currentMessage);
        session.updatedAt = new Date().toISOString();
        if (Array.isArray(answer.optionIds) && answer.optionIds.includes('yes')) {
          recordApprovalCheckpoint(workflow, {
            kind: ACTION_KINDS.SPEC_REVIEW,
            decision: 'approved',
            questionId: session.currentMessage.questionId
          });
          await runWorkflowPlanDraft(session);
          appendMainlineNodeTransition(session, previousQuestion, answer);
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
          appendMainlineNodeTransition(session, previousQuestion, answer);
        }
        persistSubmitSession(session, submitContext);
        return clone(session);
      }

      if (session.currentMessage.questionId === 'workflow-revise-spec') {
        const previousQuestion = clone(session.currentMessage);
        session.updatedAt = new Date().toISOString();
        workflow.blocked = null;
        workflow.review = createInitialReviewState();
        await runWorkflowSpecDraft(session, answer.text || answer.rawInput || '');
        appendMainlineNodeTransition(session, previousQuestion, answer);
        persistSubmitSession(session, submitContext);
        return clone(session);
      }
    }

    const previousQuestion = clone(session.currentMessage);
    const runtimeSnapshot = {
      sessionId: session.id,
      seedPrompt: session.seedPrompt,
      backendMode: session.backendMode,
      providerSession: session.providerSession,
      strategyState: session.strategyState,
      currentQuestionId: session.currentQuestionId,
      history: session.history || [],
      currentMessage: session.currentMessage
    };
    const usesFallbackRuntime = runtimeSnapshot.backendMode === 'fake';
    async function reseedFallbackSession(error) {
      const fallbackPrompt = answer && (answer.text || answer.rawInput)
        ? (answer.text || answer.rawInput)
        : (session.seedPrompt || '');
      recordWorkflowEvent(workflow, {
        kind: 'runtime-fallback-reseed',
        action: 'submit-answer',
        error: error.message
      });
      const reseeded = await fallbackRuntimeAdapter.createSession({
        sessionId: session.id,
        flowId: session.flowId,
        completionMode: session.completionMode,
        initialPrompt: fallbackPrompt,
        cwd: defaultCwd
      });
      reseeded.history = [{
        questionId: session.currentQuestionId,
        question: session.currentMessage && session.currentMessage.title
          ? session.currentMessage.title
          : session.currentQuestionId,
        answer: fallbackPrompt
      }];
      return reseeded;
    }
    let next;
    try {
      if (usesFallbackRuntime) {
        next = await withTimeout(
          fallbackRuntimeAdapter.submitAnswer(runtimeSnapshot, answer),
          runtimeSubmitTimeoutMs,
          'fallback runtime submitAnswer'
        );
      } else {
        next = await withTimeout(
          runtimeAdapter.submitAnswer(runtimeSnapshot, answer),
          runtimeSubmitTimeoutMs,
          'runtime submitAnswer'
        );
      }
    } catch (error) {
      if (workflow.mode !== WORKFLOW_MODES.FULL_SKILL || !allowFakeRuntimeFallback) {
        throw error;
      }
      if (usesFallbackRuntime) {
        next = await reseedFallbackSession(error);
      } else {
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
          next = await reseedFallbackSession(fallbackError);
        }
      }
    }

    session.updatedAt = new Date().toISOString();
    applyRuntimeMessage(session, next);
    appendMainlineNodeTransition(session, previousQuestion, answer);
    if (workflow.mode === WORKFLOW_MODES.FULL_SKILL && session.currentMessage && session.currentMessage.type === 'summary') {
      recordApprovalCheckpoint(workflow, {
        kind: ACTION_KINDS.DESIGN_APPROVAL,
        decision: 'captured_in_question_flow',
        questionId: answer && answer.questionId ? answer.questionId : null
      });
      await runWorkflowSpecDraft(session, null);
    }
    persistSubmitSession(session, submitContext);
    return clone(session);
  }

  function queueSubmitProcessing(sessionId, expectedJobId) {
    return queueBackgroundJob(sessionId, 'submit', expectedJobId, async () => {
      const session = loadSession(sessionId);
      const processing = ensureSessionProcessing(session);
      const pendingInput = clonePendingInput(processing.pendingInput);
      if (!pendingInput || typeof pendingInput !== 'object') {
        const error = new Error('No pending submit input for this running session.');
        error.code = 'INVALID_PROCESSING_STATE';
        throw error;
      }
      await submitAnswerSync(sessionId, pendingInput, { expectedJobId });
      const updated = loadSessionIfJobCurrent(sessionId, 'submit', expectedJobId);
      if (!updated) {
        return;
      }
      clearSessionProcessing(updated, expectedJobId);
      persistSession(updated);
    });
  }

  async function submitAnswer(sessionId, answer) {
    if (!backgroundProcessing) {
      return submitAnswerSync(sessionId, answer);
    }

    const session = loadSession(sessionId);
    const processing = ensureSessionProcessing(session);
    if (processing.state === 'running') {
      const error = new Error('This session is already processing another turn.');
      error.code = 'SESSION_BUSY';
      throw error;
    }
    if (!session.currentMessage || session.currentMessage.type !== 'question') {
      return clone(session);
    }

    const nextProcessing = beginSessionProcessing(session, 'submit', answer || {});
    persistSession(session);
    queueSubmitProcessing(session.id, nextProcessing.jobId);
    return clone(session);
  }

  function runSessionLifecycleAction(sessionId, action) {
    const normalizedAction = typeof action === 'string' ? action.trim().toLowerCase() : '';
    const session = loadSession(sessionId);
    const processing = ensureSessionProcessing(session);

    if (normalizedAction === 'retry') {
      if (processing.state !== 'retryable' || !processing.action) {
        const error = new Error('Retry is only available for retryable background steps.');
        error.code = 'INVALID_LIFECYCLE_ACTION';
        throw error;
      }
      const pendingInput = clonePendingInput(processing.pendingInput);
      if (!pendingInput || typeof pendingInput !== 'object') {
        const error = new Error('This retryable session has no persisted input to replay.');
        error.code = 'INVALID_LIFECYCLE_ACTION';
        throw error;
      }
      const nextProcessing = beginSessionProcessing(session, processing.action, pendingInput);
      persistSession(session);
      if (nextProcessing.action === 'create') {
        queueCreateProcessing(session.id, nextProcessing.jobId);
      } else {
        queueSubmitProcessing(session.id, nextProcessing.jobId);
      }
      return clone(session);
    }

    if (normalizedAction === 'cancel') {
      if (processing.state !== 'running' && processing.state !== 'retryable') {
        const error = new Error('Cancel is only available while a background step is running or retryable.');
        error.code = 'INVALID_LIFECYCLE_ACTION';
        throw error;
      }
      markSessionProcessingCancelled(session, processing.jobId);
      persistSession(session);
      const runningJob = runningJobs.get(sessionId);
      if (runningJob && runningJob.jobId === processing.jobId) {
        if (runningJob.heartbeatTimer) {
          clearInterval(runningJob.heartbeatTimer);
        }
        runningJobs.delete(sessionId);
      }
      return clone(session);
    }

    const error = new Error(`Unknown lifecycle action: ${action}`);
    error.code = 'INVALID_LIFECYCLE_ACTION';
    throw error;
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
    deleteSession,
    getFinishedResult,
    getFinishedResultMarkdown,
    getSessionInspection,
    getSessionProvenance,
    submitAnswer,
    runSessionLifecycleAction,
    selectSessionBranchContext,
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
  DEFAULT_RUNTIME_CREATE_TIMEOUT_MS,
  DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS,
  WORKFLOW_MODES,
  createSessionManager
};
