# Enterprise Research Asset Workbench V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing browser-first brainstorming product into a V1 enterprise research asset workbench with first-class workspaces, published asset bundles, governance, and audit boundaries.

**Architecture:** Reuse the current `/app` browser shell and `web-session-manager.cjs` orchestration layer, but split research asset persistence into dedicated helpers so mutable workspaces and immutable published bundles have different lifecycle rules. Keep user-visible workbench interactions in the existing HTML shell, keep APIs in `server.cjs`, and enforce lifecycle / governance rules in service-layer modules rather than only in the UI.

**Tech Stack:** Node.js CommonJS (`fs`, `path`, `crypto`, existing zero-dependency server stack), HTML/CSS/vanilla browser JS in `web-app-shell.html`, existing brainstorm-server Node test harness.

**Spec:** `docs/superpowers/specs/2026-03-26-enterprise-research-asset-workbench-design.md`

**OpenSpec Change:** `openspec/changes/enterprise-research-asset-workbench-v1/`

---

## File Map

- **Create:** `skills/brainstorming/scripts/research-asset-model.cjs` — status enums, normalization helpers, fingerprint helpers, immutable-field helpers
- **Create:** `skills/brainstorming/scripts/research-asset-store.cjs` — persistence for workspaces, bundles, review requests, and audit entries under the brainstorming data directory
- **Modify:** `skills/brainstorming/scripts/web-session-manager.cjs` — research lifecycle orchestration, publish gating, clone flow, checkpoint triggers
- **Modify:** `skills/brainstorming/scripts/server.cjs` — `/api/assets`, publish, review-request, and audit endpoints
- **Modify:** `skills/brainstorming/scripts/web-app-shell.html` — asset library, published bundle preview, publish-review view, request queue UI
- **Modify:** `tests/brainstorm-server/package.json` — include new targeted research asset tests in the local test script
- **Test Create:** `tests/brainstorm-server/research-asset-store.test.js`
- **Test Create:** `tests/brainstorm-server/research-asset-lifecycle.test.js`
- **Test Create:** `tests/brainstorm-server/research-asset-api.test.js`
- **Test Create:** `tests/brainstorm-server/research-asset-governance.test.js`
- **Test Modify:** `tests/brainstorm-server/web-product.test.js`

---

## Spec-to-Task Coverage

- **Single root question / object dictionary / lifecycle enums** → Task 1, Task 2
- **Evidence freeze rules / fingerprint / copy-on-edit** → Task 1, Task 2
- **Promotion path `Evidence -> Judgment -> Conclusion`** → Task 2
- **Publish checklist 8 hard rules** → Task 2, Task 3
- **Published snapshot include/exclude rules + versioning + revoke/archive semantics** → Task 3
- **RBAC / ReviewRequest / audit fields and required actions** → Task 3
- **Asset library / workspace / publish review / permissions & audit / request queue UI** → Task 4
- **Full regression + OpenSpec completion tracking** → Task 5

---

## Task 1: Add Research Asset Model and Store

**Files:**
- Create: `skills/brainstorming/scripts/research-asset-model.cjs`
- Create: `skills/brainstorming/scripts/research-asset-store.cjs`
- Test: `tests/brainstorm-server/research-asset-store.test.js`

- [ ] **Step 1: Write the failing store/model test**

