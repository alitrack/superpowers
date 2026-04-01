const assert = require('assert');
const path = require('path');

const CLIENT_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-app-server-client.cjs');
const FIXTURE_PATH = path.join(__dirname, 'fixtures/mock-codex-app-server.cjs');

let createCodexAppServerClient;
let buildDefaultAppServerArgs;
try {
  ({ createCodexAppServerClient, buildDefaultAppServerArgs } = require(CLIENT_PATH));
} catch (error) {
  console.error(`Cannot load ${CLIENT_PATH}: ${error.message}`);
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

  console.log('\n--- Codex App Server Client ---');

  await test('builds product-safe default args without forcing openai', async () => {
    const previousProvider = process.env.BRAINSTORM_CODEX_MODEL_PROVIDER;
    const previousModel = process.env.BRAINSTORM_CODEX_MODEL;
    delete process.env.BRAINSTORM_CODEX_MODEL_PROVIDER;
    delete process.env.BRAINSTORM_CODEX_MODEL;

    try {
      const args = buildDefaultAppServerArgs({});
      assert(args.includes('--disable'));
      assert(args.includes('apply_patch_freeform'));
      assert(args.includes('child_agents_md'));
      assert(args.includes('memories'));
      assert(args.includes('app-server'));
      assert(!args.includes('--session-source'));
      assert(args.includes('-c'));
      assert(args.includes('model="gpt-5.3-codex"'));
      assert(!args.includes('model_provider="openai"'));
    } finally {
      if (previousProvider === undefined) {
        delete process.env.BRAINSTORM_CODEX_MODEL_PROVIDER;
      } else {
        process.env.BRAINSTORM_CODEX_MODEL_PROVIDER = previousProvider;
      }
      if (previousModel === undefined) {
        delete process.env.BRAINSTORM_CODEX_MODEL;
      } else {
        process.env.BRAINSTORM_CODEX_MODEL = previousModel;
      }
    }
  });

  await test('starts a thread after the required initialization handshake', async () => {
    const client = createCodexAppServerClient({
      command: process.execPath,
      args: [FIXTURE_PATH]
    });

    try {
      const thread = await client.startThread({ cwd: '/tmp/brainstorm-codex-app-server-client' });
      assert.strictEqual(thread.threadId, 'thread-mock');
      assert.strictEqual(thread.cwd, '/tmp/brainstorm-codex-app-server-client');
    } finally {
      await client.dispose();
    }
  });

  await test('surfaces server-side requestUserInput events from turn/start', async () => {
    const client = createCodexAppServerClient({
      command: process.execPath,
      args: [FIXTURE_PATH]
    });

    const requestPromise = new Promise((resolve) => {
      client.once('server-request', resolve);
    });

    try {
      const thread = await client.startThread({ cwd: '/tmp/brainstorm-codex-app-server-client' });
      const turn = await client.startTurn({
        threadId: thread.threadId,
        input: [{ type: 'text', text: '$brainstorming' }]
      });
      const request = await requestPromise;

      assert.strictEqual(turn.turnId, 'turn-mock');
      assert.strictEqual(request.method, 'item/tool/requestUserInput');
      assert.strictEqual(request.params.questions[0].question, 'What are you brainstorming about?');
    } finally {
      await client.dispose();
    }
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
