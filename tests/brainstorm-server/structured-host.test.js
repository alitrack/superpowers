const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HOST_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/structured-host.cjs');
const DEMO_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/structured-demo.html');
const host = require(HOST_PATH);

class FakeClassList {
  constructor(initial) {
    this.values = new Set(initial || []);
  }

  add(...tokens) {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
  }

  toggle(token) {
    if (this.values.has(token)) {
      this.values.delete(token);
      return false;
    }
    this.values.add(token);
    return true;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor(config) {
    const resolved = config || {};
    this.attributes = { ...(resolved.attributes || {}) };
    this.classList = new FakeClassList(resolved.classNames || []);
    this.listeners = {};
    this.value = resolved.value || '';
    this.parent = resolved.parent || null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }

  dispatch(type, overrides) {
    const event = {
      preventDefault() {},
      key: null,
      target: this,
      ...overrides
    };
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  closest(selector) {
    if ((selector === '.options' || selector === '.cards') && this.parent) {
      return this.parent;
    }
    return null;
  }
}

function createFakeDocument() {
  const styleNodes = new Map();
  return {
    head: {
      appendChild(node) {
        if (node && node.id) {
          styleNodes.set(node.id, node);
        }
      }
    },
    getElementById(id) {
      return styleNodes.get(id) || null;
    },
    createElement(tagName) {
      return {
        tagName,
        id: '',
        textContent: ''
      };
    }
  };
}

function createFakeRoot(optionIds) {
  const document = createFakeDocument();
  const optionsContainer = new FakeElement({
    attributes: { 'data-multiselect': '' }
  });
  const optionElements = optionIds.map((optionId) => new FakeElement({
    attributes: { 'data-option-id': optionId },
    classNames: ['option'],
    parent: optionsContainer
  }));
  optionsContainer.querySelectorAll = (selector) => (
    selector === '.option.selected, .card.selected'
      ? optionElements.filter((element) => element.classList.contains('selected'))
      : []
  );

  const form = new FakeElement();
  const textInput = new FakeElement({ value: '' });
  const errorEl = new FakeElement();
  errorEl.textContent = '';
  const branchButton = new FakeElement();

  return {
    ownerDocument: document,
    _html: '',
    optionsContainer,
    optionElements,
    form,
    textInput,
    errorEl,
    branchButton,
    set innerHTML(value) {
      this._html = value;
    },
    get innerHTML() {
      return this._html;
    },
    querySelector(selector) {
      if (selector === '[data-role="question-form"]') return form;
      if (selector === '[data-role="text-input"]') return textInput;
      if (selector === '[data-role="error"]') return errorEl;
      if (selector === '[data-role="branch-materialize"]') return branchButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-option-id]') return optionElements;
      if (selector === '.option.selected') {
        return optionElements.filter((element) => element.classList.contains('selected'));
      }
      return [];
    }
  };
}

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    }
  }

  const pickOneQuestion = {
    type: 'question',
    questionType: 'pick_one',
    questionId: 'root-goal',
    title: 'What do you want first?',
    description: 'Choose one direction.',
    allowTextOverride: true,
    metadata: { step: 1, path: ['root-goal'], expectsArtifact: 'summary' },
    options: [
      { id: 'requirements', label: 'Requirements', description: 'Clarify scope', next: 'requirements-details' },
      { id: 'solution', label: 'Solution', description: 'Compare approaches', next: 'solution-details' },
      { id: 'execution', label: 'Execution', description: 'Plan next steps', next: 'execution-details' }
    ]
  };

  const pickManyQuestion = {
    type: 'question',
    questionType: 'pick_many',
    questionId: 'constraints',
    title: 'Which constraints matter?',
    description: 'Select multiple options.',
    allowTextOverride: true,
    metadata: { step: 2, path: ['root-goal', 'constraints'], expectsArtifact: 'summary' },
    options: [
      { id: 'speed', label: 'Speed' },
      { id: 'consistency', label: 'Consistency' },
      { id: 'simplicity', label: 'Simplicity' }
    ]
  };

  const branchablePickManyQuestion = {
    ...pickManyQuestion,
    branching: {
      branchable: true,
      minOptionCount: 2,
      materializeActionLabel: 'Explore selected as branches'
    }
  };

  const confirmQuestion = {
    type: 'question',
    questionType: 'confirm',
    questionId: 'renderer-only',
    title: 'Should the host stay renderer-only?',
    description: 'Confirm the architectural choice.',
    allowTextOverride: true,
    metadata: { step: 2, path: ['root-goal', 'renderer-only'], expectsArtifact: 'summary' }
  };

  const askTextQuestion = {
    type: 'question',
    questionType: 'ask_text',
    questionId: 'backend-rule',
    title: 'What backend rule matters most?',
    description: 'Answer in your own words.',
    allowTextOverride: true,
    metadata: { step: 2, path: ['root-goal', 'backend-rule'], expectsArtifact: 'summary' }
  };

  console.log('\n--- Structured Host Rendering ---');

  test('renders pick_one questions with option markup and text override', () => {
    const html = host.buildQuestionMarkup(pickOneQuestion, []);
    assert(html.includes('What do you want first?'));
    assert(html.includes('data-choice="requirements"'));
    assert(html.includes('structured-answer-input'));
  });

  test('renders options without inline toggleSelect dependency', () => {
    const html = host.buildQuestionMarkup(pickOneQuestion, []);
    assert(!html.includes('onclick="toggleSelect(this)"'));
  });

  test('renders confirm questions with default yes/no options', () => {
    const html = host.buildQuestionMarkup(confirmQuestion, []);
    assert(html.includes('data-choice="yes"'));
    assert(html.includes('data-choice="no"'));
  });

  test('renders ask_text questions with textarea', () => {
    const html = host.buildQuestionMarkup(askTextQuestion, []);
    assert(html.includes('backend rule matters most'));
    assert(html.includes('textarea'));
  });

  test('renders compact embedded question markup without repeating the question chrome', () => {
    const html = host.buildQuestionMarkup(pickOneQuestion, [], { compact: true });
    assert(!html.includes('Current Question'));
    assert(!html.includes('<h2>What do you want first?</h2>'));
    assert(!html.includes('Choose one direction.'));
    assert(html.includes('data-choice="requirements"'));
  });

  test('renders branchable multi-select questions with an explicit branch materialization action', () => {
    const html = host.buildQuestionMarkup(branchablePickManyQuestion, []);
    assert(html.includes('Explore selected as branches'));
    assert(html.includes('data-role="branch-materialize"'));
  });

  test('renders summary cards with a dedicated title and preserved multi-section text', () => {
    const html = host.buildSummaryMarkup({
      type: 'summary',
      title: 'Recommendation: Guided question flow',
      text: 'Recommendation\n- Choose: Guided question flow\n\nWhy This Path Currently Wins\n- It keeps one clear decision at a time.',
      answers: []
    }, []);
    assert(html.includes('Recommendation: Guided question flow'));
    assert(html.includes('summary-text'));
    assert(html.includes('Why This Path Currently Wins'));
  });

  test('renders artifact-ready cards with preview text so the finished artifact is visible in the main stage', () => {
    const html = host.buildArtifactReadyMarkup({
      type: 'artifact_ready',
      artifactType: 'markdown',
      title: 'brainstorm-result.md',
      text: 'Structured brainstorming artifact is ready.',
      path: '/api/sessions/demo/artifacts/current',
      artifactPreviewText: 'Recommendation\n- Choose: Guided question flow\n\nNext Actions\n- Prototype one full session.',
      generatedArtifacts: [
        { label: 'Design spec', title: 'Guided question flow design', path: 'docs/specs/demo.md' },
        { label: 'Implementation plan', title: 'Guided question flow plan', path: 'docs/plans/demo.md' }
      ],
      nextActions: [
        'Review the generated package.',
        'Start a new round if the direction is off.'
      ]
    });
    assert(html.includes('summary-text'));
    assert(html.includes('Guided question flow'));
    assert(html.includes('Next Actions'));
    assert(html.includes('This brainstorming round is complete'));
    assert(html.includes('What you can do next') || html.includes('Next 1'));
    assert(html.includes('Guided question flow design'));
    assert(html.includes('do not need to open the file path manually'));
    assert(html.includes('Result panel'));
  });

  test('structured demo is a fragment so frame styles can wrap it', () => {
    const demo = fs.readFileSync(DEMO_PATH, 'utf-8').trimStart().toLowerCase();
    assert(!demo.startsWith('<!doctype'), 'Demo should not be a full HTML document');
    assert(!demo.startsWith('<html'), 'Demo should be a fragment, not a full page');
  });

  console.log('\n--- Structured Host Normalization ---');

  test('normalizes explicit pick_one selection', () => {
    const result = host.normalizeAnswer(pickOneQuestion, {
      selectedOptionIds: ['solution'],
      text: '',
      rawInput: ''
    });
    assert.strictEqual(result.status, 'normalized');
    assert.strictEqual(result.answer.answerMode, host.ANSWER_MODES.OPTION);
    assert.deepStrictEqual(result.answer.optionIds, ['solution']);
  });

  test('normalizes numeric shorthand to a pick_one option', () => {
    const result = host.normalizeAnswer(pickOneQuestion, '2');
    assert.strictEqual(result.status, 'normalized');
    assert.deepStrictEqual(result.answer.optionIds, ['solution']);
  });

  test('normalizes pick_many shorthand into multiple option ids', () => {
    const result = host.normalizeAnswer(pickManyQuestion, 'A,C');
    assert.strictEqual(result.status, 'normalized');
    assert.strictEqual(result.answer.answerMode, host.ANSWER_MODES.OPTIONS);
    assert.deepStrictEqual(result.answer.optionIds, ['speed', 'simplicity']);
  });

  test('normalizes confirm text to default confirm options', () => {
    const result = host.normalizeAnswer(confirmQuestion, 'yes');
    assert.strictEqual(result.status, 'normalized');
    assert.strictEqual(result.answer.answerMode, host.ANSWER_MODES.CONFIRM);
    assert.deepStrictEqual(result.answer.optionIds, ['yes']);
  });

  test('preserves unmatched text as a text answer', () => {
    const result = host.normalizeAnswer(pickOneQuestion, 'Need something custom');
    assert.strictEqual(result.status, 'normalized');
    assert.strictEqual(result.answer.answerMode, host.ANSWER_MODES.TEXT);
    assert.strictEqual(result.answer.text, 'Need something custom');
  });

  test('preserves selected option plus note as a mixed answer', () => {
    const result = host.normalizeAnswer(pickOneQuestion, {
      selectedOptionIds: ['requirements'],
      text: 'But keep the first pass small',
      rawInput: 'requirements + note'
    });
    assert.strictEqual(result.status, 'normalized');
    assert.strictEqual(result.answer.answerMode, host.ANSWER_MODES.MIXED);
    assert.deepStrictEqual(result.answer.optionIds, ['requirements']);
    assert.strictEqual(result.answer.text, 'But keep the first pass small');
  });

  test('reports ambiguous partial text matches', () => {
    const result = host.normalizeAnswer(pickManyQuestion, 's');
    assert.strictEqual(result.status, 'ambiguous');
    assert.deepStrictEqual(result.candidates, ['speed', 'consistency', 'simplicity']);
  });

  test('emits branch_materialize when the explicit branch action is clicked', () => {
    const answers = [];
    const rootEl = createFakeRoot(['speed', 'consistency', 'simplicity']);
    const messageHost = host.mountMessageHost(rootEl, {
      onAnswer(answer) {
        answers.push(answer);
      }
    });

    messageHost.renderMessage(branchablePickManyQuestion);
    rootEl.optionElements[0].dispatch('click');
    rootEl.optionElements[1].dispatch('click');
    rootEl.branchButton.dispatch('click');

    assert.strictEqual(answers.length, 1);
    assert.strictEqual(answers[0].type, 'branch_materialize');
    assert.deepStrictEqual(answers[0].optionIds, ['speed', 'consistency']);
    assert.strictEqual(answers[0].questionId, 'constraints');
  });

  console.log('\n--- Structured Host Flow ---');

  test('advances from one question to the next question through backend flow logic', () => {
    const flow = {
      initialQuestionId: 'root-goal',
      questions: {
        'root-goal': pickOneQuestion,
        'solution-details': askTextQuestion
      }
    };
    const session = host.createSession(flow);
    const answer = host.normalizeAnswer(pickOneQuestion, '2').answer;
    const next = host.applyAnswer(session, answer);
    assert.strictEqual(next.message.type, 'question');
    assert.strictEqual(next.message.questionId, 'backend-rule');
  });

  test('emits a summary when the branch ends', () => {
    const flow = {
      initialQuestionId: 'root-goal',
      questions: {
        'root-goal': {
          ...pickOneQuestion,
          options: pickOneQuestion.options.map((option) => ({ ...option, next: null }))
        }
      }
    };
    const session = host.createSession(flow);
    const answer = host.normalizeAnswer(pickOneQuestion, '1').answer;
    const result = host.applyAnswer(session, answer);
    assert.strictEqual(result.message.type, 'summary');
    assert.strictEqual(result.message.answers[0].questionId, 'root-goal');
    assert.strictEqual(result.message.answers[0].answer, 'Requirements');
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();