```js
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  WORKSPACE_STATUS,
  EVIDENCE_STATUS,
  REVIEW_REQUEST_STATUS,
  computeSourceFingerprint,
  normalizeWorkspace,
  normalizeBundle,
  normalizeReviewRequest,
  createAuditEntry
} = require('../../skills/brainstorming/scripts/research-asset-model.cjs');
const { createResearchAssetStore } = require('../../skills/brainstorming/scripts/research-asset-store.cjs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-asset-store-'));
const store = createResearchAssetStore({ dataDir: tempDir });
const workspace = normalizeWorkspace({ title: 'Market Entry', team: 'strategy', owner: 'u1' });
const bundle = normalizeBundle({ title: 'Market Entry Bundle', team: 'strategy', version: 1, sourceWorkspaceId: workspace.id });
const request = normalizeReviewRequest({ type: 'publish-approval', targetType: 'Workspace', targetId: workspace.id, requesterId: 'u1', assigneeId: 'u2' });
const audit = createAuditEntry({ actorId: 'u1', actorRole: 'Owner', action: 'publish', targetType: 'ResearchAssetBundle', targetId: bundle.id, assetVersion: 1 });

assert.equal(workspace.status, WORKSPACE_STATUS.DRAFT);
assert.equal(request.status, REVIEW_REQUEST_STATUS.OPEN);
assert.ok(EVIDENCE_STATUS.VERIFIED);
const fingerprint = computeSourceFingerprint({
  sourceType: 'web',
  canonicalSourceId: 'https://example.com/a',
  sourceLocator: 'url#summary',
  excerpt: 'Example quote'
});
assert.equal(typeof fingerprint, 'string');
assert.equal(fingerprint.length, 64);

store.saveWorkspace(workspace);
store.saveBundle(bundle);
store.saveReviewRequest(request);
store.appendAuditEntry(audit);

assert.equal(store.listWorkspaces().length, 1);
assert.equal(store.listBundles().length, 1);
assert.equal(store.listOpenReviewRequests().length, 1);
assert.equal(store.listAuditEntries({ targetId: bundle.id }).length, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/brainstorm-server && node research-asset-store.test.js`
Expected: FAIL with missing module errors for `research-asset-model.cjs` / `research-asset-store.cjs`

- [ ] **Step 3: Write minimal model and store implementation**

```js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKSPACE_STATUS = Object.freeze({
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  READY_FOR_PUBLISH: 'ReadyForPublish',
  ARCHIVED: 'Archived'
});
const EVIDENCE_STATUS = Object.freeze({
  COLLECTED: 'Collected',
  REVIEWED: 'Reviewed',
  VERIFIED: 'Verified',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected'
});
const REVIEW_REQUEST_STATUS = Object.freeze({
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected'
});

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeWorkspace(input) {
  return {
    id: input.id || createId('workspace'),
    title: input.title,
    team: input.team,
    owner: input.owner,
    status: input.status || WORKSPACE_STATUS.DRAFT,
    rootQuestionId: input.rootQuestionId || null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

function normalizeBundle(input) {
  return {
    id: input.id || createId('bundle'),
    title: input.title,
    team: input.team,
    version: input.version,
    sourceWorkspaceId: input.sourceWorkspaceId,
    status: input.status || 'Published',
    publishSummary: input.publishSummary || '',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

function normalizeReviewRequest(input) {
  return {
    id: input.id || createId('review-request'),
    type: input.type,
    status: input.status || REVIEW_REQUEST_STATUS.OPEN,
    targetType: input.targetType,
    targetId: input.targetId,
    requesterId: input.requesterId,
    assigneeId: input.assigneeId,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

function createAuditEntry(input) {
  return {
    timestamp: input.timestamp || new Date().toISOString(),
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    assetVersion: input.assetVersion || null,
    before: input.before || null,
    after: input.after || null,
    reason: input.reason || '',
    details: input.details || {}
  };
}

function computeSourceFingerprint(input) {
  const payload = [
    input.sourceType,
    input.canonicalSourceId,
    input.sourceLocator,
    String(input.excerpt || '').trim().replace(/\s+/g, ' ')
  ].join('::');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function createResearchAssetStore({ dataDir }) {
  const rootDir = path.join(dataDir, 'research-assets');
  const workspacesDir = path.join(rootDir, 'workspaces');
  const bundlesDir = path.join(rootDir, 'bundles');
  const requestsDir = path.join(rootDir, 'review-requests');
  const auditPath = path.join(rootDir, 'audit-log.jsonl');
  fs.mkdirSync(workspacesDir, { recursive: true });
  fs.mkdirSync(bundlesDir, { recursive: true });
  fs.mkdirSync(requestsDir, { recursive: true });
  return {
    saveWorkspace(workspace) {
      fs.writeFileSync(path.join(workspacesDir, `${workspace.id}.json`), JSON.stringify(workspace, null, 2));
    },
    listWorkspaces() {
      return fs.readdirSync(workspacesDir).map((entry) => JSON.parse(fs.readFileSync(path.join(workspacesDir, entry), 'utf8')));
    },
    saveBundle(bundle) {
      fs.writeFileSync(path.join(bundlesDir, `${bundle.id}.json`), JSON.stringify(bundle, null, 2));
    },
    listBundles() {
      return fs.readdirSync(bundlesDir).map((entry) => JSON.parse(fs.readFileSync(path.join(bundlesDir, entry), 'utf8')));
    },
    saveReviewRequest(request) {
      fs.writeFileSync(path.join(requestsDir, `${request.id}.json`), JSON.stringify(request, null, 2));
    },
    listOpenReviewRequests() {
      return fs.readdirSync(requestsDir)
        .map((entry) => JSON.parse(fs.readFileSync(path.join(requestsDir, entry), 'utf8')))
        .filter((item) => item.status === REVIEW_REQUEST_STATUS.OPEN);
    },
    appendAuditEntry(entry) {
      fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
    },
    listAuditEntries(filter = {}) {
      if (!fs.existsSync(auditPath)) return [];
      return fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((entry) => !filter.targetId || entry.targetId === filter.targetId);
    }
  };
}

module.exports = {
  WORKSPACE_STATUS,
  EVIDENCE_STATUS,
  REVIEW_REQUEST_STATUS,
  computeSourceFingerprint,
  normalizeWorkspace,
  normalizeBundle,
  normalizeReviewRequest,
  createAuditEntry,
  createResearchAssetStore
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/brainstorm-server && node research-asset-store.test.js`
Expected: PASS with one normalized workspace persisted and reloaded

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/scripts/research-asset-model.cjs skills/brainstorming/scripts/research-asset-store.cjs tests/brainstorm-server/research-asset-store.test.js
git commit -m "feat: add research asset model and store"
```

---

## Task 2: Implement Workspace Lifecycle and Publish Gating

**Files:**
- Modify: `skills/brainstorming/scripts/web-session-manager.cjs`
- Modify: `skills/brainstorming/scripts/workflow-checkpoint-store.cjs`
- Test: `tests/brainstorm-server/research-asset-lifecycle.test.js`

- [ ] **Step 1: Write the failing lifecycle test**

```js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSessionManager } = require('../../skills/brainstorming/scripts/web-session-manager.cjs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-lifecycle-test-'));
const manager = createSessionManager({
  dataDir: tempDir,
  runtimeAdapter: { nextMessage: async () => null }
});

