const assert = require('assert');
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/research-asset-store.cjs');
const MODEL_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/research-asset-model.cjs');

let createResearchAssetStore;
let normalizeWorkspace;
let normalizeResearchAssetBundle;
let normalizeReviewRequest;
let normalizeAuditEntry;
let fingerprintSource;
let WORKSPACE_STATUS;
let BUNDLE_STATUS;
let REVIEW_REQUEST_STATUS;

try {
  ({ createResearchAssetStore } = require(STORE_PATH));
  ({
    normalizeWorkspace,
    normalizeResearchAssetBundle,
    normalizeReviewRequest,
    normalizeAuditEntry,
    fingerprintSource,
    WORKSPACE_STATUS,
    BUNDLE_STATUS,
    REVIEW_REQUEST_STATUS
  } = require(MODEL_PATH));
} catch (error) {
  console.error(`Cannot load research asset modules: ${error.message}`);
  process.exit(1);
}

const TEST_DIR = '/tmp/brainstorm-research-asset-store-test';

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

async function runTests() {
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const store = createResearchAssetStore({ dataDir: TEST_DIR });

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

  console.log('\n--- Research Asset Store ---');

  await test('normalizes and persists a workspace (mutable)', async () => {
    const created = store.saveWorkspace({
      title: 'Enterprise Research Workspace',
      status: WORKSPACE_STATUS.ACTIVE,
      metadata: { owner: 'test' }
    });

    const normalized = normalizeWorkspace(created);
    assert.strictEqual(normalized.id, created.id);
    assert.strictEqual(normalized.status, WORKSPACE_STATUS.ACTIVE);
    assert.strictEqual(normalized.title, 'Enterprise Research Workspace');
    assert(normalized.createdAt, 'workspace should include createdAt');
    assert(normalized.updatedAt, 'workspace should include updatedAt');

    const all = store.listWorkspaces();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, created.id);
    assert.strictEqual(all[0].title, 'Enterprise Research Workspace');
  });

  await test('persists a published bundle (immutable) and prevents overwrites', async () => {
    const workspace = store.saveWorkspace({ title: 'ws', status: WORKSPACE_STATUS.ACTIVE });

    const bundle = store.saveBundle({
      workspaceId: workspace.id,
      status: BUNDLE_STATUS.PUBLISHED,
      sources: [
        { kind: 'url', url: 'https://example.com/a', title: 'A' }
      ],
      assets: [
        { kind: 'note', title: 'Findings', body: 'Hello' }
      ]
    });

    assert.strictEqual(bundle.workspaceId, workspace.id);
    assert.strictEqual(bundle.status, BUNDLE_STATUS.PUBLISHED);
    assert(bundle.id, 'bundle should have id');
    assert(bundle.publishedAt, 'bundle should have publishedAt');

    assert.throws(() => {
      store.saveBundle({
        id: bundle.id,
        workspaceId: workspace.id,
        status: BUNDLE_STATUS.PUBLISHED,
        sources: [{ kind: 'url', url: 'https://example.com/DIFFERENT' }],
        assets: []
      });
    }, /immutable/i);

    const bundles = store.listBundles();
    assert.strictEqual(bundles.length, 1);
    assert.strictEqual(bundles[0].id, bundle.id);
  });

  await test('supports review requests list/save with normalized defaults', async () => {
    const workspace = store.saveWorkspace({ title: 'ws2' });
    const bundle = store.saveBundle({
      workspaceId: workspace.id,
      status: BUNDLE_STATUS.PUBLISHED,
      sources: [{ kind: 'url', url: 'https://example.com/b' }],
      assets: [{ kind: 'note', title: 'n', body: 'b' }]
    });

    const request = store.saveReviewRequest({
      workspaceId: workspace.id,
      bundleId: bundle.id,
      requestedBy: 'tester',
      status: REVIEW_REQUEST_STATUS.OPEN
    });

    const normalized = normalizeReviewRequest(request);
    assert.strictEqual(normalized.workspaceId, workspace.id);
    assert.strictEqual(normalized.bundleId, bundle.id);
    assert.strictEqual(normalized.status, REVIEW_REQUEST_STATUS.OPEN);

    const all = store.listReviewRequests();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, request.id);
  });

  await test('fingerprints sources deterministically after normalization', async () => {
    const left = fingerprintSource({ url: 'https://example.com/x', kind: 'url', title: 'X' });
    const right = fingerprintSource({ kind: 'url', title: 'X', url: 'https://example.com/x' });
    assert.strictEqual(left, right);
    assert.strictEqual(left.length, 64, 'fingerprint should be hex sha256');
  });

  await test('appends and lists audit entries', async () => {
    const workspace = store.saveWorkspace({ title: 'ws3' });

    const first = store.appendAuditEntry(workspace.id, {
      kind: 'workspace_created',
      actor: 'tester',
      message: 'Created'
    });
    const second = store.appendAuditEntry(workspace.id, {
      kind: 'bundle_published',
      actor: 'tester',
      message: 'Published'
    });

    const normalizedFirst = normalizeAuditEntry(first);
    const normalizedSecond = normalizeAuditEntry(second);
    assert.strictEqual(normalizedFirst.workspaceId, workspace.id);
    assert.strictEqual(normalizedSecond.workspaceId, workspace.id);

    const entries = store.listAuditEntries(workspace.id);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].id, first.id);
    assert.strictEqual(entries[1].id, second.id);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  cleanup();
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});

