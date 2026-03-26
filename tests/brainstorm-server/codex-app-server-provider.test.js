const assert = require('assert');
const path = require('path');

const ADAPTER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-runtime-adapter.cjs');
const CLIENT_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-app-server-client.cjs');
const FIXTURE_PATH = path.join(__dirname, 'fixtures/mock-codex-app-server.cjs');

let createAppServerCodexRuntimeProvider;
let createCodexAppServerClient;
try {
  ({ createAppServerCodexRuntimeProvider } = require(ADAPTER_PATH));
  ({ createCodexAppServerClient } = require(CLIENT_PATH));
} catch (error) {
  console.error(`Cannot load provider dependencies: ${error.message}`);
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

  console.log('\n--- Codex App Server Provider ---');

  await test('creates the first active question from requestUserInput', async () => {
    const provider = createAppServerCodexRuntimeProvider({
      clientFactory: () => createCodexAppServerClient({
        command: process.execPath,
        args: [FIXTURE_PATH]
      })
    });

    const session = await provider.createSession({
      sessionId: 'app-1',
      completionMode: 'summary'
    });

    assert.strictEqual(session.backendMode, 'app-server');
    assert.strictEqual(session.currentMessage.type, 'question');
    assert.strictEqual(session.currentMessage.questionId, 'question-1');
    assert.strictEqual(session.providerSession.threadId, 'thread-mock');
    assert.strictEqual(session.providerSession.pendingRequestId, 'server-request-1');
    assert(session.strategyState, 'strategyState should be initialized');
    assert.strictEqual(session.strategyState.phase, 'scope');
    assert.strictEqual(session.strategyState.nextLearningGoal, 'understand-the-core-problem');
    assert.deepStrictEqual(session.strategyState.candidateDirections, []);

    await provider.dispose();
  });

  await test('bootstraps the app-server thread with explicit skill-loading instructions', async () => {
    const calls = [];
    let stubClient = null;
    const provider = createAppServerCodexRuntimeProvider({
      clientFactory: () => {
        stubClient = {
          async startThread(input) {
            calls.push(['startThread', input]);
            return { threadId: 'thread-bootstrap' };
          },
          async startTurn(input) {
            calls.push(['startTurn', input]);
            return { turnId: 'turn-bootstrap' };
          },
          on(eventName, handler) {
            if (eventName === 'server-request') {
              this.serverRequestHandler = handler;
            }
            if (eventName === 'notification') {
              this.notificationHandler = handler;
            }
          },
          off() {},
          async resumeThread() {
            return { threadId: 'thread-bootstrap' };
          },
          async dispose() {}
        };
        return stubClient;
      }
    });

    const createPromise = provider.createSession({
      sessionId: 'app-bootstrap-1',
      completionMode: 'summary'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const startThreadCall = calls.find((entry) => entry[0] === 'startThread');
    assert(startThreadCall, 'startThread should be called');
    assert(startThreadCall[1].baseInstructions.includes('load the required repository skill files'));
    assert(startThreadCall[1].developerInstructions.includes('skills/using-superpowers/SKILL.md'));
    assert(startThreadCall[1].developerInstructions.includes('skills/brainstorming/SKILL.md'));

    assert(stubClient && typeof stubClient.notificationHandler === 'function', 'notification handler should be registered');
    stubClient.notificationHandler({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-bootstrap',
        delta: JSON.stringify({
          type: 'question',
          questionType: 'ask_text',
          questionId: 'topic',
          title: 'What do you want to brainstorm about?',
          description: 'Start with the core topic.',
          allowTextOverride: true
        })
      }
    });
    stubClient.notificationHandler({
      method: 'turn/completed',
      params: {
        threadId: 'thread-bootstrap',
        turn: {
          id: 'turn-bootstrap'
        }
      }
    });

    const session = await createPromise;
    assert.strictEqual(session.currentMessage.type, 'question');

    await provider.dispose();
  });

  await test('submits a structured answer and returns the next completion message', async () => {
    const provider = createAppServerCodexRuntimeProvider({
      clientFactory: () => createCodexAppServerClient({
        command: process.execPath,
        args: [FIXTURE_PATH]
      })
    });

    const session = await provider.createSession({
      sessionId: 'app-2',
      completionMode: 'summary'
    });

    const updated = await provider.submitAnswer(session, {
      type: 'answer',
      questionId: 'question-1',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    assert.strictEqual(updated.backendMode, 'app-server');
    assert.strictEqual(updated.currentMessage.type, 'summary');
    assert.strictEqual(updated.history.length, 1);
    assert(updated.currentMessage.text.includes('A visual brainstorming assistant'));
    assert(updated.strategyState, 'strategyState should be preserved');
    assert.strictEqual(updated.strategyState.phase, 'reframe');
    assert.strictEqual(updated.strategyState.nextLearningGoal, 'select-the-best-problem-frame');
    assert.strictEqual(updated.strategyState.problemFrame.summary, 'A visual brainstorming assistant');

    await provider.dispose();
  });

  await test('labels empty app-server completions as fallback-excerpt provenance', async () => {
    let stubClient = null;
    const provider = createAppServerCodexRuntimeProvider({
      clientFactory: () => {
        stubClient = {
          async startThread() {
            return { threadId: 'thread-fallback' };
          },
          async startTurn() {
            return { turnId: 'turn-fallback' };
          },
          on(eventName, handler) {
            if (eventName === 'server-request') {
              this.serverRequestHandler = handler;
            }
            if (eventName === 'notification') {
              this.notificationHandler = handler;
            }
          },
          off() {},
          async resumeThread() {
            return { threadId: 'thread-fallback' };
          },
          async dispose() {}
        };
        return stubClient;
      }
    });

    const createPromise = provider.createSession({
      sessionId: 'app-fallback-1',
      completionMode: 'summary'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    stubClient.notificationHandler({
      method: 'turn/completed',
      params: {
        threadId: 'thread-fallback',
        turn: { id: 'turn-fallback' }
      }
    });

    const session = await createPromise;
    assert.strictEqual(session.currentMessage.type, 'question');
    assert.strictEqual(session.currentMessage.provenance.generationMode, 'fallback-excerpt');

    await provider.dispose();
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