const session = manager.createSession({ seedPrompt: 'Should we enter market X?' });
manager.attachResearchWorkspace(session.id, { title: 'Market X', team: 'strategy', owner: 'u1' });

assert.throws(() => manager.addRootResearchQuestion(session.id, { title: 'Second root' }), /single root/i);
assert.throws(() => manager.acceptEvidence(session.id, 'ev-1'), /Verified/i);

const publishResult = manager.validateWorkspaceForPublish({
  status: 'Active',
  rootQuestion: null,
  confirmedJudgments: [{ id: 'j1', evidenceRefs: [] }],
  acceptedEvidence: [{ id: 'e1', sourceFingerprint: null, sourceLocator: null, capturedAt: null, collector: null }],
  conclusion: { status: 'Draft', judgmentRefs: [], openRisks: [], nextActions: [] },
  activeHypotheses: [{ id: 'h1' }],
  conclusionOpenRisksMentionActiveBranches: false,
  evidence: [{ id: 'e2', status: 'Reviewed' }]
});
assert.deepStrictEqual(publishResult.errorCodes.sort(), [
  'root-question-missing',
  'active-branch-risk-missing',
  'conclusion-not-ready',
  'evidence-metadata-missing',
  'judgment-missing-accepted-evidence',
  'reviewed-evidence-unresolved',
  'workspace-not-ready-for-publish'
]);

