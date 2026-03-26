const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function slugify(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'checkpoint';
}

function safeGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_error) {
    return null;
  }
}

function detectProvider(cwd) {
  const repoRoot = safeGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!repoRoot) {
    return {
      kind: 'file',
      details: {
        cwd
      }
    };
  }

  return {
    kind: 'git',
    details: {
      cwd,
      repoRoot,
      head: safeGit(cwd, ['rev-parse', 'HEAD']),
      status: (safeGit(cwd, ['status', '--short', '--untracked-files=normal']) || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      stashOid: safeGit(cwd, ['stash', 'create', 'brainstorm-server hidden checkpoint']) || null
    }
  };
}

function summarizeArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    return null;
  }
  return {
    title: artifact.title || null,
    relativePath: artifact.relativePath || null,
    artifactType: artifact.artifactType || null
  };
}

function summarizeSession(session) {
  const workflow = session && session.workflow && typeof session.workflow === 'object'
    ? session.workflow
    : {};
  return {
    sessionId: session ? session.id : null,
    updatedAt: session ? session.updatedAt : null,
    currentQuestionId: session ? session.currentQuestionId : null,
    historyLength: Array.isArray(session && session.history) ? session.history.length : 0,
    seedPrompt: session && session.seedPrompt ? session.seedPrompt : null,
    workflow: {
      mode: workflow.mode || null,
      status: workflow.status || null,
      internalStage: workflow.internalStage || null,
      visibleStage: workflow.visibleStage || null,
      blocked: workflow.blocked || null,
      review: workflow.review || null,
      specArtifact: summarizeArtifact(workflow.specArtifact),
      planArtifact: summarizeArtifact(workflow.planArtifact),
      bundleArtifact: summarizeArtifact(workflow.bundleArtifact)
    }
  };
}

function createWorkflowCheckpointStore(options) {
  const dataDir = options && options.dataDir ? options.dataDir : process.cwd();
  const cwd = options && options.cwd ? options.cwd : process.cwd();
  const checkpointsDir = path.join(dataDir, 'workflow-checkpoints');
  ensureDir(checkpointsDir);

  function captureCheckpoint(session, context) {
    const createdAt = new Date().toISOString();
    const provider = detectProvider(cwd);
    const stageId = context && context.stageId ? context.stageId : 'workflow-checkpoint';
    const record = {
      id: createId(),
      sessionId: session.id,
      createdAt,
      stageId,
      label: context && context.label ? context.label : stageId,
      reason: context && context.reason ? context.reason : 'workflow-progress',
      provider: provider.kind,
      providerDetails: provider.details,
      sessionSnapshot: summarizeSession(session)
    };
    const sessionDir = path.join(checkpointsDir, session.id);
    ensureDir(sessionDir);
    const filePath = path.join(
      sessionDir,
      `${createdAt.replace(/[:.]/g, '-')}-${slugify(stageId)}.json`
    );
    record.filePath = filePath;
    record.relativePath = path.relative(dataDir, filePath).replace(/\\/g, '/');
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + '\n');
    return record;
  }

  function listCheckpoints(sessionId) {
    const sessionDir = path.join(checkpointsDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      return [];
    }
    return fs.readdirSync(sessionDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => JSON.parse(fs.readFileSync(path.join(sessionDir, entry), 'utf-8')))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  return {
    captureCheckpoint,
    listCheckpoints
  };
}

module.exports = {
  createWorkflowCheckpointStore
};
