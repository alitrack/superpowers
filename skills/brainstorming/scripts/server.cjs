const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== WebSocket Protocol (RFC 6455) ==========

const OPCODES = { TEXT: 0x01, CLOSE: 0x08, PING: 0x09, PONG: 0x0A };
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function computeAcceptKey(clientKey) {
  return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

function encodeFrame(opcode, payload) {
  const fin = 0x80;
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = fin | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = fin | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = fin | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeFrame(buffer) {
  if (buffer.length < 2) return null;

  const secondByte = buffer[1];
  const opcode = buffer[0] & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7F;
  let offset = 2;

  if (!masked) throw new Error('Client frames must be masked');

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const maskOffset = offset;
  const dataOffset = offset + 4;
  const totalLen = dataOffset + payloadLen;
  if (buffer.length < totalLen) return null;

  const mask = buffer.slice(maskOffset, dataOffset);
  const data = Buffer.alloc(payloadLen);
  for (let i = 0; i < payloadLen; i++) {
    data[i] = buffer[dataOffset + i] ^ mask[i % 4];
  }

  return { opcode, payload: data, bytesConsumed: totalLen };
}

// ========== Configuration ==========

const PORT = process.env.BRAINSTORM_PORT || (49152 + Math.floor(Math.random() * 16383));
const HOST = process.env.BRAINSTORM_HOST || '127.0.0.1';
const URL_HOST = process.env.BRAINSTORM_URL_HOST || (HOST === '127.0.0.1' ? 'localhost' : HOST);
const SCREEN_DIR = process.env.BRAINSTORM_DIR || '/tmp/brainstorm';
const OWNER_PID = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
};

function readPositiveIntEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

// ========== Templates and Constants ==========

const WAITING_PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Brainstorm Companion</title>
<style>body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
h1 { color: #333; } p { color: #666; }</style>
</head>
<body><h1>Brainstorm Companion</h1>
<p>Waiting for the agent to push a screen...</p></body></html>`;

const frameTemplate = fs.readFileSync(path.join(__dirname, 'frame-template.html'), 'utf-8');
const helperScript = fs.readFileSync(path.join(__dirname, 'helper.js'), 'utf-8');
const structuredHostScript = fs.readFileSync(path.join(__dirname, 'structured-host.cjs'), 'utf-8');
const webMainstageScript = fs.readFileSync(path.join(__dirname, 'web-mainstage.cjs'), 'utf-8');
const webAppShellTemplate = fs.readFileSync(path.join(__dirname, 'web-app-shell.html'), 'utf-8');
const webGraphClientBundlePath = path.join(__dirname, 'web-graph-client.bundle.js');
const webGraphClientCssPath = path.join(__dirname, 'web-graph-client.bundle.css');
const webGraphClientScript = fs.existsSync(webGraphClientBundlePath)
  ? fs.readFileSync(webGraphClientBundlePath, 'utf-8')
  : '';
const webGraphClientCss = fs.existsSync(webGraphClientCssPath)
  ? fs.readFileSync(webGraphClientCssPath, 'utf-8')
  : '';
const { createSessionManager } = require('./web-session-manager.cjs');
const { createFakeCodexRuntimeAdapter } = require('./codex-runtime-adapter.cjs');
const { createExecWorkflowEngine } = require('./workflow-artifact-engine.cjs');
const helperInjection =
  '<script>\n' + helperScript + '\n</script>\n' +
  '<script>\n' + structuredHostScript + '\n</script>';
const runtimeMode = process.env.BRAINSTORM_RUNTIME_MODE || 'real';
const defaultWorkflowMode = process.env.BRAINSTORM_WORKFLOW_MODE || 'conversation';
const backgroundProcessing = process.env.BRAINSTORM_BACKGROUND_PROCESSING !== '0';
const appServerRequestTimeoutMs = readPositiveIntEnv('BRAINSTORM_APP_SERVER_REQUEST_TIMEOUT_MS');
const runtimeOptions = runtimeMode === 'fake'
  ? undefined
  : {
      appServer: {
        clientOptions: appServerRequestTimeoutMs
          ? { requestTimeoutMs: appServerRequestTimeoutMs }
          : {}
      }
    };
const webSessionManager = createSessionManager({
  dataDir: path.join(SCREEN_DIR, '.web-product'),
  runtimeAdapter: runtimeMode === 'fake' ? createFakeCodexRuntimeAdapter() : undefined,
  runtimeOptions,
  backgroundProcessing,
  workflowEngine: runtimeMode === 'fake' ? undefined : createExecWorkflowEngine()
});
const legacySocketAdapter = createFakeCodexRuntimeAdapter();

// ========== Helper Functions ==========

function isFullDocument(html) {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function wrapInFrame(content) {
  return frameTemplate.replace('<!-- CONTENT -->', content);
}

function renderWebAppShell() {
  const replaceLiteral = (template, marker, content) => (
    template.replace(marker, () => content)
  );

  let html = webAppShellTemplate;
  html = replaceLiteral(
    html,
    '<!-- BRAINSTORM_GRAPH_CLIENT_CSS -->',
    webGraphClientCss ? `<style>\n${webGraphClientCss}\n</style>` : ''
  );
  html = replaceLiteral(
    html,
    '<!-- BRAINSTORM_MAINSTAGE_SCRIPT -->',
    '<script>\n' + webMainstageScript + '\n</script>'
  );
  html = replaceLiteral(
    html,
    '<!-- BRAINSTORM_GRAPH_CLIENT_SCRIPT -->',
    webGraphClientScript ? '<script>\n' + webGraphClientScript + '\n</script>' : ''
  );
  html = replaceLiteral(
    html,
    '<!-- STRUCTURED_HOST_SCRIPT -->',
    '<script>\n' + structuredHostScript + '\n</script>'
  );
  return html;
}

function getNewestScreen() {
  const files = fs.readdirSync(SCREEN_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => {
      const fp = path.join(SCREEN_DIR, f);
      return { path: fp, mtime: fs.statSync(fp).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].path : null;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { 'Content-Type': contentType || 'text/plain; charset=utf-8' });
  res.end(body);
}

function parseJsonBody(req, callback) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    if (!body.trim()) {
      callback(null, {});
      return;
    }
    try {
      callback(null, JSON.parse(body));
    } catch (error) {
      callback(error);
    }
  });
}

function getRole(req) {
  const role = req.headers['x-role'];
  return typeof role === 'string' ? role : 'Viewer';
}

function getActorId(req) {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

function getActorKind(req) {
  const actorKind = req.headers['x-actor-kind'];
  return typeof actorKind === 'string' ? actorKind : 'human';
}

function getErrorStatus(error, fallbackStatus) {
  if (!error || typeof error !== 'object') {
    return fallbackStatus;
  }
  if (error.code === 'SESSION_BUSY') {
    return 409;
  }
  if (error.code === 'RUNTIME_TIMEOUT') {
    return 504;
  }
  if (error.code === 'INVALID_LIFECYCLE_ACTION') {
    return 400;
  }
  if (typeof error.message === 'string' && error.message.startsWith('Unknown session:')) {
    return 404;
  }
  if (error.code === 'FORBIDDEN') {
    return 403;
  }
  if (error.code === 'HUMAN_CONFIRMATION_REQUIRED') {
    return 409;
  }
  if (
    error.code === 'INVALID_REVIEW_REQUEST'
    || error.code === 'INVALID_SHARE_REQUEST'
    || error.code === 'PUBLISH_VALIDATION_FAILED'
    || error.code === 'INVALID_JUDGMENT_PROMOTION'
    || error.code === 'INVALID_HYPOTHESIS_TRANSITION'
  ) {
    return 400;
  }
  return fallbackStatus;
}

function handleApiRequest(req, res, pathname, requestUrl) {
  if (req.method === 'GET' && pathname === '/api/sessions') {
    sendJson(res, 200, webSessionManager.listSessions());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/assets') {
    sendJson(res, 200, { items: webSessionManager.listResearchAssets() });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/workspaces') {
    try {
      webSessionManager.assertAllowed(getRole(req), 'workspace:view');
      sendJson(res, 200, { items: webSessionManager.listResearchWorkspaces() });
    } catch (error) {
      sendJson(res, getErrorStatus(error, 403), { error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/review-requests') {
    try {
      webSessionManager.assertAllowed(getRole(req), 'review-request:view');
      const workspaceId = requestUrl.searchParams.get('workspaceId');
      sendJson(res, 200, { items: webSessionManager.listReviewRequests({ workspaceId }) });
    } catch (error) {
      sendJson(res, getErrorStatus(error, 403), { error: error.message });
    }
    return;
  }

  const assetMatch = pathname.match(/^\/api\/assets\/([^/]+)$/);
  if (req.method === 'GET' && assetMatch) {
    try {
      sendJson(res, 200, webSessionManager.getResearchAsset(assetMatch[1]));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const revokeAssetMatch = pathname.match(/^\/api\/assets\/([^/]+)\/revoke$/);
  if (req.method === 'POST' && revokeAssetMatch) {
    try {
      webSessionManager.assertAllowed(getRole(req), 'revoke_publish');
      const asset = webSessionManager.revokeResearchAsset(revokeAssetMatch[1], {
        actorId: getActorId(req),
        actorRole: getRole(req)
      });
      sendJson(res, 200, asset);
    } catch (error) {
      sendJson(res, error.code === 'FORBIDDEN' ? 403 : 404, { error: error.message });
    }
    return;
  }

  const cloneAssetMatch = pathname.match(/^\/api\/assets\/([^/]+)\/clone$/);
  if (req.method === 'POST' && cloneAssetMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'workspace:clone');
        const workspace = webSessionManager.cloneResearchAsset(cloneAssetMatch[1], {
          title: typeof body.title === 'string' ? body.title : null,
          team: typeof body.team === 'string' ? body.team : null,
          owner: getActorId(req)
        });
        sendJson(res, 200, { workspace });
      } catch (cloneError) {
        sendJson(res, getErrorStatus(cloneError, 404), { error: cloneError.message });
      }
    });
    return;
  }

  const exportAssetMatch = pathname.match(/^\/api\/assets\/([^/]+)\/export$/);
  if (req.method === 'POST' && exportAssetMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'export');
        const result = webSessionManager.exportResearchAsset(exportAssetMatch[1], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          actorKind: getActorKind(req),
          confirmedByHuman: Boolean(body.confirmedByHuman),
          reason: typeof body.reason === 'string' ? body.reason : ''
        });
        sendJson(res, 200, result);
      } catch (exportError) {
        sendJson(res, getErrorStatus(exportError, 404), { error: exportError.message });
      }
    });
    return;
  }

  const shareAssetMatch = pathname.match(/^\/api\/assets\/([^/]+)\/share$/);
  if (req.method === 'POST' && shareAssetMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'cross_team_share');
        const asset = webSessionManager.shareResearchAsset(shareAssetMatch[1], body.targetTeam, {
          actorId: getActorId(req),
          actorRole: getRole(req),
          actorKind: getActorKind(req),
          confirmedByHuman: Boolean(body.confirmedByHuman),
          reason: typeof body.reason === 'string' ? body.reason : ''
        });
        sendJson(res, 200, asset);
      } catch (shareError) {
        sendJson(res, getErrorStatus(shareError, 404), { error: shareError.message });
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/audit') {
    try {
      webSessionManager.assertAllowed(getRole(req), 'audit:view');
      const workspaceId = requestUrl.searchParams.get('workspaceId');
      sendJson(res, 200, { items: webSessionManager.listAuditEntries({ workspaceId }) });
    } catch (error) {
      sendJson(res, error.code === 'FORBIDDEN' ? 403 : 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/review-requests') {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'review-request:create');
        const reviewRequest = webSessionManager.createReviewRequest({
          ...body,
          requestedBy: getActorId(req)
        });
        sendJson(res, 200, reviewRequest);
      } catch (requestError) {
        const statusCode = requestError.code === 'FORBIDDEN'
          ? 403
          : (requestError.code === 'INVALID_REVIEW_REQUEST' ? 400 : 404);
        sendJson(res, statusCode, { error: requestError.message });
      }
    });
    return;
  }

  const resolveReviewRequestMatch = pathname.match(/^\/api\/review-requests\/([^/]+)\/resolve$/);
  if (req.method === 'POST' && resolveReviewRequestMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'review-request:resolve');
        const reviewRequest = webSessionManager.resolveReviewRequest(resolveReviewRequestMatch[1], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          reason: typeof body.resolutionNote === 'string'
            ? body.resolutionNote
            : (typeof body.reason === 'string' ? body.reason : '')
        });
        sendJson(res, 200, reviewRequest);
      } catch (requestError) {
        sendJson(res, getErrorStatus(requestError, 404), { error: requestError.message });
      }
    });
    return;
  }

  const rejectReviewRequestMatch = pathname.match(/^\/api\/review-requests\/([^/]+)\/reject$/);
  if (req.method === 'POST' && rejectReviewRequestMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'review-request:reject');
        const reviewRequest = webSessionManager.rejectReviewRequest(rejectReviewRequestMatch[1], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          reason: typeof body.resolutionNote === 'string'
            ? body.resolutionNote
            : (typeof body.reason === 'string' ? body.reason : '')
        });
        sendJson(res, 200, reviewRequest);
      } catch (requestError) {
        sendJson(res, getErrorStatus(requestError, 404), { error: requestError.message });
      }
    });
    return;
  }

  const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (req.method === 'GET' && workspaceMatch) {
    try {
      webSessionManager.assertAllowed(getRole(req), 'workspace:view');
      sendJson(res, 200, webSessionManager.getResearchWorkspace(workspaceMatch[1]));
    } catch (error) {
      sendJson(res, getErrorStatus(error, 404), { error: error.message });
    }
    return;
  }

  const publishReviewMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/publish-review$/);
  if (req.method === 'GET' && publishReviewMatch) {
    try {
      webSessionManager.assertAllowed(getRole(req), 'workspace:view');
      sendJson(res, 200, webSessionManager.getWorkspacePublishReview(publishReviewMatch[1]));
    } catch (error) {
      sendJson(res, getErrorStatus(error, 404), { error: error.message });
    }
    return;
  }

  const readyWorkspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/ready$/);
  if (req.method === 'POST' && readyWorkspaceMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'publish');
        const result = webSessionManager.markWorkspaceReadyForPublish(readyWorkspaceMatch[1], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          reason: typeof body.reason === 'string' ? body.reason : ''
        });
        sendJson(res, 200, result);
      } catch (readyError) {
        sendJson(res, getErrorStatus(readyError, 404), {
          error: readyError.message,
          validation: readyError.validation || null
        });
      }
    });
    return;
  }

  const parkHypothesisMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/hypotheses\/([^/]+)\/park$/);
  if (req.method === 'POST' && parkHypothesisMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'hypothesis:park');
        const hypothesis = webSessionManager.parkHypothesis(parkHypothesisMatch[1], parkHypothesisMatch[2], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          reason: typeof body.reason === 'string' ? body.reason : ''
        });
        sendJson(res, 200, { hypothesis });
      } catch (transitionError) {
        sendJson(res, getErrorStatus(transitionError, 404), { error: transitionError.message });
      }
    });
    return;
  }

  const supersedeHypothesisMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/hypotheses\/([^/]+)\/supersede$/);
  if (req.method === 'POST' && supersedeHypothesisMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'hypothesis:supersede');
        const hypothesis = webSessionManager.supersedeHypothesis(supersedeHypothesisMatch[1], supersedeHypothesisMatch[2], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          reason: typeof body.reason === 'string' ? body.reason : '',
          supersededByHypothesisId: typeof body.supersededByHypothesisId === 'string'
            ? body.supersededByHypothesisId
            : null
        });
        sendJson(res, 200, { hypothesis });
      } catch (transitionError) {
        sendJson(res, getErrorStatus(transitionError, 404), { error: transitionError.message });
      }
    });
    return;
  }

  const verifyEvidenceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/evidence\/([^/]+)\/verify$/);
  if (req.method === 'POST' && verifyEvidenceMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'evidence_verify');
        const evidence = webSessionManager.verifyWorkspaceEvidence(verifyEvidenceMatch[1], verifyEvidenceMatch[2], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          actorKind: getActorKind(req),
          confirmedByHuman: Boolean(body.confirmedByHuman),
          reason: typeof body.reason === 'string' ? body.reason : ''
        });
        sendJson(res, 200, { evidence });
      } catch (verifyError) {
        sendJson(res, getErrorStatus(verifyError, 404), { error: verifyError.message });
      }
    });
    return;
  }

  const acceptEvidenceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/evidence\/([^/]+)\/accept$/);
  if (req.method === 'POST' && acceptEvidenceMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'evidence_accept');
        const evidence = webSessionManager.acceptWorkspaceEvidence(acceptEvidenceMatch[1], acceptEvidenceMatch[2], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          actorKind: getActorKind(req),
          confirmedByHuman: Boolean(body.confirmedByHuman),
          reason: typeof body.reason === 'string' ? body.reason : ''
        });
        sendJson(res, 200, { evidence });
      } catch (acceptError) {
        sendJson(res, getErrorStatus(acceptError, 404), { error: acceptError.message });
      }
    });
    return;
  }

  const publishMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/publish$/);
  if (req.method === 'POST' && publishMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        webSessionManager.assertAllowed(getRole(req), 'publish');
        const result = webSessionManager.publishWorkspace(publishMatch[1], {
          actorId: getActorId(req),
          actorRole: getRole(req),
          actorKind: getActorKind(req),
          confirmedByHuman: Boolean(body.confirmedByHuman),
          reason: typeof body.publishSummary === 'string' ? body.publishSummary : ''
        });
        sendJson(res, 200, result);
      } catch (publishError) {
        sendJson(res, getErrorStatus(publishError, 404), {
          error: publishError.message,
          validation: publishError.validation || null
        });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sessions') {
    parseJsonBody(req, async (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        const completionMode = body.completionMode === 'summary' ? 'summary' : 'artifact';
        const initialPrompt = typeof body.initialPrompt === 'string' ? body.initialPrompt : null;
        const workflowMode = body.workflowMode === 'full_skill' ? 'full_skill' : defaultWorkflowMode;
        const session = await webSessionManager.createSession({ completionMode, initialPrompt, workflowMode });
        sendJson(res, 200, session);
      } catch (createError) {
        sendJson(res, 500, { error: createError.message });
      }
    });
    return;
  }

  const artifactMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/artifacts\/current$/);
  if (req.method === 'GET' && artifactMatch) {
    try {
      const artifactText = webSessionManager.getArtifactContent(artifactMatch[1]);
      sendText(res, 200, artifactText, 'text/markdown; charset=utf-8');
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const resultMarkdownMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/result\.md$/);
  if (req.method === 'GET' && resultMarkdownMatch) {
    try {
      const resultMarkdown = webSessionManager.getFinishedResultMarkdown(resultMarkdownMatch[1]);
      sendText(res, 200, resultMarkdown, 'text/markdown; charset=utf-8');
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const resultMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/result$/);
  if (req.method === 'GET' && resultMatch) {
    try {
      sendJson(res, 200, webSessionManager.getFinishedResult(resultMatch[1]));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const provenanceMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/provenance$/);
  if (req.method === 'GET' && provenanceMatch) {
    try {
      sendJson(res, 200, webSessionManager.getSessionProvenance(provenanceMatch[1]));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const inspectionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/inspection$/);
  if (req.method === 'GET' && inspectionMatch) {
    try {
      sendJson(res, 200, webSessionManager.getSessionInspection(inspectionMatch[1]));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'DELETE' && sessionMatch) {
    try {
      sendJson(res, 200, webSessionManager.deleteSession(sessionMatch[1]));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && sessionMatch) {
    try {
      sendJson(res, 200, webSessionManager.getSession(sessionMatch[1]));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  const answerMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/answers$/);
  if (req.method === 'POST' && answerMatch) {
    parseJsonBody(req, async (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        const session = await webSessionManager.submitAnswer(answerMatch[1], body);
        sendJson(res, 200, session);
      } catch (submitError) {
        sendJson(res, getErrorStatus(submitError, 500), { error: submitError.message });
      }
    });
    return;
  }

  const lifecycleMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/lifecycle$/);
  if (req.method === 'POST' && lifecycleMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        const action = typeof body.action === 'string' ? body.action : '';
        const session = webSessionManager.runSessionLifecycleAction(lifecycleMatch[1], action);
        sendJson(res, 200, session);
      } catch (lifecycleError) {
        sendJson(res, getErrorStatus(lifecycleError, 500), { error: lifecycleError.message });
      }
    });
    return;
  }

  const contextMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/context$/);
  if (req.method === 'POST' && contextMatch) {
    parseJsonBody(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        const branchRunId = typeof body.branchRunId === 'string' && body.branchRunId.trim()
          ? body.branchRunId.trim()
          : null;
        const session = webSessionManager.selectSessionBranchContext(contextMatch[1], branchRunId);
        sendJson(res, 200, session);
      } catch (selectionError) {
        sendJson(res, 404, { error: selectionError.message });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

// ========== HTTP Request Handler ==========

function handleRequest(req, res) {
  touchActivity();
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/app') {
    sendText(res, 200, renderWebAppShell(), 'text/html; charset=utf-8');
    return;
  }

  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname, requestUrl);
    return;
  }

  if (req.method === 'GET' && pathname === '/') {
    const screenFile = getNewestScreen();
    let html = screenFile
      ? (raw => isFullDocument(raw) ? raw : wrapInFrame(raw))(fs.readFileSync(screenFile, 'utf-8'))
      : WAITING_PAGE;

    if (html.includes('</body>')) {
      html = html.replace('</body>', helperInjection + '\n</body>');
    } else {
      html += helperInjection;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.method === 'GET' && req.url.startsWith('/files/')) {
    const fileName = req.url.slice(7);
    const filePath = path.join(SCREEN_DIR, path.basename(fileName));
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ========== WebSocket Connection Handling ==========

const clients = new Set();
const socketSessions = new Map();
const socketMetadata = new Map();

function sendSocketMessage(socket, msg) {
  socket.write(encodeFrame(OPCODES.TEXT, Buffer.from(JSON.stringify(msg))));
}

async function processSocketAnswer(socket, event) {
  const session = socketSessions.get(socket);
  if (!session) return;
  const nextSession = await legacySocketAdapter.submitAnswer(session, event);
  socketSessions.set(socket, nextSession);
  sendSocketMessage(socket, nextSession.currentMessage);
}

function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = computeAcceptKey(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  let buffer = Buffer.alloc(0);
  clients.add(socket);
  const session = legacySocketAdapter.createSession({ sessionId: `socket-${Date.now()}` });
  socketSessions.set(socket, session);
  socketMetadata.set(socket, {
    openedAt: Date.now(),
    answerCount: 0,
    initialSent: false,
    pendingAnswers: []
  });
  setTimeout(() => {
    const metadata = socketMetadata.get(socket);
    if (!metadata || !clients.has(socket) || socket.destroyed) {
      return;
    }
    sendSocketMessage(socket, session.currentMessage);
    metadata.initialSent = true;
    const pendingAnswers = metadata.pendingAnswers.slice();
    metadata.pendingAnswers = [];
    pendingAnswers.reduce(
      (promise, pendingEvent) => promise.then(() => processSocketAnswer(socket, pendingEvent)),
      Promise.resolve()
    ).catch((error) => {
      console.error('Failed to process queued WebSocket answer:', error.message);
    });
  }, 0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      let result;
      try {
        result = decodeFrame(buffer);
      } catch (e) {
        socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
        clients.delete(socket);
        return;
      }
      if (!result) break;
      buffer = buffer.slice(result.bytesConsumed);

      switch (result.opcode) {
        case OPCODES.TEXT:
          handleMessage(socket, result.payload.toString()).catch((error) => {
            console.error('Failed to handle WebSocket message:', error.message);
          });
          break;
        case OPCODES.CLOSE:
          socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
          clients.delete(socket);
          socketSessions.delete(socket);
          socketMetadata.delete(socket);
          return;
        case OPCODES.PING:
          socket.write(encodeFrame(OPCODES.PONG, result.payload));
          break;
        case OPCODES.PONG:
          break;
        default: {
          const closeBuf = Buffer.alloc(2);
          closeBuf.writeUInt16BE(1003);
          socket.end(encodeFrame(OPCODES.CLOSE, closeBuf));
          clients.delete(socket);
          socketSessions.delete(socket);
          socketMetadata.delete(socket);
          return;
        }
      }
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    socketSessions.delete(socket);
    socketMetadata.delete(socket);
  });
  socket.on('error', () => {
    clients.delete(socket);
    socketSessions.delete(socket);
    socketMetadata.delete(socket);
  });
}

async function handleMessage(socket, text) {
  let event;
  try {
    event = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse WebSocket message:', e.message);
    return;
  }
  touchActivity();
  console.log(JSON.stringify({ source: 'user-event', ...event }));
  if (shouldPersistEvent(event)) {
    const eventsFile = path.join(SCREEN_DIR, '.events');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
  }

  if (event.type === 'answer') {
    const metadata = socketMetadata.get(socket);
    if (metadata && !metadata.initialSent) {
      metadata.pendingAnswers.push(event);
      return;
    }
    if (metadata) {
      metadata.answerCount += 1;
    }
    await processSocketAnswer(socket, event);
  }
}

function shouldPersistEvent(event) {
  return Boolean(event.choice) || ['answer', 'summary', 'artifact_ready'].includes(event.type);
}

function broadcast(msg) {
  const frame = encodeFrame(OPCODES.TEXT, Buffer.from(JSON.stringify(msg)));
  for (const socket of clients) {
    try { socket.write(frame); } catch (e) { clients.delete(socket); }
  }
}

// ========== Activity Tracking ==========

const rawIdleTimeout = process.env.BRAINSTORM_IDLE_TIMEOUT_MS;
const IDLE_TIMEOUT_MS = rawIdleTimeout === '0'
  ? 0
  : (rawIdleTimeout ? Number(rawIdleTimeout) : 30 * 60 * 1000); // 30 minutes by default
let lastActivity = Date.now();

function touchActivity() {
  lastActivity = Date.now();
}

// ========== File Watching ==========

const debounceTimers = new Map();

// ========== Server Startup ==========

function startServer() {
  if (!fs.existsSync(SCREEN_DIR)) fs.mkdirSync(SCREEN_DIR, { recursive: true });

  // Track known files to distinguish new screens from updates.
  // macOS fs.watch reports 'rename' for both new files and overwrites,
  // so we can't rely on eventType alone.
  const knownFiles = new Set(
    fs.readdirSync(SCREEN_DIR).filter(f => f.endsWith('.html'))
  );

  const server = http.createServer(handleRequest);
  server.on('upgrade', handleUpgrade);

  const watcher = fs.watch(SCREEN_DIR, (eventType, filename) => {
    if (!filename || !filename.endsWith('.html')) return;

    if (debounceTimers.has(filename)) clearTimeout(debounceTimers.get(filename));
    debounceTimers.set(filename, setTimeout(() => {
      debounceTimers.delete(filename);
      const filePath = path.join(SCREEN_DIR, filename);

      if (!fs.existsSync(filePath)) return; // file was deleted
      touchActivity();

      if (!knownFiles.has(filename)) {
        knownFiles.add(filename);
        const eventsFile = path.join(SCREEN_DIR, '.events');
        if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
        console.log(JSON.stringify({ type: 'screen-added', file: filePath }));
      } else {
        console.log(JSON.stringify({ type: 'screen-updated', file: filePath }));
      }

      broadcast({ type: 'reload' });
    }, 100));
  });
  watcher.on('error', (err) => console.error('fs.watch error:', err.message));

  function shutdown(reason) {
    console.log(JSON.stringify({ type: 'server-stopped', reason }));
    const infoFile = path.join(SCREEN_DIR, '.server-info');
    if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile);
    fs.writeFileSync(
      path.join(SCREEN_DIR, '.server-stopped'),
      JSON.stringify({ reason, timestamp: Date.now() }) + '\n'
    );
    watcher.close();
    clearInterval(lifecycleCheck);
    server.close(() => process.exit(0));
  }

  function ownerAlive() {
    if (!OWNER_PID) return true;
    try { process.kill(OWNER_PID, 0); return true; } catch (e) { return false; }
  }

  // Check every 60s: exit if owner process died or idle timeout is exceeded.
  const lifecycleCheck = setInterval(() => {
    if (!ownerAlive()) shutdown('owner process exited');
    else if (IDLE_TIMEOUT_MS > 0 && Date.now() - lastActivity > IDLE_TIMEOUT_MS) shutdown('idle timeout');
  }, 60 * 1000);
  lifecycleCheck.unref();

  server.listen(PORT, HOST, () => {
    const info = JSON.stringify({
      type: 'server-started', port: Number(PORT), host: HOST,
      url_host: URL_HOST, url: 'http://' + URL_HOST + ':' + PORT,
      screen_dir: SCREEN_DIR
    });
    console.log(info);
    fs.writeFileSync(path.join(SCREEN_DIR, '.server-info'), info + '\n');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { computeAcceptKey, encodeFrame, decodeFrame, OPCODES };
