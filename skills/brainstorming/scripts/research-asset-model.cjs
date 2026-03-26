const crypto = require('crypto');

const WORKSPACE_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  READY_FOR_PUBLISH: 'ready_for_publish',
  ARCHIVED: 'archived'
});

const BUNDLE_STATUS = Object.freeze({
  PUBLISHED: 'published',
  SUPERSEDED: 'superseded',
  ARCHIVED: 'archived'
});

const REVIEW_REQUEST_STATUS = Object.freeze({
  OPEN: 'open',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  NEEDS_CHANGES: 'needs_changes'
});

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const items = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${items.join(',')}}`;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function normalizeWorkspace(workspace, options) {
  const input = isPlainObject(workspace) ? workspace : {};
  const existing = options && isPlainObject(options.existing) ? options.existing : null;
  const createdAt = input.createdAt || (existing && existing.createdAt) || nowIso();

  return {
    type: 'workspace',
    id: input.id || (existing && existing.id) || createId(),
    sessionId: typeof input.sessionId === 'string'
      ? input.sessionId
      : (existing && existing.sessionId) || null,
    title: typeof input.title === 'string' ? input.title : (existing && existing.title) || null,
    team: typeof input.team === 'string' ? input.team : (existing && existing.team) || null,
    owner: typeof input.owner === 'string' ? input.owner : (existing && existing.owner) || null,
    status: Object.values(WORKSPACE_STATUS).includes(input.status)
      ? input.status
      : (existing && existing.status) || WORKSPACE_STATUS.DRAFT,
    rootQuestionId: typeof input.rootQuestionId === 'string'
      ? input.rootQuestionId
      : (existing && existing.rootQuestionId) || null,
    researchQuestion: isPlainObject(input.researchQuestion)
      ? input.researchQuestion
      : (existing && isPlainObject(existing.researchQuestion) ? existing.researchQuestion : null),
    hypotheses: Array.isArray(input.hypotheses)
      ? input.hypotheses
      : (existing && Array.isArray(existing.hypotheses) ? existing.hypotheses : []),
    evidence: Array.isArray(input.evidence)
      ? input.evidence
      : (existing && Array.isArray(existing.evidence) ? existing.evidence : []),
    judgments: Array.isArray(input.judgments)
      ? input.judgments
      : (existing && Array.isArray(existing.judgments) ? existing.judgments : []),
    conclusion: isPlainObject(input.conclusion)
      ? input.conclusion
      : (existing && isPlainObject(existing.conclusion) ? existing.conclusion : null),
    checkpoints: Array.isArray(input.checkpoints)
      ? input.checkpoints
      : (existing && Array.isArray(existing.checkpoints) ? existing.checkpoints : []),
    reviewRequests: Array.isArray(input.reviewRequests)
      ? input.reviewRequests
      : (existing && Array.isArray(existing.reviewRequests) ? existing.reviewRequests : []),
    auditRefs: Array.isArray(input.auditRefs)
      ? input.auditRefs
      : (existing && Array.isArray(existing.auditRefs) ? existing.auditRefs : []),
    permissions: isPlainObject(input.permissions)
      ? input.permissions
      : (existing && isPlainObject(existing.permissions) ? existing.permissions : {}),
    sourceBundleId: typeof input.sourceBundleId === 'string'
      ? input.sourceBundleId
      : (existing && existing.sourceBundleId) || null,
    latestBundleId: typeof input.latestBundleId === 'string'
      ? input.latestBundleId
      : (existing && existing.latestBundleId) || null,
    conclusionOpenRisksMentionActiveBranches: typeof input.conclusionOpenRisksMentionActiveBranches === 'boolean'
      ? input.conclusionOpenRisksMentionActiveBranches
      : (existing && typeof existing.conclusionOpenRisksMentionActiveBranches === 'boolean'
          ? existing.conclusionOpenRisksMentionActiveBranches
          : false),
    createdAt,
    updatedAt: nowIso(),
    metadata: isPlainObject(input.metadata)
      ? input.metadata
      : (existing && isPlainObject(existing.metadata) ? existing.metadata : {})
  };
}

function normalizeSource(source) {
  const input = isPlainObject(source) ? source : {};
  const kind = typeof input.kind === 'string' ? input.kind.trim() : 'unknown';
  const normalized = { kind };

  if (kind === 'url') {
    normalized.url = typeof input.url === 'string' ? input.url : null;
    normalized.title = typeof input.title === 'string' ? input.title : null;
  } else {
    normalized.value = input.value !== undefined ? input.value : null;
  }

  return normalized;
}

function fingerprintSource(source) {
  const normalized = normalizeSource(source);
  return sha256Hex(stableStringify(normalized));
}

function normalizeResearchAssetBundle(bundle, options) {
  const input = isPlainObject(bundle) ? bundle : {};
  const existing = options && isPlainObject(options.existing) ? options.existing : null;

  const status = Object.values(BUNDLE_STATUS).includes(input.status)
    ? input.status
    : (existing && existing.status) || BUNDLE_STATUS.PUBLISHED;
  const publishedAt = input.publishedAt || (existing && existing.publishedAt) || (status === BUNDLE_STATUS.PUBLISHED ? nowIso() : null);

  const sources = Array.isArray(input.sources)
    ? input.sources.map(normalizeSource)
    : (existing && Array.isArray(existing.sources) ? existing.sources : []);

  const sourceFingerprints = sources.map(fingerprintSource);

  return {
    type: 'bundle',
    id: input.id || (existing && existing.id) || createId(),
    workspaceId: typeof input.workspaceId === 'string'
      ? input.workspaceId
      : (existing && existing.workspaceId) || null,
    rootQuestionId: typeof input.rootQuestionId === 'string'
      ? input.rootQuestionId
      : (existing && existing.rootQuestionId) || null,
    status,
    title: typeof input.title === 'string' ? input.title : (existing && existing.title) || null,
    team: typeof input.team === 'string' ? input.team : (existing && existing.team) || null,
    permissions: isPlainObject(input.permissions)
      ? input.permissions
      : (existing && isPlainObject(existing.permissions) ? existing.permissions : {}),
    sourceWorkspace: isPlainObject(input.sourceWorkspace)
      ? input.sourceWorkspace
      : (existing && isPlainObject(existing.sourceWorkspace) ? existing.sourceWorkspace : null),
    version: Number.isInteger(input.version) ? input.version : (existing && existing.version) || 1,
    supersededByVersion: Number.isInteger(input.supersededByVersion)
      ? input.supersededByVersion
      : (existing && existing.supersededByVersion) || null,
    publishSummary: typeof input.publishSummary === 'string'
      ? input.publishSummary
      : (existing && existing.publishSummary) || '',
    publishedAt,
    sources,
    sourceFingerprints,
    researchQuestion: isPlainObject(input.researchQuestion)
      ? input.researchQuestion
      : (existing && isPlainObject(existing.researchQuestion) ? existing.researchQuestion : null),
    includedHypotheses: Array.isArray(input.includedHypotheses)
      ? input.includedHypotheses
      : (existing && Array.isArray(existing.includedHypotheses) ? existing.includedHypotheses : []),
    includedEvidence: Array.isArray(input.includedEvidence)
      ? input.includedEvidence
      : (existing && Array.isArray(existing.includedEvidence) ? existing.includedEvidence : []),
    includedJudgments: Array.isArray(input.includedJudgments)
      ? input.includedJudgments
      : (existing && Array.isArray(existing.includedJudgments) ? existing.includedJudgments : []),
    conclusion: isPlainObject(input.conclusion)
      ? input.conclusion
      : (existing && isPlainObject(existing.conclusion) ? existing.conclusion : null),
    excludedEvidence: Array.isArray(input.excludedEvidence)
      ? input.excludedEvidence
      : (existing && Array.isArray(existing.excludedEvidence) ? existing.excludedEvidence : []),
    checkpointRefs: Array.isArray(input.checkpointRefs)
      ? input.checkpointRefs
      : (existing && Array.isArray(existing.checkpointRefs) ? existing.checkpointRefs : []),
    auditRefs: Array.isArray(input.auditRefs)
      ? input.auditRefs
      : (existing && Array.isArray(existing.auditRefs) ? existing.auditRefs : []),
    sharedWithTeams: Array.isArray(input.sharedWithTeams)
      ? input.sharedWithTeams
      : (existing && Array.isArray(existing.sharedWithTeams) ? existing.sharedWithTeams : []),
    assets: Array.isArray(input.assets)
      ? input.assets
      : (existing && Array.isArray(existing.assets) ? existing.assets : [])
  };
}

function normalizeReviewRequest(request, options) {
  const input = isPlainObject(request) ? request : {};
  const existing = options && isPlainObject(options.existing) ? options.existing : null;
  const createdAt = input.createdAt || (existing && existing.createdAt) || nowIso();
  const requestType = typeof input.requestType === 'string'
    ? input.requestType
    : (typeof input.type === 'string' ? input.type : (existing && existing.type) || (existing && existing.requestType) || null);
  const status = Object.values(REVIEW_REQUEST_STATUS).includes(input.status)
    ? input.status
    : (existing && existing.status) || REVIEW_REQUEST_STATUS.OPEN;

  return {
    entityType: 'review_request',
    id: input.id || (existing && existing.id) || createId(),
    type: requestType,
    requestType,
    targetType: typeof input.targetType === 'string'
      ? input.targetType
      : (existing && existing.targetType) || null,
    targetId: typeof input.targetId === 'string'
      ? input.targetId
      : (existing && existing.targetId) || null,
    workspaceId: typeof input.workspaceId === 'string'
      ? input.workspaceId
      : (existing && existing.workspaceId) || null,
    bundleId: typeof input.bundleId === 'string'
      ? input.bundleId
      : (existing && existing.bundleId) || null,
    assigneeId: typeof input.assigneeId === 'string'
      ? input.assigneeId
      : (existing && existing.assigneeId) || null,
    status,
    requestedBy: typeof input.requestedBy === 'string'
      ? input.requestedBy
      : (existing && existing.requestedBy) || null,
    createdAt,
    updatedAt: nowIso(),
    metadata: isPlainObject(input.metadata)
      ? input.metadata
      : (existing && isPlainObject(existing.metadata) ? existing.metadata : {})
  };
}

function normalizeAuditEntry(entry, options) {
  const input = isPlainObject(entry) ? entry : {};
  const existing = options && isPlainObject(options.existing) ? options.existing : null;

  return {
    type: 'audit_entry',
    id: input.id || (existing && existing.id) || createId(),
    workspaceId: typeof input.workspaceId === 'string'
      ? input.workspaceId
      : (existing && existing.workspaceId) || null,
    timestamp: input.timestamp || (existing && existing.timestamp) || nowIso(),
    createdAt: input.createdAt || (existing && existing.createdAt) || input.timestamp || (existing && existing.timestamp) || nowIso(),
    action: typeof input.action === 'string'
      ? input.action
      : (typeof input.kind === 'string' ? input.kind : (existing && existing.action) || (existing && existing.kind) || 'unknown'),
    actorId: typeof input.actorId === 'string'
      ? input.actorId
      : (typeof input.actor === 'string' ? input.actor : (existing && existing.actorId) || (existing && existing.actor) || null),
    actorRole: typeof input.actorRole === 'string'
      ? input.actorRole
      : (existing && existing.actorRole) || null,
    targetType: typeof input.targetType === 'string'
      ? input.targetType
      : (existing && existing.targetType) || null,
    targetId: typeof input.targetId === 'string'
      ? input.targetId
      : (existing && existing.targetId) || null,
    assetVersion: Number.isInteger(input.assetVersion)
      ? input.assetVersion
      : (existing && existing.assetVersion) || null,
    before: isPlainObject(input.before) ? input.before : (existing && isPlainObject(existing.before) ? existing.before : null),
    after: isPlainObject(input.after) ? input.after : (existing && isPlainObject(existing.after) ? existing.after : null),
    reason: typeof input.reason === 'string' ? input.reason : (existing && existing.reason) || '',
    message: typeof input.message === 'string' ? input.message : (existing && existing.message) || null,
    details: isPlainObject(input.details)
      ? input.details
      : (existing && isPlainObject(existing.details) ? existing.details : {})
  };
}

module.exports = {
  WORKSPACE_STATUS,
  BUNDLE_STATUS,
  REVIEW_REQUEST_STATUS,
  fingerprintSource,
  normalizeWorkspace,
  normalizeResearchAssetBundle,
  normalizeReviewRequest,
  normalizeAuditEntry
};
