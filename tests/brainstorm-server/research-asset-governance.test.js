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

const TEST_PORT = 3337;
const TEST_DIR = '/tmp/brainstorm-research-asset-governance-test';

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

function seedWorkspaceAndBundle() {
  const dataDir = path.join(TEST_DIR, '.web-product');
  const store = createResearchAssetStore({ dataDir });
  const workspace = store.saveWorkspace({
    id: 'workspace-governance',
    title: 'Governance Workspace',
    team: 'strategy',
    owner: 'owner-1',
    status: 'ready_for_publish',
    rootQuestionId: 'rq-1',
    researchQuestion: { id: 'rq-1', title: 'Question' },
    hypotheses: [],
    evidence: [{
      id: 'ev-1',
      status: 'accepted',
      sourceFingerprint: 'abc123',
      sourceLocator: 'url#fragment',
      capturedAt: '2026-03-26T00:00:00.000Z',
      collector: 'user-1'
    }, {
      id: 'ev-2',
      status: 'collected',
      sourceFingerprint: 'ghi789',
      sourceLocator: 'url#fragment-2',
      capturedAt: '2026-03-26T00:00:00.000Z',
      collector: 'user-2'
    }],
    judgments: [{ id: 'j-1', status: 'confirmed', evidenceRefs: ['ev-1'] }],
    conclusion: {
      id: 'c-1',
      status: 'ready',
      judgmentRefs: ['j-1'],
      openRisks: ['Need diligence'],
      nextActions: ['Prepare memo']
    }
  });
  store.saveBundle({
    id: 'bundle-governance',
    workspaceId: workspace.id,
    rootQuestionId: 'rq-1',
    title: 'Governance Bundle',
    team: 'strategy',
    version: 1,
    status: 'published',
    permissions: { owner: ['owner-1'] },
    publishSummary: 'Published bundle'
  });
  return workspace;
}

