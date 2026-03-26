const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MANAGER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/web-session-manager.cjs');
const STORE_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/research-asset-store.cjs');

let createSessionManager;
let createResearchAssetStore;
try {
  ({ createSessionManager } = require(MANAGER_PATH));
  ({ createResearchAssetStore } = require(STORE_PATH));
} catch (error) {
  console.error(`Cannot load research lifecycle dependencies: ${error.message}`);
  process.exit(1);
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-research-lifecycle-'));
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

  console.log('\n--- Research Asset Lifecycle ---');

  await test('enforces a single root research question per workspace', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'fake',
          providerSession: null,
          currentQuestionId: 'root-goal',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'root-goal',
            title: 'Primary outcome',
            description: '',
            options: [],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'artifact' });

    const workspace = manager.attachResearchWorkspace(session.id, {
      title: 'Market Entry',
      team: 'strategy',
      owner: 'u1'
    });
    const root = manager.addRootResearchQuestion(session.id, {
      workspaceId: workspace.id,
      title: 'Should we enter market X?'
    });

    assert.ok(root.id);
    assert.throws(() => {
      manager.addRootResearchQuestion(session.id, {
        workspaceId: workspace.id,
        title: 'Second root'
      });
    }, /single root/i);
  });

  await test('blocks publish until workspace satisfies the required release gates', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'fake',
          providerSession: null,
          currentQuestionId: 'root-goal',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'root-goal',
            title: 'Primary outcome',
            description: '',
            options: [],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'artifact' });
    const workspace = manager.attachResearchWorkspace(session.id, {
      title: 'Market Entry',
      team: 'strategy',
      owner: 'u1'
    });

    manager.addRootResearchQuestion(session.id, {
      workspaceId: workspace.id,
      title: 'Should we enter market X?'
    });

    const validation = manager.validateWorkspaceForPublish(session.id);
    assert.strictEqual(validation.ok, false);
    assert(validation.errorCodes.includes('confirmed-judgment-missing'));
    assert(validation.errorCodes.includes('conclusion-not-ready'));
    assert(validation.errorCodes.includes('workspace-not-ready-for-publish'));
  });

  await test('creates a collected copy when revising a frozen evidence source', async (tmpDir) => {
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter: { async createSession() { return {}; } } });
    const store = createResearchAssetStore({ dataDir: tmpDir });
    const workspace = store.saveWorkspace({
      id: 'workspace-frozen-evidence',
      title: 'Evidence freeze',
      team: 'strategy',
      owner: 'u1',
      status: 'active',
      rootQuestionId: 'rq-1',
      researchQuestion: { id: 'rq-1', title: 'Question' },
      evidence: [{
        id: 'ev-1',
        status: 'verified',
        sourceFingerprint: 'abc123',
        sourceLocator: 'url#old',
        capturedAt: '2026-03-26T00:00:00.000Z',
        collector: 'user-1'
      }]
    });

    const revised = manager.reviseWorkspaceEvidenceSource(workspace.id, 'ev-1', {
      sourceLocator: 'url#new'
    }, {
      actorId: 'editor-1',
      actorRole: 'Editor'
    });

    assert.notStrictEqual(revised.id, 'ev-1');
    assert.strictEqual(revised.status, 'collected');
    assert.strictEqual(revised.supersedesEvidenceId, 'ev-1');

    const refreshed = manager.getResearchWorkspace(workspace.id);
    assert.strictEqual(refreshed.evidence.length, 2);
    assert.strictEqual(refreshed.evidence.find((item) => item.id === 'ev-1').status, 'verified');
  });

  await test('blocks judgment confirmation without accepted evidence and creates ready-for-publish checkpoint once fixed', async (tmpDir) => {
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter: { async createSession() { return {}; } } });
    const store = createResearchAssetStore({ dataDir: tmpDir });
    const workspace = store.saveWorkspace({
      id: 'workspace-promotion',
      title: 'Promotion path',
      team: 'strategy',
      owner: 'u1',
      status: 'active',
      rootQuestionId: 'rq-1',
      researchQuestion: { id: 'rq-1', title: 'Question' },
      hypotheses: [{ id: 'h-1', status: 'parked', title: 'Preserved branch' }],
      evidence: [{
        id: 'ev-1',
        status: 'reviewed',
        sourceFingerprint: 'abc123',
        sourceLocator: 'url#fragment',
        capturedAt: '2026-03-26T00:00:00.000Z',
        collector: 'user-1'
      }],
      judgments: [{
        id: 'j-1',
        status: 'draft',
        evidenceRefs: ['ev-1']
      }],
      conclusion: {
        id: 'c-1',
        status: 'ready',
        judgmentRefs: ['j-1'],
        openRisks: ['Need diligence'],
        nextActions: ['Prepare memo']
      }
    });

    assert.throws(() => {
      manager.confirmJudgment(workspace.id, 'j-1', {
        actorId: 'owner-1',
        actorRole: 'Owner'
      });
    }, /Accepted Evidence/i);

    const verified = manager.verifyWorkspaceEvidence(workspace.id, 'ev-1', {
      actorId: 'editor-1',
      actorRole: 'Editor'
    });
    assert.strictEqual(verified.status, 'verified');

    const accepted = manager.acceptWorkspaceEvidence(workspace.id, 'ev-1', {
      actorId: 'editor-1',
      actorRole: 'Editor'
    });
    assert.strictEqual(accepted.status, 'accepted');

    const judgment = manager.confirmJudgment(workspace.id, 'j-1', {
      actorId: 'owner-1',
      actorRole: 'Owner'
    });
    assert.strictEqual(judgment.status, 'confirmed');

    const ready = manager.markWorkspaceReadyForPublish(workspace.id, {
      actorId: 'owner-1',
      actorRole: 'Owner'
    });
    assert.strictEqual(ready.workspace.status, 'ready_for_publish');
    assert.strictEqual(ready.validation.ok, true);
    assert(ready.workspace.checkpoints.some((item) => item.triggerType === 'workspace_ready_for_publish'));
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
