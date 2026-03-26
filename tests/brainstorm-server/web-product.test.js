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

    await test('serves the browser-first app shell at /app', async () => {
      const res = await request('GET', '/app');
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Research Asset Workbench'));
      assert(res.body.includes('Research Assets'));
      assert(res.body.includes('Project Library'));
      assert(res.body.includes('Research Workspace'));
      assert(res.body.includes('Publish Review'));
      assert(res.body.includes('Review Requests'));
      assert(/Permissions\s*&amp;\s*Audit/.test(res.body));
      assert(res.body.includes('asset-library-list'));
      assert(res.body.includes('project-library-list'));
      assert(res.body.includes('review-request-queue'));
      assert(res.body.includes('bundle-preview-status'));
      assert(res.body.includes('/api/assets'));
      assert(res.body.includes('/api/workspaces'));
      assert(res.body.includes('/api/review-requests'));
      assert(res.body.includes('/api/audit?workspaceId='));
      assert(res.body.includes('New Session'));
      assert(res.body.includes('Start A New Brainstorm'));
      assert(res.body.includes('The full result is shown directly below'));
      assert(res.body.includes('不需要手动去路径里找文件'));
      assert(res.body.includes('persistent-start-artifact'));
      assert(!res.body.includes('Start with the question that needs real thinking'));
      assert(!res.body.includes('seed-entry-input'));
      assert(!res.body.includes("return createSession('artifact');"));
    });

    await test('does not auto-create an empty session on fresh load', async () => {
      const before = JSON.parse((await request('GET', '/api/sessions')).body);
      assert.deepStrictEqual(before, []);

      await request('GET', '/app');

      const after = JSON.parse((await request('GET', '/api/sessions')).body);
      assert.deepStrictEqual(after, []);
    });

    await test('creates isolated sessions through the API', async () => {
      const first = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);
      const second = JSON.parse((await request('POST', '/api/sessions', { completionMode: 'summary' })).body);

      assert.notStrictEqual(first.id, second.id);
      assert.strictEqual(first.currentMessage.questionId, 'root-goal');
      assert.strictEqual(second.currentMessage.questionId, 'root-goal');
    });

    await test('creates a seeded session whose first formal question is not the generic intake question', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
      })).body);

      assert.strictEqual(session.seedPrompt, 'We have a brainstorming tool, but it still feels like a form.');
      assert.strictEqual(session.strategyState.phase, 'reframe');
      assert.notStrictEqual(session.currentMessage.questionId, 'root-goal');
      assert.notStrictEqual(session.currentMessage.title, 'What do you want to improve first?');
    });

    await test('seeded sessions converge to a structured brainstorming result instead of a raw choice echo', async () => {
      const session = JSON.parse((await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
      })).body);

      const afterReframe = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-reframe',
        answerMode: 'option',
        optionIds: ['fix-facilitation'],
        text: null,
        rawInput: '2'
      })).body);

      assert.strictEqual(afterReframe.currentMessage.questionId, 'seed-directions');

      const afterDirections = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-directions',
        answerMode: 'options',
        optionIds: ['facilitation-engine', 'interaction-redesign'],
        text: null,
        rawInput: '1,2'
      })).body);

      assert.strictEqual(afterDirections.currentMessage.questionId, 'seed-criterion');

      const afterCriterion = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-criterion',
        answerMode: 'option',
        optionIds: ['clarity'],
        text: null,
        rawInput: '1'
      })).body);

      assert.strictEqual(afterCriterion.currentMessage.questionId, 'seed-path');

      const completed = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'seed-path',
        answerMode: 'option',
        optionIds: ['interaction-redesign'],
        text: null,
        rawInput: '2'
      })).body);

      assert.strictEqual(completed.currentMessage.type, 'summary');
      assert(completed.currentMessage.title.includes('Recommendation:'));
      assert(completed.currentMessage.text.includes('Recommendation'));
      assert(completed.currentMessage.text.includes('Problem Framing'));
      assert(completed.currentMessage.text.includes('Why This Path Currently Wins'));
      assert(completed.currentMessage.text.includes('Alternatives Still Worth Remembering'));
      assert(completed.currentMessage.text.includes('Next Actions'));
    });

    await test('keeps the new-brainstorm composer visible even when sessions already exist', async () => {
      await request('POST', '/api/sessions', {
        completionMode: 'summary',
        initialPrompt: 'We need a new topic even while old sessions remain visible.'
      });

      const res = await request('GET', '/app');
      assert.strictEqual(res.status, 200);
      assert(res.body.includes('Start A New Brainstorm'));
      assert(res.body.includes('persistent-seed-input'));
      assert(res.body.includes('persistent-start-summary'));
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

      const reviewGate = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'host-confirm',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      })).body);

      assert.strictEqual(reviewGate.workflow.mode, 'full_skill');
      assert.strictEqual(reviewGate.currentMessage.type, 'question');
      assert.strictEqual(reviewGate.currentMessage.questionId, 'workflow-review-spec');
      assert.strictEqual(reviewGate.workflow.visibleStage.id, 'review-spec');
      assert(reviewGate.workflow.specArtifact);

      const completed = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, {
        type: 'answer',
        questionId: 'workflow-review-spec',
        answerMode: 'confirm',
        optionIds: ['yes'],
        text: null,
        rawInput: 'yes'
      })).body);

      assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
      assert.strictEqual(completed.workflow.visibleStage.id, 'plan-ready');
      assert(completed.workflow.planArtifact);

      const artifactRes = await request('GET', `/api/sessions/${session.id}/artifacts/current`);
      assert.strictEqual(artifactRes.status, 200);
      assert(artifactRes.body.includes('Spec and Plan Bundle'));
      assert(artifactRes.body.includes('Implementation Plan'));
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
