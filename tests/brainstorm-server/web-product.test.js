const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SERVER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/server.cjs');
const TEST_PORT = 3335;
const TEST_DIR = '/tmp/brainstorm-web-product-test';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, route, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: route,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json' }
        : {}
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function startServer() {
  return spawn('node', [SERVER_PATH], {
    env: { ...process.env, BRAINSTORM_PORT: TEST_PORT, BRAINSTORM_DIR: TEST_DIR }
  });
}

async function waitForServer(server) {
  let stderr = '';
  return new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      if (data.toString().includes('server-started')) resolve();
    });
    server.stderr.on('data', (data) => { stderr += data.toString(); });
    server.on('error', reject);
    setTimeout(() => reject(new Error(`Server did not start: ${stderr}`)), 5000);
  });
}

async function runTests() {
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const server = startServer();

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return fn().then(() => {
      console.log(`  PASS: ${name}`);
      passed++;
    }).catch((error) => {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    });
  }

  try {
    await waitForServer(server);

    console.log('\n--- Web Product ---');

    await test('serves the browser-first app shell at /app', async () => {
      const res = await request('GET', '/app');
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Brainstorm Workspace'));
      assert(res.body.includes('New Session'));
    });

    await test('creates isolated sessions through the API', async () => {
      const first = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const second = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);

      assert.notStrictEqual(first.id, second.id);
      assert.strictEqual(first.currentMessage.questionId, 'root-goal');
      assert.strictEqual(second.currentMessage.questionId, 'root-goal');
    });

    await test('advances only the targeted session', async () => {
      const first = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const second = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);

      await request('POST', `/api/sessions/${first.id}/answers`, {
        type: 'answer',
        questionId: 'root-goal',
        answerMode: 'option',
        optionIds: ['host-ux'],
        text: null,
        rawInput: '2'
      });

      const firstState = JSON.parse((await request('GET', `/api/sessions/${first.id}`)).body);
      const secondState = JSON.parse((await request('GET', `/api/sessions/${second.id}`)).body);

      assert.strictEqual(firstState.currentMessage.questionId, 'host-confirm');
      assert.strictEqual(secondState.currentMessage.questionId, 'root-goal');
    });

    await test('returns summary-complete sessions when completionMode=summary', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'root-goal',
        answerMode: 'option',
        optionIds: ['host-ux'],
        text: null,
        rawInput: '2'
      });

      const completed = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'host-confirm',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      })).body);

      assert.strictEqual(completed.currentMessage.type, 'summary');
      assert.strictEqual(completed.history.length, 2);
    });

    await test('persists artifact-ready outputs and serves their content', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions')).body);

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'root-goal',
        answerMode: 'option',
        optionIds: ['host-ux'],
        text: null,
        rawInput: '2'
      });

      const completed = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'host-confirm',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      })).body);

      assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
      const artifactRes = await request('GET', `/api/sessions/${session.id}/artifacts/current`);
      assert.strictEqual(artifactRes.status, 200);
      assert(artifactRes.body.includes('Structured Brainstorming Result'));
    });

    console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
    if (failed > 0) process.exit(1);
  } finally {
    server.kill();
    await sleep(100);
    cleanup();
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
