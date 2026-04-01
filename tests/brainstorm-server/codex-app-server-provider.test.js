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

  await test('bootstraps the app-server thread with explicit skill-loading instructions and a real $brainstorming turn', async () => {
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
      completionMode: 'artifact',
      initialPrompt: '写一篇关于浙江省水利厅公务员队伍能力提升的文章'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const startThreadCall = calls.find((entry) => entry[0] === 'startThread');
    assert(startThreadCall, 'startThread should be called');
    assert(startThreadCall[1].baseInstructions.includes('load the required repository skill files'));
    assert(startThreadCall[1].developerInstructions.includes('skills/using-superpowers/SKILL.md'));
    assert(startThreadCall[1].developerInstructions.includes('skills/brainstorming/SKILL.md'));
    const startTurnCall = calls.find((entry) => entry[0] === 'startTurn');
    assert(startTurnCall, 'startTurn should be called');
    assert(startTurnCall[1].input[0].text.includes('$brainstorming'));
    assert(startTurnCall[1].input[0].text.includes('写一篇关于浙江省水利厅公务员队伍能力提升的文章'));
    assert(startTurnCall[1].input[0].text.includes('Never return placeholder labels like A, B, C, 1, 2, 3 by themselves.'));
    assert(startTurnCall[1].input[0].text.includes('you MUST include artifactMarkdown containing the complete deliverable body'));
    assert(!startTurnCall[1].input[0].text.includes('Current facilitation intent'));
    assert(!startTurnCall[1].input[0].text.includes('Brainstorming phase:'));

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

  await test('recreates a missing app-server thread and continues from persisted history on submit', async () => {
    let startThreadCalls = 0;
    let startTurnCalls = 0;
    const provider = createAppServerCodexRuntimeProvider({
      clientFactory: () => ({
        async startThread() {
          startThreadCalls += 1;
          return { threadId: `thread-recovered-${startThreadCalls}` };
        },
        async startTurn(input) {
          startTurnCalls += 1;
          this.notificationHandler({
            method: 'item/agentMessage/delta',
            params: {
              threadId: input.threadId,
              delta: JSON.stringify({
                type: 'question',
                questionType: 'ask_text',
                questionId: 'next-question',
                title: '请补充你最希望保留的文章语气要求。',
                description: '',
                options: [],
                allowTextOverride: true
              })
            }
          });
          this.notificationHandler({
            method: 'turn/completed',
            params: {
              threadId: input.threadId,
              turn: { id: `turn-recovered-${startTurnCalls}` }
            }
          });
          return { turnId: `turn-recovered-${startTurnCalls}` };
        },
        async resumeThread() {
          throw new Error('thread not found: old-thread-1');
        },
        async sendServerResponse() {
          throw new Error('sendServerResponse should not be used after thread recovery');
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
        async dispose() {}
      })
    });

    const updated = await provider.submitAnswer({
      sessionId: 'app-recover-1',
      seedPrompt: '写一篇关于浙江省水利厅公务员队伍能力提升的文章',
      backendMode: 'app-server',
      providerSession: {
        threadId: 'old-thread-1',
        pendingRequestId: null,
        pendingRequestMethod: null,
        pendingRequestParams: null,
        completionMode: 'artifact'
      },
      strategyState: {
        phase: 'reframe',
        nextLearningGoal: 'select-the-best-problem-frame',
        decisionTrail: [
          { kind: 'topic', value: '写一篇关于浙江省水利厅公务员队伍能力提升的文章' }
        ]
      },
      currentQuestionId: 'question',
      history: [
        { questionId: 'question', question: '主要使用场景是哪个？', answer: '厅党组决策参考稿' }
      ],
      currentMessage: {
        type: 'question',
        questionType: 'pick_one',
        questionId: 'question',
        title: '这篇文章主要使用场景是哪个？',
        description: '',
        options: [
          { id: 'leadership', label: '厅党组决策参考稿', description: '' }
        ],
        allowTextOverride: true
      }
    }, {
      type: 'answer',
      questionId: 'question',
      answerMode: 'option',
      optionIds: ['leadership'],
      text: null,
      rawInput: '1'
    });

    assert.strictEqual(startThreadCalls, 1);
    assert.strictEqual(startTurnCalls, 1);
    assert.strictEqual(updated.providerSession.threadId, 'thread-recovered-1');
    assert.strictEqual(updated.currentMessage.type, 'question');
    assert.strictEqual(updated.currentMessage.questionId, 'next-question');
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

  await test('surfaces app-server wait timeout as a handled rejection instead of crashing the process', async () => {
    let disposed = false;
    const provider = createAppServerCodexRuntimeProvider({
      waitForMessageTimeoutMs: 5,
      clientFactory: () => ({
        async startThread() {
          return { threadId: 'thread-timeout' };
        },
        async startTurn() {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { turnId: 'turn-timeout' };
        },
        on() {},
        off() {},
        async resumeThread() {
          return { threadId: 'thread-timeout' };
        },
        async dispose() {
          disposed = true;
        }
      })
    });

    await assert.rejects(
      () => provider.createSession({
        sessionId: 'app-timeout-1',
        completionMode: 'summary'
      }),
      /waitForAppServerMessage timed out after 5ms/
    );

    await provider.dispose();
    assert.strictEqual(disposed, true);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
