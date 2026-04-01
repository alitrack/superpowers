(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.structuredBrainstorming = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const QUESTION_TYPES = Object.freeze({
    PICK_ONE: 'pick_one',
    PICK_MANY: 'pick_many',
    CONFIRM: 'confirm',
    ASK_TEXT: 'ask_text'
  });

  const ANSWER_MODES = Object.freeze({
    OPTION: 'option',
    OPTIONS: 'options',
    CONFIRM: 'confirm',
    TEXT: 'text',
    MIXED: 'mixed'
  });

  const DEFAULT_CONFIRM_OPTIONS = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' }
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeWhitespace(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeWhitespace(value).toLowerCase();
  }

  function getOptions(question) {
    if (Array.isArray(question.options) && question.options.length > 0) {
      return question.options;
    }
    if (question.questionType === QUESTION_TYPES.CONFIRM) {
      return DEFAULT_CONFIRM_OPTIONS;
    }
    return [];
  }

  function findExactOption(question, token) {
    const normalized = normalizeKey(token);
    const options = getOptions(question);

    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      const numberKey = String(index + 1);
      const letterKey = String.fromCharCode(97 + index);
      if (
        normalized === normalizeKey(option.id) ||
        normalized === normalizeKey(option.label) ||
        normalized === numberKey ||
        normalized === letterKey
      ) {
        return option;
      }
    }

    if (question.questionType === QUESTION_TYPES.CONFIRM) {
      if (['yes', 'y', 'true', '1', '是', '对', '确认'].includes(normalized)) {
        return options[0];
      }
      if (['no', 'n', 'false', '0', '否', '不是', '不对'].includes(normalized)) {
        return options[1];
      }
    }

    return null;
  }

  function findFuzzyMatches(question, token) {
    const normalized = normalizeKey(token);
    if (!normalized) return [];

    return getOptions(question).filter((option) => {
      const label = normalizeKey(option.label);
      const id = normalizeKey(option.id);
      return label.includes(normalized) || id.includes(normalized);
    });
  }

  function resolveOptionIdsFromText(question, rawInput) {
    const trimmed = normalizeWhitespace(rawInput);
    if (!trimmed) {
      return { status: 'empty', optionIds: [], unmatchedTokens: [] };
    }

    const splitRegex = question.questionType === QUESTION_TYPES.PICK_MANY ? /[,\n，]+/ : /\n+/;
    const tokens = trimmed
      .split(splitRegex)
      .map((token) => normalizeWhitespace(token))
      .filter(Boolean);

    const candidateTokens = tokens.length > 0 ? tokens : [trimmed];
    const optionIds = [];
    const unmatchedTokens = [];

    for (const token of candidateTokens) {
      const exact = findExactOption(question, token);
      if (exact) {
        if (!optionIds.includes(exact.id)) optionIds.push(exact.id);
        continue;
      }

      const fuzzyMatches = findFuzzyMatches(question, token);
      if (fuzzyMatches.length === 1) {
        if (!optionIds.includes(fuzzyMatches[0].id)) optionIds.push(fuzzyMatches[0].id);
        continue;
      }

      if (fuzzyMatches.length > 1) {
        return {
          status: 'ambiguous',
          optionIds: [],
          candidates: fuzzyMatches.map((option) => option.id),
          rawInput: trimmed
        };
      }

      unmatchedTokens.push(token);
    }

    if (optionIds.length === 0) {
      return { status: 'unmatched', optionIds: [], unmatchedTokens, rawInput: trimmed };
    }

    if (unmatchedTokens.length > 0) {
      return { status: 'partial', optionIds, unmatchedTokens, rawInput: trimmed };
    }

    return { status: 'normalized', optionIds, unmatchedTokens: [], rawInput: trimmed };
  }

  function createAnswer(question, mode, optionIds, text, rawInput) {
    return {
      type: 'answer',
      questionId: question.questionId,
      answerMode: mode,
      optionIds,
      text,
      rawInput: rawInput == null ? '' : String(rawInput)
    };
  }

  function normalizeAnswer(question, submission) {
    const payload = typeof submission === 'string'
      ? { selectedOptionIds: [], text: submission, rawInput: submission }
      : {
          selectedOptionIds: Array.isArray(submission.selectedOptionIds) ? submission.selectedOptionIds : [],
          text: submission.text || '',
          rawInput: submission.rawInput != null ? submission.rawInput : (submission.text || '')
        };

    const selectedOptionIds = payload.selectedOptionIds.filter(Boolean);
    const text = normalizeWhitespace(payload.text);
    const rawInput = payload.rawInput;

    if (question.questionType === QUESTION_TYPES.ASK_TEXT) {
      if (!text) {
        return { status: 'invalid', reason: 'text required' };
      }
      return {
        status: 'normalized',
        answer: createAnswer(question, ANSWER_MODES.TEXT, [], text, rawInput)
      };
    }

    if (selectedOptionIds.length > 0 && text) {
      return {
        status: 'normalized',
        answer: createAnswer(question, ANSWER_MODES.MIXED, selectedOptionIds, text, rawInput)
      };
    }

    if (selectedOptionIds.length > 0) {
      const mode = question.questionType === QUESTION_TYPES.CONFIRM
        ? ANSWER_MODES.CONFIRM
        : (selectedOptionIds.length > 1 ? ANSWER_MODES.OPTIONS : ANSWER_MODES.OPTION);

      return {
        status: 'normalized',
        answer: createAnswer(question, mode, selectedOptionIds, null, rawInput)
      };
    }

    if (!text) {
      return { status: 'invalid', reason: 'selection or text required' };
    }

    const resolution = resolveOptionIdsFromText(question, text);
    if (resolution.status === 'ambiguous') {
      return resolution;
    }

    if (resolution.status === 'normalized') {
      const mode = question.questionType === QUESTION_TYPES.CONFIRM
        ? ANSWER_MODES.CONFIRM
        : (resolution.optionIds.length > 1 ? ANSWER_MODES.OPTIONS : ANSWER_MODES.OPTION);

      return {
        status: 'normalized',
        answer: createAnswer(question, mode, resolution.optionIds, null, rawInput)
      };
    }

    if (resolution.status === 'partial') {
      return {
        status: 'normalized',
        answer: createAnswer(question, ANSWER_MODES.MIXED, resolution.optionIds, text, rawInput)
      };
    }

    return {
      status: 'normalized',
      answer: createAnswer(question, ANSWER_MODES.TEXT, [], text, rawInput)
    };
  }

  function resolveAnswerLabel(question, answer) {
    const options = getOptions(question);
    if (answer.optionIds.length > 0) {
      const labels = answer.optionIds.map((optionId) => {
        const option = options.find((item) => item.id === optionId);
        return option ? option.label : optionId;
      });
      if (answer.text && answer.answerMode === ANSWER_MODES.MIXED) {
        return labels.join(', ') + ' + ' + answer.text;
      }
      return labels.join(', ');
    }
    return answer.text || answer.rawInput;
  }

  function createHistoryEntry(question, answer) {
    return {
      questionId: question.questionId,
      question: question.title,
      answer: resolveAnswerLabel(question, answer)
    };
  }

  function createQuestionMessage(flow, questionId, history) {
    const source = flow.questions[questionId];
    if (!source) {
      throw new Error('Unknown question: ' + questionId);
    }

    const message = JSON.parse(JSON.stringify(source));
    if (!message.type) {
      message.type = 'question';
    }
    if (!message.history) {
      message.history = history.slice();
    }
    return message;
  }

  function resolveNextQuestionId(question, answer) {
    if (question.nextByAnswer && answer.optionIds.length === 1) {
      const mapped = question.nextByAnswer[answer.optionIds[0]];
      if (mapped !== undefined) return mapped;
    }

    if ((answer.answerMode === ANSWER_MODES.TEXT || answer.answerMode === ANSWER_MODES.MIXED) && question.textNext !== undefined) {
      return question.textNext;
    }

    if (question.nextByAnswer && question.nextByAnswer.default !== undefined) {
      return question.nextByAnswer.default;
    }

    if (answer.optionIds.length === 1) {
      const option = getOptions(question).find((item) => item.id === answer.optionIds[0]);
      if (option && Object.prototype.hasOwnProperty.call(option, 'next')) {
        return option.next;
      }
    }

    if (Object.prototype.hasOwnProperty.call(question, 'next')) {
      return question.next;
    }

    return null;
  }

  function createSummaryMessage(state) {
    return {
      type: 'summary',
      text: state.history.map((entry) => `${entry.questionId}=${entry.answer}`).join('; '),
      path: state.history.map((entry) => entry.questionId),
      answers: state.history.map((entry) => ({
        questionId: entry.questionId,
        answer: entry.answer
      }))
    };
  }

  function createSession(flow) {
    return {
      flow,
      currentQuestionId: flow.initialQuestionId,
      history: []
    };
  }

  function applyAnswer(state, answer) {
    const question = createQuestionMessage(state.flow, state.currentQuestionId, state.history);
    const historyEntry = createHistoryEntry(question, answer);
    const nextHistory = state.history.concat(historyEntry);
    const nextQuestionId = resolveNextQuestionId(question, answer);
    const nextState = {
      flow: state.flow,
      currentQuestionId: nextQuestionId,
      history: nextHistory
    };

    if (nextQuestionId) {
      return {
        state: nextState,
        message: createQuestionMessage(state.flow, nextQuestionId, nextHistory)
      };
    }

    return {
      state: nextState,
      message: createSummaryMessage(nextState)
    };
  }

  function ensureHostStyles(document) {
    if (document.getElementById('structured-brainstorming-styles')) return;
    const style = document.createElement('style');
    style.id = 'structured-brainstorming-styles';
    style.textContent = [
      '.structured-host { max-width: 100%; position: relative; z-index: 1; }',
      '.structured-host .question-card, .structured-host .summary-card-shell { background: rgba(255,255,255,0.72); border: 1px solid rgba(112, 84, 63, 0.12); border-radius: 30px; padding: 1.25rem 1.25rem 1.35rem; box-shadow: 0 24px 50px rgba(70, 44, 28, 0.07); }',
      '.structured-host .question-card--compact { border-radius: 22px; padding: 0.7rem 0.75rem 0.78rem; box-shadow: none; background: rgba(255,255,255,0.68); }',
      '.structured-host .meta-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1rem; }',
      '.structured-host .meta-pill { padding: 0.4rem 0.7rem; border-radius: 999px; background: rgba(255,255,255,0.74); border: 1px solid rgba(112, 84, 63, 0.14); color: var(--muted, #7b675a); font-size: 0.75rem; }',
      '.structured-host .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent-deep, #66311d); margin-bottom: 0.7rem; }',
      '.structured-host h2 { font-family: var(--display-font, serif); font-size: clamp(2rem, 3.5vw, 3.5rem); line-height: 0.98; letter-spacing: -0.05em; margin: 0 0 0.75rem 0; max-width: 12ch; }',
      '.structured-host .subtitle { font-size: 1.02rem; line-height: 1.75; color: var(--muted, #7b675a); margin-bottom: 1.4rem; max-width: 54ch; }',
      '.structured-host .summary-text { font-size: 1rem; line-height: 1.8; color: var(--muted, #7b675a); margin-bottom: 1.4rem; white-space: pre-wrap; }',
      '.structured-host .stack { display: grid; gap: 0.9rem; }',
      '.structured-host .completion-note { margin-bottom: 1rem; background: linear-gradient(135deg, rgba(255,255,255,0.94), rgba(255, 241, 231, 0.98)); border: 1px solid rgba(182, 84, 45, 0.18); border-radius: 22px; padding: 1rem 1.05rem; }',
      '.structured-host .completion-note strong { display: block; margin-bottom: 0.3rem; color: var(--text, #241913); }',
      '.structured-host .completion-note span { display: block; color: var(--muted, #7b675a); line-height: 1.7; }',
      '.structured-host .next-steps { display: grid; gap: 0.7rem; margin-top: 1rem; }',
      '.structured-host .next-steps .step-item { background: rgba(255,255,255,0.72); border: 1px solid rgba(112, 84, 63, 0.12); border-radius: 18px; padding: 0.9rem 1rem; }',
      '.structured-host .next-steps .step-item strong { display: block; margin-bottom: 0.25rem; }',
      '.structured-host .next-steps .step-item span { display: block; color: var(--muted, #7b675a); line-height: 1.65; }',
      '.structured-host .question-form { display: grid; gap: 1rem; }',
      '.structured-host .options { display: grid; gap: 0.85rem; }',
      '.structured-host .option { background: rgba(255,255,255,0.8); border: 1px solid rgba(112, 84, 63, 0.14); border-radius: 22px; padding: 1rem 1.05rem; cursor: pointer; transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease; display: flex; align-items: flex-start; gap: 0.95rem; }',
      '.structured-host .option:hover { transform: translateY(-1px); border-color: rgba(182, 84, 45, 0.32); box-shadow: 0 16px 28px rgba(115, 66, 39, 0.08); }',
      '.structured-host .option.selected { background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255, 240, 229, 0.98)); border-color: rgba(182, 84, 45, 0.45); box-shadow: 0 16px 30px rgba(115, 66, 39, 0.11); }',
      '.structured-host .option .letter { width: 2rem; height: 2rem; border-radius: 999px; background: rgba(182, 84, 45, 0.1); color: var(--accent-deep, #66311d); display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; flex-shrink: 0; }',
      '.structured-host .option.selected .letter { background: var(--accent, #b6542d); color: white; }',
      '.structured-host .option .content h3 { font-size: 1rem; margin: 0 0 0.2rem 0; color: var(--text, #241913); }',
      '.structured-host .option .content p { color: var(--muted, #7b675a); line-height: 1.65; margin: 0; font-size: 0.92rem; }',
      '.structured-host textarea { width: 100%; min-height: 118px; resize: vertical; padding: 0.95rem 1rem; border: 1px solid rgba(112, 84, 63, 0.18); border-radius: 18px; background: rgba(255,255,255,0.78); color: var(--text, #241913); font: inherit; line-height: 1.65; }',
      '.structured-host textarea:focus { outline: none; border-color: rgba(182, 84, 45, 0.42); box-shadow: 0 0 0 4px rgba(182, 84, 45, 0.1); }',
      '.structured-host .helper-copy { font-size: 0.88rem; color: var(--muted, #7b675a); line-height: 1.65; }',
      '.structured-host .error-copy { color: #b42318; min-height: 1.2rem; font-size: 0.9rem; }',
      '.structured-host .actions-row { display: flex; gap: 0.75rem; flex-wrap: wrap; padding-top: 0.15rem; }',
      '.structured-host .mock-button { appearance: none; border: 1px solid rgba(182, 84, 45, 0.22); background: linear-gradient(135deg, #b6542d, #d37339); color: white; border-radius: 999px; padding: 0.8rem 1.25rem; font: inherit; font-weight: 600; letter-spacing: 0.01em; box-shadow: 0 18px 28px rgba(139, 76, 46, 0.18); cursor: pointer; }',
      '.structured-host .mock-button:hover { filter: saturate(1.03) brightness(1.02); }',
      '.structured-host .mock-button.secondary { background: rgba(255,255,255,0.9); color: var(--accent-deep, #66311d); box-shadow: none; }',
      '.structured-host .history-list { display: grid; gap: 0.75rem; margin-top: 1rem; }',
      '.structured-host .history-item { background: rgba(255,255,255,0.7); border: 1px solid rgba(112, 84, 63, 0.12); border-radius: 18px; padding: 0.95rem 1rem; }',
      '.structured-host .history-item strong { display: block; margin-bottom: 0.3rem; }',
      '.structured-host .history-item span { color: var(--muted, #7b675a); line-height: 1.65; display: block; }',
      '.structured-host .question-card--compact .question-form { gap: 0.72rem; }',
      '.structured-host .question-card--compact .options { gap: 0.55rem; }',
      '.structured-host .question-card--compact .option { padding: 0.68rem 0.78rem; border-radius: 18px; gap: 0.7rem; }',
      '.structured-host .question-card--compact .option .letter { width: 1.72rem; height: 1.72rem; font-size: 0.72rem; }',
      '.structured-host .question-card--compact .option .content h3 { font-size: 0.9rem; margin-bottom: 0.12rem; }',
      '.structured-host .question-card--compact .option .content p { font-size: 0.82rem; line-height: 1.45; }',
      '.structured-host .question-card--compact textarea { min-height: 86px; padding: 0.75rem 0.8rem; border-radius: 15px; }',
      '.structured-host .question-card--compact .actions-row { gap: 0.5rem; padding-top: 0; }',
      '.structured-host .question-card--compact .mock-button { padding: 0.58rem 0.95rem; font-size: 0.84rem; box-shadow: none; }',
      '.structured-host .question-card--compact .helper-copy, .structured-host .question-card--compact .error-copy { font-size: 0.8rem; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function toggleOptionSelection(optionEl) {
    const container = optionEl.closest('.options') || optionEl.closest('.cards');
    const multi = Boolean(container && container.hasAttribute('data-multiselect'));
    if (container && !multi) {
      container.querySelectorAll('.option.selected, .card.selected').forEach((el) => {
        if (el !== optionEl) el.classList.remove('selected');
      });
    }

    if (multi) {
      optionEl.classList.toggle('selected');
    } else {
      optionEl.classList.add('selected');
    }
  }

  function bindOptionInteractions(rootEl) {
    const optionEls = Array.from(rootEl.querySelectorAll('[data-option-id]'));
    optionEls.forEach((optionEl) => {
      optionEl.addEventListener('click', () => {
        toggleOptionSelection(optionEl);
      });
      optionEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleOptionSelection(optionEl);
        }
      });
    });
  }

  function buildQuestionMarkup(question, history, options) {
    const config = options || {};
    const questionOptions = getOptions(question);
    const multi = question.questionType === QUESTION_TYPES.PICK_MANY;
    const allowText = question.questionType === QUESTION_TYPES.ASK_TEXT || question.allowTextOverride;
    const showMeta = Boolean(config.showMeta);
    const readOnly = Boolean(config.readOnly);
    const compact = Boolean(config.compact);
    const meta = [
      `<div class="meta-pill">type: ${escapeHtml(question.questionType)}</div>`,
      `<div class="meta-pill">questionId: ${escapeHtml(question.questionId)}</div>`
    ];

    if (history.length > 0) {
      meta.push(`<div class="meta-pill">history: ${history.length}</div>`);
    }

    const optionMarkup = questionOptions.length === 0
      ? ''
      : `<div class="options stack"${multi ? ' data-multiselect' : ''}>` +
        questionOptions.map((option, index) => (
          `<div class="option" data-choice="${escapeHtml(option.id)}" data-option-id="${escapeHtml(option.id)}" role="button" tabindex="0">` +
            `<div class="letter">${String.fromCharCode(65 + index)}</div>` +
            `<div class="content">` +
              `<h3>${escapeHtml(option.label)}</h3>` +
              `<p>${escapeHtml(option.description || '')}</p>` +
            `</div>` +
          `</div>`
        )).join('') +
        `</div>`;

    const textMarkup = allowText
      ? `<div class="stack">` +
          `<label class="helper-copy" for="structured-answer-input">${escapeHtml(question.textOverrideLabel || 'Type an answer instead')}</label>` +
          `<textarea id="structured-answer-input" data-role="text-input" placeholder="Type your answer here"${readOnly ? ' readonly' : ''}></textarea>` +
        `</div>`
      : '';
    const branchingAction = question.branching
      && question.branching.branchable
      && multi
      ? `<button type="button" class="mock-button secondary" data-role="branch-materialize"${readOnly ? ' disabled' : ''}>${escapeHtml(question.branching.materializeActionLabel || 'Explore selected as branches')}</button>`
      : '';
    const headerMarkup = compact
      ? ''
      : (
          `<div class="label">Current Question</div>` +
          `<h2>${escapeHtml(question.title)}</h2>` +
          `<p class="subtitle">${escapeHtml(question.description || '')}</p>`
        );
    const helperMarkup = compact
      ? ''
      : `<div class="helper-copy">一次只回答一个正式问题。可以点选，也可以直接输入；如果你的答案超出选项，系统会保留你的原话。</div>`;

    return (
      `<div class="structured-host${readOnly ? ' structured-host--readonly' : ''}">` +
        `<div class="question-card${compact ? ' question-card--compact' : ''}">` +
          headerMarkup +
          (showMeta ? `<div class="meta-row">${meta.join('')}</div>` : '') +
          `<form class="question-form" data-role="question-form">` +
            optionMarkup +
            textMarkup +
            helperMarkup +
            `<div class="error-copy" data-role="error"></div>` +
            `<div class="actions-row">` +
              `<button type="submit" class="mock-button" data-role="submit"${readOnly ? ' disabled' : ''}>Continue</button>` +
              branchingAction +
            `</div>` +
          `</form>` +
        `</div>` +
      `</div>`
    );
  }

  function buildSummaryMarkup(summary, history) {
    const entries = Array.isArray(history) && history.length > 0
      ? history.map((entry, index) => ({
          label: `Q${index + 1}: ${entry.question}`,
          answer: entry.answer
        }))
      : (summary.answers || []).map((entry, index) => ({
          label: `Q${index + 1}: ${entry.question || entry.questionId}`,
          answer: entry.answer
        }));

    return (
      `<div class="structured-host">` +
        `<div class="summary-card-shell">` +
          `<div class="label">Draft Summary</div>` +
          `<h2>${escapeHtml(summary.title || 'What this round converged to')}</h2>` +
          `<div class="summary-text">${escapeHtml(summary.text)}</div>` +
          `<div class="history-list">` +
            entries.map((entry) => (
              `<div class="history-item"><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.answer)}</span></div>`
            )).join('') +
          `</div>` +
        `</div>` +
      `</div>`
    );
  }

  function buildArtifactReadyMarkup(message) {
    const generatedArtifacts = Array.isArray(message.generatedArtifacts) ? message.generatedArtifacts : [];
    const nextActions = Array.isArray(message.nextActions) && message.nextActions.length > 0
      ? message.nextActions
      : [
          'Review the finished package to confirm it matches what you wanted.',
          'If the result is off, start another round and refine the direction.',
          'If the result is right, use it as the handoff for the next implementation step.'
        ];

    return (
      `<div class="structured-host">` +
        `<div class="summary-card-shell">` +
          `<div class="label">Workflow Complete</div>` +
          `<h2>${escapeHtml(message.title)}</h2>` +
          `<p class="subtitle">${escapeHtml(message.text)}</p>` +
          `<div class="completion-note">` +
            `<strong>This brainstorming round is complete.</strong>` +
            `<span>You have reached the end of the current workflow. The finished package is shown directly in the result panel, so you do not need to open the file path manually.</span>` +
          `</div>` +
          (message.artifactPreviewText
            ? `<div class="summary-text">${escapeHtml(message.artifactPreviewText)}</div>`
            : '') +
          `<div class="history-list">` +
            `<div class="history-item"><strong>Format</strong><span>${escapeHtml(message.artifactType)}</span></div>` +
            `<div class="history-item"><strong>Result panel</strong><span>The full bundle, design spec, and implementation plan are shown in the page.</span></div>` +
            generatedArtifacts.map((artifact) => (
              `<div class="history-item"><strong>${escapeHtml(artifact.label || 'Generated artifact')}</strong><span>${escapeHtml(artifact.title || artifact.path || '')}</span></div>`
            )).join('') +
          `</div>` +
          `<div class="label" style="margin-top:1rem;">What you can do next</div>` +
          `<div class="next-steps">` +
            nextActions.map((item, index) => (
              `<div class="step-item"><strong>Next ${index + 1}</strong><span>${escapeHtml(item)}</span></div>`
            )).join('') +
          `</div>` +
        `</div>` +
      `</div>`
    );
  }

  function setIndicator(text) {
    const indicator = typeof document !== 'undefined' ? document.getElementById('indicator-text') : null;
    if (indicator) indicator.textContent = text;
  }

  function mountMessageHost(rootEl, config) {
    const onAnswer = typeof config.onAnswer === 'function' ? config.onAnswer : function() {};
    const showMeta = Boolean(config.showMeta);
    const readOnly = Boolean(config.readOnly);
    const compact = Boolean(config.compact);
    const document = rootEl.ownerDocument;
    ensureHostStyles(document);

    function renderMessage(message) {
      if (message.type === 'question') {
        const history = Array.isArray(message.history) ? message.history : [];
        rootEl.innerHTML = buildQuestionMarkup(message, history, { showMeta, readOnly, compact });
        setIndicator(message.title);
        if (!readOnly) {
          bindOptionInteractions(rootEl);
        }

        const form = rootEl.querySelector('[data-role="question-form"]');
        const errorEl = rootEl.querySelector('[data-role="error"]');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (readOnly) {
            return;
          }
          const selectedOptionIds = Array.from(rootEl.querySelectorAll('.option.selected')).map((el) => el.getAttribute('data-option-id'));
          const textInput = rootEl.querySelector('[data-role="text-input"]');
          const text = textInput ? textInput.value : '';
          const normalized = normalizeAnswer(message, {
            selectedOptionIds,
            text,
            rawInput: text
          });

          if (normalized.status === 'invalid') {
            if (errorEl) errorEl.textContent = 'Provide a selection or type an answer to continue.';
            return;
          }

          if (normalized.status === 'ambiguous') {
            if (errorEl) errorEl.textContent = 'That text matches multiple options. Select directly or clarify your wording.';
            return;
          }

          if (errorEl) errorEl.textContent = '';
          onAnswer(normalized.answer);
        });

        const branchMaterializeButton = rootEl.querySelector('[data-role="branch-materialize"]');
        if (branchMaterializeButton) {
          branchMaterializeButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (readOnly) {
              return;
            }
            const selectedOptionIds = Array.from(rootEl.querySelectorAll('.option.selected')).map((el) => el.getAttribute('data-option-id'));
            const textInput = rootEl.querySelector('[data-role="text-input"]');
            const text = textInput ? textInput.value : '';
            const minimum = message.branching && typeof message.branching.minOptionCount === 'number'
              ? message.branching.minOptionCount
              : 2;

            if (selectedOptionIds.length < minimum) {
              if (errorEl) errorEl.textContent = `Select at least ${minimum} options before exploring them as branches.`;
              return;
            }

            if (errorEl) errorEl.textContent = '';
            onAnswer({
              type: 'branch_materialize',
              questionId: message.questionId,
              optionIds: selectedOptionIds,
              text: text || null,
              rawInput: text || selectedOptionIds.join(', ')
            });
          });
        }
        return;
      }

      if (message.type === 'summary') {
        rootEl.innerHTML = buildSummaryMarkup(message, []);
        setIndicator('Summary ready');
        return;
      }

      if (message.type === 'artifact_ready') {
        rootEl.innerHTML = buildArtifactReadyMarkup(message);
        setIndicator('Artifact ready');
      }
    }

    return {
      renderMessage
    };
  }

  function mountDemoHost(rootEl, config) {
    const flow = config.flow;
    const onMessage = typeof config.onMessage === 'function' ? config.onMessage : function() {};
    const showMeta = Boolean(config.showMeta);
    let session = createSession(flow);
    const messageHost = mountMessageHost(rootEl, {
      showMeta,
      onAnswer(answer) {
        onMessage(answer);
        const next = applyAnswer(session, answer);
        session = next.state;
        if (next.message.type === 'summary' || next.message.type === 'artifact_ready') {
          onMessage(next.message);
        }
        messageHost.renderMessage(next.message);
      }
    });

    messageHost.renderMessage(createQuestionMessage(flow, flow.initialQuestionId, session.history));
    return {
      getSession: function() {
        return session;
      }
    };
  }

  return {
    QUESTION_TYPES,
    ANSWER_MODES,
    getOptions,
    normalizeAnswer,
    createSession,
    createQuestionMessage,
    applyAnswer,
    buildQuestionMarkup,
    buildSummaryMarkup,
    buildArtifactReadyMarkup,
    mountMessageHost,
    mountDemoHost
  };
});
