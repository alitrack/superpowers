const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const structuredHost = require('./structured-host.cjs');
const structuredRuntime = require('./structured-runtime.cjs');

const DEFAULT_FLOW_ID = 'structured-demo';
const FLOW_REGISTRY = {
  [DEFAULT_FLOW_ID]: structuredRuntime.STRUCTURED_DEMO_FLOW
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildArtifactMarkdown(session, summary) {
  const lines = [
    '# Structured Brainstorming Result',
    '',
    `- Session ID: ${session.id}`,
    `- Completion Mode: ${session.completionMode}`,
    `- Updated At: ${session.updatedAt}`,
    '',
    '## Summary',
    '',
    summary.text,
    '',
    '## Answers',
    ''
  ];

  for (const entry of summary.answers || []) {
    lines.push(`- ${entry.questionId}: ${entry.answer}`);
  }

  lines.push('');
  return lines.join('\n');
}

function createSessionManager(options) {
  const dataDir = options.dataDir;
  const sessionsDir = path.join(dataDir, 'sessions');
  const artifactsDir = path.join(dataDir, 'artifacts');

  ensureDir(sessionsDir);
  ensureDir(artifactsDir);

  function getFlow(flowId) {
    const flow = FLOW_REGISTRY[flowId || DEFAULT_FLOW_ID];
    if (!flow) {
      throw new Error(`Unknown flow: ${flowId}`);
    }
    return flow;
  }

  function sessionFile(sessionId) {
    return path.join(sessionsDir, `${sessionId}.json`);
  }

  function persistSession(session) {
    fs.writeFileSync(sessionFile(session.id), JSON.stringify(session, null, 2) + '\n');
  }

  function loadSession(sessionId) {
    const filePath = sessionFile(sessionId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  function createInitialMessage(flowId) {
    const flow = getFlow(flowId);
    return structuredHost.createQuestionMessage(flow, flow.initialQuestionId, []);
  }

  function createArtifact(session, summary) {
    const title = `${session.id}.md`;
    const filePath = path.join(artifactsDir, title);
    fs.writeFileSync(filePath, buildArtifactMarkdown(session, summary));
    return {
      artifactType: 'markdown',
      title,
      filePath,
      path: `/api/sessions/${session.id}/artifacts/current`,
      text: 'Structured brainstorming artifact is ready.'
    };
  }

  function createSession(input) {
    const now = new Date().toISOString();
    const flowId = input && input.flowId ? input.flowId : DEFAULT_FLOW_ID;
    const completionMode = input && input.completionMode ? input.completionMode : 'artifact';
    const flow = getFlow(flowId);
    const currentMessage = structuredHost.createQuestionMessage(flow, flow.initialQuestionId, []);

    const session = {
      id: createId(),
      flowId,
      completionMode,
      createdAt: now,
      updatedAt: now,
      currentQuestionId: flow.initialQuestionId,
      history: [],
      currentMessage,
      summary: null,
      artifact: null
    };

    persistSession(session);
    return clone(session);
  }

  function listSessions() {
    return fs.readdirSync(sessionsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => JSON.parse(fs.readFileSync(path.join(sessionsDir, entry), 'utf-8')))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => ({
        id: session.id,
        flowId: session.flowId,
        completionMode: session.completionMode,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        currentMessageType: session.currentMessage ? session.currentMessage.type : null
      }));
  }

  function getSession(sessionId) {
    return clone(loadSession(sessionId));
  }

  function submitAnswer(sessionId, answer) {
    const session = loadSession(sessionId);
    if (!session.currentMessage || session.currentMessage.type !== 'question') {
      return clone(session);
    }

    const flow = getFlow(session.flowId);
    const runtimeState = {
      flow,
      currentQuestionId: session.currentQuestionId,
      history: session.history || []
    };
    const next = structuredHost.applyAnswer(runtimeState, answer);

    session.updatedAt = new Date().toISOString();
    session.currentQuestionId = next.state.currentQuestionId;
    session.history = next.state.history;

    if (next.message.type === 'summary') {
      session.summary = clone(next.message);
      if (session.completionMode === 'artifact') {
        session.artifact = createArtifact(session, next.message);
        session.currentMessage = {
          type: 'artifact_ready',
          artifactType: session.artifact.artifactType,
          title: session.artifact.title,
          path: session.artifact.path,
          text: session.artifact.text
        };
      } else {
        session.currentMessage = clone(next.message);
      }
    } else {
      session.currentMessage = clone(next.message);
    }

    persistSession(session);
    return clone(session);
  }

  function getArtifactContent(sessionId) {
    const session = loadSession(sessionId);
    if (!session.artifact || !session.artifact.filePath) {
      throw new Error(`No artifact for session: ${sessionId}`);
    }
    return fs.readFileSync(session.artifact.filePath, 'utf-8');
  }

  return {
    createSession,
    listSessions,
    getSession,
    submitAnswer,
    getArtifactContent
  };
}

module.exports = {
  DEFAULT_FLOW_ID,
  createSessionManager
};
