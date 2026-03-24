const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HOST_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/structured-host.cjs');
const DEMO_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/structured-demo.html');
const host = require(HOST_PATH);

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
