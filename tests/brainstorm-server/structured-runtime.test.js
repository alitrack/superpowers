const assert = require('assert');
const path = require('path');

const RUNTIME_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/structured-runtime.cjs');
const runtimeModule = require(RUNTIME_PATH);

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

  console.log('\n--- Structured Runtime ---');

  test('starts with a backend-owned initial question', () => {
    const runtime = runtimeModule.createStructuredRuntime();
    const message = runtime.getCurrentMessage();
    assert.strictEqual(message.type, 'question');
    assert.strictEqual(message.questionId, 'root-goal');
  });

  test('advances to the next question when an answer is applied', () => {
    const runtime = runtimeModule.createStructuredRuntime();
    const next = runtime.applyAnswer({
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['requirements'],
      text: null,
      rawInput: '1'
    });
    assert.strictEqual(next.type, 'question');
    assert.strictEqual(next.questionId, 'requirements-constraints');
  });

  test('emits a summary when the selected branch ends', () => {
    const runtime = runtimeModule.createStructuredRuntime();
    runtime.applyAnswer({
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['host-ux'],
      text: null,
      rawInput: '2'
    });
    const next = runtime.applyAnswer({
      type: 'answer',
      questionId: 'host-confirm',
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    });
    assert.strictEqual(next.type, 'summary');
    assert.strictEqual(next.answers.length, 2);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();