async function runTests() {
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const workspace = seedWorkspaceAndBundle();
  const server = startServer();
  let reviewRequestId = null;

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

    console.log('\n--- Research Asset Governance ---');

    await test('blocks editor from revoking a published bundle', async () => {
      const res = await request('POST', '/api/assets/bundle-governance/revoke', null, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1'
      });
      assert.strictEqual(res.status, 403);
    });

    await test('allows auditors to read audit entries', async () => {
      const res = await request('GET', `/api/audit?workspaceId=${workspace.id}`, null, {
        'x-role': 'Auditor',
        'x-actor-id': 'auditor-1'
      });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body.items));
    });

    await test('creates review requests for publish approval', async () => {
      const res = await request('POST', '/api/review-requests', {
        type: 'publish-approval',
        targetType: 'Workspace',
        targetId: workspace.id,
        assigneeId: 'owner-1'
      }, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1'
      });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.type, 'publish-approval');
      assert.strictEqual(body.targetId, workspace.id);
      reviewRequestId = body.id;
    });

    await test('lists review requests for a workspace', async () => {
      const res = await request('GET', `/api/review-requests?workspaceId=${workspace.id}`, null, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1'
      });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body.items));
      assert(body.items.some((item) => item.targetId === workspace.id));
    });

    await test('allows owners to resolve review requests and preserve request history', async () => {
      const res = await request('POST', `/api/review-requests/${reviewRequestId}/resolve`, {
        resolutionNote: 'Publish gate cleared'
      }, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1'
      });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, 'resolved');
      assert.strictEqual(body.resolvedBy, 'owner-1');
      assert.strictEqual(body.resolutionNote, 'Publish gate cleared');
      assert.ok(Array.isArray(body.statusHistory));
      assert.strictEqual(body.statusHistory.length, 2);
      assert.strictEqual(body.statusHistory[0].status, 'open');
      assert.strictEqual(body.statusHistory[1].status, 'resolved');
    });

    await test('blocks auditors from deciding review requests but allows editors to reject a fresh one', async () => {
      const createdRes = await request('POST', '/api/review-requests', {
        type: 'evidence-review',
        targetType: 'Workspace',
        targetId: workspace.id,
        assigneeId: 'editor-1'
      }, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1'
      });
      assert.strictEqual(createdRes.status, 200);
      const created = JSON.parse(createdRes.body);

      const blockedRes = await request('POST', `/api/review-requests/${created.id}/reject`, {
        resolutionNote: 'Auditor should not decide'
      }, {
        'x-role': 'Auditor',
        'x-actor-id': 'auditor-1'
      });
      assert.strictEqual(blockedRes.status, 403);

      const rejectRes = await request('POST', `/api/review-requests/${created.id}/reject`, {
        resolutionNote: 'Need more evidence'
      }, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1'
      });
      assert.strictEqual(rejectRes.status, 200);
      const rejected = JSON.parse(rejectRes.body);
      assert.strictEqual(rejected.status, 'rejected');
      assert.strictEqual(rejected.resolvedBy, 'editor-1');
      assert.strictEqual(rejected.statusHistory.length, 2);
      assert.strictEqual(rejected.statusHistory[1].status, 'rejected');
    });

    await test('requires human confirmation for agent-triggered publish', async () => {
      const res = await request('POST', `/api/workspaces/${workspace.id}/publish`, {
        publishSummary: 'Attempt from agent'
      }, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1',
        'x-actor-kind': 'agent'
      });
      assert.strictEqual(res.status, 409);
    });

    await test('requires human confirmation for agent-triggered evidence verification', async () => {
      const res = await request('POST', `/api/workspaces/${workspace.id}/evidence/ev-2/verify`, {
        reason: 'Agent wants to verify'
      }, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1',
        'x-actor-kind': 'agent'
      });
      assert.strictEqual(res.status, 409);
    });

    await test('verifies and accepts evidence for an authorized human editor', async () => {
      const verifyRes = await request('POST', `/api/workspaces/${workspace.id}/evidence/ev-2/verify`, {
        reason: 'Human review complete'
      }, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1'
      });
      assert.strictEqual(verifyRes.status, 200);
      const verifyBody = JSON.parse(verifyRes.body);
      assert.strictEqual(verifyBody.evidence.status, 'verified');

      const acceptRes = await request('POST', `/api/workspaces/${workspace.id}/evidence/ev-2/accept`, {
        reason: 'Human accepts the source'
      }, {
        'x-role': 'Editor',
        'x-actor-id': 'editor-1'
      });
      assert.strictEqual(acceptRes.status, 200);
      const acceptBody = JSON.parse(acceptRes.body);
      assert.strictEqual(acceptBody.evidence.status, 'accepted');
    });

    await test('exports and shares a published bundle only after confirmation', async () => {
      const blockedExport = await request('POST', '/api/assets/bundle-governance/export', {
        reason: 'Agent export'
      }, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1',
        'x-actor-kind': 'agent'
      });
      assert.strictEqual(blockedExport.status, 409);

      const exportRes = await request('POST', '/api/assets/bundle-governance/export', {
        reason: 'Owner export',
        confirmedByHuman: true
      }, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1',
        'x-actor-kind': 'agent'
      });
      assert.strictEqual(exportRes.status, 200);
      const exportBody = JSON.parse(exportRes.body);
      assert.strictEqual(exportBody.asset.id, 'bundle-governance');

      const shareRes = await request('POST', '/api/assets/bundle-governance/share', {
        targetTeam: 'corp-dev',
        reason: 'Cross-team review',
        confirmedByHuman: true
      }, {
        'x-role': 'Owner',
        'x-actor-id': 'owner-1',
        'x-actor-kind': 'agent'
      });
      assert.strictEqual(shareRes.status, 200);
      const shareBody = JSON.parse(shareRes.body);
      assert.ok(Array.isArray(shareBody.sharedWithTeams));
      assert(shareBody.sharedWithTeams.includes('corp-dev'));
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
