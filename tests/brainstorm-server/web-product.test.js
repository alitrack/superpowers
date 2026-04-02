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

async function waitForSession(sessionId, predicate, timeoutMs = 5000, intervalMs = 25) {
  const deadline = Date.now() + timeoutMs;
  let lastSession = null;

  while (Date.now() < deadline) {
    const res = await request('GET', `/api/sessions/${sessionId}`);
    if (res.status === 200) {
      lastSession = JSON.parse(res.body);
      if (predicate(lastSession)) {
        return lastSession;
      }
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for session ${sessionId}: ${JSON.stringify(lastSession, null, 2)}`);
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
    cwd: TEST_DIR,
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

    await test('serves the brainstorming canvas workspace shell at /app', async () => {
      const res = await request('GET', '/app');
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('brainstorm-workbench'));
      assert(res.body.includes('tree-canvas-stage'));
      assert(res.body.includes('brainstorm-graph-root'));
      assert(res.body.includes('data-graph-engine="xyflow"'));
      assert(res.body.includes('canvas-inspector-drawer'));
      assert(res.body.includes('workspace-mode-toggle'));
      assert(res.body.includes('workflow-stage-strip'));
      assert(res.body.includes('request-status-panel'));
      assert(res.body.includes('request-status-copy'));
      assert(res.body.includes('request-status-retry'));
      assert(res.body.includes('request-status-cancel'));
      assert(res.body.includes('history-toggle-button'));
      assert(res.body.includes('Decision Graph'));
      assert(res.body.includes('Start Another Topic'));
      assert(res.body.indexOf('id="new-brainstorm-dock"') < res.body.indexOf('<main class="workspace">'));
      assert(res.body.indexOf('id="workflow-stage-strip"') < res.body.indexOf('<main class="workspace">'));
      assert(res.body.indexOf('id="request-status-panel"') < res.body.indexOf('<main class="workspace">'));
      assert(res.body.includes('Focused View'));
      assert(res.body.includes('Overview'));
      assert(res.body.includes('Start from one real topic, keep one active node, and let the result converge on the same canvas.'));
      assert(res.body.includes('BrainstormGraphClient'));
      assert(res.body.includes('Creating artifact session'));
      assert(res.body.includes('Submitting answer'));
      assert(res.body.includes('Moved to the next question'));
      assert(res.body.includes('The graph advanced to the next question and refocused the active node.'));
      assert(res.body.includes('Try again'));
      assert(res.body.includes('Cancel'));
      assert(res.body.includes('Open Full History'));
      assert(res.body.includes('Confirm Delete'));
      assert(!res.body.includes('window.confirm('));
      assert(res.body.includes('completion-package-grid'));
      assert(!res.body.includes("workflowMode: 'full_skill'"));
      assert(res.body.includes('<textarea id="persistent-seed-input"'));
      assert(!res.body.includes('<!-- BRAINSTORM_GRAPH_CLIENT_SCRIPT -->'));
      assert(!res.body.includes('<!-- STRUCTURED_HOST_SCRIPT -->'));
      assert(!res.body.includes('<!-- BRAINSTORM_MAINSTAGE_SCRIPT -->'));
      assert(!res.body.includes('<!-- BRAINSTORM_GRAPH_CLIENT_CSS -->'));
      assert(!res.body.includes('window.BrainstormGraphClient ='));
      assert(!res.body.includes('decision-tree-panel'));
      assert(!res.body.includes('active-stage-panel'));
      assert(!res.body.includes('context-panel'));
      assert(!res.body.includes('id="canvas-topic-root"'));
      assert(!res.body.includes('id="canvas-active-node"'));
      assert(!res.body.includes('id="canvas-convergence-cluster"'));
      assert(!res.body.includes('id="canvas-artifact-node"'));
      assert(!res.body.includes('Research Asset Workbench'));
      assert(!res.body.includes('V1 Governance Lens'));
      assert(!res.body.includes('Research Assets'));
      assert(!res.body.includes('Publish Review'));
    });

    await test('serves the rebuilt graph bundle in top-down tree mode', async () => {
      const bundlePath = path.join(__dirname, '../../skills/brainstorming/scripts/web-graph-client.bundle.js');
      const bundle = fs.readFileSync(bundlePath, 'utf-8');
      assert(bundle.includes('rankdir: "TB"') || bundle.includes("rankdir: 'TB'"));
    });

    await test('bundle preserves manual node positions and lets readonly branch nodes switch context from interactive content', async () => {
      const bundlePath = path.join(__dirname, '../../skills/brainstorming/scripts/web-graph-client.bundle.js');
      const bundle = fs.readFileSync(bundlePath, 'utf-8');
      assert(bundle.includes('manualPositionsRef'), 'expected graph client to preserve manual node positions across rerenders');
      assert(bundle.includes('if (data.readOnly)'), 'expected readonly graph nodes to branch on readonly click handling');
      assert(bundle.includes('data.onInspect();'), 'expected readonly interactive content to forward clicks into branch inspection');
    });

    await test('bundle disables graph keyboard shortcuts that can interfere with IME text entry', async () => {
      const bundlePath = path.join(__dirname, '../../skills/brainstorming/scripts/web-graph-client.bundle.js');
      const bundle = fs.readFileSync(bundlePath, 'utf-8');
      assert(bundle.includes('deleteKeyCode: null'), 'expected graph keyboard delete shortcut to be disabled');
      assert(bundle.includes('selectionKeyCode: null'), 'expected graph keyboard selection shortcut to be disabled');
      assert(bundle.includes('panActivationKeyCode: null'), 'expected graph keyboard pan shortcut to be disabled');
      assert(bundle.includes('zoomActivationKeyCode: null'), 'expected graph keyboard zoom shortcut to be disabled');
      assert(bundle.includes('disableKeyboardA11y: true'), 'expected graph keyboard a11y handlers to be disabled for IME safety');
    });

    await test('does not auto-create an empty session on fresh load', async () => {
      const before = JSON.parse((await request('GET', '/api/sessions')).body);
      assert.deepStrictEqual(before, []);

      await request('GET', '/app');

      const after = JSON.parse((await request('GET', '/api/sessions')).body);
      assert.deepStrictEqual(after, []);
    });

    await test('deletes a session through the API and removes it from subsequent list/get responses', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const deleteRes = await request('DELETE', `/api/sessions/${session.id}`);
      assert.strictEqual(deleteRes.status, 200);
      const deleted = JSON.parse(deleteRes.body);
      assert.strictEqual(deleted.id, session.id);
      assert.strictEqual(deleted.deleted, true);

      const listRes = JSON.parse((await request('GET', '/api/sessions')).body);
      assert(!listRes.some((entry) => entry.id === session.id));

      const missingRes = await request('GET', `/api/sessions/${session.id}`);
      assert.strictEqual(missingRes.status, 404);
    });

    await test('creates isolated sessions through the API', async () => {
      const first = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const second = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const firstReady = await waitForSession(first.id, (session) => (
        session.currentMessage && session.currentMessage.questionId === 'root-goal'
      ));
      const secondReady = await waitForSession(second.id, (session) => (
        session.currentMessage && session.currentMessage.questionId === 'root-goal'
      ));

      assert.notStrictEqual(first.id, second.id);
      assert.strictEqual(first.workflowMode, 'conversation');
      assert.strictEqual(second.workflowMode, 'conversation');
      assert.strictEqual(first.processing.state, 'running');
      assert.strictEqual(second.processing.state, 'running');
      assert.strictEqual(firstReady.currentMessage.questionId, 'root-goal');
      assert.strictEqual(secondReady.currentMessage.questionId, 'root-goal');
    });

    await test('creates a seeded session whose first formal question is not the generic intake question', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
      })).body);
      const ready = await waitForSession(session.id, (current) => (
        current.strategyState
        && current.strategyState.phase === 'reframe'
        && current.currentMessage
        && current.currentMessage.type === 'question'
      ));

      assert.strictEqual(session.seedPrompt, 'We have a brainstorming tool, but it still feels like a form.');
      assert.strictEqual(session.processing.state, 'running');
      assert.strictEqual(ready.strategyState.phase, 'reframe');
      assert.notStrictEqual(ready.currentMessage.questionId, 'root-goal');
      assert.notStrictEqual(ready.currentMessage.title, 'What do you want to improve first?');
    });

    await test('seeded sessions converge to a structured brainstorming result instead of a raw choice echo', async () => {
      const created = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
      })).body);
      const session = await waitForSession(created.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-reframe'
      ));

      assert(session.roundGraph);
      assert.strictEqual(session.roundGraph.activeRoundId, 'round-seed-reframe');

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-reframe',
        answerMode: 'option',
        optionIds: ['fix-facilitation'],
        text: null,
        rawInput: '2'
      });
      const afterReframe = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-directions'
      ));

      assert.strictEqual(afterReframe.currentMessage.questionId, 'seed-directions');
      assert.strictEqual(afterReframe.roundGraph.activeRoundId, 'round-seed-directions');

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-directions',
        answerMode: 'options',
        optionIds: ['facilitation-engine', 'interaction-redesign'],
        text: null,
        rawInput: '1,2'
      });
      const afterDirections = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-criterion'
      ));

      assert.strictEqual(afterDirections.currentMessage.questionId, 'seed-criterion');
      assert.strictEqual(afterDirections.roundGraph.activeRoundId, 'round-seed-criterion');

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-criterion',
        answerMode: 'option',
        optionIds: ['clarity'],
        text: null,
        rawInput: '1'
      });
      const afterCriterion = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-path'
      ));

      assert.strictEqual(afterCriterion.currentMessage.questionId, 'seed-path');
      assert.strictEqual(afterCriterion.roundGraph.activeRoundId, 'round-seed-path');

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-path',
        answerMode: 'option',
        optionIds: ['interaction-redesign'],
        text: null,
        rawInput: '2'
      });
      const completed = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.type === 'summary'
      ));

      assert.strictEqual(completed.currentMessage.type, 'summary');
      assert(completed.currentMessage.title.includes('Recommendation:'));
      assert(completed.currentMessage.text.includes('Recommendation'));
      assert(completed.currentMessage.text.includes('Problem Framing'));
      assert(completed.currentMessage.text.includes('Why This Path Currently Wins'));
      assert(completed.currentMessage.text.includes('Alternatives Still Worth Remembering'));
      assert(completed.currentMessage.text.includes('Next Actions'));
    });

    await test('materializes shortlisted directions into branch runs and preserves sibling branches through selection and continuation', async () => {
      const created = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'Our brainstorming product still feels like a wizard instead of a real workspace.'
      })).body);
      const session = await waitForSession(created.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-reframe'
      ));

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-reframe',
        answerMode: 'option',
        optionIds: ['fix-facilitation'],
        text: null,
        rawInput: '2'
      });
      const afterReframe = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-directions'
      ));

      assert.strictEqual(afterReframe.currentMessage.questionId, 'seed-directions');

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'branch_materialize',
        questionId: 'seed-directions',
        optionIds: ['facilitation-engine', 'interaction-redesign'],
        text: null,
        rawInput: 'facilitation-engine,interaction-redesign'
      });
      const afterMaterialize = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-criterion'
        && current.strategyState
        && Array.isArray(current.strategyState.branchRuns)
        && current.strategyState.branchRuns.length === 2
      ));

      assert.strictEqual(afterMaterialize.currentMessage.questionId, 'seed-criterion');
      assert(Array.isArray(afterMaterialize.strategyState.branchRuns));
      assert.strictEqual(afterMaterialize.strategyState.branchRuns.length, 2);
      assert.strictEqual(afterMaterialize.strategyState.selectedBranchRunId, null);
      assert(afterMaterialize.roundGraph);
      assert.strictEqual(afterMaterialize.roundGraph.activeRoundId, 'round-seed-criterion');
      assert(afterMaterialize.roundGraph.rounds.some((round) => round.id === 'round-seed-directions'));
      assert(afterMaterialize.roundGraph.rounds.some((round) => round.id === 'round-seed-criterion'));
      assert(afterMaterialize.roundGraph.rounds.some((round) => (
        round.id === 'branch-run-question-seed-directions-facilitation-engine'
        && round.questionId === 'seed-criterion'
      )));

      const siblingBranch = afterMaterialize.strategyState.branchRuns.find((branchRun) => (
        branchRun.id === 'branch-run-question-seed-directions-interaction-redesign'
      ));
      assert(siblingBranch);
      assert.strictEqual(siblingBranch.status, 'paused');

      const selectedBranchContext = JSON.parse((await request('POST', `/api/sessions/${session.id}/context`, {
        branchRunId: siblingBranch.id
      })).body);

      assert.strictEqual(selectedBranchContext.strategyState.selectedBranchRunId, siblingBranch.id);
      assert.strictEqual(selectedBranchContext.roundGraph.activeRoundId, siblingBranch.id);
      const activeBranch = selectedBranchContext.strategyState.branchRuns.find((branchRun) => branchRun.id === siblingBranch.id);
      assert(activeBranch);
      assert(activeBranch.currentMessage);
      assert.strictEqual(activeBranch.status, 'active');
      assert.strictEqual(activeBranch.currentMessage.questionId, 'seed-criterion');

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: activeBranch.currentMessage.questionId,
        answerMode: 'option',
        optionIds: ['clarity'],
        text: null,
        rawInput: 'clarity'
      });
      const continuedBranch = await waitForSession(session.id, (current) => {
        const branchRuns = current.strategyState && Array.isArray(current.strategyState.branchRuns)
          ? current.strategyState.branchRuns
          : [];
        const branch = branchRuns.find((branchRun) => branchRun.id === siblingBranch.id);
        return branch && branch.currentMessage && branch.currentMessage.questionId === 'seed-path';
      });

      const completedBranch = continuedBranch.strategyState.branchRuns.find((branchRun) => branchRun.id === siblingBranch.id);
      const preservedSibling = continuedBranch.strategyState.branchRuns.find((branchRun) => (
        branchRun.id !== siblingBranch.id
      ));

      assert(completedBranch);
      assert.strictEqual(completedBranch.status, 'active');
      assert.strictEqual(completedBranch.currentMessage.questionId, 'seed-path');
      assert(preservedSibling);
      assert.strictEqual(preservedSibling.sourceOptionId, 'facilitation-engine');
      assert(preservedSibling.currentMessage);

      const backToMainline = JSON.parse((await request('POST', `/api/sessions/${session.id}/context`, {
        branchRunId: null
      })).body);

      assert.strictEqual(backToMainline.strategyState.selectedBranchRunId, null);
      assert.strictEqual(backToMainline.currentMessage.questionId, 'seed-criterion');
      assert.strictEqual(backToMainline.roundGraph.activeRoundId, 'round-seed-criterion');
    });

    await test('keeps the new-brainstorm composer visible even when sessions already exist', async () => {
      await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We need a new topic even while old sessions remain visible.'
      });

      const res = await request('GET', '/app');
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Start Another Topic'));
      assert(res.body.includes('persistent-seed-input'));
      assert(res.body.includes('new-brainstorm-dock'));
    });

    await test('advances only the targeted session', async () => {
      const first = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const second = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      await waitForSession(first.id, (session) => session.currentMessage && session.currentMessage.questionId === 'root-goal');
      await waitForSession(second.id, (session) => session.currentMessage && session.currentMessage.questionId === 'root-goal');

      await request('POST', `/api/sessions/${first.id}/answers`, {
        type: 'answer',
        questionId: 'root-goal',
        answerMode: 'option',
        optionIds: ['host-ux'],
        text: null,
        rawInput: '2'
      });

      const firstState = await waitForSession(first.id, (session) => (
        session.currentMessage && session.currentMessage.questionId === 'host-confirm'
      ));
      const secondState = JSON.parse((await request('GET', `/api/sessions/${second.id}`)).body);

      assert.strictEqual(firstState.currentMessage.questionId, 'host-confirm');
      assert.strictEqual(secondState.currentMessage.questionId, 'root-goal');
    });

    await test('returns 404 for answer submission against an unknown session', async () => {
      const res = await request('POST', '/api/sessions/does-not-exist/answers', {
        type: 'answer',
        questionId: 'topic',
        answerMode: 'text',
        optionIds: [],
        text: 'hello',
        rawInput: 'hello'
      });

      assert.strictEqual(res.status, 404);
    });

    await test('marks stale sessions retryable and supports lifecycle retry through the API', async () => {
      const created = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'Lifecycle retry flow'
      })).body);
      const session = await waitForSession(created.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-reframe'
      ));

      const sessionPath = path.join(TEST_DIR, '.web-product', 'sessions', `${session.id}.json`);
      const stored = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      stored.processing = {
        state: 'retryable',
        action: 'submit',
        jobId: 'retryable-job',
        queuedAt: '2000-01-01T00:00:00.000Z',
        startedAt: '2000-01-01T00:00:00.000Z',
        heartbeatAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        finishedAt: '2000-01-01T00:00:00.000Z',
        attemptCount: 1,
        leaseOwnerId: 'dead-runner',
        supersededByJobId: null,
        pendingInput: {
          type: 'answer',
          questionId: 'seed-reframe',
          answerMode: 'option',
          optionIds: ['fix-facilitation'],
          text: null,
          rawInput: '2'
        },
        error: {
          code: 'RUNTIME_TIMEOUT',
          message: 'Background step timed out'
        }
      };
      fs.writeFileSync(sessionPath, JSON.stringify(stored, null, 2) + '\n');

      const retryRes = await request('POST', `/api/sessions/${session.id}/lifecycle`, {
        action: 'retry'
      });
      assert.strictEqual(retryRes.status, 200);
      const retried = JSON.parse(retryRes.body);
      assert.strictEqual(retried.processing.state, 'running');

      const completed = await waitForSession(session.id, (current) => (
        current.processing.state === 'idle'
        && current.currentMessage
        && current.currentMessage.questionId === 'seed-directions'
      ));
      assert.strictEqual(completed.currentMessage.questionId, 'seed-directions');
    });

    await test('returns summary-complete sessions when completionMode=summary', async () => {
      const created = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const session = await waitForSession(created.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'root-goal'
      ));

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'root-goal',
        answerMode: 'option',
        optionIds: ['host-ux'],
        text: null,
        rawInput: '2'
      });

      await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'host-confirm'
      ));

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'host-confirm',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      });
      const completed = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.type === 'summary'
      ));

      assert.strictEqual(completed.currentMessage.type, 'summary');
      assert.strictEqual(completed.history.length, 2);
    });

    await test('persists artifact-ready outputs and serves their content', async () => {
      const created = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'artifact',
        initialPrompt: 'We need a brainstorm result we can directly review and export.'
      })).body);
      const session = await waitForSession(created.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-reframe'
      ));

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-reframe',
        answerMode: 'option',
        optionIds: ['fix-facilitation'],
        text: null,
        rawInput: '2'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-directions',
        answerMode: 'options',
        optionIds: ['facilitation-engine', 'interaction-redesign'],
        text: null,
        rawInput: '1,2'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-criterion',
        answerMode: 'option',
        optionIds: ['clarity'],
        text: null,
        rawInput: '1'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-path',
        answerMode: 'option',
        optionIds: ['interaction-redesign'],
        text: null,
        rawInput: '2'
      });
      const completed = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.type === 'artifact_ready'
      ));

      assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
      assert.strictEqual(completed.workflowMode, 'conversation');
      const artifactRes = await request('GET', `/api/sessions/${session.id}/artifacts/current`);
      assert.strictEqual(artifactRes.status, 200);
      assert(artifactRes.body.includes('# Recommendation:'));
      assert(!artifactRes.body.includes('Spec and Plan Bundle'));

      const resultJsonRes = await request('GET', `/api/sessions/${session.id}/result`);
      assert.strictEqual(resultJsonRes.status, 200);
      const resultJson = JSON.parse(resultJsonRes.body);
      assert(Array.isArray(resultJson.sections));
      assert(resultJson.sections.some((section) => section.title === 'Recommendation'));
      assert.strictEqual(resultJson.supportingArtifacts.length, 1);
      assert.strictEqual(resultJson.supportingArtifacts[0].label, 'Current Artifact');

      const resultMarkdownRes = await request('GET', `/api/sessions/${session.id}/result.md`);
      assert.strictEqual(resultMarkdownRes.status, 200);
      assert(resultMarkdownRes.body.includes('# Recommendation:'));
      assert(resultMarkdownRes.body.includes('Recommendation'));
      assert(!resultMarkdownRes.body.includes('Spec and Plan Bundle'));
    });

    await test('exposes developer-facing provenance inspection without polluting the default app shell', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We need to know whether the visible question came from the real skill-guided path.'
      })).body);

      const provenanceRes = await request('GET', `/api/sessions/${session.id}/provenance`);
      assert.strictEqual(provenanceRes.status, 200);
      const provenance = JSON.parse(provenanceRes.body);
      assert(Array.isArray(provenance.questions));
      assert.strictEqual(provenance.questions.length, 1);
      assert(provenance.questions[0].generationMode);
      assert(Array.isArray(provenance.questions[0].requiredSkills));

      const appRes = await request('GET', '/app');
      assert.strictEqual(appRes.status, 200);
      assert(!appRes.body.includes('generationMode'));
      assert(!appRes.body.includes('real-skill-runtime'));
      assert(!appRes.body.includes('fallback-excerpt'));
    });

    await test('supports full-skill workflow sessions that pause for spec review before the final bundle', async () => {
      const created = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'artifact',
        workflowMode: 'full_skill',
        initialPrompt: 'We need a browser-first brainstorm result surface with exports.'
      })).body);
      const session = await waitForSession(created.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'seed-reframe'
      ));

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-reframe',
        answerMode: 'option',
        optionIds: ['fix-facilitation'],
        text: null,
        rawInput: '2'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-directions',
        answerMode: 'options',
        optionIds: ['facilitation-engine', 'interaction-redesign'],
        text: null,
        rawInput: '1,2'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-criterion',
        answerMode: 'option',
        optionIds: ['clarity'],
        text: null,
        rawInput: '1'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-path',
        answerMode: 'option',
        optionIds: ['interaction-redesign'],
        text: null,
        rawInput: '2'
      });
      const reviewGate = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.questionId === 'workflow-review-spec'
      ));

      assert.strictEqual(reviewGate.workflow.mode, 'full_skill');
      assert.strictEqual(reviewGate.currentMessage.type, 'question');
      assert.strictEqual(reviewGate.currentMessage.questionId, 'workflow-review-spec');
      assert.strictEqual(reviewGate.workflow.visibleStage.id, 'review-spec');
      assert(reviewGate.workflow.specArtifact);

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'workflow-review-spec',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      });
      const completed = await waitForSession(session.id, (current) => (
        current.currentMessage && current.currentMessage.type === 'artifact_ready'
      ));

      assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
      assert.strictEqual(completed.workflow.visibleStage.id, 'plan-ready');
      assert(completed.workflow.planArtifact);
      assert(completed.currentMessage.resultExportPaths);
      assert.strictEqual(completed.currentMessage.resultExportPaths.jsonPath, `/api/sessions/${session.id}/result`);
      assert(completed.currentMessage.finishedResult);
      assert.strictEqual(completed.currentMessage.finishedResult.supportingArtifacts.length, 3);

      const artifactRes = await request('GET', `/api/sessions/${session.id}/artifacts/current`);
      assert.strictEqual(artifactRes.status, 200);
      assert(artifactRes.body.includes('Spec and Plan Bundle'));
      assert(artifactRes.body.includes('Implementation Plan'));

      const resultJsonRes = await request('GET', `/api/sessions/${session.id}/result`);
      assert.strictEqual(resultJsonRes.status, 200);
      const resultJson = JSON.parse(resultJsonRes.body);
      assert.strictEqual(resultJson.supportingArtifacts.length, 3);
      assert(resultJson.sections.some((section) => section.title === 'Recommendation'));

      const resultMarkdownRes = await request('GET', `/api/sessions/${session.id}/result.md`);
      assert.strictEqual(resultMarkdownRes.status, 200);
      assert(resultMarkdownRes.body.includes('# Recommendation:'));
      assert(resultMarkdownRes.body.includes('Recommendation'));
      assert(!resultMarkdownRes.body.includes('Spec and Plan Bundle'));
    });

    await test('exposes workflow inspection details only through the developer inspection API', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'artifact',
        workflowMode: 'full_skill'
      })).body);

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'root-goal',
        answerMode: 'option',
        optionIds: ['host-ux'],
        text: null,
        rawInput: '2'
      });

      await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'host-confirm',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      });

      const inspectionRes = await request('GET', `/api/sessions/${session.id}/inspection`);
      assert.strictEqual(inspectionRes.status, 200);
      const inspection = JSON.parse(inspectionRes.body);
      assert.strictEqual(inspection.workflow.mode, 'full_skill');
      assert(Array.isArray(inspection.workflow.hiddenActivity));
      assert(Array.isArray(inspection.workflow.checkpoints));
      assert(Array.isArray(inspection.workflow.skillChecklist));
      assert(inspection.workflow.automationPolicy.automaticHiddenActions.includes('write_design_doc'));
      assert(inspection.workflow.checkpoints.length >= 1);

      const appRes = await request('GET', '/app');
      assert.strictEqual(appRes.status, 200);
      assert(!appRes.body.includes('automationPolicy'));
      assert(!appRes.body.includes('hiddenActivity'));
      assert(!appRes.body.includes('workflow-checkpoints'));
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
