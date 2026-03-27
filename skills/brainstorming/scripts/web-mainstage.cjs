(function attachBrainstormMainstage(globalScope) {
  const RECENT_CONTEXT_LIMIT = 3;
  const REVIEW_STAGE_IDS = new Set(['review-spec', 'refine-spec', 'review-blocked']);
  const REVIEW_QUESTION_IDS = new Set(['workflow-review-spec', 'workflow-revise-spec']);

  function lastEntries(entries, count) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }
    return entries.slice(Math.max(0, entries.length - count));
  }

  function buildHistoryModel(session, options) {
    const history = Array.isArray(session && session.history) ? session.history : [];
    const expanded = Boolean(options && options.historyExpanded);
    const visibleEntries = expanded ? history.slice() : lastEntries(history, RECENT_CONTEXT_LIMIT);
    const hiddenCount = Math.max(history.length - visibleEntries.length, 0);

    return {
      totalCount: history.length,
      visibleEntries,
      hiddenCount,
      expanded,
      canExpand: hiddenCount > 0
    };
  }

  function isReviewCheckpoint(session) {
    const workflow = session && session.workflow && typeof session.workflow === 'object'
      ? session.workflow
      : {};
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : {};
    const visibleStageId = workflow.visibleStage && workflow.visibleStage.id
      ? workflow.visibleStage.id
      : null;

    return (
      message.type === 'question' && (
        REVIEW_QUESTION_IDS.has(message.questionId)
        || REVIEW_STAGE_IDS.has(visibleStageId)
      )
    );
  }

  function buildCurrentDecision(session, mode) {
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : {};
    const workflow = session && session.workflow && typeof session.workflow === 'object'
      ? session.workflow
      : {};
    const stage = workflow.visibleStage && typeof workflow.visibleStage === 'object'
      ? workflow.visibleStage
      : null;

    if (mode === 'completion') {
      return {
        label: 'Finished Bundle',
        title: message.title || (stage && stage.title) || 'Spec and plan are ready',
        description: message.text || (stage && stage.description) || 'The workflow finished with a reviewable bundle.'
      };
    }

    if (mode === 'summary') {
      return {
        label: 'Session Summary',
        title: message.title || 'Summary ready',
        description: message.text || (stage && stage.description) || 'This session has already converged to a summary.'
      };
    }

    if (mode === 'review') {
      return {
        label: 'Approval Needed',
        title: message.title || (stage && stage.title) || 'Review the drafted document',
        description: message.description || (stage && stage.description) || 'Confirm whether the current draft is ready to continue.'
      };
    }

    return {
      label: 'Current Decision',
      title: message.title || (stage && stage.title) || 'Current question',
      description: message.description || (stage && stage.description) || 'Answer the one active decision to keep the session moving.'
    };
  }

  function pickSupportingArtifact(session) {
    const workflow = session && session.workflow && typeof session.workflow === 'object'
      ? session.workflow
      : {};

    if (workflow.visibleStage && workflow.visibleStage.id === 'review-spec' && workflow.specArtifact) {
      return workflow.specArtifact;
    }
    if (workflow.visibleStage && workflow.visibleStage.id === 'refine-spec' && workflow.specArtifact) {
      return workflow.specArtifact;
    }
    if (workflow.planArtifact) {
      return workflow.planArtifact;
    }
    if (workflow.specArtifact) {
      return workflow.specArtifact;
    }
    return null;
  }

  function buildCompletionPayload(session) {
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : {};
    const workflow = session && session.workflow && typeof session.workflow === 'object'
      ? session.workflow
      : {};
    const artifacts = [];

    if (workflow.specArtifact) {
      artifacts.push({
        kind: 'spec',
        title: workflow.specArtifact.title,
        relativePath: workflow.specArtifact.relativePath,
        previewText: workflow.specArtifact.previewText || ''
      });
    }
    if (workflow.planArtifact) {
      artifacts.push({
        kind: 'plan',
        title: workflow.planArtifact.title,
        relativePath: workflow.planArtifact.relativePath,
        previewText: workflow.planArtifact.previewText || ''
      });
    }

    return {
      title: message.title || 'Spec and plan are ready',
      description: message.text || 'The workflow finished with a reviewable design spec and implementation plan.',
      bundlePath: message.path || null,
      artifactType: message.artifactType || null,
      artifacts
    };
  }

  function deriveMainstageView(session, options) {
    if (!session || !session.currentMessage) {
      return {
        mode: 'empty',
        primaryMessage: null,
        currentDecision: {
          label: 'Current Decision',
          title: 'Start with one real problem.',
          description: 'Use the persistent composer to begin a new brainstorming session.'
        },
        history: buildHistoryModel(null, options),
        supportingArtifact: null,
        completion: null,
        newBrainstorm: { visible: true }
      };
    }

    const message = session.currentMessage;
    let mode = 'question';
    if (message.type === 'artifact_ready') {
      mode = 'completion';
    } else if (message.type === 'summary') {
      mode = 'summary';
    } else if (isReviewCheckpoint(session)) {
      mode = 'review';
    }

    return {
      mode,
      primaryMessage: message,
      currentDecision: buildCurrentDecision(session, mode),
      stage: session.workflow && session.workflow.visibleStage ? session.workflow.visibleStage : null,
      history: buildHistoryModel(session, options),
      supportingArtifact: mode === 'review' ? pickSupportingArtifact(session) : null,
      completion: mode === 'completion' ? buildCompletionPayload(session) : null,
      newBrainstorm: { visible: true }
    };
  }

  const api = {
    RECENT_CONTEXT_LIMIT,
    deriveMainstageView
  };

  if (typeof module !== 'undefined') {
    module.exports = api;
  }
  globalScope.brainstormMainstage = api;
})(typeof window !== 'undefined' ? window : globalThis);
