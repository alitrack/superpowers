const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SERVER_PATH = path.join(REPO_ROOT, 'skills/brainstorming/scripts/server.cjs');
const PORT = Number(process.env.BRAINSTORM_SMOKE_PORT || 3347);
const DIR = '/tmp/brainstorm-full-skill-smoke';
const RUNTIME_MODE = process.env.BRAINSTORM_SMOKE_RUNTIME_MODE || 'real';

function cleanupDir() {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
}

function request(method, route, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: route,
      method,
      headers: payload ? { 'Content-Type': 'application/json' } : {}
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timeout for ${method} ${route}`));
    });
    req.on('error', reject);
    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

function chooseAnswer(session) {
  const message = session.currentMessage;
  if (!message || message.type !== 'question') {
    throw new Error('No active question to answer');
  }

  if (message.questionId === 'workflow-review-spec') {
    return {
      type: 'answer',
      questionId: message.questionId,
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    };
  }

  if (message.questionType === 'pick_one') {
    return {
      type: 'answer',
      questionId: message.questionId,
      answerMode: 'option',
      optionIds: [message.options[0].id],
      text: null,
      rawInput: '1'
    };
  }

  if (message.questionType === 'pick_many') {
    const optionIds = message.options.slice(0, Math.min(2, message.options.length)).map((item) => item.id);
    return {
      type: 'answer',
      questionId: message.questionId,
      answerMode: optionIds.length > 1 ? 'options' : 'option',
      optionIds,
      text: null,
      rawInput: optionIds.map((_, index) => String(index + 1)).join(',')
    };
  }

  if (message.questionType === 'confirm') {
    return {
      type: 'answer',
      questionId: message.questionId,
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    };
  }

  return {
    type: 'answer',
    questionId: message.questionId,
    answerMode: 'text',
    optionIds: [],
    text: 'Build a browser-first brainstorming product that hides engineering mechanics and ends with a reviewable spec plus plan.',
    rawInput: 'Build a browser-first brainstorming product that hides engineering mechanics and ends with a reviewable spec plus plan.'
  };
}

async function waitForServer(server) {
  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server start timeout\n${stderr}`)), 20000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('server-started')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on('error', reject);
    server.on('exit', (code) => reject(new Error(`Server exited early: ${code}\n${stderr}`)));
  });
}

async function main() {
  cleanupDir();
  const server = spawn('node', [SERVER_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      BRAINSTORM_PORT: String(PORT),
      BRAINSTORM_DIR: DIR,
      BRAINSTORM_RUNTIME_MODE: RUNTIME_MODE,
      BRAINSTORM_WORKFLOW_MODE: 'full_skill'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForServer(server);

  try {
    const app = await request('GET', '/app');
    if (app.status !== 200) {
      throw new Error(`GET /app failed: ${app.status}`);
    }

    const appChecks = {
      hidesGenerationMode: !app.body.includes('generationMode'),
      hidesSubagentTerm: !app.body.toLowerCase().includes('subagent'),
      hidesGitTerm: !app.body.toLowerCase().includes('git-backed')
    };

    let session = JSON.parse((await request('POST', '/api/sessions', {
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'We need a real brainstorming product that takes a non-technical user from a messy problem to a reviewable spec and implementation plan.'
    })).body);

    const transcript = [];
    for (let step = 0; step < 10; step += 1) {
      transcript.push({
        step,
        type: session.currentMessage ? session.currentMessage.type : null,
        questionId: session.currentMessage ? session.currentMessage.questionId || null : null,
        stage: session.workflow && session.workflow.visibleStage
          ? session.workflow.visibleStage.id
          : null
      });

      if (session.currentMessage && session.currentMessage.type === 'artifact_ready') {
        break;
      }

      const answer = chooseAnswer(session);
      session = JSON.parse((await request('POST', `/api/sessions/${session.id}/answers`, answer)).body);
    }

    if (!session.currentMessage || session.currentMessage.type !== 'artifact_ready') {
      throw new Error(`Workflow did not reach artifact_ready\n${JSON.stringify(transcript, null, 2)}`);
    }

    const artifact = await request('GET', `/api/sessions/${session.id}/artifacts/current`);
    if (artifact.status !== 200) {
      throw new Error(`Artifact fetch failed: ${artifact.status}`);
    }

    const inspection = JSON.parse((await request('GET', `/api/sessions/${session.id}/inspection`)).body);

    const result = {
      appChecks,
      finalStage: session.workflow.visibleStage.id,
      artifactType: session.currentMessage.artifactType,
      artifactHasBundle: artifact.body.includes('Spec and Plan Bundle'),
      artifactHasPlan: artifact.body.includes('Implementation Plan'),
      artifactLeaksSubagent: artifact.body.toLowerCase().includes('subagent'),
      artifactLeaksSkill: artifact.body.toLowerCase().includes('required sub-skill'),
      hiddenActivityCount: Array.isArray(inspection.workflow.hiddenActivity) ? inspection.workflow.hiddenActivity.length : 0,
      checkpointCount: Array.isArray(inspection.workflow.checkpoints) ? inspection.workflow.checkpoints.length : 0,
      checklistStatuses: Array.isArray(inspection.workflow.skillChecklist)
        ? inspection.workflow.skillChecklist.map((entry) => ({ id: entry.id, status: entry.status }))
        : [],
      transcript
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 2000);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
