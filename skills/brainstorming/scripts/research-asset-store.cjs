const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {
  normalizeWorkspace,
  normalizeResearchAssetBundle,
  normalizeReviewRequest,
  normalizeAuditEntry
} = require('./research-asset-model.cjs');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_error) {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.join(dirPath, entry));
}

function deepEqual(left, right) {
  try {
    assert.deepStrictEqual(left, right);
    return true;
  } catch (_error) {
    return false;
  }
}

function createResearchAssetStore(options) {
  const dataDir = options && options.dataDir ? options.dataDir : process.cwd();
  const rootDir = path.join(dataDir, 'research-assets');
  const workspacesDir = path.join(rootDir, 'workspaces');
  const bundlesDir = path.join(rootDir, 'bundles');
  const reviewRequestsDir = path.join(rootDir, 'review-requests');
  const auditDir = path.join(rootDir, 'audit');

  ensureDir(workspacesDir);
  ensureDir(bundlesDir);
  ensureDir(reviewRequestsDir);
  ensureDir(auditDir);

  function saveWorkspace(workspace) {
    const id = workspace && workspace.id ? String(workspace.id) : null;
    const filePath = id ? path.join(workspacesDir, `${id}.json`) : null;
    const existing = filePath && fs.existsSync(filePath) ? safeReadJson(filePath) : null;
    const normalized = normalizeWorkspace(workspace, { existing });
    writeJson(path.join(workspacesDir, `${normalized.id}.json`), normalized);
    return normalized;
  }

  function getWorkspace(workspaceId) {
    const resolvedId = String(workspaceId || '');
    if (!resolvedId) {
      return null;
    }
    const filePath = path.join(workspacesDir, `${resolvedId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const record = safeReadJson(filePath);
    return record ? normalizeWorkspace(record, { existing: record }) : null;
  }

  function listWorkspaces() {
    return listJsonFiles(workspacesDir)
      .map((filePath) => safeReadJson(filePath))
      .filter(Boolean)
      .map((record) => normalizeWorkspace(record, { existing: record }))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  function saveBundle(bundle) {
    const normalized = normalizeResearchAssetBundle(bundle);
    const filePath = path.join(bundlesDir, `${normalized.id}.json`);

    if (fs.existsSync(filePath)) {
      const existing = safeReadJson(filePath);
      const existingNormalized = normalizeResearchAssetBundle(existing, { existing });
      const incomingNormalized = normalizeResearchAssetBundle(normalized, { existing: existingNormalized });
      if (!deepEqual(existingNormalized, incomingNormalized)) {
        throw new Error('Bundle is immutable; attempted overwrite with different content.');
      }
      return existingNormalized;
    }

    writeJson(filePath, normalized);
    return normalized;
  }

  function getBundle(bundleId) {
    const resolvedId = String(bundleId || '');
    if (!resolvedId) {
      return null;
    }
    const filePath = path.join(bundlesDir, `${resolvedId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const record = safeReadJson(filePath);
    return record ? normalizeResearchAssetBundle(record, { existing: record }) : null;
  }

  function updateBundle(bundleId, nextFields) {
    const existing = getBundle(bundleId);
    if (!existing) {
      return null;
    }
    const normalized = normalizeResearchAssetBundle({
      ...existing,
      ...(nextFields || {}),
      id: existing.id
    }, { existing });
    writeJson(path.join(bundlesDir, `${normalized.id}.json`), normalized);
    return normalized;
  }

  function listBundles() {
    return listJsonFiles(bundlesDir)
      .map((filePath) => safeReadJson(filePath))
      .filter(Boolean)
      .map((record) => normalizeResearchAssetBundle(record, { existing: record }))
      .sort((left, right) => String(left.publishedAt).localeCompare(String(right.publishedAt)));
  }

  function saveReviewRequest(request) {
    const id = request && request.id ? String(request.id) : null;
    const filePath = id ? path.join(reviewRequestsDir, `${id}.json`) : null;
    const existing = filePath && fs.existsSync(filePath) ? safeReadJson(filePath) : null;
    const normalized = normalizeReviewRequest(request, { existing });
    writeJson(path.join(reviewRequestsDir, `${normalized.id}.json`), normalized);
    return normalized;
  }

  function getReviewRequest(requestId) {
    const resolvedId = String(requestId || '');
    if (!resolvedId) {
      return null;
    }
    const filePath = path.join(reviewRequestsDir, `${resolvedId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const record = safeReadJson(filePath);
    return record ? normalizeReviewRequest(record, { existing: record }) : null;
  }

  function listReviewRequests() {
    return listJsonFiles(reviewRequestsDir)
      .map((filePath) => safeReadJson(filePath))
      .filter(Boolean)
      .map((record) => normalizeReviewRequest(record, { existing: record }))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  function auditLogPath(workspaceId) {
    return path.join(auditDir, `${workspaceId}.ndjson`);
  }

  function appendAuditEntry(workspaceId, entry) {
    const resolvedWorkspaceId = String(workspaceId || '');
    if (!resolvedWorkspaceId) {
      throw new Error('workspaceId is required for audit entries');
    }

    const normalized = normalizeAuditEntry({ ...entry, workspaceId: resolvedWorkspaceId });
    fs.appendFileSync(auditLogPath(resolvedWorkspaceId), JSON.stringify(normalized) + '\n');
    return normalized;
  }

  function listAuditEntries(workspaceId) {
    const resolvedWorkspaceId = String(workspaceId || '');
    if (!resolvedWorkspaceId) {
      return [];
    }
    const filePath = auditLogPath(resolvedWorkspaceId);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').map((line) => line.trim()).filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean)
      .map((record) => normalizeAuditEntry(record, { existing: record }))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  return {
    saveWorkspace,
    getWorkspace,
    listWorkspaces,
    saveBundle,
    getBundle,
    updateBundle,
    listBundles,
    saveReviewRequest,
    getReviewRequest,
    listReviewRequests,
    appendAuditEntry,
    listAuditEntries
  };
}

module.exports = {
  createResearchAssetStore
};
