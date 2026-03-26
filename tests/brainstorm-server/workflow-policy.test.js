const assert = require('assert');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/workflow-policy.cjs');

let ACTION_KINDS;
let buildBoundaryConfirmationQuestion;
let evaluateWorkflowActionBoundary;
try {
  ({
    ACTION_KINDS,
    buildBoundaryConfirmationQuestion,
    evaluateWorkflowActionBoundary
  } = require(POLICY_PATH));
} catch (error) {
  console.error(`Cannot load ${POLICY_PATH}: ${error.message}`);
  process.exit(1);
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    }
  }

  console.log('\n--- Workflow Policy ---');

  await test('treats hidden internal workflow actions as automatic and non-interactive', async () => {
    const evaluation = evaluateWorkflowActionBoundary(ACTION_KINDS.WRITE_DESIGN_DOC);
    assert.strictEqual(evaluation.requiresConfirmation, false);
    assert.strictEqual(evaluation.visibility, 'hidden');
    assert.strictEqual(evaluation.reason, 'internal_automation');
  });

  await test('requires explicit confirmation for deliverable-shape changes', async () => {
    const evaluation = evaluateWorkflowActionBoundary(ACTION_KINDS.DELIVERABLE_CHANGE);
    assert.strictEqual(evaluation.requiresConfirmation, true);
    assert.strictEqual(evaluation.reason, 'meaningful_product_decision');

    const question = buildBoundaryConfirmationQuestion(evaluation);
    assert.strictEqual(question.questionType, 'confirm');
    assert.strictEqual(question.questionId, 'workflow-confirm-deliverable-change');
    assert(question.title.includes('result'));
    assert(!question.title.toLowerCase().includes('git'));
    assert(!question.description.toLowerCase().includes('subagent'));
  });

  await test('requires explicit confirmation for external side effects with non-technical wording', async () => {
    const evaluation = evaluateWorkflowActionBoundary(ACTION_KINDS.EXTERNAL_SIDE_EFFECT);
    assert.strictEqual(evaluation.requiresConfirmation, true);
    assert.strictEqual(evaluation.reason, 'external_side_effect');

    const question = buildBoundaryConfirmationQuestion(evaluation);
    assert.strictEqual(question.questionType, 'confirm');
    assert.strictEqual(question.questionId, 'workflow-confirm-external-action');
    assert(question.description.includes('external system'));
    assert(!question.description.toLowerCase().includes('branch'));
    assert(!question.description.toLowerCase().includes('commit'));
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
