const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SERVER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/server.cjs');
const STORE_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/research-asset-store.cjs');

let createResearchAssetStore;
try {
  ({ createResearchAssetStore } = require(STORE_PATH));
} catch (error) {
  console.error(`Cannot load ${STORE_PATH}: ${error.message}`);
  process.exit(1);
}

const TEST_PORT = 3336;
const TEST_DIR = '/tmp/brainstorm-research-asset-api-test';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, route, payload, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: route,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

function startServer() {
  return spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      BRAINSTORM_PORT: TEST_PORT,
      BRAINSTORM_DIR: TEST_DIR,
      BRAINSTORM_RUNTIME_MODE: 'fake'
    }
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

function seedReadyWorkspace() {
  const dataDir = path.join(TEST_DIR, '.web-product');
  const store = createResearchAssetStore({ dataDir });
  const workspace = store.saveWorkspace({
    id: 'workspace-ready',
    title: 'Market Entry',
    team: 'strategy',
    owner: 'owner-1',
    status: 'ready_for_publish',
    rootQuestionId: 'rq-1',
    researchQuestion: { id: 'rq-1', title: 'Should we enter market X?' },
    hypotheses: [
      { id: 'h-active', status: 'active', title: 'Active branch' },
      { id: 'h-parked', status: 'parked', title: 'Parked branch' }
    ],
    evidence: [{
      id: 'ev-1',
      status: 'accepted',
      sourceFingerprint: 'abc123',
      sourceLocator: 'url#fragment',
      capturedAt: '2026-03-26T00:00:00.000Z',
      collector: 'user-1'
    }, {
      id: 'ev-2',
      status: 'reviewed',
      sourceFingerprint: 'def456',
      sourceLocator: 'url#fragment-2',
      capturedAt: '2026-03-26T00:00:00.000Z',
      collector: 'user-2'
    }],
    judgments: [{
      id: 'j-1',
      status: 'confirmed',
      evidenceRefs: ['ev-1']
    }],
    conclusion: {
      id: 'c-1',
      status: 'ready',
      judgmentRefs: ['j-1'],
      openRisks: ['Need pricing validation'],
      nextActions: ['Interview two customers']
    }
  });
  return { dataDir, store, workspace };
}

async function runTests() {
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const { store, workspace } = seedReadyWorkspace();
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

    console.log('\n--- Research Asset API ---');

    await test('lists published research assets', async () => {
      const published = store.saveBundle({
        id: 'bundle-1',
        workspaceId: workspace.id,
        rootQuestionId: 'rq-1',
        title: 'Market Entry Bundle',
        team: 'strategy',
        version: 1,
        status: 'published',
        permissions: { owner: ['owner-1'] },
        publishSummary: 'Initial release'
      });

      const res = await request('GET', '/api/assets');
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body.items));
      assert(body.items.some((item) => item.id === published.id));
    });

    await test('publishes a ready workspace into a new bundle version', async () => {
    const res = await request(
      'POST',
      `/api/workspaces/${workspace.id}/publish`,
      { publishSummary: 'Ship v1' },
      { 'x-role': 'Owner', 'x-actor-id': 'owner-1' }
    );
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.bundle.workspaceId, workspace.id);
      assert.strictEqual(body.bundle.version, 2);
      assert.strictEqual(body.bundle.publishSummary, 'Ship v1');
      assert.deepStrictEqual(body.bundle.includedEvidence.map((item) => item.id), ['ev-1']);
      assert.deepStrictEqual(body.bundle.excludedEvidence, ['ev-2']);
      assert.deepStrictEqual(body.bundle.includedHypotheses.map((item) => item.id), ['h-active', 'h-parked']);
    });

    await test('lists research workspaces and exposes publish review state', async () => {
      const workspaceRes = await request('GET', '/api/workspaces');
      assert.strictEqual(workspaceRes.status, 200);
      const workspaceBody = JSON.parse(workspaceRes.body);
      assert.ok(Array.isArray(workspaceBody.items));
      assert(workspaceBody.items.some((item) => item.id === workspace.id));

      const reviewRes = await request('GET', `/api/workspaces/${workspace.id}/publish-review`);
      assert.strictEqual(reviewRes.status, 200);
      const reviewBody = JSON.parse(reviewRes.body);
      assert.strictEqual(reviewBody.workspace.id, workspace.id);
      assert.strictEqual(reviewBody.validation.ok, true);
      assert.strictEqual(reviewBody.nextVersion, 3);
      assert.ok(Array.isArray(reviewBody.validation.warningCodes));
      assert(reviewBody.validation.warningCodes.includes('reviewed-evidence-unresolved'));
    });

    await test('clones a published bundle into a new editable workspace', async () => {
      const res = await request('POST', '/api/assets/bundle-1/clone', {
        title: 'Market Entry Follow-up',
        team: 'strategy'
      }, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1'
      });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.workspace.sourceBundleId, 'bundle-1');
      assert.strictEqual(body.workspace.status, 'active');
      assert.strictEqual(body.workspace.title, 'Market Entry Follow-up');
      assert.strictEqual(body.workspace.researchQuestion.title, 'Should we enter market X?');
    });

    await test('returns asset detail by id', async () => {
      const listRes = await request('GET', '/api/assets');
      assert.strictEqual(listRes.status, 200);
      const listBody = JSON.parse(listRes.body);
      const latestBundle = listBody.items.find((item) => item.workspaceId === workspace.id && item.version === 2);
      assert(latestBundle, 'expected the published v2 bundle to exist');

      const res = await request('GET', `/api/assets/${latestBundle.id}`);
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.id, latestBundle.id);
      assert.strictEqual(body.researchQuestion.title, 'Should we enter market X?');
      assert.strictEqual(body.conclusion.id, 'c-1');
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
