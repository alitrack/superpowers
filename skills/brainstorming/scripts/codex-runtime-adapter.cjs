const fs = require('fs');
const path = require('path');
const structuredHost = require('./structured-host.cjs');
const structuredRuntime = require('./structured-runtime.cjs');
const { createCodexAppServerClient } = require('./codex-app-server-client.cjs');
const { runCodexExec } = require('./codex-exec-runner.cjs');

const BACKEND_MODES = Object.freeze({
  FAKE: 'fake',
  APP_SERVER: 'app-server',
  EXEC: 'exec'
});

const DEFAULT_FLOW_ID = 'structured-demo';
const FLOW_REGISTRY = Object.freeze({
  [DEFAULT_FLOW_ID]: structuredRuntime.STRUCTURED_DEMO_FLOW
});
const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
const DEFAULT_STRATEGY_PHASE = 'scope';
const DEFAULT_NEXT_LEARNING_GOAL = 'understand-the-core-problem';
const BRAINSTORMING_SKILL_RELATIVE_PATH = 'skills/brainstorming/SKILL.md';
const USING_SUPERPOWERS_SKILL_RELATIVE_PATH = 'skills/using-superpowers/SKILL.md';
const BRAINSTORMING_SKILL_PATH = path.join(__dirname, '..', 'SKILL.md');
const REQUIRED_SKILL_FILES = Object.freeze([
  USING_SUPERPOWERS_SKILL_RELATIVE_PATH,
  BRAINSTORMING_SKILL_RELATIVE_PATH
]);
const COMPLETION_GATE_VERSION = 'finished-deliverable-v1';
const GENERATION_MODES = Object.freeze({
  REAL_SKILL_RUNTIME: 'real-skill-runtime',
  FALLBACK_EXCERPT: 'fallback-excerpt',
  FAKE_FLOW: 'fake-flow'
});
const PRODUCT_BASE_INSTRUCTIONS = [
  'You are the backend runtime for a browser-first brainstorming product.',
  'Ask exactly one concise formal question at a time.',
  'Prefer structured user input requests when available.',
  'When structured input requests are unavailable, emit exactly one JSON object using the shared message contract.',
  'Do not expose CLI, protocol, or debugging details to the user.',
  'At the start of the session, load the required repository skill files before replying.',
  'You may inspect repository files when needed to load the required repository skill files.',
  'Do not inspect unrelated repository files or call tools unless the user explicitly asks for implementation or file analysis.'
].join(' ');
const SEEDED_FAKE_REFRAME_OPTIONS = Object.freeze([
  { id: 'clarify-decision', label: 'Clarify the real decision', description: 'Figure out the exact choice or tension the session should resolve first.' },
  { id: 'fix-facilitation', label: 'Fix the facilitation gap', description: 'Focus on why the session feels procedural instead of generative.' },
  { id: 'improve-outcome', label: 'Improve decision quality', description: 'Focus on whether the session ends with better choices and clearer tradeoffs.' }
]);
const SEEDED_FAKE_DIRECTION_OPTIONS = Object.freeze([
  { id: 'facilitation-engine', label: 'Dynamic facilitation engine', description: 'Choose the next move based on session state instead of a fixed checklist.' },
  { id: 'interaction-redesign', label: 'Interaction model redesign', description: 'Make the experience feel like a collaborator rather than a form.' },
  { id: 'decision-workflow', label: 'Decision-quality workflow', description: 'Optimize the flow for better comparisons, tradeoffs, and commitments.' }
]);
const SEEDED_FAKE_CRITERIA_OPTIONS = Object.freeze([
  { id: 'clarity', label: 'Most user clarity', description: 'Choose the path that makes the session easiest to understand and follow.' },
  { id: 'speed', label: 'Fastest path to value', description: 'Choose the path that delivers a meaningful improvement soonest.' },
  { id: 'leverage', label: 'Highest strategic leverage', description: 'Choose the path that unlocks the biggest long-term behavior change.' }
]);
let brainstormingSkillPolicyCache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneOrNull(value) {
  return value == null ? null : clone(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkdownSection(markdown, heading) {
  const pattern = new RegExp(`^## ${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, 'm');
  const match = markdown.match(pattern);
  return match ? match[1].trim() : '';
}

function extractNamedBulletBlock(sectionText, label) {
  if (!sectionText) {
    return '';
  }
  const pattern = new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*[\\r\\n]+([\\s\\S]*?)(?=\\n\\n\\*\\*|\\n## |$)`);
  const match = sectionText.match(pattern);
  return match ? match[1].trim() : '';
}

function extractBulletLines(blockText) {
  if (!blockText) {
    return [];
  }
  return blockText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function loadBrainstormingSkillPolicy() {
  if (brainstormingSkillPolicyCache) {
    return brainstormingSkillPolicyCache;
  }

  let markdown = '';
  try {
    markdown = fs.readFileSync(BRAINSTORMING_SKILL_PATH, 'utf-8');
  } catch (_error) {
    brainstormingSkillPolicyCache = [
      `Source skill file: ${BRAINSTORMING_SKILL_RELATIVE_PATH}`,
      'Skill file could not be loaded; fallback to one-question-at-a-time brainstorming behavior.'
    ].join('\n');
    return brainstormingSkillPolicyCache;
  }

  const processSection = extractMarkdownSection(markdown, 'The Process');
  const principlesSection = extractMarkdownSection(markdown, 'Key Principles');
  const understandingLines = extractBulletLines(extractNamedBulletBlock(processSection, 'Understanding the idea'));
  const exploringLines = extractBulletLines(extractNamedBulletBlock(processSection, 'Exploring approaches'));
  const presentingLines = extractBulletLines(extractNamedBulletBlock(processSection, 'Presenting the design'));
  const principleLines = extractBulletLines(principlesSection);

  const lines = [
    `Source skill file: ${BRAINSTORMING_SKILL_RELATIVE_PATH}`,
    'Ground the conversation in the current brainstorming skill for the browser conversation stage.',
    'Use the user seed as the topic anchor before asking the next formal question.'
  ];

  if (understandingLines.length > 0) {
    lines.push('Skill guidance - understanding the idea:');
    lines.push(...understandingLines.map((line) => `- ${line}`));
  }
  if (exploringLines.length > 0) {
    lines.push('Skill guidance - exploring approaches:');
    lines.push(...exploringLines.map((line) => `- ${line}`));
  }
  if (presentingLines.length > 0) {
    lines.push('Skill guidance - presenting the design:');
    lines.push(...presentingLines.map((line) => `- ${line}`));
  }
  if (principleLines.length > 0) {
    lines.push('Skill guidance - key principles:');
    lines.push(...principleLines.map((line) => `- ${line}`));
  }

  lines.push('Browser-host adaptation: stay inside question/summary/artifact_ready; do not write files, commit code, or begin implementation tasks during the brainstorm.');
  brainstormingSkillPolicyCache = lines.join('\n');
  return brainstormingSkillPolicyCache;
}

function buildRequiredSkillLoadingInstructions() {
  return [
    'Before you produce any user-facing content, actually read these skill files from the repository using available tools:',
    ...REQUIRED_SKILL_FILES.map((filePath) => `- ${filePath}`),
    'Treat the live contents of those files as the ground truth for this conversation.',
    'If this app-server thread has already loaded them, continue following them instead of re-reading unrelated files.',
    'Do not tell the user that you are loading skills or reading files.',
    'After loading the skills, stay within the browser-host contract and emit only question, summary, or artifact_ready.'
  ].join('\n');
}

function normalizeProblemFrame(problemFrame) {
  if (!problemFrame) {
    return null;
  }
  if (typeof problemFrame === 'string') {
    const summary = problemFrame.trim();
    return summary ? { summary } : null;
  }
  if (typeof problemFrame !== 'object') {
    return null;
  }

  const cloned = clone(problemFrame);
  const summary = typeof cloned.summary === 'string' && cloned.summary.trim()
    ? cloned.summary.trim()
    : typeof cloned.label === 'string' && cloned.label.trim()
      ? cloned.label.trim()
      : typeof cloned.value === 'string' && cloned.value.trim()
        ? cloned.value.trim()
        : null;

  if (!summary) {
    return cloned;
  }

  return {
    ...cloned,
    summary
  };
}

function normalizeChoice(option, prefix, index) {
  if (option == null) {
    return null;
  }

  if (typeof option === 'string') {
    const label = option.trim();
    if (!label) {
      return null;
    }
    return {
      id: `${prefix}-${index + 1}`,
      label,
      description: ''
    };
  }

  if (typeof option !== 'object') {
    return null;
  }

  const fallbackId = `${prefix}-${index + 1}`;
  const label = option.label || option.title || option.value || option.id || option.summary;
  if (!label) {
    return null;
  }

  return {
    id: option.id || option.value || fallbackId,
    label,
    description: option.description || option.details || ''
  };
}

function normalizeChoiceList(options, prefix) {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .map((option, index) => normalizeChoice(option, prefix, index))
    .filter(Boolean);
}

function normalizeDecisionTrailEntry(entry, index) {
  if (!entry) {
    return null;
  }
  if (typeof entry === 'string') {
    const value = entry.trim();
    return value
      ? { kind: `note-${index + 1}`, value }
      : null;
  }
  if (typeof entry !== 'object') {
    return null;
  }

  const value = typeof entry.value === 'string'
    ? entry.value.trim()
    : typeof entry.label === 'string'
      ? entry.label.trim()
      : '';
  if (!value) {
    return null;
  }

  return {
    kind: typeof entry.kind === 'string' && entry.kind.trim()
      ? entry.kind.trim()
      : `note-${index + 1}`,
    value
  };
}

function normalizeStrategyState(strategyState) {
  const source = strategyState && typeof strategyState === 'object' ? strategyState : {};
  return {
    phase: typeof source.phase === 'string' && source.phase.trim()
      ? source.phase
      : DEFAULT_STRATEGY_PHASE,
    nextLearningGoal: typeof source.nextLearningGoal === 'string' && source.nextLearningGoal.trim()
      ? source.nextLearningGoal
      : DEFAULT_NEXT_LEARNING_GOAL,
    problemFrame: normalizeProblemFrame(source.problemFrame),
    candidateDirections: normalizeChoiceList(source.candidateDirections, 'direction'),
    shortlistedDirections: normalizeChoiceList(source.shortlistedDirections, 'shortlist'),
    selectionCriteria: normalizeChoiceList(source.selectionCriteria, 'criterion'),
    selectedCriterion: normalizeChoice(source.selectedCriterion, 'selected-criterion', 0),
    selectedPath: normalizeChoice(source.selectedPath, 'selected-path', 0),
    decisionTrail: Array.isArray(source.decisionTrail)
      ? source.decisionTrail.map((entry, index) => normalizeDecisionTrailEntry(entry, index)).filter(Boolean)
      : []
  };
}

function normalizeSeedPrompt(initialPrompt) {
  return typeof initialPrompt === 'string' && initialPrompt.trim()
    ? initialPrompt.trim()
    : null;
}

function initializeStrategyStateForSession(input) {
  const seedPrompt = normalizeSeedPrompt(input && input.initialPrompt);
  const hasExplicitStrategyState = Boolean(input && input.strategyState);
  const baseState = normalizeStrategyState(input && input.strategyState);

  if (!seedPrompt) {
    return baseState;
  }

  if (hasExplicitStrategyState) {
    return baseState;
  }

  return {
    ...baseState,
    phase: 'reframe',
    nextLearningGoal: 'select-the-best-problem-frame',
    problemFrame: {
      summary: seedPrompt
    },
    candidateDirections: [],
    shortlistedDirections: [],
    selectionCriteria: [],
    selectedCriterion: null,
    selectedPath: null,
    decisionTrail: appendDecisionTrail([], 'topic', seedPrompt)
  };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function getFlow(flowId) {
  const resolvedFlowId = flowId || DEFAULT_FLOW_ID;
  const flow = FLOW_REGISTRY[resolvedFlowId];
  if (!flow) {
    throw new Error(`Unknown fake runtime flow: ${resolvedFlowId}`);
  }
  return flow;
}

function extractStructuredPayload(text) {
  const rawText = String(text || '').trim();
  if (!rawText) {
    throw new Error('Codex response did not contain structured content');
  }

  const direct = tryParseJson(rawText);
  if (direct) {
    return direct;
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const fenced = tryParseJson(fencedMatch[1].trim());
    if (fenced) {
      return fenced;
    }
  }

  const objectMatch = rawText.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const objectPayload = tryParseJson(objectMatch[0]);
    if (objectPayload) {
      return objectPayload;
    }
  }

  throw new Error('Unable to parse structured JSON payload from Codex response');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function normalizeStructuredMessage(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
    throw new Error('Structured payload missing message type');
  }

  if (payload.type === 'question') {
    const normalizedOptions = Array.isArray(payload.options)
      ? payload.options.map((option, index) => {
          const source = option && typeof option === 'object' ? option : {};
          const fallbackId = `option-${index + 1}`;
          return {
            id: source.id || source.value || fallbackId,
            label: source.label || source.title || source.value || source.id || fallbackId,
            description: source.description || source.details || ''
          };
        })
      : [];
    return {
      type: 'question',
      questionType: payload.questionType
        || (normalizedOptions.length > 0
          ? structuredHost.QUESTION_TYPES.PICK_ONE
          : structuredHost.QUESTION_TYPES.ASK_TEXT),
      questionId: payload.questionId || payload.id || 'question',
      title: payload.title || payload.question || payload.prompt || payload.text || 'Untitled question',
      description: payload.description || '',
      options: normalizedOptions,
      allowTextOverride: payload.allowTextOverride !== false,
      textOverrideLabel: payload.textOverrideLabel || 'Type your answer',
      provenance: payload.provenance && typeof payload.provenance === 'object'
        ? clone(payload.provenance)
        : undefined,
      metadata: payload.metadata && typeof payload.metadata === 'object'
        ? clone(payload.metadata)
        : undefined
    };
  }

  if (payload.type === 'summary') {
    return {
      type: 'summary',
      title: payload.title || 'Brainstorming Summary',
      text: payload.text || '',
      path: Array.isArray(payload.path) ? payload.path : [],
      answers: Array.isArray(payload.answers) ? payload.answers : [],
      deliverable: payload.deliverable && typeof payload.deliverable === 'object'
        ? clone(payload.deliverable)
        : undefined,
      provenance: payload.provenance && typeof payload.provenance === 'object'
        ? clone(payload.provenance)
        : undefined,
      synthesis: payload.synthesis && typeof payload.synthesis === 'object'
        ? clone(payload.synthesis)
        : undefined
    };
  }

  if (payload.type === 'artifact_ready') {
    return {
      type: 'artifact_ready',
      artifactType: payload.artifactType || 'markdown',
      title: payload.title || 'Brainstorming artifact',
      path: payload.path || null,
      text: payload.text || '',
      artifactMarkdown: payload.artifactMarkdown || null,
      artifactPreviewText: payload.artifactPreviewText || null,
      deliverable: payload.deliverable && typeof payload.deliverable === 'object'
        ? clone(payload.deliverable)
        : undefined,
      provenance: payload.provenance && typeof payload.provenance === 'object'
        ? clone(payload.provenance)
        : undefined
    };
  }

  throw new Error(`Unsupported structured payload type: ${payload.type}`);
}

function resolveAnswerLabel(question, answer) {
  const options = structuredHost.getOptions(question);
  if (Array.isArray(answer.optionIds) && answer.optionIds.length > 0) {
    const labels = answer.optionIds.map((optionId) => {
      const option = options.find((item) => item.id === optionId);
      return option ? option.label : optionId;
    });
    if (answer.text && answer.answerMode === structuredHost.ANSWER_MODES.MIXED) {
      return labels.join(', ') + ' + ' + answer.text;
    }
    return labels.join(', ');
  }
  return answer.text || answer.rawInput || '';
}

function createHistoryEntry(question, answer) {
  return {
    questionId: question.questionId,
    question: question.title,
    answer: resolveAnswerLabel(question, answer)
  };
}

function cloneQuestion(message) {
  return {
    ...message,
    options: Array.isArray(message.options) ? clone(message.options) : []
  };
}

function formatChoice(choice) {
  if (!choice) {
    return '';
  }
  return choice.description
    ? `${choice.label} - ${choice.description}`
    : choice.label;
}

function formatChoiceLines(choices, emptyText) {
  return Array.isArray(choices) && choices.length > 0
    ? choices.map((choice) => `- ${formatChoice(choice)}`).join('\n')
    : `- ${emptyText}`;
}

function formatDecisionTrail(decisionTrail) {
  return Array.isArray(decisionTrail) && decisionTrail.length > 0
    ? decisionTrail.map((entry) => `- ${entry.kind}: ${entry.value}`).join('\n')
    : '- (none yet)';
}

function appendDecisionTrail(decisionTrail, kind, value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  const nextTrail = Array.isArray(decisionTrail) ? clone(decisionTrail) : [];
  if (!normalizedValue) {
    return nextTrail;
  }

  const last = nextTrail[nextTrail.length - 1];
  if (last && last.kind === kind && last.value === normalizedValue) {
    return nextTrail;
  }

  nextTrail.push({ kind, value: normalizedValue });
  return nextTrail;
}

function resolveSelectedOptions(question, answer) {
  const options = structuredHost.getOptions(question);
  if (!Array.isArray(answer.optionIds) || answer.optionIds.length === 0) {
    return [];
  }
  return answer.optionIds
    .map((optionId, index) => {
      const option = options.find((item) => item.id === optionId);
      return normalizeChoice(option || optionId, 'selected-option', index);
    })
    .filter(Boolean);
}

function resolveSingleChoice(choices, fallbackLabel, prefix) {
  if (Array.isArray(choices) && choices.length > 0) {
    return choices[0];
  }
  const normalizedFallback = typeof fallbackLabel === 'string' ? fallbackLabel.trim() : '';
  return normalizedFallback
    ? normalizeChoice(normalizedFallback, prefix, 0)
    : null;
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function collectChoiceLabels(choices) {
  return uniqueStrings((Array.isArray(choices) ? choices : []).map((choice) => {
    const normalized = normalizeChoice(choice, 'choice', 0);
    return normalized ? normalized.label : '';
  }));
}

function findLatestDecisionTrailValue(decisionTrail, kind) {
  const entries = Array.isArray(decisionTrail) ? decisionTrail : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && entry.kind === kind && typeof entry.value === 'string' && entry.value.trim()) {
      return entry.value.trim();
    }
  }
  return null;
}

function normalizeProviderTrace(providerSession) {
  const trace = {};
  if (providerSession && providerSession.threadId) {
    trace.threadId = providerSession.threadId;
  }
  if (providerSession && providerSession.turnId) {
    trace.turnId = providerSession.turnId;
  }
  if (providerSession && providerSession.pendingRequestId) {
    trace.pendingRequestId = providerSession.pendingRequestId;
  }
  if (providerSession && providerSession.transcript && Array.isArray(providerSession.transcript)) {
    trace.transcriptLength = providerSession.transcript.length;
  }
  return Object.keys(trace).length > 0 ? trace : undefined;
}

function inferGenerationMode(backendMode, override) {
  if (override) {
    return override;
  }
  if (backendMode === BACKEND_MODES.FAKE) {
    return GENERATION_MODES.FAKE_FLOW;
  }
  return GENERATION_MODES.REAL_SKILL_RUNTIME;
}

function createMessageProvenance(context) {
  const backendMode = context && context.backendMode ? context.backendMode : BACKEND_MODES.FAKE;
  const provenance = {
    backendMode,
    generationMode: inferGenerationMode(backendMode, context && context.generationMode),
    requiredSkills: clone(REQUIRED_SKILL_FILES),
    timestamp: new Date().toISOString()
  };
  const providerTrace = normalizeProviderTrace(context && context.providerSession);
  if (providerTrace) {
    provenance.providerTrace = providerTrace;
  }
  if (context && context.completionGateVersion) {
    provenance.completionGateVersion = context.completionGateVersion;
  }
  return provenance;
}

function attachMessageProvenance(message, context) {
  if (!message || typeof message !== 'object') {
    return message;
  }
  return {
    ...message,
    provenance: message.provenance && typeof message.provenance === 'object'
      ? clone(message.provenance)
      : createMessageProvenance(context)
  };
}

function decorateRuntimeMessage(strategyState, message, provenanceContext) {
  if (!message || typeof message !== 'object') {
    return message;
  }
  if (message.type === 'question') {
    return annotateQuestionMessage(strategyState, message, provenanceContext);
  }
  return attachMessageProvenance(message, provenanceContext);
}

function buildBrainstormSynthesis(strategyState, history) {
  const state = normalizeStrategyState(strategyState);
  const selectedPath = state.selectedPath
    || resolveSingleChoice(state.shortlistedDirections, findLatestDecisionTrailValue(state.decisionTrail, 'selected-path') || '', 'selected-path');
  const selectedCriterion = state.selectedCriterion
    || resolveSingleChoice(state.selectionCriteria, findLatestDecisionTrailValue(state.decisionTrail, 'criterion') || '', 'criterion');
  const problemFrame = state.problemFrame && state.problemFrame.summary
    ? state.problemFrame.summary
    : null;
  const exploredDirections = uniqueStrings([
    ...collectChoiceLabels(state.candidateDirections),
    ...collectChoiceLabels(state.shortlistedDirections),
    selectedPath ? selectedPath.label : ''
  ]);
  const shortlistedDirections = uniqueStrings([
    ...collectChoiceLabels(state.shortlistedDirections),
    selectedPath ? selectedPath.label : ''
  ]);
  const alternatives = selectedPath
    ? exploredDirections.filter((label) => label !== selectedPath.label)
    : exploredDirections;
  const reasoning = [];
  const nextValidation = [];

  if (selectedPath && selectedCriterion) {
    reasoning.push(`"${selectedPath.label}" is the current recommendation because the session chose "${selectedCriterion.label}" as the deciding criterion.`);
    nextValidation.push(`Pressure-test whether "${selectedPath.label}" really wins when measured by "${selectedCriterion.label}" in a concrete user flow.`);
  } else if (selectedPath) {
    reasoning.push(`"${selectedPath.label}" is the current recommendation because it best matches the problem framing captured so far.`);
    nextValidation.push(`Name one explicit decision criterion to validate why "${selectedPath.label}" should remain the winner.`);
  } else {
    reasoning.push('The session clarified the space, but it still needs one final convergence choice before implementation work should begin.');
    nextValidation.push('Run one more convergence pass to commit to a single path.');
  }

  if (problemFrame) {
    reasoning.push(`The session is anchored on this framing: ${problemFrame}`);
  }

  if (alternatives.length > 0) {
    reasoning.push(`Other viable directions remain visible instead of being silently discarded: ${alternatives.join('; ')}.`);
    nextValidation.push(`Keep ${alternatives.join('; ')} visible as fallback paths if validation changes the recommendation.`);
  }

  return {
    title: selectedPath
      ? `Recommendation: ${selectedPath.label}`
      : 'Brainstorming Summary',
    problemFrame,
    recommendation: selectedPath ? selectedPath.label : null,
    decisionCriterion: selectedCriterion ? selectedCriterion.label : null,
    exploredDirections,
    shortlistedDirections,
    alternatives,
    reasoning,
    decisionTrail: Array.isArray(state.decisionTrail) ? clone(state.decisionTrail) : [],
    nextValidation,
    answers: Array.isArray(history) ? history.map((entry) => ({
      questionId: entry.questionId,
      question: entry.question,
      answer: entry.answer
    })) : []
  };
}

function buildBulletSection(title, items, fallbackText) {
  const lines = Array.isArray(items) && items.length > 0
    ? items.map((item) => `- ${item}`)
    : [`- ${fallbackText}`];
  return [title, ...lines].join('\n');
}

function buildBrainstormSummaryText(synthesis) {
  return [
    buildBulletSection(
      'Recommendation',
      synthesis.recommendation ? [`Choose: ${synthesis.recommendation}`] : [],
      'No single path has been committed yet.'
    ),
    buildBulletSection(
      'Problem Framing',
      synthesis.problemFrame ? [synthesis.problemFrame] : [],
      'The problem framing is still being clarified.'
    ),
    buildBulletSection(
      'Why This Path Currently Wins',
      synthesis.reasoning,
      'The session has not yet produced a decisive recommendation.'
    )
  ].join('\n\n');
}

function createDeliverableSection(id, title, items) {
  return {
    id,
    title,
    items: uniqueStrings(items)
  };
}

function buildFinishedDeliverable(strategyState, history) {
  const synthesis = buildBrainstormSynthesis(strategyState, history);
  const exploredApproaches = synthesis.exploredDirections.length > 0
    ? synthesis.exploredDirections.map((direction) => {
        if (synthesis.recommendation && direction === synthesis.recommendation) {
          return `${direction} (current recommended path)`;
        }
        return direction;
      })
    : [];

  const designExecutionDraft = [];
  if (synthesis.recommendation) {
    designExecutionDraft.push(`Start with "${synthesis.recommendation}" as the primary path for the next design or implementation draft.`);
  }
  if (synthesis.decisionCriterion) {
    designExecutionDraft.push(`Use "${synthesis.decisionCriterion}" as the explicit decision rule when comparing subsequent scope choices.`);
  }
  if (synthesis.alternatives.length > 0) {
    designExecutionDraft.push(`Keep ${synthesis.alternatives.join('; ')} visible as fallback paths while validating the recommendation.`);
  }
  if (synthesis.problemFrame) {
    designExecutionDraft.push(`Anchor the next draft in the framing: ${synthesis.problemFrame}`);
  }

  const risksOrOpenQuestions = [];
  if (synthesis.alternatives.length > 0) {
    risksOrOpenQuestions.push(`The recommendation could change if ${synthesis.alternatives.join('; ')} outperform the current path during validation.`);
  }
  if (synthesis.decisionCriterion) {
    risksOrOpenQuestions.push(`Over-optimizing for "${synthesis.decisionCriterion}" could hide other important tradeoffs that still need checking.`);
  } else {
    risksOrOpenQuestions.push('The session still needs an explicit decision rule to avoid converging on the wrong path for the wrong reason.');
  }
  if (synthesis.problemFrame) {
    risksOrOpenQuestions.push(`Validate that the framing "${synthesis.problemFrame}" reflects the true decision rather than a proxy concern.`);
  }

  const nextActions = synthesis.nextValidation.length > 0
    ? synthesis.nextValidation.slice()
    : [];
  if (synthesis.recommendation) {
    nextActions.push(`Turn "${synthesis.recommendation}" into the next design draft or prototype slice.`);
  }
  if (synthesis.answers.length > 0) {
    nextActions.push('Use the captured answers and decision trail as the baseline for the next review or implementation planning step.');
  }

  const sections = [
    createDeliverableSection(
      'recommendation',
      'Recommendation',
      synthesis.recommendation ? [`Choose: ${synthesis.recommendation}`] : []
    ),
    createDeliverableSection(
      'problem-framing',
      'Problem Framing',
      synthesis.problemFrame ? [synthesis.problemFrame] : []
    ),
    createDeliverableSection(
      'explored-approaches',
      'Explored Approaches',
      exploredApproaches
    ),
    createDeliverableSection(
      'why-this-path-currently-wins',
      'Why This Path Currently Wins',
      synthesis.reasoning
    ),
    createDeliverableSection(
      'alternatives-still-worth-remembering',
      'Alternatives Still Worth Remembering',
      synthesis.alternatives.length > 0
        ? synthesis.alternatives
        : ['No explicit alternatives were kept visible at completion.']
    ),
    createDeliverableSection(
      'design-execution-draft',
      'Design / Execution Draft',
      designExecutionDraft
    ),
    createDeliverableSection(
      'risks-open-questions',
      'Risks / Open Questions',
      risksOrOpenQuestions
    ),
    createDeliverableSection(
      'next-actions',
      'Next Actions',
      nextActions
    )
  ];

  const missingSections = sections
    .filter((section) => section.items.length === 0)
    .map((section) => section.title);

  return {
    title: synthesis.title,
    completionGateVersion: COMPLETION_GATE_VERSION,
    isComplete: missingSections.length === 0,
    missingSections,
    sections,
    synthesis
  };
}

function buildFinishedDeliverableText(deliverable) {
  return deliverable.sections.map((section) => (
    buildBulletSection(
      section.title,
      section.items,
      `Missing section: ${section.title}`
    )
  )).join('\n\n');
}

function createCompletionGapQuestion(strategyState, deliverable, context) {
  const nextState = normalizeStrategyState(strategyState);
  const missingTitle = deliverable.missingSections[0] || 'Next Actions';
  const lowerMissing = missingTitle.toLowerCase();
  const nextLearningGoal = `complete-${lowerMissing.replace(/[^a-z0-9]+/g, '-')}`;
  nextState.phase = 'handoff';
  nextState.nextLearningGoal = nextLearningGoal;
  const question = {
    type: 'question',
    questionType: structuredHost.QUESTION_TYPES.ASK_TEXT,
    questionId: `complete-${nextLearningGoal}`,
    title: `We still need one more detail to finish this brainstorm: ${missingTitle}`,
    description: `Add the missing material for "${missingTitle}" so the session can produce a finished deliverable.`,
    options: [],
    allowTextOverride: true,
    textOverrideLabel: `Add missing ${missingTitle}`
  };
  return {
    strategyState: nextState,
    message: annotateQuestionMessage(nextState, question, context)
  };
}

function getBrainstormMove(strategyState) {
  const state = normalizeStrategyState(strategyState);

  if (state.phase === 'scope') {
    return {
      intent: 'clarify_problem',
      questionType: structuredHost.QUESTION_TYPES.ASK_TEXT,
      questionId: 'topic',
      guidance: [
        'Ask one ask_text question that surfaces the messy situation, decision, or idea that needs real thinking work.',
        'Do not ask for separate intake slots like goal, target user, or persona yet.'
      ].join(' ')
    };
  }

  if (state.phase === 'reframe') {
    return {
      intent: 'reframe_problem',
      questionType: structuredHost.QUESTION_TYPES.PICK_ONE,
      questionId: 'reframe',
      guidance: [
        'Offer 3-4 materially different problem framings.',
        'Each option should reframe what matters, not just paraphrase the topic.'
      ].join(' ')
    };
  }

  if (state.phase === 'diverge') {
    return {
      intent: 'generate_directions',
      questionType: structuredHost.QUESTION_TYPES.PICK_MANY,
      questionId: 'directions',
      guidance: [
        'generate 2-5 distinct directions that could plausibly solve the problem frame.',
        'Make the directions meaningfully different, not cosmetic variations.'
      ].join(' ')
    };
  }

  if (state.phase === 'converge' && state.nextLearningGoal === 'choose-the-most-important-decision-criterion') {
    return {
      intent: 'compare_directions',
      questionType: structuredHost.QUESTION_TYPES.PICK_ONE,
      questionId: 'criterion',
      guidance: [
        'Ask which single decision criterion should drive convergence.',
        'Offer 2-4 explicit criteria that would change the winning path.'
      ].join(' ')
    };
  }

  if (state.phase === 'converge') {
    return {
      intent: 'commit_path',
      questionType: structuredHost.QUESTION_TYPES.PICK_ONE,
      questionId: 'path',
      guidance: [
        'Ask the user to commit to one path using the shortlisted directions and selected criterion.',
        'Keep the options tied to the already-explored directions.'
      ].join(' ')
    };
  }

  return {
    intent: 'handoff_summary',
    questionType: null,
    questionId: 'handoff',
    guidance: 'Return a structured completion that preserves the selected path, explored alternatives, and rationale.'
  };
}

function annotateQuestionMessage(strategyState, message, provenanceContext) {
  if (!message || message.type !== 'question') {
    return message;
  }

  const move = getBrainstormMove(strategyState);
  const annotated = {
    ...message,
    metadata: {
      ...(message.metadata || {}),
      brainstormIntent: move.intent,
      facilitationPhase: normalizeStrategyState(strategyState).phase,
      learningGoal: normalizeStrategyState(strategyState).nextLearningGoal
    }
  };
  return attachMessageProvenance(annotated, provenanceContext);
}

function captureStrategyStateFromMessage(strategyState, message) {
  const nextState = normalizeStrategyState(strategyState);
  if (!message || message.type !== 'question') {
    return nextState;
  }

  const move = getBrainstormMove(nextState);
  const options = normalizeChoiceList(message.options, 'message-option');

  if (move.intent === 'generate_directions' && options.length > 0) {
    nextState.candidateDirections = options;
  } else if (move.intent === 'compare_directions' && options.length > 0) {
    nextState.selectionCriteria = options;
  } else if (move.intent === 'commit_path' && options.length > 0 && nextState.shortlistedDirections.length === 0) {
    nextState.shortlistedDirections = options;
  }

  return nextState;
}

function advanceStrategyStateFromAnswer(strategyState, question, answer) {
  const nextState = normalizeStrategyState(strategyState);
  const answerText = resolveAnswerLabel(question || { options: [] }, answer);
  const selectedOptions = resolveSelectedOptions(question, answer);
  const questionIntent = question && question.metadata && question.metadata.brainstormIntent
    ? question.metadata.brainstormIntent
    : getBrainstormMove(nextState).intent;

  if (questionIntent === 'clarify_problem') {
    nextState.problemFrame = answerText ? { summary: answerText } : nextState.problemFrame;
    nextState.phase = 'reframe';
    nextState.nextLearningGoal = 'select-the-best-problem-frame';
    nextState.decisionTrail = appendDecisionTrail(nextState.decisionTrail, 'topic', answerText);
    return nextState;
  }

  if (questionIntent === 'reframe_problem') {
    nextState.problemFrame = answerText ? { summary: answerText } : nextState.problemFrame;
    nextState.phase = 'diverge';
    nextState.nextLearningGoal = 'generate-distinct-directions';
    nextState.decisionTrail = appendDecisionTrail(nextState.decisionTrail, 'problem-frame', answerText);
    return nextState;
  }

  if (questionIntent === 'generate_directions') {
    if (nextState.candidateDirections.length === 0 && question && Array.isArray(question.options)) {
      nextState.candidateDirections = normalizeChoiceList(question.options, 'direction');
    }
    nextState.shortlistedDirections = selectedOptions.length > 0
      ? selectedOptions
      : normalizeChoiceList(answerText ? [answerText] : [], 'shortlist');
    nextState.phase = 'converge';
    nextState.nextLearningGoal = 'choose-the-most-important-decision-criterion';
    for (const direction of nextState.shortlistedDirections) {
      nextState.decisionTrail = appendDecisionTrail(nextState.decisionTrail, 'direction', direction.label);
    }
    return nextState;
  }

  if (questionIntent === 'compare_directions') {
    if (nextState.selectionCriteria.length === 0 && question && Array.isArray(question.options)) {
      nextState.selectionCriteria = normalizeChoiceList(question.options, 'criterion');
    }
    nextState.selectedCriterion = resolveSingleChoice(selectedOptions, answerText, 'criterion');
    nextState.phase = 'converge';
    nextState.nextLearningGoal = 'commit-to-a-path';
    nextState.decisionTrail = appendDecisionTrail(
      nextState.decisionTrail,
      'criterion',
      nextState.selectedCriterion ? nextState.selectedCriterion.label : answerText
    );
    return nextState;
  }

  if (questionIntent === 'commit_path') {
    if (nextState.shortlistedDirections.length === 0 && question && Array.isArray(question.options)) {
      nextState.shortlistedDirections = normalizeChoiceList(question.options, 'shortlist');
    }
    nextState.selectedPath = resolveSingleChoice(selectedOptions, answerText, 'selected-path');
    nextState.phase = 'handoff';
    nextState.nextLearningGoal = 'summarize-the-selected-path';
    nextState.decisionTrail = appendDecisionTrail(
      nextState.decisionTrail,
      'selected-path',
      nextState.selectedPath ? nextState.selectedPath.label : answerText
    );
    return nextState;
  }

  nextState.decisionTrail = appendDecisionTrail(nextState.decisionTrail, 'note', answerText);
  return nextState;
}

function createBrainstormSummary(strategyState, history, provenanceContext) {
  const synthesis = buildBrainstormSynthesis(strategyState, history);
  const deliverable = buildFinishedDeliverable(strategyState, history);
  const answerHistory = Array.isArray(history) ? history : [];

  return attachMessageProvenance({
    type: 'summary',
    title: synthesis.title,
    text: buildFinishedDeliverableText(deliverable),
    path: answerHistory.map((entry) => entry.questionId),
    answers: answerHistory.map((entry) => ({
      questionId: entry.questionId,
      question: entry.question,
      answer: entry.answer
    })),
    deliverable,
    synthesis
  }, {
    ...(provenanceContext || {}),
    completionGateVersion: deliverable.completionGateVersion
  });
}

function createBrainstormCompletionMessage(strategyState, history, provenanceContext) {
  const deliverable = buildFinishedDeliverable(strategyState, history);
  if (!deliverable.isComplete) {
    return createCompletionGapQuestion(strategyState, deliverable, provenanceContext);
  }
  return {
    strategyState: normalizeStrategyState(strategyState),
    message: createBrainstormSummary(strategyState, history, provenanceContext)
  };
}

function buildSeededFakeQuestion(strategyState, provenanceContext) {
  const state = normalizeStrategyState(strategyState);

  if (state.phase === 'reframe') {
    return annotateQuestionMessage(state, {
      type: 'question',
      questionType: structuredHost.QUESTION_TYPES.PICK_ONE,
      questionId: 'seed-reframe',
      title: 'Which framing matters most for this brainstorming session?',
      description: '',
      options: clone(SEEDED_FAKE_REFRAME_OPTIONS),
      allowTextOverride: true,
      textOverrideLabel: 'Type your own framing'
    }, provenanceContext);
  }

  if (state.phase === 'diverge') {
    return annotateQuestionMessage(state, {
      type: 'question',
      questionType: structuredHost.QUESTION_TYPES.PICK_MANY,
      questionId: 'seed-directions',
      title: 'Which directions are worth exploring as serious paths?',
      description: '',
      options: clone(SEEDED_FAKE_DIRECTION_OPTIONS),
      allowTextOverride: true,
      textOverrideLabel: 'Type another direction'
    }, provenanceContext);
  }

  if (state.phase === 'converge' && state.nextLearningGoal === 'choose-the-most-important-decision-criterion') {
    return annotateQuestionMessage(state, {
      type: 'question',
      questionType: structuredHost.QUESTION_TYPES.PICK_ONE,
      questionId: 'seed-criterion',
      title: 'Which criterion should decide the winner?',
      description: '',
      options: clone(SEEDED_FAKE_CRITERIA_OPTIONS),
      allowTextOverride: true,
      textOverrideLabel: 'Type your own criterion'
    }, provenanceContext);
  }

  if (state.phase === 'converge') {
    const pathOptions = state.shortlistedDirections.length > 0
      ? state.shortlistedDirections
      : state.candidateDirections.length > 0
        ? state.candidateDirections
        : clone(SEEDED_FAKE_DIRECTION_OPTIONS);
    return annotateQuestionMessage(state, {
      type: 'question',
      questionType: structuredHost.QUESTION_TYPES.PICK_ONE,
      questionId: 'seed-path',
      title: 'Which path should we commit to?',
      description: '',
      options: clone(pathOptions),
      allowTextOverride: true,
      textOverrideLabel: 'Type your own path'
    }, provenanceContext);
  }

  return createBrainstormCompletionMessage(state, [], provenanceContext).message;
}

function buildExecPrompt(snapshot, options) {
  const history = snapshot && Array.isArray(snapshot.history) ? snapshot.history : [];
  const transcript = snapshot && snapshot.providerSession && Array.isArray(snapshot.providerSession.transcript)
    ? snapshot.providerSession.transcript
    : [];
  const currentQuestion = snapshot && snapshot.currentMessage && snapshot.currentMessage.type === 'question'
    ? snapshot.currentMessage
    : null;

  return [
    buildBrainstormTurnPrompt(snapshot, options),
    '',
    currentQuestion
      ? `Current unanswered question: ${currentQuestion.questionId} | ${currentQuestion.title}`
      : 'There is no unanswered question yet.',
    '',
    'Previous transcript turns:',
    transcript.length > 0
      ? transcript.map((entry, index) => `Turn ${index + 1} prompt:\n${entry.prompt}\nTurn ${index + 1} response:\n${entry.agentText}`).join('\n\n')
      : '- (none yet)',
    '',
    history.length > 0
      ? 'Build on the existing decision trail instead of restarting intake.'
      : 'Start with the highest-leverage scoping question.'
  ].join('\n');
}

function buildAppServerInitialPrompt(options) {
  return buildBrainstormTurnPrompt({
    strategyState: options && options.strategyState,
    history: options && options.history ? options.history : [],
    currentMessage: null
  }, options);
}

function buildBrainstormTurnPrompt(snapshot, options) {
  const history = snapshot && Array.isArray(snapshot.history) ? snapshot.history : [];
  const strategyState = normalizeStrategyState(snapshot && snapshot.strategyState);
  const move = getBrainstormMove(strategyState);
  const skillPolicy = loadBrainstormingSkillPolicy();
  const requiredSkillLoadingInstructions = buildRequiredSkillLoadingInstructions();

  return [
    'You are facilitating a real brainstorming session for a browser-first product.',
    'Return exactly one JSON object and nothing else.',
    'Valid message types are: question, summary, artifact_ready.',
    'Valid questionType values are: pick_one, pick_many, confirm, ask_text.',
    'Ask exactly one formal question at a time.',
    'Do not fall back to generic intake fields when a sharper reframing, divergence, or convergence move is available.',
    '',
    'Required skill bootstrap:',
    requiredSkillLoadingInstructions,
    '',
    'Embedded fallback excerpt from the current brainstorming skill (use this only if the runtime cannot read the skill files above):',
    skillPolicy,
    '',
    options && options.completionMode === 'artifact'
      ? 'When the brainstorming result is ready for handoff, you may return artifact_ready with artifactMarkdown.'
      : 'When the brainstorming result is ready, return summary.',
    '',
    `Brainstorming phase: ${strategyState.phase}`,
    `Next learning goal: ${strategyState.nextLearningGoal}`,
    `Current facilitation intent: ${move.intent}`,
    move.questionType ? `Recommended questionType: ${move.questionType}` : 'Recommended questionType: none',
    '',
    strategyState.problemFrame && strategyState.problemFrame.summary
      ? `Current problem frame: ${strategyState.problemFrame.summary}`
      : 'Current problem frame: (not set yet)',
    'Candidate directions:',
    formatChoiceLines(strategyState.candidateDirections, 'none yet'),
    '',
    'Shortlisted directions:',
    formatChoiceLines(strategyState.shortlistedDirections, 'none yet'),
    '',
    'Selection criteria:',
    formatChoiceLines(strategyState.selectionCriteria, 'none yet'),
    '',
    strategyState.selectedCriterion
      ? `Selected criterion: ${formatChoice(strategyState.selectedCriterion)}`
      : 'Selected criterion: (none yet)',
    strategyState.selectedPath
      ? `Selected path: ${formatChoice(strategyState.selectedPath)}`
      : 'Selected path: (none yet)',
    '',
    'Decision trail:',
    formatDecisionTrail(strategyState.decisionTrail),
    '',
    'Conversation history:',
    history.length > 0
      ? history.map((entry) => `- ${entry.questionId}: ${entry.answer}`).join('\n')
      : '- (none yet)',
    '',
    'Phase-specific guidance:',
    move.guidance,
    '',
    strategyState.phase === 'handoff'
      ? 'Finish with a structured handoff that names the problem framing, explored directions, recommended path, why it won, and what to validate next.'
      : 'Produce the single next highest-information-gain move.'
  ].join('\n');
}

function buildAppServerDeveloperInstructions(options) {
  const skillPolicy = loadBrainstormingSkillPolicy();
  const requiredSkillLoadingInstructions = buildRequiredSkillLoadingInstructions();
  return [
    'Return the next user-facing message quickly and keep it product-friendly.',
    'Use one of these message types only: question, summary, artifact_ready.',
    'Supported questionType values are: pick_one, pick_many, confirm, ask_text.',
    'Drive the conversation with the actually loaded repository skills rather than generic intake fields.',
    requiredSkillLoadingInstructions,
    `Required skill files: ${REQUIRED_SKILL_FILES.join(', ')}.`,
    'Do not claim a skill is loaded unless you actually read the file in this runtime.',
    `Embedded fallback skill excerpt source: ${BRAINSTORMING_SKILL_RELATIVE_PATH}.`,
    skillPolicy,
    options && options.completionMode === 'artifact'
      ? 'When the conversation is ready for handoff, return artifact_ready with concise markdown-ready content that includes the recommendation, alternatives, and rationale.'
      : 'When enough information has been gathered, return summary instead of continuing to ask questions. That summary must synthesize the problem framing, explored options, recommendation, and rationale.',
    'Do not produce multiple unanswered questions in a single turn.'
  ].join(' ');
}

function defaultSummaryFromHistory(history) {
  return {
    type: 'summary',
    text: history.length > 0
      ? history.map((entry) => `${entry.question}: ${entry.answer}`).join('\n')
      : 'Brainstorming turn completed.',
    path: history.map((entry) => entry.questionId),
    answers: history.map((entry) => ({
      questionId: entry.questionId,
      answer: entry.answer
    }))
  };
}

function createFallbackRuntimeMessage(context) {
  const history = Array.isArray(context && context.history) ? context.history : [];
  const strategyState = normalizeStrategyState(context && context.strategyState);
  const provenanceContext = {
    backendMode: context && context.backendMode ? context.backendMode : BACKEND_MODES.APP_SERVER,
    generationMode: GENERATION_MODES.FALLBACK_EXCERPT,
    providerSession: context && context.providerSession ? context.providerSession : {
      threadId: context && context.threadId ? context.threadId : null
    }
  };

  if (strategyState.phase === 'scope') {
    return attachMessageProvenance({
      type: 'question',
      questionType: structuredHost.QUESTION_TYPES.ASK_TEXT,
      questionId: 'fallback-scope',
      title: 'What is the core problem this brainstorm needs to resolve?',
      description: 'The runtime fell back to a local safe question so the session can continue without exposing internal protocol details.',
      options: [],
      allowTextOverride: true,
      textOverrideLabel: 'Describe the core problem'
    }, provenanceContext);
  }

  if (strategyState.phase === 'handoff') {
    return createBrainstormCompletionMessage(strategyState, history, provenanceContext).message;
  }

  return buildSeededFakeQuestion(strategyState, provenanceContext);
}

function isConfirmLikeOptions(options) {
  if (!Array.isArray(options) || options.length !== 2) {
    return false;
  }
  const labels = options.map((option) => String(option.label || '').trim().toLowerCase());
  return labels.includes('yes') && labels.includes('no');
}

function mapRequestUserInputToQuestion(params) {
  const sourceQuestion = params && Array.isArray(params.questions) ? params.questions[0] : null;
  if (!sourceQuestion) {
    throw new Error('requestUserInput params missing questions[0]');
  }

  const sourceOptions = Array.isArray(sourceQuestion.options) ? sourceQuestion.options : [];
  let questionType = structuredHost.QUESTION_TYPES.ASK_TEXT;
  if (sourceQuestion.multiSelect === true || sourceQuestion.maxSelections > 1) {
    questionType = structuredHost.QUESTION_TYPES.PICK_MANY;
  } else if (sourceOptions.length > 0) {
    questionType = isConfirmLikeOptions(sourceOptions)
      ? structuredHost.QUESTION_TYPES.CONFIRM
      : structuredHost.QUESTION_TYPES.PICK_ONE;
  }

  return {
    type: 'question',
    questionType,
    questionId: sourceQuestion.id || 'question',
    title: sourceQuestion.question || sourceQuestion.header || 'Untitled question',
    description: sourceQuestion.header || '',
    options: sourceOptions.map((option, index) => ({
      id: `option-${index + 1}`,
      label: option.label,
      description: option.description || ''
    })),
    allowTextOverride: sourceQuestion.isOther === true,
    textOverrideLabel: 'Type your own answer',
    metadata: {
      sourceRequestMethod: 'item/tool/requestUserInput'
    }
  };
}

function mapToolCallToQuestion(params) {
  const args = params && params.arguments ? params.arguments : {};
  const options = Array.isArray(args.options) ? args.options : [];
  const tool = params && params.tool ? params.tool : '';
  return {
    type: 'question',
    questionType: tool === 'pick_many'
      ? structuredHost.QUESTION_TYPES.PICK_MANY
      : tool === 'confirm'
        ? structuredHost.QUESTION_TYPES.CONFIRM
        : tool === 'ask_text'
          ? structuredHost.QUESTION_TYPES.ASK_TEXT
          : (options.length > 0 ? structuredHost.QUESTION_TYPES.PICK_ONE : structuredHost.QUESTION_TYPES.ASK_TEXT),
    questionId: params && params.callId ? params.callId : 'tool-call',
    title: args.question || args.title || 'Untitled question',
    description: args.description || args.context || '',
    options: options.map((option, index) => ({
      id: `option-${index + 1}`,
      label: typeof option === 'string' ? option : option.label,
      description: typeof option === 'string' ? '' : (option.description || '')
    })),
    allowTextOverride: args.allowOther === true,
    textOverrideLabel: 'Type your own answer',
    metadata: {
      sourceRequestMethod: 'item/tool/call',
      toolName: tool
    }
  };
}

function buildUserInputResponse(questionMessage, answer) {
  if (questionMessage.metadata && questionMessage.metadata.sourceRequestMethod === 'item/tool/call') {
    const parts = [];
    if (Array.isArray(answer.optionIds) && answer.optionIds.length > 0) {
      const labels = answer.optionIds.map((optionId) => {
        const option = (questionMessage.options || []).find((item) => item.id === optionId);
        return option ? option.label : optionId;
      });
      parts.push(labels.join(', '));
    }
    if (answer.text) {
      parts.push(answer.text);
    }
    return {
      success: true,
      contentItems: [
        {
          type: 'inputText',
          text: parts.length > 0 ? parts.join('\n\n') : (answer.rawInput || '')
        }
      ]
    };
  }

  const answers = [];
  if (Array.isArray(answer.optionIds) && answer.optionIds.length > 0) {
    for (const optionId of answer.optionIds) {
      const option = (questionMessage.options || []).find((item) => item.id === optionId);
      answers.push(option ? option.label : optionId);
    }
  }
  if (answer.text) {
    answers.push(answer.text);
  }
  if (answers.length === 0 && answer.rawInput) {
    answers.push(answer.rawInput);
  }

  return {
    answers: {
      [questionMessage.questionId]: {
        answers
      }
    }
  };
}

function waitForAppServerMessage(client, context) {
  const threadId = context.threadId;
  const history = Array.isArray(context.history) ? context.history : [];
  let agentText = '';

  return withTimeout(new Promise((resolve) => {
    function cleanup() {
      client.off('server-request', onServerRequest);
      client.off('notification', onNotification);
    }

    function onServerRequest(event) {
      if (!event || !event.params || event.params.threadId !== threadId) {
        return;
      }

      if (event.method === 'item/tool/requestUserInput') {
        cleanup();
        resolve({
          currentMessage: mapRequestUserInputToQuestion(event.params),
          pendingRequestId: event.requestId,
          pendingRequestMethod: event.method,
          pendingRequestParams: event.params,
          turnId: event.params.turnId || null
        });
        return;
      }

      if (event.method === 'item/tool/call') {
        cleanup();
        resolve({
          currentMessage: mapToolCallToQuestion(event.params),
          pendingRequestId: event.requestId,
          pendingRequestMethod: event.method,
          pendingRequestParams: event.params,
          turnId: event.params.turnId || null
        });
      }
    }

    function onNotification(event) {
      if (!event || !event.params) {
        return;
      }

      if (event.params.threadId && event.params.threadId !== threadId) {
        return;
      }

      if (event.method === 'item/agentMessage/delta') {
        agentText += event.params.delta || event.params.text || '';
        return;
      }

      if (event.method === 'turn/completed') {
        cleanup();
        let currentMessage;
        if (agentText.trim()) {
          try {
            currentMessage = normalizeStructuredMessage(extractStructuredPayload(agentText));
          } catch (_error) {
            currentMessage = createFallbackRuntimeMessage(context);
          }
        } else {
          currentMessage = createFallbackRuntimeMessage({
            ...context,
            backendMode: BACKEND_MODES.APP_SERVER,
            providerSession: {
              ...(context && context.providerSession ? context.providerSession : {}),
              threadId,
              turnId: event.params.turn && event.params.turn.id ? event.params.turn.id : null
            }
          });
        }
        resolve({
          currentMessage,
          pendingRequestId: null,
          pendingRequestMethod: null,
          pendingRequestParams: null,
          turnId: event.params.turn && event.params.turn.id ? event.params.turn.id : null
        });
      }
    }

    client.on('server-request', onServerRequest);
    client.on('notification', onNotification);
  }), DEFAULT_PROVIDER_TIMEOUT_MS, 'waitForAppServerMessage');
}

function createFakeSessionState(flowId, sessionId, input) {
  const strategyState = initializeStrategyStateForSession(input || {});
  const seedPrompt = normalizeSeedPrompt(input && input.initialPrompt);
  if (seedPrompt) {
    const providerSession = {
      kind: BACKEND_MODES.FAKE,
      flowId: flowId || DEFAULT_FLOW_ID,
      seeded: true
    };
    const currentMessage = buildSeededFakeQuestion(strategyState, {
      backendMode: BACKEND_MODES.FAKE,
      generationMode: GENERATION_MODES.FAKE_FLOW,
      providerSession
    });
    return {
      sessionId: sessionId || null,
      backendMode: BACKEND_MODES.FAKE,
      providerSession,
      strategyState,
      currentQuestionId: currentMessage.type === 'question' ? currentMessage.questionId : null,
      history: [],
      currentMessage
    };
  }

  const flow = getFlow(flowId);
  return {
    sessionId: sessionId || null,
    backendMode: BACKEND_MODES.FAKE,
    providerSession: {
      kind: BACKEND_MODES.FAKE,
      flowId: flowId || DEFAULT_FLOW_ID
    },
    strategyState,
    currentQuestionId: flow.initialQuestionId,
    history: [],
    currentMessage: attachMessageProvenance(structuredHost.createQuestionMessage(flow, flow.initialQuestionId, []), {
      backendMode: BACKEND_MODES.FAKE,
      generationMode: GENERATION_MODES.FAKE_FLOW,
      providerSession: {
        kind: BACKEND_MODES.FAKE,
        flowId: flowId || DEFAULT_FLOW_ID
      }
    })
  };
}

function createFakeCodexRuntimeAdapter(options) {
  const defaultFlowId = options && options.flowId ? options.flowId : DEFAULT_FLOW_ID;

  return {
    createSession(input) {
      return clone(createFakeSessionState(defaultFlowId, input && input.sessionId, input));
    },

    resumeSession(snapshot) {
      if (!snapshot || snapshot.backendMode !== BACKEND_MODES.FAKE) {
        throw new Error('Cannot resume non-fake session snapshot');
      }
      return clone(snapshot);
    },

    submitAnswer(snapshot, answer) {
      if (!snapshot || snapshot.backendMode !== BACKEND_MODES.FAKE) {
        throw new Error('Cannot submit answer to non-fake session snapshot');
      }

      if (snapshot.providerSession && snapshot.providerSession.seeded) {
        if (!snapshot.currentMessage || snapshot.currentMessage.type !== 'question') {
          return clone(snapshot);
        }
        const nextHistory = (snapshot.history || []).concat(createHistoryEntry(snapshot.currentMessage, answer));
        const nextStrategyState = advanceStrategyStateFromAnswer(snapshot.strategyState, snapshot.currentMessage, answer);
        const completion = nextStrategyState.phase === 'handoff'
          ? createBrainstormCompletionMessage(nextStrategyState, nextHistory, {
              backendMode: BACKEND_MODES.FAKE,
              generationMode: GENERATION_MODES.FAKE_FLOW,
              providerSession: snapshot.providerSession
            })
          : {
              strategyState: nextStrategyState,
              message: buildSeededFakeQuestion(nextStrategyState, {
                backendMode: BACKEND_MODES.FAKE,
                generationMode: GENERATION_MODES.FAKE_FLOW,
                providerSession: snapshot.providerSession
              })
            };
        const nextMessage = completion.message;
        return clone({
          sessionId: snapshot.sessionId || null,
          backendMode: BACKEND_MODES.FAKE,
          providerSession: {
            ...snapshot.providerSession
          },
          strategyState: completion.strategyState,
          currentQuestionId: nextMessage.type === 'question' ? nextMessage.questionId : null,
          history: nextHistory,
          currentMessage: nextMessage
        });
      }

      const flowId = snapshot.providerSession && snapshot.providerSession.flowId
        ? snapshot.providerSession.flowId
        : defaultFlowId;
      const flow = getFlow(flowId);
      const runtimeState = {
        flow,
        currentQuestionId: snapshot.currentQuestionId,
        history: Array.isArray(snapshot.history) ? snapshot.history : []
      };
      const next = structuredHost.applyAnswer(runtimeState, answer);

      return clone({
        sessionId: snapshot.sessionId || null,
        backendMode: BACKEND_MODES.FAKE,
        providerSession: {
          kind: BACKEND_MODES.FAKE,
          flowId
        },
        strategyState: normalizeStrategyState(snapshot.strategyState),
        currentQuestionId: next.state.currentQuestionId,
        history: next.state.history,
        currentMessage: next.message
      });
    }
  };
}

function createExecCodexRuntimeProvider(options) {
  const runExec = options && options.runExec;
  if (typeof runExec !== 'function') {
    throw new Error('createExecCodexRuntimeProvider requires a runExec function');
  }

  return {
    async createSession(input) {
      const sessionId = input && input.sessionId ? input.sessionId : null;
      const completionMode = input && input.completionMode ? input.completionMode : 'artifact';
      const strategyState = initializeStrategyStateForSession(input || {});
      const prompt = buildExecPrompt({
        history: [],
        providerSession: { transcript: [] },
        currentMessage: null,
        strategyState
      }, { completionMode });
      const result = await runExec(prompt, input || {});
      const message = decorateRuntimeMessage(
        strategyState,
        normalizeStructuredMessage(extractStructuredPayload(result.agentText)),
        {
          backendMode: BACKEND_MODES.EXEC,
          generationMode: GENERATION_MODES.REAL_SKILL_RUNTIME,
          providerSession: {
            transcript: [{ prompt, agentText: result.agentText }],
            completionMode
          }
        }
      );
      const capturedStrategyState = captureStrategyStateFromMessage(strategyState, message);

      return {
        sessionId,
        backendMode: BACKEND_MODES.EXEC,
        providerSession: {
          transcript: [{ prompt, agentText: result.agentText }],
          completionMode
        },
        strategyState: capturedStrategyState,
        currentQuestionId: message.type === 'question' ? message.questionId : null,
        history: [],
        currentMessage: message
      };
    },

    async resumeSession(snapshot) {
      if (!snapshot || snapshot.backendMode !== BACKEND_MODES.EXEC) {
        throw new Error('Cannot resume non-exec session snapshot');
      }
      return clone({
        ...snapshot,
        strategyState: normalizeStrategyState(snapshot.strategyState)
      });
    },

    async submitAnswer(snapshot, answer) {
      if (!snapshot || snapshot.backendMode !== BACKEND_MODES.EXEC) {
        throw new Error('Cannot submit answer to non-exec session snapshot');
      }
      if (!snapshot.currentMessage || snapshot.currentMessage.type !== 'question') {
        return clone(snapshot);
      }

      const nextHistory = (snapshot.history || []).concat(createHistoryEntry(snapshot.currentMessage, answer));
      const providerSession = snapshot.providerSession || { transcript: [], completionMode: 'artifact' };
      const nextStrategyState = advanceStrategyStateFromAnswer(snapshot.strategyState, snapshot.currentMessage, answer);
      if (nextStrategyState.phase === 'handoff') {
        const completion = createBrainstormCompletionMessage(nextStrategyState, nextHistory, {
          backendMode: BACKEND_MODES.EXEC,
          generationMode: GENERATION_MODES.REAL_SKILL_RUNTIME,
          providerSession
        });
        return {
          sessionId: snapshot.sessionId || null,
          backendMode: BACKEND_MODES.EXEC,
          providerSession: {
            ...providerSession
          },
          strategyState: completion.strategyState,
          currentQuestionId: completion.message.type === 'question' ? completion.message.questionId : null,
          history: nextHistory,
          currentMessage: completion.message
        };
      }

      const prompt = buildExecPrompt({
        ...snapshot,
        history: nextHistory,
        strategyState: nextStrategyState
      }, { completionMode: providerSession.completionMode || 'artifact' });
      const result = await runExec(prompt, {
        ...snapshot,
        history: nextHistory,
        strategyState: nextStrategyState
      });
      const message = decorateRuntimeMessage(
        nextStrategyState,
        normalizeStructuredMessage(extractStructuredPayload(result.agentText)),
        {
          backendMode: BACKEND_MODES.EXEC,
          generationMode: GENERATION_MODES.REAL_SKILL_RUNTIME,
          providerSession: {
            ...providerSession,
            transcript: (providerSession.transcript || []).concat([{ prompt, agentText: result.agentText }])
          }
        }
      );
      const capturedStrategyState = captureStrategyStateFromMessage(nextStrategyState, message);

      return {
        sessionId: snapshot.sessionId || null,
        backendMode: BACKEND_MODES.EXEC,
        providerSession: {
          ...providerSession,
          transcript: (providerSession.transcript || []).concat([{ prompt, agentText: result.agentText }])
        },
        strategyState: capturedStrategyState,
        currentQuestionId: message.type === 'question' ? message.questionId : null,
        history: nextHistory,
        currentMessage: message
      };
    }
  };
}

function createAppServerCodexRuntimeProvider(options) {
  const clientFactory = options && options.clientFactory
    ? options.clientFactory
    : (() => createCodexAppServerClient(options && options.clientOptions ? options.clientOptions : {}));
  const clients = new Map();

  async function getClient(snapshot) {
    if (snapshot && snapshot.sessionId && clients.has(snapshot.sessionId)) {
      return clients.get(snapshot.sessionId);
    }

    const client = clientFactory(snapshot || {});
    if (snapshot && snapshot.sessionId) {
      clients.set(snapshot.sessionId, client);
    }
    if (snapshot && snapshot.providerSession && snapshot.providerSession.threadId) {
      await client.resumeThread({
        threadId: snapshot.providerSession.threadId,
        baseInstructions: PRODUCT_BASE_INSTRUCTIONS,
        developerInstructions: buildAppServerDeveloperInstructions({
          completionMode: snapshot.providerSession.completionMode || 'artifact'
        })
      });
    }
    return client;
  }

  return {
    async createSession(input) {
      const sessionId = input && input.sessionId ? input.sessionId : null;
      const completionMode = input && input.completionMode ? input.completionMode : 'artifact';
      const strategyState = initializeStrategyStateForSession(input || {});
      const client = clientFactory(input || {});
      if (sessionId) {
        clients.set(sessionId, client);
      }

      const thread = await client.startThread({
        cwd: input && input.cwd ? input.cwd : process.cwd(),
        baseInstructions: PRODUCT_BASE_INSTRUCTIONS,
        developerInstructions: buildAppServerDeveloperInstructions({ completionMode })
      });
      const nextPromise = waitForAppServerMessage(client, {
        threadId: thread.threadId,
        history: [],
        strategyState,
        backendMode: BACKEND_MODES.APP_SERVER,
        providerSession: {
          threadId: thread.threadId,
          completionMode
        }
      });
      const turn = await client.startTurn({
        threadId: thread.threadId,
        input: [
          {
            type: 'text',
            text: buildAppServerInitialPrompt({
              completionMode,
              strategyState,
              history: []
            })
          }
        ]
      });
      const next = await nextPromise;
      const message = decorateRuntimeMessage(strategyState, next.currentMessage, {
        backendMode: BACKEND_MODES.APP_SERVER,
        generationMode: GENERATION_MODES.REAL_SKILL_RUNTIME,
        providerSession: {
          threadId: thread.threadId,
          turnId: next.turnId || turn.turnId,
          pendingRequestId: next.pendingRequestId
        }
      });
      const capturedStrategyState = captureStrategyStateFromMessage(strategyState, message);

      return {
        sessionId,
        backendMode: BACKEND_MODES.APP_SERVER,
        providerSession: {
          threadId: thread.threadId,
          turnId: next.turnId || turn.turnId,
          pendingRequestId: next.pendingRequestId,
          pendingRequestMethod: next.pendingRequestMethod,
          pendingRequestParams: next.pendingRequestParams,
          completionMode
        },
        strategyState: capturedStrategyState,
        currentQuestionId: message.type === 'question' ? message.questionId : null,
        history: [],
        currentMessage: message
      };
    },

    async resumeSession(snapshot) {
      if (!snapshot || snapshot.backendMode !== BACKEND_MODES.APP_SERVER) {
        throw new Error('Cannot resume non-app-server session snapshot');
      }
      await getClient(snapshot);
      return clone({
        ...snapshot,
        strategyState: normalizeStrategyState(snapshot.strategyState)
      });
    },

    async submitAnswer(snapshot, answer) {
      if (!snapshot || snapshot.backendMode !== BACKEND_MODES.APP_SERVER) {
        throw new Error('Cannot submit answer to non-app-server session snapshot');
      }

      const client = await getClient(snapshot);
      const nextHistory = (snapshot.history || []).concat(createHistoryEntry(snapshot.currentMessage, answer));
      const providerSession = snapshot.providerSession || {};
      const nextStrategyState = advanceStrategyStateFromAnswer(snapshot.strategyState, snapshot.currentMessage, answer);
      if (nextStrategyState.phase === 'handoff') {
        const completion = createBrainstormCompletionMessage(nextStrategyState, nextHistory, {
          backendMode: BACKEND_MODES.APP_SERVER,
          generationMode: GENERATION_MODES.REAL_SKILL_RUNTIME,
          providerSession
        });
        return {
          sessionId: snapshot.sessionId || null,
          backendMode: BACKEND_MODES.APP_SERVER,
          providerSession: {
            ...providerSession,
            pendingRequestId: null,
            pendingRequestMethod: null,
            pendingRequestParams: null
          },
          strategyState: completion.strategyState,
          currentQuestionId: completion.message.type === 'question' ? completion.message.questionId : null,
          history: nextHistory,
          currentMessage: completion.message
        };
      }

      const nextPromise = waitForAppServerMessage(client, {
        threadId: providerSession.threadId,
        history: nextHistory,
        strategyState: nextStrategyState,
        backendMode: BACKEND_MODES.APP_SERVER,
        providerSession
      });

      if (providerSession.pendingRequestId) {
        await client.sendServerResponse({
          requestId: providerSession.pendingRequestId,
          result: buildUserInputResponse(snapshot.currentMessage, answer)
        });
      } else {
        const turn = await client.startTurn({
          threadId: providerSession.threadId,
          input: [
            {
              type: 'text',
              text: buildBrainstormTurnPrompt({
                history: nextHistory,
                strategyState: nextStrategyState,
                currentMessage: null
              }, {
                completionMode: providerSession.completionMode || 'artifact'
              })
            }
          ]
        });
        providerSession.turnId = turn.turnId;
      }

      const next = await nextPromise;
      const message = decorateRuntimeMessage(nextStrategyState, next.currentMessage, {
        backendMode: BACKEND_MODES.APP_SERVER,
        generationMode: GENERATION_MODES.REAL_SKILL_RUNTIME,
        providerSession: {
          ...providerSession,
          turnId: next.turnId || providerSession.turnId || null,
          pendingRequestId: next.pendingRequestId
        }
      });
      const capturedStrategyState = captureStrategyStateFromMessage(nextStrategyState, message);

      return {
        sessionId: snapshot.sessionId || null,
        backendMode: BACKEND_MODES.APP_SERVER,
        providerSession: {
          ...providerSession,
          turnId: next.turnId || providerSession.turnId || null,
          pendingRequestId: next.pendingRequestId,
          pendingRequestMethod: next.pendingRequestMethod,
          pendingRequestParams: next.pendingRequestParams
        },
        strategyState: capturedStrategyState,
        currentQuestionId: message.type === 'question' ? message.questionId : null,
        history: nextHistory,
        currentMessage: message
      };
    },

    async dispose() {
      const disposals = [];
      for (const client of clients.values()) {
        if (client && typeof client.dispose === 'function') {
          disposals.push(client.dispose());
        }
      }
      clients.clear();
      await Promise.all(disposals);
    }
  };
}

function normalizeSessionState(mode, session) {
  if (!session || typeof session !== 'object') {
    throw new Error(`Provider ${mode} returned an invalid session state`);
  }
  return {
    ...session,
    strategyState: normalizeStrategyState(session.strategyState),
    backendMode: mode
  };
}

function getProvider(providers, mode) {
  const provider = providers && providers[mode];
  if (!provider) {
    throw new Error(`No provider registered for backend mode: ${mode}`);
  }
  return provider;
}

function createCodexRuntimeAdapter(options) {
  if (options && options.fake) {
    return createFakeCodexRuntimeAdapter(options);
  }

  const providers = options && options.providers
    ? options.providers
    : {
        [BACKEND_MODES.APP_SERVER]: createAppServerCodexRuntimeProvider(options && options.appServer ? options.appServer : {}),
        [BACKEND_MODES.EXEC]: createExecCodexRuntimeProvider({
          runExec: options && options.runExec ? options.runExec : runCodexExec
        })
      };

  return {
    async createSession(input) {
      const errors = [];
      for (const mode of [BACKEND_MODES.APP_SERVER, BACKEND_MODES.EXEC]) {
        const provider = providers && providers[mode];
        if (!provider || typeof provider.createSession !== 'function') {
          continue;
        }

        try {
          return normalizeSessionState(mode, await provider.createSession(input || {}));
        } catch (error) {
          errors.push(`${mode}: ${error.message}`);
        }
      }

      throw new Error(errors.length > 0
        ? `Unable to create Codex runtime session (${errors.join('; ')})`
        : 'No Codex runtime providers are configured');
    },

    async resumeSession(snapshot) {
      if (!snapshot || !snapshot.backendMode) {
        throw new Error('Cannot resume runtime session without backendMode');
      }
      const provider = getProvider(providers, snapshot.backendMode);
      if (typeof provider.resumeSession === 'function') {
        return normalizeSessionState(snapshot.backendMode, await provider.resumeSession(snapshot));
      }
      return normalizeSessionState(snapshot.backendMode, snapshot);
    },

    async submitAnswer(snapshot, answer) {
      if (!snapshot || !snapshot.backendMode) {
        throw new Error('Cannot submit answer without backendMode');
      }
      const provider = getProvider(providers, snapshot.backendMode);
      if (typeof provider.submitAnswer !== 'function') {
        throw new Error(`Provider ${snapshot.backendMode} does not support submitAnswer`);
      }
      return normalizeSessionState(snapshot.backendMode, await provider.submitAnswer(snapshot, answer));
    },

    async dispose() {
      const disposals = [];
      for (const provider of Object.values(providers || {})) {
        if (provider && typeof provider.dispose === 'function') {
          disposals.push(provider.dispose());
        }
      }
      await Promise.all(disposals);
    }
  };
}

module.exports = {
  BACKEND_MODES,
  DEFAULT_FLOW_ID,
  advanceStrategyStateFromAnswer,
  buildAppServerDeveloperInstructions,
  buildBrainstormTurnPrompt,
  buildRequiredSkillLoadingInstructions,
  createAppServerCodexRuntimeProvider,
  createBrainstormSummary,
  createCodexRuntimeAdapter,
  createExecCodexRuntimeProvider,
  createFakeCodexRuntimeAdapter,
  loadBrainstormingSkillPolicy,
  normalizeStrategyState
};