const missingJudgment = manager.validateWorkspaceForPublish({
  status: 'ReadyForPublish',
  rootQuestion: { id: 'rq-1' },
  confirmedJudgments: [],
  acceptedEvidence: [],
  conclusion: { status: 'Ready', judgmentRefs: [], openRisks: ['h1 still active'], nextActions: ['resolve'] },
  activeHypotheses: [],
  conclusionOpenRisksMentionActiveBranches: true,
  evidence: []
});
assert.ok(missingJudgment.errorCodes.includes('confirmed-judgment-missing'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/brainstorm-server && node research-asset-lifecycle.test.js`
Expected: FAIL because research lifecycle helpers do not exist on `web-session-manager.cjs`

- [ ] **Step 3: Add lifecycle helpers, promotion guards, and checkpoint triggers**

```js
function assertSingleRootQuestion(workspace, question) {
  if (workspace.rootQuestionId) {
    throw new Error('Workspace must keep a single root research question');
  }
  workspace.rootQuestionId = question.id;
}

function assertFrozenEvidenceFields(previousRecord, nextRecord) {
  const frozen = ['sourceType', 'sourceLocator', 'excerpt', 'sourceFingerprint'];
  for (const field of frozen) {
    if (previousRecord[field] !== nextRecord[field]) {
      throw new Error(`Evidence field ${field} is immutable after verification`);
    }
  }
}

function acceptEvidence(evidence) {
  if (evidence.status !== 'Verified') {
    throw new Error('Evidence must be Verified before it can be Accepted');
  }
  return { ...evidence, status: 'Accepted', acceptedAt: new Date().toISOString() };
}

function confirmJudgment(judgment, evidenceRecords) {
  const acceptedEvidenceIds = new Set(
    evidenceRecords.filter((item) => item.status === 'Accepted').map((item) => item.id)
  );
  const allRefsAccepted = Array.isArray(judgment.evidenceRefs)
    && judgment.evidenceRefs.length > 0
    && judgment.evidenceRefs.every((id) => acceptedEvidenceIds.has(id));
  if (!allRefsAccepted) {
    throw new Error('Judgment requires Accepted Evidence');
  }
  return { ...judgment, status: 'Confirmed' };
}

function validateWorkspaceForPublish(workspaceSnapshot) {
  const errorCodes = [];
  if (!workspaceSnapshot.rootQuestion) errorCodes.push('root-question-missing');
  if (!workspaceSnapshot.confirmedJudgments.length) errorCodes.push('confirmed-judgment-missing');
  if (workspaceSnapshot.confirmedJudgments.some((item) => !item.evidenceRefs.length)) {
    errorCodes.push('judgment-missing-accepted-evidence');
  }
  if (workspaceSnapshot.acceptedEvidence.some((item) => !item.sourceFingerprint || !item.sourceLocator || !item.capturedAt || !item.collector)) {
    errorCodes.push('evidence-metadata-missing');
  }
  if (!workspaceSnapshot.conclusion
    || workspaceSnapshot.conclusion.status !== 'Ready'
    || !workspaceSnapshot.conclusion.judgmentRefs?.length
    || !workspaceSnapshot.conclusion.openRisks?.length
    || !workspaceSnapshot.conclusion.nextActions?.length) {
    errorCodes.push('conclusion-not-ready');
  }
  if (workspaceSnapshot.confirmedJudgments.some((item) => !item.evidenceRefs?.length)) {
    errorCodes.push('judgment-missing-accepted-evidence');
  }
  if (workspaceSnapshot.status !== 'ReadyForPublish') errorCodes.push('workspace-not-ready-for-publish');
  if (workspaceSnapshot.activeHypotheses.length && !workspaceSnapshot.conclusion.openRisksMentionActiveBranches) {
    errorCodes.push('active-branch-risk-missing');
  }
  if (workspaceSnapshot.evidence.some((item) => item.status === 'Reviewed')) {
    errorCodes.push('reviewed-evidence-unresolved');
  }
  return { ok: errorCodes.length === 0, errorCodes };
}
```

- [ ] **Step 4: Run lifecycle tests**

Run: `cd tests/brainstorm-server && node research-asset-lifecycle.test.js`
Expected: PASS with root-question guard, evidence promotion guard, and checkpoint emission verified

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/scripts/web-session-manager.cjs skills/brainstorming/scripts/workflow-checkpoint-store.cjs tests/brainstorm-server/research-asset-lifecycle.test.js
git commit -m "feat: add research asset lifecycle guards"
```

---

## Task 3: Add Publish Snapshots, RBAC, and Audit APIs

**Files:**
- Modify: `skills/brainstorming/scripts/server.cjs`
- Modify: `skills/brainstorming/scripts/web-session-manager.cjs`
- Test: `tests/brainstorm-server/research-asset-api.test.js`
- Test: `tests/brainstorm-server/research-asset-governance.test.js`

- [ ] **Step 1: Write failing API and governance tests**

```js
const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/server.cjs');

function request(method, route, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3335,
      path: route,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

(async () => {
  const server = spawn('node', [SERVER_PATH], {
    env: { ...process.env, BRAINSTORM_PORT: 3335, BRAINSTORM_RUNTIME_MODE: 'fake' }
  });

  try {
    const assetList = JSON.parse((await request('GET', '/api/assets')).body);
    assert.ok(Array.isArray(assetList.items));

    const forbidden = await request('POST', '/api/assets/a1/revoke', null, { 'x-role': 'Editor' });
    assert.equal(forbidden.status, 403);

    const auditorAudit = await request('GET', '/api/audit?targetId=a1', null, { 'x-role': 'Auditor' });
    assert.equal(auditorAudit.status, 200);
    const auditPayload = JSON.parse(auditorAudit.body);
    assert.ok(auditPayload.items[0].timestamp);
    assert.ok(auditPayload.items[0].before);
    assert.ok(auditPayload.items[0].after);

    const invalidReviewReq = await request('POST', '/api/review-requests', {
      type: 'publish-approval',
      targetType: 'Workspace',
      targetId: 'ws-not-ready'
    }, { 'x-role': 'Editor' });
    assert.equal(invalidReviewReq.status, 400);
  } finally {
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `cd tests/brainstorm-server && node research-asset-api.test.js && node research-asset-governance.test.js`
Expected: FAIL because `/api/assets` routes and governance checks do not exist yet

- [ ] **Step 3: Implement asset routes, publish snapshot creation, RBAC, and audit writes**

```js
if (req.method === 'GET' && req.url === '/api/assets') {
  return writeJson(res, 200, { items: manager.listResearchAssets() });
}

if (req.method === 'GET' && req.url.startsWith('/api/audit')) {
  manager.assertAllowed(getRole(req), 'audit:view');
  return writeJson(res, 200, { items: manager.listAuditEntries(getQuery(req)) });
}

if (req.method === 'POST' && req.url === '/api/review-requests') {
  const role = getRole(req);
  manager.assertAllowed(role, 'review-request:create');
  return writeJson(res, 200, manager.createReviewRequest(body));
}

if (req.method === 'POST' && req.url.match(/^\/api\/workspaces\/[^/]+\/publish$/)) {
  const role = getRole(req);
  manager.assertAllowed(role, 'publish');
  const result = manager.publishWorkspace(workspaceId, {
    actorId: getActor(req),
    reason: body.publishSummary
  });
  return writeJson(res, 200, result);
}

function buildBundleSnapshot(workspaceSnapshot, nextVersion) {
  return {
    version: nextVersion,
    includedHypotheses: workspaceSnapshot.hypotheses.filter((item) => item.status === 'Active' || item.status === 'Parked' || item.status === 'Superseded'),
    includedEvidence: workspaceSnapshot.acceptedEvidence.filter((item) => workspaceSnapshot.confirmedJudgments.some((judgment) => judgment.evidenceRefs.includes(item.id))),
    excludedEvidence: workspaceSnapshot.evidence.filter((item) => item.status === 'Reviewed' || item.status === 'Rejected').map((item) => item.id),
    checkpointRefs: workspaceSnapshot.checkpoints.map((item) => item.id),
    auditRefs: workspaceSnapshot.auditEntries.map((item) => item.timestamp)
  };
}

function writeGovernedAudit(action, context) {
  return manager.appendAuditEntry({
    timestamp: new Date().toISOString(),
    actorId: context.actorId,
    actorRole: context.actorRole,
    action,
    targetType: context.targetType,
    targetId: context.targetId,
    assetVersion: context.assetVersion,
    before: context.before,
    after: context.after,
    reason: context.reason,
    details: context.details
  });
}
```

必做审计动作：

- `publish`
- `revoke_publish`
- `permission_change`
- `evidence_verify`
- `evidence_accept`
- `export`
- `cross_team_share`

- [ ] **Step 4: Run API and governance tests**

Run: `cd tests/brainstorm-server && node research-asset-api.test.js && node research-asset-governance.test.js`
Expected: PASS with asset listing, publish/revoke RBAC, review-request validation, snapshot include/exclude rules, version incrementing, and audit field assertions verified

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/scripts/server.cjs skills/brainstorming/scripts/web-session-manager.cjs tests/brainstorm-server/research-asset-api.test.js tests/brainstorm-server/research-asset-governance.test.js
git commit -m "feat: add research asset publish and governance APIs"
```

---

## Task 4: Update the Browser Workbench UI

**Files:**
- Modify: `skills/brainstorming/scripts/web-app-shell.html`
- Test: `tests/brainstorm-server/web-product.test.js`

- [ ] **Step 1: Extend the UI test with research asset expectations**

```js
assert.match(html, /Research Assets/i);
assert.match(html, /Project Library/i);
assert.match(html, /Research Workspace/i);
assert.match(html, /Publish Review/i);
assert.match(html, /Permissions & Audit/i);
assert.match(html, /Review Requests/i);
assert.doesNotMatch(html, /developer inspection/i);
```

- [ ] **Step 2: Run the browser product test to verify it fails**

Run: `cd tests/brainstorm-server && node web-product.test.js`
Expected: FAIL because the workbench does not yet render research asset library or publish review surfaces

- [ ] **Step 3: Implement the workbench surfaces**

```html
<aside class="project-library-card" data-panel="project-library">
  <h3>Project Library</h3>
  <div data-role="workspace-list"></div>
  <div data-role="asset-list"></div>
</aside>

<main class="research-workspace-card" data-panel="workspace">
  <h2>Research Workspace</h2>
  <div data-role="workspace-canvas"></div>
</main>

<section class="publish-review-card" data-panel="publish-review" hidden>
  <h3>Publish Review</h3>
  <div data-role="publish-checks"></div>
  <button data-action="publish-workspace">Publish bundle</button>
</section>

<section class="governance-card" data-panel="governance">
  <h3>Permissions & Audit</h3>
  <div data-role="audit-list"></div>
  <div data-role="review-request-queue"></div>
</section>
```

- [ ] **Step 4: Re-run the browser product test**

Run: `cd tests/brainstorm-server && node web-product.test.js`
Expected: PASS with asset library and publish-review cards rendered, while developer-only inspection remains hidden

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/scripts/web-app-shell.html tests/brainstorm-server/web-product.test.js
git commit -m "feat: add research asset workbench UI"
```

---

## Task 5: Full Regression and Apply Readiness

**Files:**
- Modify: `openspec/changes/enterprise-research-asset-workbench-v1/tasks.md`
- Test: `tests/brainstorm-server/package.json`

- [ ] **Step 1: Add the new tests to the brainstorm-server test script**

```json
{
  "scripts": {
    "test": "node server.test.js && node structured-host.test.js && node structured-runtime.test.js && node codex-runtime-adapter.test.js && node codex-app-server-client.test.js && node codex-app-server-provider.test.js && node codex-exec-runner.test.js && node codex-exec-provider.test.js && node workflow-artifact-engine.test.js && node workflow-policy.test.js && node brainstorm-quality-fixtures.test.js && node web-session-manager.test.js && node web-product.test.js && node research-asset-store.test.js && node research-asset-lifecycle.test.js && node research-asset-api.test.js && node research-asset-governance.test.js && bash codex-background-guard.test.sh"
  }
}
```

- [ ] **Step 2: Run the full targeted suite**

Run: `npm --prefix tests/brainstorm-server test`
Expected: PASS across existing brainstorm-server coverage plus new research asset coverage

- [ ] **Step 3: Mark the OpenSpec task checklist items that were completed during implementation**

```md
- [x] 1.1 Add a dedicated research asset schema/helper module...
- [x] 1.2 Add a research asset store...
```

- [ ] **Step 4: Validate the OpenSpec change again**

Run: `openspec validate "enterprise-research-asset-workbench-v1" --type change --strict`
Expected: `Change 'enterprise-research-asset-workbench-v1' is valid`

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/scripts tests/brainstorm-server openspec/changes/enterprise-research-asset-workbench-v1/tasks.md
git commit -m "feat: implement research asset workbench v1"
```
