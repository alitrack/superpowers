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
      '.structured-host { max-width: 920px; margin: 0 auto; }',
      '.structured-host .question-card, .structured-host .summary-card-shell { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 18px; padding: 1.5rem; }',
      '.structured-host .meta-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1rem; }',
      '.structured-host .meta-pill { padding: 0.4rem 0.7rem; border-radius: 999px; background: var(--bg-primary); border: 1px solid var(--border); color: var(--text-secondary); font-size: 0.78rem; }',
      '.structured-host .stack { display: grid; gap: 0.85rem; }',
      '.structured-host .question-form { display: grid; gap: 1rem; }',
      '.structured-host textarea { width: 100%; min-height: 92px; resize: vertical; padding: 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-primary); color: var(--text-primary); font: inherit; }',
      '.structured-host .helper-copy { font-size: 0.85rem; color: var(--text-secondary); }',
      '.structured-host .error-copy { color: var(--error); min-height: 1.2rem; }',
      '.structured-host .actions-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }',
      '.structured-host .history-list { display: grid; gap: 0.7rem; margin-top: 1rem; }',
      '.structured-host .history-item { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 14px; padding: 0.9rem 1rem; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildQuestionMarkup(question, history) {
    const options = getOptions(question);
    const multi = question.questionType === QUESTION_TYPES.PICK_MANY;
    const allowText = question.questionType === QUESTION_TYPES.ASK_TEXT || question.allowTextOverride;
    const meta = [
      `<div class="meta-pill">type: ${escapeHtml(question.questionType)}</div>`,
      `<div class="meta-pill">questionId: ${escapeHtml(question.questionId)}</div>`
    ];

    if (history.length > 0) {
      meta.push(`<div class="meta-pill">history: ${history.length}</div>`);
    }

    const optionMarkup = options.length === 0
      ? ''
      : `<div class="options stack"${multi ? ' data-multiselect' : ''}>` +
        options.map((option, index) => (
          `<div class="option" data-choice="${escapeHtml(option.id)}" data-option-id="${escapeHtml(option.id)}" role="button" tabindex="0" onclick="toggleSelect(this)">` +
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
          `<textarea id="structured-answer-input" data-role="text-input" placeholder="Type your answer here"></textarea>` +
        `</div>`
      : '';

    return (
      `<div class="structured-host">` +
        `<div class="question-card">` +
          `<div class="label">Question</div>` +
          `<h2>${escapeHtml(question.title)}</h2>` +
          `<p class="subtitle">${escapeHtml(question.description || '')}</p>` +
          `<div class="meta-row">${meta.join('')}</div>` +
          `<form class="question-form" data-role="question-form">` +
            optionMarkup +
            textMarkup +
            `<div class="helper-copy">One active question at a time. You can select options, type text, or combine both when the question allows it.</div>` +
            `<div class="error-copy" data-role="error"></div>` +
            `<div class="actions-row"><button type="submit" class="mock-button" data-role="submit">Submit answer</button></div>` +
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
          `<div class="label">Summary</div>` +
          `<h2>Structured brainstorming summary</h2>` +
          `<p class="subtitle">${escapeHtml(summary.text)}</p>` +
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
    return (
      `<div class="structured-host">` +
        `<div class="summary-card-shell">` +
          `<div class="label">Artifact Ready</div>` +
          `<h2>${escapeHtml(message.title)}</h2>` +
          `<p class="subtitle">${escapeHtml(message.text)}</p>` +
          `<div class="history-list">` +
            `<div class="history-item"><strong>type</strong><span>${escapeHtml(message.artifactType)}</span></div>` +
            `<div class="history-item"><strong>path</strong><span>${escapeHtml(message.path)}</span></div>` +
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
    const document = rootEl.ownerDocument;
    ensureHostStyles(document);

    function renderMessage(message) {
      if (message.type === 'question') {
        const history = Array.isArray(message.history) ? message.history : [];
        rootEl.innerHTML = buildQuestionMarkup(message, history);
        setIndicator(message.title);

        const form = rootEl.querySelector('[data-role="question-form"]');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const selectedOptionIds = Array.from(rootEl.querySelectorAll('.option.selected')).map((el) => el.getAttribute('data-option-id'));
          const textInput = rootEl.querySelector('[data-role="text-input"]');
          const text = textInput ? textInput.value : '';
          const errorEl = rootEl.querySelector('[data-role="error"]');
          const normalized = normalizeAnswer(message, {
            selectedOptionIds,
            text,
            rawInput: text
          });

          if (normalized.status === 'invalid') {
            errorEl.textContent = 'Provide a selection or type an answer to continue.';
            return;
          }

          if (normalized.status === 'ambiguous') {
            errorEl.textContent = 'That text matches multiple options. Select directly or clarify your wording.';
            return;
          }

          errorEl.textContent = '';
          onAnswer(normalized.answer);
        });
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
    let session = createSession(flow);
    const messageHost = mountMessageHost(rootEl, {
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
