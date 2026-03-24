const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MANAGER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/web-session-manager.cjs');

let createSessionManager;
try {
  ({ createSessionManager } = require(MANAGER_PATH));
} catch (error) {
  console.error(`Cannot load ${MANAGER_PATH}: ${error.message}`);
  process.exit(1);
}

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-web-session-'));
    try {
      fn(tmpDir);
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log('\n--- Web Session Manager ---');

  test('creates isolated sessions with distinct ids', (tmpDir) => {
    const manager = createSessionManager({ dataDir: tmpDir });
    const first = manager.createSession({ completionMode: 'summary' });
    const second = manager.createSession({ completionMode: 'summary' });

    assert.notStrictEqual(first.id, second.id);
    assert.strictEqual(first.currentMessage.questionId, 'root-goal');
    assert.strictEqual(second.currentMessage.questionId, 'root-goal');
  });

  test('persists session state across manager instances', (tmpDir) => {
    const manager = createSessionManager({ dataDir: tmpDir });
    const session = manager.createSession({ completionMode: 'summary' });

    manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['host-ux'],
      text: null,
      rawInput: '2'
    });

    const reloadedManager = createSessionManager({ dataDir: tmpDir });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.currentMessage.questionId, 'host-confirm');
    assert.strictEqual(reloaded.history.length, 1);
  });

  test('creates a real artifact for artifact-mode sessions', (tmpDir) => {
    const manager = createSessionManager({ dataDir: tmpDir });
    const session = manager.createSession({ completionMode: 'artifact' });

    manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['host-ux'],
      text: null,
      rawInput: '2'
    });

    const completed = manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'host-confirm',
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    });

    assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
    assert(completed.artifact, 'artifact metadata should be persisted');
    assert(fs.existsSync(completed.artifact.filePath), 'artifact file should exist');
    const artifactText = fs.readFileSync(completed.artifact.filePath, 'utf-8');
    assert(artifactText.includes('Structured Brainstorming Result'));
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();
