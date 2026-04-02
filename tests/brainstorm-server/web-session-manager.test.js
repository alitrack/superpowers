const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MANAGER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/web-session-manager.cjs');

let createSessionManager;
let DEFAULT_RUNTIME_CREATE_TIMEOUT_MS;
let DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS;
try {
  ({
    createSessionManager,
    DEFAULT_RUNTIME_CREATE_TIMEOUT_MS,
    DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS
  } = require(MANAGER_PATH));
} catch (error) {
  console.error(`Cannot load ${MANAGER_PATH}: ${error.message}`);
  process.exit(1);
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForSession(manager, sessionId, predicate, timeoutMs = 2000, intervalMs = 20) {
    const deadline = Date.now() + timeoutMs;
    let lastSession = null;
    while (Date.now() < deadline) {
      lastSession = manager.getSession(sessionId);
      if (predicate(lastSession)) {
        return lastSession;
      }
      await sleep(intervalMs);
    }
    throw new Error(`Timed out waiting for session ${sessionId}: ${JSON.stringify(lastSession, null, 2)}`);
  }

  async function waitForCondition(predicate, timeoutMs = 2000, intervalMs = 20) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) {
        return;
      }
      await sleep(intervalMs);
    }
    throw new Error('Timed out waiting for condition');
  }

  async function test(name, fn) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-web-session-'));
    try {
      await fn(tmpDir);
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

  await test('uses production-safe default runtime timeouts for real Codex backends', async () => {
    assert.strictEqual(typeof DEFAULT_RUNTIME_CREATE_TIMEOUT_MS, 'number');
    assert.strictEqual(typeof DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS, 'number');
    assert(DEFAULT_RUNTIME_CREATE_TIMEOUT_MS >= 45000);
    assert(DEFAULT_RUNTIME_SUBMIT_TIMEOUT_MS >= 45000);
  });

  await test('creates isolated sessions with distinct ids', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const first = await manager.createSession({ completionMode: 'summary' });
    const second = await manager.createSession({ completionMode: 'summary' });

    assert.notStrictEqual(first.id, second.id);
    assert.strictEqual(first.backendMode, 'exec');
    assert.strictEqual(first.workflowMode, 'conversation');
    assert.strictEqual(second.workflowMode, 'conversation');
    assert.strictEqual(first.currentMessage.questionId, 'topic');
    assert.strictEqual(second.currentMessage.questionId, 'topic');
  });

  await test('persists backend session state across manager instances', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-1', pendingRequestId: 'request-1' },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          providerSession: { threadId: 'thread-1', pendingRequestId: null },
          currentMessage: {
            type: 'summary',
            text: `The user wants to brainstorm: ${answer.text}`,
            path: ['topic'],
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });

    await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.backendMode, 'app-server');
    assert.strictEqual(reloaded.providerSession.threadId, 'thread-1');
    assert.strictEqual(reloaded.currentMessage.type, 'summary');
    assert.strictEqual(reloaded.history.length, 1);
  });

  await test('backgroundProcessing creates a provisional session before the first runtime question is ready', async (tmpDir) => {
    let releaseCreate = null;
    const runtimeAdapter = {
      createSession(input) {
        return new Promise((resolve) => {
          releaseCreate = () => resolve({
            sessionId: input.sessionId,
            backendMode: 'exec',
            providerSession: { transcriptId: `transcript-${input.sessionId}` },
            currentQuestionId: 'topic',
            history: [],
            currentMessage: {
              type: 'question',
              questionType: 'ask_text',
              questionId: 'topic',
              title: 'What do you want to brainstorm about?',
              description: 'Start with the core topic.',
              options: [],
              allowTextOverride: true
            }
          });
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true
    });

    const session = await manager.createSession({
      completionMode: 'summary',
      initialPrompt: 'A background-first brainstorming session'
    });

    assert.strictEqual(session.processing.state, 'running');
    assert.strictEqual(session.processing.action, 'create');
    assert.strictEqual(session.currentMessage, null);

    await waitForCondition(() => typeof releaseCreate === 'function');
    releaseCreate();
    const ready = await waitForSession(manager, session.id, (current) => (
      current.processing.state === 'idle'
      && current.currentMessage
      && current.currentMessage.questionId === 'topic'
    ));
    assert.strictEqual(ready.currentMessage.questionId, 'topic');
  });

  await test('backgroundProcessing freezes the current question until the submit turn completes', async (tmpDir) => {
    let releaseSubmit = null;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      submitAnswer(snapshot, answer) {
        return new Promise((resolve) => {
          releaseSubmit = () => resolve({
            ...snapshot,
            history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            currentQuestionId: 'goal',
            currentMessage: {
              type: 'question',
              questionType: 'pick_one',
              questionId: 'goal',
              title: 'Primary outcome',
              description: '',
              options: [
                { id: 'clarity', label: 'Clarify the idea', description: '' },
                { id: 'plan', label: 'Turn it into a plan', description: '' }
              ],
              allowTextOverride: true
            }
          });
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true
    });

    const provisional = await manager.createSession({ completionMode: 'summary' });
    const ready = await waitForSession(manager, provisional.id, (current) => (
      current.currentMessage && current.currentMessage.questionId === 'topic'
    ));

    const ack = await manager.submitAnswer(ready.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    assert.strictEqual(ack.processing.state, 'running');
    assert.strictEqual(ack.processing.action, 'submit');
    assert.strictEqual(ack.currentMessage.questionId, 'topic');

    const during = manager.getSession(ready.id);
    assert.strictEqual(during.currentMessage.questionId, 'topic');
    assert.strictEqual(during.processing.state, 'running');

    await waitForCondition(() => typeof releaseSubmit === 'function');
    releaseSubmit();
    const completed = await waitForSession(manager, ready.id, (current) => (
      current.processing.state === 'idle'
      && current.currentMessage
      && current.currentMessage.questionId === 'goal'
    ));
    assert.strictEqual(completed.history.length, 1);
    assert.strictEqual(completed.currentMessage.questionId, 'goal');
  });

  await test('backgroundProcessing rejects duplicate submits while a session is already running another turn', async (tmpDir) => {
    let releaseSubmit = null;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      submitAnswer(snapshot, answer) {
        return new Promise((resolve) => {
          releaseSubmit = () => resolve({
            ...snapshot,
            history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            currentQuestionId: null,
            currentMessage: {
              type: 'summary',
              text: answer.text,
              answers: [{ questionId: 'topic', answer: answer.text }]
            }
          });
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true
    });

    const provisional = await manager.createSession({ completionMode: 'summary' });
    const ready = await waitForSession(manager, provisional.id, (current) => (
      current.currentMessage && current.currentMessage.questionId === 'topic'
    ));

    await manager.submitAnswer(ready.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'First turn',
      rawInput: 'First turn'
    });

    await assert.rejects(
      () => manager.submitAnswer(ready.id, {
        type: 'answer',
        questionId: 'topic',
        answerMode: 'text',
        optionIds: [],
        text: 'Duplicate turn',
        rawInput: 'Duplicate turn'
      }),
      /already processing another turn/
    );

    await waitForCondition(() => typeof releaseSubmit === 'function');
    releaseSubmit();
    await waitForSession(manager, ready.id, (current) => current.processing.state === 'idle');
  });

  await test('backgroundProcessing marks stale running submit jobs as retryable instead of silently re-enqueueing them', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-background-restart', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      submitAnswer() {
        return new Promise(() => {});
      }
    };

    const firstManager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true,
      processingLeaseTimeoutMs: 50
    });
    const provisional = await firstManager.createSession({ completionMode: 'summary' });
    const ready = await waitForSession(firstManager, provisional.id, (current) => (
      current.currentMessage && current.currentMessage.questionId === 'topic'
    ));

    await firstManager.submitAnswer(ready.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'Recover after restart',
      rawInput: 'Recover after restart'
    });

    const sessionPath = path.join(tmpDir, 'sessions', `${ready.id}.json`);
    const stored = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    stored.processing.heartbeatAt = '2000-01-01T00:00:00.000Z';
    stored.processing.startedAt = '2000-01-01T00:00:00.000Z';
    stored.processing.updatedAt = '2000-01-01T00:00:00.000Z';
    stored.processing.leaseOwnerId = 'dead-runner';
    fs.writeFileSync(sessionPath, JSON.stringify(stored, null, 2) + '\n');

    const reloadedManager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true,
      processingLeaseTimeoutMs: 50
    });

    const retryable = reloadedManager.getSession(ready.id);
    assert.strictEqual(retryable.processing.state, 'retryable');
    assert.strictEqual(retryable.currentMessage.questionId, 'topic');
  });

  await test('backgroundProcessing persists submit failures as retryable without discarding the current question', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer() {
        const error = new Error('runtime submitAnswer timed out after 12345ms');
        error.code = 'RUNTIME_TIMEOUT';
        throw error;
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true
    });

    const provisional = await manager.createSession({ completionMode: 'summary' });
    const ready = await waitForSession(manager, provisional.id, (current) => (
      current.currentMessage && current.currentMessage.questionId === 'topic'
    ));

    await manager.submitAnswer(ready.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    const failed = await waitForSession(manager, ready.id, (current) => (
      current.processing.state === 'retryable'
    ));
    assert.strictEqual(failed.currentMessage.questionId, 'topic');
    assert.strictEqual(failed.processing.error.code, 'RUNTIME_TIMEOUT');
    assert(/timed out/.test(failed.processing.error.message));
  });

  await test('retry requeues a retryable submit job from pending input and last stable snapshot', async (tmpDir) => {
    let submitCallCount = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        submitCallCount += 1;
        if (submitCallCount === 1) {
          const error = new Error('runtime submitAnswer timed out after 12345ms');
          error.code = 'RUNTIME_TIMEOUT';
          throw error;
        }
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Retried session',
            text: 'Recovered through retry.',
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true
    });

    const provisional = await manager.createSession({ completionMode: 'summary' });
    const ready = await waitForSession(manager, provisional.id, (current) => (
      current.currentMessage && current.currentMessage.questionId === 'topic'
    ));

    await manager.submitAnswer(ready.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'Retry this turn',
      rawInput: 'Retry this turn'
    });

    const retryable = await waitForSession(manager, ready.id, (current) => (
      current.processing.state === 'retryable'
    ));
    assert.strictEqual(retryable.currentMessage.questionId, 'topic');

    const retried = manager.runSessionLifecycleAction(ready.id, 'retry');
    assert.strictEqual(retried.processing.state, 'running');
    assert.strictEqual(retried.processing.action, 'submit');

    const completed = await waitForSession(manager, ready.id, (current) => (
      current.processing.state === 'idle'
      && current.currentMessage
      && current.currentMessage.type === 'summary'
    ));
    assert.strictEqual(completed.currentMessage.title, 'Retried session');
    assert.strictEqual(completed.history.length, 1);
  });

  await test('cancel supersedes a running submit job and ignores its late result', async (tmpDir) => {
    let releaseSubmit = null;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      submitAnswer(snapshot, answer) {
        return new Promise((resolve) => {
          releaseSubmit = () => resolve({
            ...snapshot,
            history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            currentQuestionId: null,
            currentMessage: {
              type: 'summary',
              title: 'Late summary',
              text: 'This should be ignored after cancel.',
              answers: [{ questionId: 'topic', answer: answer.text }]
            }
          });
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      backgroundProcessing: true
    });

    const provisional = await manager.createSession({ completionMode: 'summary' });
    const ready = await waitForSession(manager, provisional.id, (current) => (
      current.currentMessage && current.currentMessage.questionId === 'topic'
    ));

    await manager.submitAnswer(ready.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'Cancel this turn',
      rawInput: 'Cancel this turn'
    });

    const cancelled = manager.runSessionLifecycleAction(ready.id, 'cancel');
    assert.strictEqual(cancelled.processing.state, 'cancelled');
    assert.strictEqual(cancelled.currentMessage.questionId, 'topic');

    await waitForCondition(() => typeof releaseSubmit === 'function');
    releaseSubmit();
    await sleep(50);

    const current = manager.getSession(ready.id);
    assert.strictEqual(current.processing.state, 'cancelled');
    assert.strictEqual(current.currentMessage.questionId, 'topic');
  });

  await test('deletes a persisted session and removes it from the session list', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });
    assert.strictEqual(manager.listSessions().length, 1);

    const result = manager.deleteSession(session.id);
    assert.strictEqual(result.id, session.id);
    assert.strictEqual(result.deleted, true);
    assert.strictEqual(manager.listSessions().length, 0);
    assert.throws(() => manager.getSession(session.id), /Unknown session/);
  });

  await test('persists facilitation strategy state and passes it back into later turns', async (tmpDir) => {
    let sawPersistedStrategyStateOnSubmit = false;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-strategy-1', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem',
            problemFrame: null,
            candidateDirections: [],
            selectionCriteria: [],
            decisionTrail: []
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        sawPersistedStrategyStateOnSubmit = Boolean(
          snapshot.strategyState
          && snapshot.strategyState.phase === 'scope'
          && snapshot.strategyState.nextLearningGoal === 'understand-the-core-problem'
        );
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: 'goal',
          strategyState: {
            phase: 'reframe',
            nextLearningGoal: 'identify-the-highest-value-outcome',
            problemFrame: {
              summary: answer.text
            },
            candidateDirections: [],
            selectionCriteria: [],
            decisionTrail: [
              {
                kind: 'problem-frame',
                value: answer.text
              }
            ]
          },
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'goal',
            title: 'Primary outcome',
            description: '',
            options: [
              { id: 'clarity', label: 'Clarify the idea', description: '' },
              { id: 'plan', label: 'Turn it into a plan', description: '' }
            ],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });
    assert.strictEqual(session.strategyState.phase, 'scope');
    assert.strictEqual(session.strategyState.nextLearningGoal, 'understand-the-core-problem');

    const updated = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A tool that helps product teams shape rough ideas',
      rawInput: 'A tool that helps product teams shape rough ideas'
    });

    assert.strictEqual(sawPersistedStrategyStateOnSubmit, true);
    assert.strictEqual(updated.strategyState.phase, 'reframe');
    assert.strictEqual(updated.strategyState.problemFrame.summary, 'A tool that helps product teams shape rough ideas');

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.strategyState.phase, 'reframe');
    assert.strictEqual(reloaded.strategyState.nextLearningGoal, 'identify-the-highest-value-outcome');
    assert.strictEqual(reloaded.strategyState.decisionTrail.length, 1);
  });

  await test('persists the initial seed prompt and passes it into runtime session creation', async (tmpDir) => {
    let receivedInitialPrompt = null;
    const runtimeAdapter = {
      async createSession(input) {
        receivedInitialPrompt = input.initialPrompt;
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-seed-1', pendingRequestId: null },
          currentQuestionId: 'seed-reframe',
          strategyState: {
            phase: 'reframe',
            nextLearningGoal: 'select-the-best-problem-frame',
            problemFrame: {
              summary: input.initialPrompt
            },
            candidateDirections: [],
            shortlistedDirections: [],
            selectionCriteria: [],
            selectedCriterion: null,
            selectedPath: null,
            decisionTrail: [
              { kind: 'topic', value: input.initialPrompt }
            ]
          },
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'seed-reframe',
            title: 'Which framing matters most?',
            description: '',
            options: [
              { id: 'facilitation', label: 'Facilitation gap', description: '' },
              { id: 'ux', label: 'Interaction mismatch', description: '' }
            ],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'summary',
      initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
    });

    assert.strictEqual(receivedInitialPrompt, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(session.seedPrompt, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(session.currentMessage.questionId, 'seed-reframe');
    assert(session.nodeLog, 'expected immutable node log');
    assert.strictEqual(session.nodeLog.activeNodeId, 'question-seed-reframe');
    assert(session.nodeLog.nodes.some((node) => node.id === 'question-seed-reframe'));
    assert(session.nodeLog.nodes.some((node) => node.id === 'topic-root'));

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.seedPrompt, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(reloaded.strategyState.phase, 'reframe');
    assert.strictEqual(reloaded.nodeLog.activeNodeId, 'question-seed-reframe');
  });

  await test('materializes real branch sessions explicitly and routes answers through the selected branch context', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-branches-1', pendingRequestId: null },
          currentQuestionId: 'seed-directions',
          strategyState: {
            phase: 'diverge',
            nextLearningGoal: 'generate-distinct-directions',
            problemFrame: { summary: input.initialPrompt || 'Topic' },
            candidateDirections: [],
            shortlistedDirections: [],
            selectionCriteria: [],
            selectedCriterion: null,
            selectedPath: null,
            branchRuns: [],
            selectedBranchRunId: null,
            decisionTrail: [
              { kind: 'topic', value: input.initialPrompt || 'Topic' }
            ]
          },
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'pick_many',
            questionId: 'seed-directions',
            title: 'Which directions are worth exploring as serious paths?',
            description: '',
            options: [
              { id: 'facilitation-engine', label: 'Dynamic facilitation engine', description: '' },
              { id: 'interaction-redesign', label: 'Interaction model redesign', description: '' },
              { id: 'decision-workflow', label: 'Decision-quality workflow', description: '' }
            ],
            allowTextOverride: true,
            branching: {
              branchable: true,
              materializeActionLabel: 'Explore selected as branches',
              minOptionCount: 2
            }
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        if (String(snapshot.sessionId || '').startsWith('branch-run-')) {
          if (snapshot.currentMessage && snapshot.currentMessage.questionId === 'seed-directions') {
            const selectedId = Array.isArray(answer.optionIds) && answer.optionIds.length > 0
              ? answer.optionIds[0]
              : 'branch-option';
            const selectedLabel = selectedId === 'facilitation-engine'
              ? 'Dynamic facilitation engine'
              : 'Interaction model redesign';
            return {
              ...snapshot,
              backendMode: 'app-server',
              providerSession: {
                threadId: `thread-${snapshot.sessionId}`,
                pendingRequestId: null
              },
              history: (snapshot.history || []).concat([{
                questionId: 'seed-directions',
                question: 'Which directions are worth exploring as serious paths?',
                answer: selectedLabel
              }]),
              currentQuestionId: `${selectedId}-branch-criterion`,
              currentMessage: {
                type: 'question',
                questionType: 'pick_one',
                questionId: `${selectedId}-branch-criterion`,
                title: `Which proof point should validate "${selectedLabel}" first?`,
                description: 'Choose the first concrete proof point for this branch.',
                options: [
                  { id: 'clarity', label: 'User clarity', description: '' },
                  { id: 'speed', label: 'Execution speed', description: '' }
                ],
                allowTextOverride: true
              }
            };
          }

          return {
            ...snapshot,
            backendMode: 'app-server',
            providerSession: {
              threadId: `thread-${snapshot.sessionId}`,
              pendingRequestId: null
            },
            history: (snapshot.history || []).concat([{
              questionId: snapshot.currentMessage.questionId,
              question: snapshot.currentMessage.title,
              answer: Array.isArray(answer.optionIds) && answer.optionIds.length > 0
                ? answer.optionIds.join(', ')
                : answer.text
            }]),
            currentQuestionId: null,
            currentMessage: {
              type: 'summary',
              title: 'Branch summary',
              text: `Branch resolved with ${Array.isArray(answer.optionIds) ? answer.optionIds.join(', ') : answer.text}`
            }
          };
        }

        return {
          ...snapshot,
          history: [
            {
              questionId: 'seed-directions',
              question: 'Which directions are worth exploring as serious paths?',
              answer: answer.optionIds.join(', ')
            }
          ],
          currentQuestionId: 'seed-criterion',
          strategyState: {
            ...snapshot.strategyState,
            phase: 'converge',
            nextLearningGoal: 'choose-the-most-important-decision-criterion',
            shortlistedDirections: [
              { id: 'facilitation-engine', label: 'Dynamic facilitation engine', description: '' },
              { id: 'interaction-redesign', label: 'Interaction model redesign', description: '' }
            ]
          },
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'seed-criterion',
            title: 'Which criterion should decide the winner?',
            description: '',
            options: [
              { id: 'clarity', label: 'Most user clarity', description: '' },
              { id: 'speed', label: 'Fastest path to value', description: '' }
            ],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'artifact',
      initialPrompt: 'How should this product become a real brainstorming workspace?'
    });

    const materialized = await manager.submitAnswer(session.id, {
      type: 'branch_materialize',
      questionId: 'seed-directions',
      optionIds: ['facilitation-engine', 'interaction-redesign'],
      text: null,
      rawInput: '1,2'
    });

    assert.strictEqual(materialized.currentMessage.questionId, 'seed-criterion');
    assert.strictEqual(materialized.strategyState.branchRuns.length, 2);
    assert.strictEqual(materialized.strategyState.selectedBranchRunId, null);
    assert.strictEqual(materialized.strategyState.branchRuns[0].backendMode, 'app-server');
    assert.strictEqual(materialized.strategyState.branchRuns[0].currentMessage.questionType, 'pick_one');
    assert(materialized.strategyState.branchRuns[0].providerSession);
    assert(materialized.roundGraph, 'expected round graph to persist on session');
    assert(materialized.nodeLog, 'expected immutable node log');
    assert.strictEqual(materialized.roundGraph.activeRoundId, 'round-seed-criterion');
    assert(materialized.roundGraph.rounds.some((round) => round.id === 'round-seed-directions'));
    assert(materialized.roundGraph.rounds.some((round) => round.id === 'round-seed-criterion'));
    assert(materialized.roundGraph.rounds.some((round) => round.id === 'branch-run-question-seed-directions-facilitation-engine'));
    assert(materialized.nodeLog.nodes.some((node) => node.id === 'question-seed-directions'));
    assert(materialized.nodeLog.nodes.some((node) => node.id === 'question-seed-criterion'));
    assert(materialized.nodeLog.nodes.some((node) => node.questionId === 'facilitation-engine-branch-criterion'));
    assert(materialized.nodeLog.nodes.some((node) => node.questionId === 'interaction-redesign-branch-criterion'));
    const sourceQuestionNode = materialized.nodeLog.nodes.find((node) => node.id === 'question-seed-directions');
    assert.strictEqual(sourceQuestionNode.title, 'Which directions are worth exploring as serious paths?');

    const switched = manager.selectSessionBranchContext(session.id, 'branch-run-question-seed-directions-interaction-redesign');
    assert.strictEqual(switched.strategyState.selectedBranchRunId, 'branch-run-question-seed-directions-interaction-redesign');
    assert.strictEqual(switched.roundGraph.activeRoundId, 'branch-run-question-seed-directions-interaction-redesign');
    assert.strictEqual(switched.nodeLog.activeNodeId, 'question-interaction-redesign-branch-criterion');

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.strategyState.selectedBranchRunId, 'branch-run-question-seed-directions-interaction-redesign');
    assert.strictEqual(reloaded.roundGraph.activeRoundId, 'branch-run-question-seed-directions-interaction-redesign');
    assert.strictEqual(reloaded.nodeLog.activeNodeId, 'question-interaction-redesign-branch-criterion');

    const branched = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'interaction-redesign-branch-criterion',
      answerMode: 'option',
      optionIds: ['clarity'],
      text: null,
      rawInput: 'clarity'
    });

    const completedBranch = branched.strategyState.branchRuns.find((branchRun) => branchRun.id === 'branch-run-question-seed-directions-interaction-redesign');
    const untouchedBranch = branched.strategyState.branchRuns.find((branchRun) => branchRun.id === 'branch-run-question-seed-directions-facilitation-engine');
    assert(completedBranch, 'expected completed branch run');
    assert.strictEqual(completedBranch.status, 'complete');
    assert.strictEqual(completedBranch.history.length, 2);
    assert(completedBranch.resultSummary.text.includes('clarity'));
    assert(untouchedBranch, 'expected sibling branch run');
    assert.notStrictEqual(untouchedBranch.status, 'complete');
    assert.strictEqual(branched.currentMessage.questionId, 'seed-criterion');

    const returned = manager.selectSessionBranchContext(session.id, null);
    assert.strictEqual(returned.strategyState.selectedBranchRunId, null);
    assert.strictEqual(returned.roundGraph.activeRoundId, 'round-seed-criterion');
    assert.strictEqual(returned.nodeLog.activeNodeId, 'question-seed-criterion');
  });

  await test('starts a real branch from a frozen historical question node without mutating the original node', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          strategyState: {
            phase: 'reframe',
            nextLearningGoal: 'select-the-best-problem-frame'
          },
          currentQuestionId: 'question',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'question',
            title: '第一题',
            description: '',
            options: [
              { id: 'A', label: 'A 方向', description: '' },
              { id: 'B', label: 'B 方向', description: '' }
            ],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        if (String(snapshot.sessionId || '').startsWith('branch-run-')) {
          return {
            ...snapshot,
            backendMode: 'exec',
            providerSession: {
              transcriptId: `transcript-${snapshot.sessionId}`
            },
            history: (snapshot.history || []).concat([{
              questionId: snapshot.currentMessage.questionId,
              question: snapshot.currentMessage.title,
              answer: Array.isArray(answer.optionIds) && answer.optionIds.length > 0
                ? answer.optionIds.join(', ')
                : answer.text
            }]),
            currentQuestionId: 'branch-follow-up',
            currentMessage: {
              type: 'question',
              questionType: 'pick_one',
              questionId: 'branch-follow-up',
              title: '分支追问',
              description: '围绕历史分支继续追问。',
              options: [
                { id: 'detail', label: '展开细节', description: '' }
              ],
              allowTextOverride: true
            }
          };
        }

        return {
          ...snapshot,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${snapshot.sessionId}` },
          history: [{
            questionId: 'question',
            question: '第一题',
            answer: Array.isArray(answer.optionIds) && answer.optionIds.length > 0
              ? answer.optionIds[0]
              : answer.text
          }],
          currentQuestionId: 'question',
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'question',
            title: '第二题',
            description: '',
            options: [
              { id: 'A', label: '继续主线 A', description: '' },
              { id: 'B', label: '继续主线 B', description: '' }
            ],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'summary',
      initialPrompt: '验证历史节点分支'
    });
    const advanced = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'question',
      answerMode: 'option',
      optionIds: ['A'],
      text: null,
      rawInput: 'A'
    });

    const firstRound = advanced.roundGraph.rounds.find((round) => round.id === 'round-question');
    assert(firstRound, 'expected first frozen round');
    assert.strictEqual(firstRound.title, '第一题');

    const branched = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'question',
      answerMode: 'option',
      optionIds: ['B'],
      text: null,
      rawInput: 'B',
      contextSelection: {
        type: 'mainline',
        roundId: 'round-question',
        nodeId: 'question-question'
      }
    });

    assert.strictEqual(branched.currentMessage.questionId, 'question');
    assert.strictEqual(branched.currentMessage.title, '第二题');
    assert.strictEqual(branched.strategyState.selectedBranchRunId, 'branch-run-question-question-B');
    const branch = branched.strategyState.branchRuns.find((entry) => entry.id === 'branch-run-question-question-B');
    assert(branch, 'expected historical branch run');
    assert.strictEqual(branch.parentQuestionNodeId, 'question-question');
    assert.strictEqual(branch.parentQuestionId, 'question');
    assert.strictEqual(branch.currentMessage.questionId, 'branch-follow-up');
    assert.strictEqual(branch.currentMessage.title, '分支追问');
    assert(branch.providerSession);

    const frozenFirstNode = branched.nodeLog.nodes.find((node) => node.id === 'question-question');
    assert(frozenFirstNode, 'expected first frozen question node');
    assert.strictEqual(frozenFirstNode.title, '第一题');
    assert.strictEqual(frozenFirstNode.messageSnapshot.title, '第一题');
  });

  await test('creates a real artifact for artifact-mode sessions', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided question flow',
            text: `The user wants to brainstorm: ${answer.text}`,
            path: ['topic'],
            answers: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            synthesis: {
              recommendation: 'Guided question flow',
              problemFrame: answer.text,
              decisionCriterion: 'Most user clarity',
              exploredDirections: ['Guided question flow', 'Collaborative workspace'],
              shortlistedDirections: ['Guided question flow'],
              alternatives: ['Collaborative workspace'],
              reasoning: ['Guided question flow keeps the session focused on one decision at a time.'],
              decisionTrail: [
                { kind: 'topic', value: answer.text },
                { kind: 'criterion', value: 'Most user clarity' },
                { kind: 'selected-path', value: 'Guided question flow' }
              ],
              nextValidation: ['Validate that users can follow the facilitation without feeling trapped by the flow.']
            }
          }
        };
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'artifact' });

    const completed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
    assert.strictEqual(completed.currentMessage.title, 'Recommendation: Guided question flow');
    assert(completed.artifact, 'artifact metadata should be persisted');
    assert(fs.existsSync(completed.artifact.filePath), 'artifact file should exist');
    const artifactText = fs.readFileSync(completed.artifact.filePath, 'utf-8');
    assert(artifactText.includes('# Recommendation: Guided question flow'));
    assert(!artifactText.includes('Spec and Plan Bundle'));
    assert(artifactText.includes('## Recommendation'));
    assert(artifactText.includes('## Explored Approaches'));
    assert(artifactText.includes('## Design / Execution Draft'));
    assert(artifactText.includes('## Risks / Open Questions'));
    assert(artifactText.includes('## Next Actions'));
    assert(artifactText.includes('## Why This Path Currently Wins'));
  });

  await test('ordinary artifact sessions keep runtime-facing export semantics for non-software prompts', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: '本轮要先收敛什么？',
            description: '先说明要形成什么写作结果。',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: '本轮要先收敛什么？', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: '浙江省水利厅公务员队伍能力提升文章提纲',
            text: '围绕政治对标、短板诊断、政策建议形成三段式文章提纲。',
            path: ['topic'],
            answers: [{ questionId: 'topic', question: '本轮要先收敛什么？', answer: answer.text }],
            deliverable: {
              isComplete: true,
              completionGateVersion: 'finished-deliverable-v1',
              sections: [
                { id: 'title', title: '文章标题', items: ['浙江省水利厅公务员队伍能力提升研究'] },
                { id: 'outline', title: '写作提纲', items: ['开篇对标总书记和省委省政府部署', '分析队伍短板', '提出政策建议'] },
                { id: 'sources', title: '参考依据', items: ['后续补充正式出处核验清单'] }
              ]
            }
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'artifact',
      initialPrompt: '写一篇关于浙江省水利厅公务员队伍能力提升的文章'
    });

    const completed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: '先形成文章提纲',
      rawInput: '先形成文章提纲'
    });

    assert.strictEqual(completed.workflowMode, 'conversation');
    assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
    assert.strictEqual(completed.currentMessage.title, '浙江省水利厅公务员队伍能力提升文章提纲');
    const finishedResult = manager.getFinishedResult(session.id);
    assert.strictEqual(finishedResult.title, '浙江省水利厅公务员队伍能力提升文章提纲');
    assert.strictEqual(finishedResult.supportingArtifacts.length, 1);
    assert.strictEqual(finishedResult.supportingArtifacts[0].label, 'Current Artifact');

    const markdown = manager.getFinishedResultMarkdown(session.id);
    assert(markdown.includes('# 浙江省水利厅公务员队伍能力提升文章提纲'));
    assert(markdown.includes('## 写作提纲'));
    assert(!markdown.includes('Structured Brainstorming Result'));
    assert(!markdown.includes('Spec and Plan Bundle'));
  });

  await test('artifact_ready with generic metadata still derives the finished result from the real artifact markdown body', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-generic-artifact-1' },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'confirm',
            questionId: 'topic',
            title: '是否直接生成全文？',
            description: '确认后直接输出完整文章。',
            options: [
              { id: 'yes', label: '是' },
              { id: 'no', label: '否' }
            ],
            allowTextOverride: false
          }
        };
      },
      async submitAnswer(snapshot) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: '是否直接生成全文？', answer: '是' }],
          currentQuestionId: null,
          currentMessage: {
            type: 'artifact_ready',
            title: 'Brainstorming artifact',
            text: 'Artifact is ready.',
            artifactMarkdown: [
              '# 浙江省水利厅公务员队伍能力提升（逐段标注审校稿）',
              '',
              '## 以能力现代化支撑浙江水利现代化先行',
              '',
              '这是一段完整导语。',
              '',
              '## 一、当前浙江水利公务员队伍能力建设的主要短板',
              '',
              '这是一段完整正文。'
            ].join('\n')
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'artifact',
      initialPrompt: '写一篇完整文章'
    });

    const completed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    });

    assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
    assert.strictEqual(completed.currentMessage.title, '浙江省水利厅公务员队伍能力提升（逐段标注审校稿）');
    assert.strictEqual(completed.finishedResult.title, '浙江省水利厅公务员队伍能力提升（逐段标注审校稿）');
    assert.strictEqual(completed.finishedResult.sections[0].title, '以能力现代化支撑浙江水利现代化先行');
    assert(completed.currentMessage.text.includes('这是一段完整导语。'));

    const markdown = manager.getFinishedResultMarkdown(session.id);
    assert(markdown.includes('# 浙江省水利厅公务员队伍能力提升（逐段标注审校稿）'));
    assert(markdown.includes('## 一、当前浙江水利公务员队伍能力建设的主要短板'));
    assert(!markdown.includes('# Brainstorming artifact'));
  });

  await test('rejects placeholder artifact_ready payloads that omit the actual artifact body', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-empty-artifact-1' },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'confirm',
            questionId: 'topic',
            title: 'Ready to generate the final article?',
            description: '',
            options: [
              { id: 'yes', label: 'Yes', description: '' },
              { id: 'no', label: 'No', description: '' }
            ],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'Ready to generate the final article?', answer: 'Yes' }],
          currentQuestionId: null,
          currentMessage: {
            type: 'artifact_ready',
            title: '关于提升浙江省水利厅公务员队伍能力的决策参考稿',
            text: 'Structured brainstorming artifact is ready.'
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'artifact',
      initialPrompt: '写一篇关于浙江省水利厅公务员队伍能力提升的文章'
    });

    await assert.rejects(
      () => manager.submitAnswer(session.id, {
        type: 'answer',
        questionId: 'topic',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      }),
      /artifact_ready without artifactMarkdown or deliverable content/
    );
  });

  await test('persists provenance for visible questions and final deliverables', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-prov-1', turnId: 'turn-prov-q1' },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What should we brainstorm?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true,
            provenance: {
              backendMode: 'app-server',
              generationMode: 'real-skill-runtime',
              requiredSkills: ['skills/using-superpowers/SKILL.md', 'skills/brainstorming/SKILL.md'],
              providerTrace: { threadId: 'thread-prov-1', turnId: 'turn-prov-q1' },
              timestamp: '2026-03-25T00:00:00.000Z'
            }
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What should we brainstorm?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided question flow',
            text: 'Recommendation\n- Choose: Guided question flow',
            path: ['topic'],
            answers: [{ questionId: 'topic', question: 'What should we brainstorm?', answer: answer.text }],
            deliverable: {
              isComplete: true,
              completionGateVersion: 'finished-deliverable-v1',
              sections: [
                { id: 'recommendation', title: 'Recommendation', items: ['Choose: Guided question flow'] },
                { id: 'problem-framing', title: 'Problem Framing', items: [answer.text] },
                { id: 'explored-approaches', title: 'Explored Approaches', items: ['Guided question flow', 'Collaborative workspace'] },
                { id: 'design-execution-draft', title: 'Design / Execution Draft', items: ['Start with a single-thread guided flow.'] },
                { id: 'risks-open-questions', title: 'Risks / Open Questions', items: ['Validate whether the flow feels too rigid.'] },
                { id: 'next-actions', title: 'Next Actions', items: ['Prototype one full session.'] }
              ]
            },
            provenance: {
              backendMode: 'app-server',
              generationMode: 'real-skill-runtime',
              requiredSkills: ['skills/using-superpowers/SKILL.md', 'skills/brainstorming/SKILL.md'],
              providerTrace: { threadId: 'thread-prov-1', turnId: 'turn-prov-summary' },
              timestamp: '2026-03-25T00:01:00.000Z',
              completionGateVersion: 'finished-deliverable-v1'
            }
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });
    const completed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A product that turns rough ideas into decisions',
      rawInput: 'A product that turns rough ideas into decisions'
    });

    const provenance = manager.getSessionProvenance(session.id);
    assert.strictEqual(provenance.questions.length, 1);
    assert.strictEqual(provenance.questions[0].generationMode, 'real-skill-runtime');
    assert.strictEqual(provenance.questions[0].providerTrace.threadId, 'thread-prov-1');
    assert.strictEqual(provenance.finalResult.generationMode, 'real-skill-runtime');
    assert.strictEqual(provenance.finalResult.completionGateVersion, 'finished-deliverable-v1');
    assert.strictEqual(completed.provenance.finalResult.generationMode, 'real-skill-runtime');
  });

  await test('fails explicitly when the runtime adapter cannot create a real session', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        throw new Error('No supported Codex backend is available');
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });

    await assert.rejects(
      () => manager.createSession({ completionMode: 'summary' }),
      /No supported Codex backend is available/
    );

    const sessionsDir = path.join(tmpDir, 'sessions');
    const sessionFiles = fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir) : [];
    assert.strictEqual(sessionFiles.length, 0);
  });

  await test('full-skill workflow fails explicitly when real runtime creation fails in product mode', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        throw new Error('No supported Codex backend is available');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter
    });

    await assert.rejects(
      () => manager.createSession({
        completionMode: 'artifact',
        workflowMode: 'full_skill',
        initialPrompt: 'A browser-first workflow for non-technical users'
      }),
      /No supported Codex backend is available/
    );
  });

  await test('compatibility mode can still fall back when real runtime creation fails', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        throw new Error('No supported Codex backend is available');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      allowFakeRuntimeFallback: true
    });

    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'A browser-first workflow for non-technical users'
    });

    assert.strictEqual(session.workflow.mode, 'full_skill');
    assert.strictEqual(session.backendMode, 'fake');
    assert.strictEqual(session.currentMessage.type, 'question');
    assert(session.currentMessage.provenance);
    assert.strictEqual(session.currentMessage.provenance.generationMode, 'fake-flow');
  });

  await test('full-skill workflow fails explicitly when real runtime creation times out in product mode', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        return new Promise(() => {
          setTimeout(() => {}, 60000);
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      runtimeCreateTimeoutMs: 10
    });

    await assert.rejects(
      () => manager.createSession({
        completionMode: 'artifact',
        workflowMode: 'full_skill',
        initialPrompt: 'A browser-first workflow for non-technical users'
      }),
      /runtime createSession timed out after 10ms/
    );
  });

  await test('compatibility mode can still continue from a fallback-created fake session', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        return new Promise(() => {
          setTimeout(() => {}, 60000);
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      runtimeCreateTimeoutMs: 10,
      allowFakeRuntimeFallback: true
    });

    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'A browser-first workflow for non-technical users'
    });

    assert.strictEqual(session.backendMode, 'fake');
    assert.strictEqual(session.currentMessage.questionId, 'seed-reframe');

    const afterAnswer = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'seed-reframe',
      answerMode: 'option',
      optionIds: ['fix-facilitation'],
      text: null,
      rawInput: '2'
    });

    assert.strictEqual(afterAnswer.backendMode, 'fake');
    assert.strictEqual(afterAnswer.currentMessage.type, 'question');
    assert.strictEqual(afterAnswer.currentMessage.questionId, 'seed-directions');
    assert.strictEqual(afterAnswer.history.length, 1);
    assert.strictEqual(afterAnswer.history[0].questionId, 'seed-reframe');

    const inspection = manager.getSessionInspection(session.id);
    assert.strictEqual(
      inspection.workflow.hiddenActivity.some((entry) => (
        entry.kind === 'runtime-fallback'
        && entry.action === 'submit-answer'
      )),
      false
    );
    assert.strictEqual(
      inspection.workflow.hiddenActivity.some((entry) => (
        entry.kind === 'runtime-fallback-reseed'
        && entry.action === 'submit-answer'
      )),
      false
    );
  });

  await test('full-skill workflow fails explicitly when the real backend times out on answer submission in product mode', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-submit-timeout', pendingRequestId: 'req-1' },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem'
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer() {
        return new Promise(() => {
          setTimeout(() => {}, 60000);
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      runtimeSubmitTimeoutMs: 10
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'A browser-first workflow for non-technical users'
    });

    await assert.rejects(
      () => manager.submitAnswer(session.id, {
        type: 'answer',
        questionId: 'topic',
        answerMode: 'text',
        optionIds: [],
        text: 'Build a product that hides engineering details but still reaches spec plus plan.',
        rawInput: 'Build a product that hides engineering details but still reaches spec plus plan.'
      }),
      /runtime submitAnswer timed out after 10ms/
    );
  });

  await test('compatibility mode can still fall back on answer submission when explicitly enabled', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-submit-timeout', pendingRequestId: 'req-1' },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem'
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer() {
        return new Promise(() => {
          setTimeout(() => {}, 60000);
        });
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      runtimeSubmitTimeoutMs: 10,
      allowFakeRuntimeFallback: true
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'A browser-first workflow for non-technical users'
    });

    const afterFallback = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'Build a product that hides engineering details but still reaches spec plus plan.',
      rawInput: 'Build a product that hides engineering details but still reaches spec plus plan.'
    });

    assert.strictEqual(afterFallback.backendMode, 'fake');
    assert.strictEqual(afterFallback.currentMessage.type, 'question');
    assert.strictEqual(afterFallback.currentMessage.questionId, 'seed-reframe');
    const inspection = manager.getSessionInspection(session.id);
    assert(inspection.workflow.hiddenActivity.some((entry) => entry.kind === 'runtime-fallback'));
    assert.strictEqual(afterFallback.provenance.questions.at(-1).generationMode, 'fake-flow');
  });

  await test('full-skill workflow pauses for spec review and then completes with a spec-and-plan bundle', async (tmpDir) => {
    let specDraftCalls = 0;
    let planDraftCalls = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem'
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided workflow',
            text: 'Recommendation\n- Choose: Guided workflow',
            path: ['topic'],
            answers: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            deliverable: {
              title: 'Recommendation: Guided workflow',
              completionGateVersion: 'finished-deliverable-v1',
              isComplete: true,
              sections: [
                { id: 'recommendation', title: 'Recommendation', items: ['Choose: Guided workflow'] },
                { id: 'problem-framing', title: 'Problem Framing', items: [answer.text] },
                { id: 'explored-approaches', title: 'Explored Approaches', items: ['Guided workflow', 'Manual facilitator'] },
                { id: 'why-this-path-currently-wins', title: 'Why This Path Currently Wins', items: ['It keeps the user in one clear flow.'] },
                { id: 'alternatives-still-worth-remembering', title: 'Alternatives Still Worth Remembering', items: ['Manual facilitator'] },
                { id: 'design-execution-draft', title: 'Design / Execution Draft', items: ['Draft the browser workflow and approval gates.'] },
                { id: 'risks-open-questions', title: 'Risks / Open Questions', items: ['Validate whether the workflow feels too hidden.'] },
                { id: 'next-actions', title: 'Next Actions', items: ['Draft the spec and implementation plan.'] }
              ]
            },
            provenance: {
              backendMode: 'exec',
              generationMode: 'real-skill-runtime',
              requiredSkills: ['skills/using-superpowers/SKILL.md', 'skills/brainstorming/SKILL.md'],
              timestamp: '2026-03-25T00:02:00.000Z'
            }
          }
        };
      }
    };
    const workflowEngine = {
      async createSpecDraft(input) {
        specDraftCalls += 1;
        assert.strictEqual(input.summary.title, 'Recommendation: Guided workflow');
        return {
          specArtifact: {
            title: 'Brainstorm Workflow Design',
            fileName: '2026-03-25-brainstorm-workflow-design.md',
            markdown: '# Brainstorm Workflow Design\n\n## Goal\n\nShip a full-skill browser workflow.\n'
          },
          review: {
            status: 'approved',
            issues: [],
            recommendations: ['Keep the first version focused on spec + plan completion.']
          },
          reviewPrompt: {
            title: 'Review the drafted workflow document',
            description: 'The first draft is ready. Review it, then confirm if it is accurate enough to continue into the implementation plan.',
            approveLabel: 'Looks right, continue',
            reviseLabel: 'Needs changes first'
          }
        };
      },
      async createPlan(input) {
        planDraftCalls += 1;
        assert.strictEqual(input.specArtifact.title, 'Brainstorm Workflow Design');
        return {
          planArtifact: {
            title: 'Brainstorm Workflow Implementation Plan',
            fileName: '2026-03-25-brainstorm-workflow.md',
            markdown: '# Brainstorm Workflow Implementation Plan\n\n> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.\n'
          },
          completion: {
            title: 'Spec and plan are ready',
            text: 'The workflow package is ready for review and implementation planning.',
            artifactType: 'workflow_bundle'
          }
        };
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeAdapter,
      workflowEngine
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill'
    });

    const afterBrainstorm = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser product that hides engineering details but still runs the full brainstorming workflow',
      rawInput: 'A browser product that hides engineering details but still runs the full brainstorming workflow'
    });

    assert.strictEqual(specDraftCalls, 1);
    assert.strictEqual(afterBrainstorm.currentMessage.type, 'question');
    assert.strictEqual(afterBrainstorm.currentMessage.questionType, 'confirm');
    assert.strictEqual(afterBrainstorm.currentMessage.questionId, 'workflow-review-spec');
    assert.strictEqual(afterBrainstorm.workflow.mode, 'full_skill');
    assert.strictEqual(afterBrainstorm.workflow.visibleStage.id, 'review-spec');
    assert.strictEqual(afterBrainstorm.workflow.status, 'awaiting_user');
    assert(afterBrainstorm.workflow.specArtifact);
    assert(fs.existsSync(afterBrainstorm.workflow.specArtifact.filePath), 'spec artifact should be written to disk');

    const approved = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'workflow-review-spec',
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    });

    assert.strictEqual(planDraftCalls, 1);
    assert.strictEqual(approved.currentMessage.type, 'artifact_ready');
    assert.strictEqual(approved.workflow.visibleStage.id, 'plan-ready');
    assert.strictEqual(approved.workflow.status, 'complete');
    assert(approved.workflow.planArtifact);
    assert(fs.existsSync(approved.workflow.planArtifact.filePath), 'plan artifact should be written to disk');
    assert(approved.artifact, 'bundle artifact metadata should be persisted');
    assert(approved.finishedResult, 'finished result snapshot should be persisted');
    assert.strictEqual(approved.finishedResult.exportPaths.jsonPath, `/api/sessions/${approved.id}/result`);
    assert.strictEqual(approved.finishedResult.exportPaths.markdownPath, `/api/sessions/${approved.id}/result.md`);
    assert.strictEqual(approved.finishedResult.sections[0].title, 'Recommendation');
    assert.strictEqual(approved.finishedResult.supportingArtifacts.length, 3);
    assert(approved.currentMessage.deliverable, 'artifact_ready payload should carry normalized deliverable');
    assert(approved.currentMessage.finishedResult, 'artifact_ready payload should expose finished result snapshot');
    assert.strictEqual(approved.currentMessage.resultExportPaths.jsonPath, `/api/sessions/${approved.id}/result`);
    assert(approved.roundGraph, 'round graph should be persisted');
    assert(approved.roundGraph.rounds.some((round) => round.questionId === 'workflow-review-spec'));
    const reviewRound = approved.roundGraph.rounds.find((round) => round.questionId === 'workflow-review-spec');
    assert(reviewRound, 'workflow review round should remain on the mainline after approval');
    assert.strictEqual(reviewRound.status, 'complete');
    assert.strictEqual(reviewRound.answerSummary, 'Looks right, continue');

    const bundleText = fs.readFileSync(approved.artifact.filePath, 'utf-8');
    assert(bundleText.includes('Spec and Plan Bundle'));
    assert(bundleText.includes('Brainstorm Workflow Design'));
    assert(bundleText.includes('Brainstorm Workflow Implementation Plan'));

    const finishedResult = manager.getFinishedResult(session.id);
    assert.strictEqual(finishedResult.recommendationTitle, 'Choose: Guided workflow');
    assert(finishedResult.sections.some((section) => section.title === 'Next Actions'));

    const finishedMarkdown = manager.getFinishedResultMarkdown(session.id);
    assert(finishedMarkdown.includes('# Recommendation: Guided workflow'));
    assert(finishedMarkdown.includes('Choose: Guided workflow'));
    assert(!finishedMarkdown.includes('Spec and Plan Bundle'));

    const reloaded = manager.getSession(session.id);
    assert.strictEqual(reloaded.workflow.status, 'complete');
    assert.strictEqual(reloaded.currentMessage.type, 'artifact_ready');
    assert(reloaded.finishedResult, 'finished result snapshot should survive reload');
  });

  await test('retries hidden spec review automatically before surfacing the user review gate', async (tmpDir) => {
    let specDraftCalls = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-review-retry', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided workflow',
            text: 'Recommendation\n- Choose: Guided workflow',
            path: ['topic'],
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };
    const workflowEngine = {
      async createSpecDraft() {
        specDraftCalls += 1;
        if (specDraftCalls === 1) {
          return {
            specArtifact: {
              title: 'Brainstorm Workflow Design',
              fileName: '2026-03-25-brainstorm-workflow-design.md',
              markdown: '# Brainstorm Workflow Design\n\n## Goal\n\nTighten the scope.\n'
            },
            review: {
              status: 'issues_found',
              issues: ['Scope is still too broad.'],
              recommendations: ['Keep V1 focused on a single browser-first workflow.']
            },
            reviewPrompt: {
              title: 'Review the drafted workflow document',
              description: 'Review the drafted document before continuing to the plan.'
            }
          };
        }

        return {
          specArtifact: {
            title: 'Brainstorm Workflow Design',
            fileName: '2026-03-25-brainstorm-workflow-design.md',
            markdown: '# Brainstorm Workflow Design\n\n## Goal\n\nKeep V1 focused.\n'
          },
          review: {
            status: 'approved',
            issues: [],
            recommendations: ['Looks ready to continue.']
          },
          reviewPrompt: {
            title: 'Review the drafted workflow document',
            description: 'Review the drafted document before continuing to the plan.'
          }
        };
      },
      async createPlan() {
        throw new Error('createPlan should not be called in this test');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeAdapter,
      workflowEngine,
      reviewRetryBudget: 3
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill'
    });

    const afterBrainstorm = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser product that hides engineering details but still runs the full workflow',
      rawInput: 'A browser product that hides engineering details but still runs the full workflow'
    });

    assert.strictEqual(specDraftCalls, 2);
    assert.strictEqual(afterBrainstorm.currentMessage.questionId, 'workflow-review-spec');
    assert.strictEqual(afterBrainstorm.workflow.review.attemptCount, 2);
    assert.strictEqual(afterBrainstorm.workflow.review.status, 'approved');
    assert(afterBrainstorm.workflow.checkpoints.length >= 2);

    const inspection = manager.getSessionInspection(session.id);
    assert(Array.isArray(inspection.workflow.hiddenActivity));
    assert(inspection.workflow.hiddenActivity.some((entry) => entry.reviewStatus === 'issues_found'));
    assert(Array.isArray(inspection.workflow.skillChecklist));
    assert.strictEqual(
      inspection.workflow.skillChecklist.find((entry) => entry.id === 'spec-review-loop').status,
      'completed'
    );
  });

  await test('surfaces a blocked review state and resumes after the user adds guidance', async (tmpDir) => {
    let specDraftCalls = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-review-blocked', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided workflow',
            text: 'Recommendation\n- Choose: Guided workflow',
            path: ['topic'],
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };
    const workflowEngine = {
      async createSpecDraft(input) {
        specDraftCalls += 1;
        if (specDraftCalls <= 2) {
          return {
            specArtifact: {
              title: 'Blocked Workflow Design',
              fileName: '2026-03-25-blocked-workflow-design.md',
              markdown: '# Blocked Workflow Design\n\n## Gap\n\nNeeds more direction.\n'
            },
            review: {
              status: 'issues_found',
              issues: ['The document still lacks a crisp boundary.'],
              recommendations: ['State exactly what V1 includes and excludes.']
            },
            reviewPrompt: {
              title: 'Review the drafted workflow document',
              description: 'Review the drafted document before continuing to the plan.'
            }
          };
        }

        assert((input.revisionNotes || '').includes('Narrow the V1 scope'));
        return {
          specArtifact: {
            title: 'Recovered Workflow Design',
            fileName: '2026-03-25-recovered-workflow-design.md',
            markdown: '# Recovered Workflow Design\n\n## Scope\n\nNarrow the V1 scope.\n'
          },
          review: {
            status: 'approved',
            issues: [],
            recommendations: ['Ready for user review.']
          },
          reviewPrompt: {
            title: 'Review the drafted workflow document',
            description: 'Review the drafted document before continuing to the plan.'
          }
        };
      },
      async createPlan() {
        throw new Error('createPlan should not be called in this test');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeAdapter,
      workflowEngine,
      reviewRetryBudget: 2
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill'
    });

    const blocked = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser product that still stalls when the draft is too broad',
      rawInput: 'A browser product that still stalls when the draft is too broad'
    });

    assert.strictEqual(specDraftCalls, 2);
    assert.strictEqual(blocked.workflow.status, 'blocked');
    assert.strictEqual(blocked.workflow.visibleStage.id, 'review-blocked');
    assert.strictEqual(blocked.currentMessage.questionId, 'workflow-revise-spec');
    assert(blocked.workflow.blocked);
    assert.strictEqual(blocked.workflow.blocked.canResume, true);
    assert(blocked.workflow.checkpoints.some((entry) => entry.stageId === 'review-blocked'));

    const resumed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'workflow-revise-spec',
      answerMode: 'text',
      optionIds: [],
      text: 'Narrow the V1 scope to one browser workflow that ends at spec plus plan.',
      rawInput: 'Narrow the V1 scope to one browser workflow that ends at spec plus plan.'
    });

    assert.strictEqual(specDraftCalls, 3);
    assert.strictEqual(resumed.workflow.status, 'awaiting_user');
    assert.strictEqual(resumed.workflow.visibleStage.id, 'review-spec');
    assert.strictEqual(resumed.currentMessage.questionId, 'workflow-review-spec');
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();
