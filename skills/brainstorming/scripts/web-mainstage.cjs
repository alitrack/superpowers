(function attachBrainstormMainstage(globalScope) {
  const RECENT_CONTEXT_LIMIT = 3;
  const REVIEW_STAGE_IDS = new Set(['review-spec', 'refine-spec', 'review-blocked']);
  const REVIEW_QUESTION_IDS = new Set(['workflow-review-spec', 'workflow-revise-spec']);
  const WORKSPACE_MODE_FOCUSED = 'focused';
  const WORKSPACE_MODE_OVERVIEW = 'overview';

  function lastEntries(entries, count) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }
    return entries.slice(Math.max(0, entries.length - count));
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'result';
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

  function getFinishedResult(session) {
    if (session && session.finishedResult && typeof session.finishedResult === 'object') {
      return session.finishedResult;
    }
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : null;
    if (message && message.finishedResult && typeof message.finishedResult === 'object') {
      return message.finishedResult;
    }
    return null;
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
    const finishedResult = getFinishedResult(session);

    if (mode === 'completion') {
      return {
        label: 'Finished Result',
        title: (finishedResult && finishedResult.recommendationTitle)
          || message.title
          || (stage && stage.title)
          || 'Finished result',
        description: (finishedResult && finishedResult.recommendationSummary)
          || message.text
          || (stage && stage.description)
          || 'The workflow finished with a reviewable result.'
      };
    }

    if (mode === 'summary') {
      return {
        label: 'Finished Result',
        title: (finishedResult && finishedResult.recommendationTitle)
          || message.title
          || 'Summary ready',
        description: (finishedResult && finishedResult.recommendationSummary)
          || message.text
          || (stage && stage.description)
          || 'This session has already converged to a mature result.'
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
    const finishedResult = getFinishedResult(session);

    if (finishedResult) {
      return {
        title: finishedResult.title || message.title || 'Finished result',
        description: message.text || finishedResult.recommendationSummary || 'The session converged to a finished result.',
        recommendationTitle: finishedResult.recommendationTitle || finishedResult.title || message.title || 'Finished result',
        recommendationSummary: finishedResult.recommendationSummary || message.text || '',
        exportPaths: finishedResult.exportPaths || null,
        sections: Array.isArray(finishedResult.sections) ? finishedResult.sections : [],
        supportingArtifacts: Array.isArray(finishedResult.supportingArtifacts) ? finishedResult.supportingArtifacts : [],
        bundlePath: message.path || null,
        artifactType: message.artifactType || null
      };
    }

    return {
      title: message.title || 'Spec and plan are ready',
      description: message.text || 'The workflow finished with a reviewable design spec and implementation plan.',
      recommendationTitle: message.title || 'Spec and plan are ready',
      recommendationSummary: message.text || 'The workflow finished with a reviewable design spec and implementation plan.',
      exportPaths: null,
      sections: [],
      supportingArtifacts: [],
      bundlePath: message.path || null,
      artifactType: message.artifactType || null
    };
  }

  function extractSynthesisDirections(session) {
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : {};
    const summary = session && session.summary && typeof session.summary === 'object'
      ? session.summary
      : {};
    const synthesis = (message.synthesis && typeof message.synthesis === 'object')
      ? message.synthesis
      : ((summary.synthesis && typeof summary.synthesis === 'object') ? summary.synthesis : null);

    if (!synthesis) {
      return [];
    }

    const shortlisted = Array.isArray(synthesis.shortlistedDirections) ? synthesis.shortlistedDirections : [];
    if (shortlisted.length > 0) {
      return shortlisted;
    }

    return Array.isArray(synthesis.exploredDirections) ? synthesis.exploredDirections : [];
  }

  function createWorkbenchNode(id, kind, title, body, options) {
    const resolved = options && typeof options === 'object' ? options : {};
    return {
      id,
      kind,
      title,
      body: body || '',
      label: resolved.label || null,
      badge: resolved.badge || null,
      previewText: resolved.previewText || body || null,
      questionId: resolved.questionId || null,
      depth: typeof resolved.depth === 'number' ? resolved.depth : 0,
      status: resolved.status || 'context',
      isActive: Boolean(resolved.isActive),
      inspectable: resolved.inspectable !== false
    };
  }

  function buildMetaPills(session, historyModel, workspaceMode) {
    const pills = [];
    const stage = session && session.workflow && session.workflow.visibleStage
      ? session.workflow.visibleStage
      : null;
    if (stage && stage.title) {
      pills.push(stage.title);
    }
    if (historyModel && typeof historyModel.totalCount === 'number') {
      pills.push(`${historyModel.totalCount} completed step${historyModel.totalCount === 1 ? '' : 's'}`);
    }
    if (workspaceMode) {
      pills.push(workspaceMode);
    }
    if (session && session.completionMode) {
      pills.push(`${session.completionMode} mode`);
    }
    return pills;
  }

  function buildDecisionTree(session, mode, historyModel, supportingArtifact, completion, currentDecision, workspaceMode) {
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : {};
    const visibleHistory = historyModel && Array.isArray(historyModel.visibleEntries)
      ? historyModel.visibleEntries
      : [];
    const pathNodes = [];

    pathNodes.push(createWorkbenchNode(
      'root-topic',
      'root-topic',
      session && session.seedPrompt ? session.seedPrompt : 'Brainstorm topic',
      session && session.seedPrompt
        ? 'The seed prompt that started this session.'
        : 'Start a session to create a visible branch path.',
      {
        badge: 'Topic',
        label: 'Topic',
        status: 'complete',
        depth: 0
      }
    ));

    visibleHistory.forEach((entry, index) => {
      pathNodes.push(createWorkbenchNode(
        `history-${entry.questionId || index + 1}`,
        'recent-step',
        entry.question || entry.questionId || `Step ${index + 1}`,
        entry.answer || '',
        {
          badge: 'Answered',
          label: `Step ${index + 1}`,
          status: 'complete',
          depth: index + 1,
          questionId: entry.questionId || null
        }
      ));
    });

    let activeKind = 'active-decision';
    if (mode === 'review') {
      activeKind = 'review-decision';
    } else if (mode === 'completion') {
      activeKind = 'completion-cluster';
    } else if (mode === 'summary') {
      activeKind = 'summary-anchor';
    } else if (mode === 'empty') {
      activeKind = 'empty-anchor';
    }

    pathNodes.push(createWorkbenchNode(
      `active-${message.questionId || mode || 'node'}`,
      activeKind,
      currentDecision.title,
      currentDecision.description,
      {
        badge: mode === 'review'
          ? 'Approval'
          : (mode === 'completion' || mode === 'summary' ? 'Result' : 'Active'),
        label: currentDecision.label,
        status: mode === 'completion' || mode === 'summary' ? 'complete' : 'active',
        depth: pathNodes.length,
        isActive: true,
        questionId: message.questionId || null,
        inspectable: false
      }
    ));

    const directions = extractSynthesisDirections(session).slice(0, workspaceMode === WORKSPACE_MODE_OVERVIEW ? 3 : 2);
    const contextNodes = directions.map((direction, index) => createWorkbenchNode(
      `direction-${index + 1}`,
      'shortlisted-direction',
      `Direction ${index + 1}`,
      direction,
      {
        badge: 'Direction',
        label: 'Adjacent path',
        status: 'branch',
        previewText: direction
      }
    ));

    if (mode === 'review' && supportingArtifact) {
      contextNodes.unshift(createWorkbenchNode(
        'review-draft',
        'review-draft',
        supportingArtifact.title || 'Current draft',
        supportingArtifact.previewText || 'Draft preview unavailable.',
        {
          badge: 'Draft',
          label: 'Checkpoint draft',
          status: 'checkpoint',
          previewText: supportingArtifact.previewText || ''
        }
      ));
    }

    const resultNodes = completion
      ? completion.sections.map((section, index) => createWorkbenchNode(
          `result-${section.id || slugify(section.title || `section-${index + 1}`)}`,
          'result-section',
          section.title || 'Result section',
          Array.isArray(section.items) ? section.items.join('\n') : '',
          {
            badge: 'Result',
            label: 'Finished result',
            status: 'complete',
            previewText: Array.isArray(section.items) ? section.items.join('\n') : ''
          }
        ))
      : [];

    return {
      rootLabel: session && session.seedPrompt ? session.seedPrompt : 'Brainstorm topic',
      hiddenCount: historyModel ? historyModel.hiddenCount : 0,
      pathNodes,
      contextNodes,
      resultNodes
    };
  }

  function buildContextPanel(decisionTree, completion, stage) {
    const preferredNodes = []
      .concat(Array.isArray(decisionTree && decisionTree.contextNodes) ? decisionTree.contextNodes : [])
      .concat(Array.isArray(decisionTree && decisionTree.resultNodes) ? decisionTree.resultNodes : []);
    const pathNodes = Array.isArray(decisionTree && decisionTree.pathNodes) ? decisionTree.pathNodes : [];
    const inspectableNodes = preferredNodes.concat(pathNodes);
    const selectedNode = inspectableNodes.find((node) => node.id === (decisionTree && decisionTree.selectedNodeId))
      || preferredNodes[0]
      || pathNodes[0]
      || null;
    const sections = [];

    if (selectedNode) {
      sections.push({
        id: 'selected-node',
        kind: 'selected-node',
        title: selectedNode.title || 'Selected node',
        body: selectedNode.previewText || selectedNode.body || ''
      });
    } else {
      sections.push({
        id: 'selected-node',
        kind: 'selected-node',
        title: 'Selected node',
        body: 'Select a branch node, checkpoint, or result section to inspect it here.'
      });
    }

    if (completion) {
      completion.sections.forEach((section) => {
        sections.push({
          id: `section-${section.id || slugify(section.title || 'section')}`,
          kind: 'result-section',
          title: section.title || 'Result section',
          body: Array.isArray(section.items) ? section.items.join('\n') : ''
        });
      });
    } else if (stage && stage.description) {
      sections.push({
        id: 'stage-context',
        kind: 'stage-context',
        title: stage.title || 'Current stage',
        body: stage.description
      });
    }

    return {
      selectedNodeId: selectedNode ? selectedNode.id : null,
      selectedNode,
      sections,
      packageItems: completion && Array.isArray(completion.supportingArtifacts)
        ? completion.supportingArtifacts
        : []
    };
  }

  function buildCanvasWorkspace(session, options, mode, historyModel, supportingArtifact, completion, currentDecision) {
    const resolvedOptions = options && typeof options === 'object' ? options : {};
    const workspaceMode = resolvedOptions.workspaceMode === WORKSPACE_MODE_OVERVIEW
      ? WORKSPACE_MODE_OVERVIEW
      : WORKSPACE_MODE_FOCUSED;
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : {};
    const stage = session && session.workflow && session.workflow.visibleStage
      ? session.workflow.visibleStage
      : null;
    const decisionTree = buildDecisionTree(
      session,
      mode,
      historyModel,
      supportingArtifact,
      completion,
      currentDecision,
      workspaceMode
    );
    decisionTree.selectedNodeId = resolvedOptions.inspectedCardId || null;
    const contextPanel = buildContextPanel(decisionTree, completion, stage);

    return {
      mode: workspaceMode,
      activeStage: {
        kind: decisionTree.pathNodes.length > 0
          ? decisionTree.pathNodes[decisionTree.pathNodes.length - 1].kind
          : 'empty-anchor',
        label: currentDecision.label,
        title: currentDecision.title,
        description: currentDecision.description,
        questionId: message.questionId || null,
        isAnswerable: mode === 'question' || mode === 'review',
        metaPills: buildMetaPills(session, historyModel, workspaceMode)
      },
      decisionTree,
      contextPanel,
      dock: {
        hasNewBrainstormEntry: true,
        hasFullHistoryEntry: historyModel.canExpand || historyModel.expanded,
        canToggleWorkspaceMode: true,
        workspaceMode
      }
    };
  }

  function deriveMainstageView(session, options) {
    if (!session || !session.currentMessage) {
      const currentDecision = {
        label: 'Current Decision',
        title: 'Start with one real problem.',
        description: 'Use the persistent composer to begin a new brainstorming session.'
      };
      const history = buildHistoryModel(null, options);
      return {
        mode: 'empty',
        primaryMessage: null,
        currentDecision,
        history,
        supportingArtifact: null,
        completion: null,
        newBrainstorm: { visible: true },
        canvasWorkspace: buildCanvasWorkspace(null, options, 'empty', history, null, null, currentDecision)
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

    const currentDecision = buildCurrentDecision(session, mode);
    const history = buildHistoryModel(session, options);
    const supportingArtifact = mode === 'review' ? pickSupportingArtifact(session) : null;
    const completion = mode === 'completion' || mode === 'summary'
      ? buildCompletionPayload(session)
      : null;

    return {
      mode,
      primaryMessage: message,
      currentDecision,
      stage: session.workflow && session.workflow.visibleStage ? session.workflow.visibleStage : null,
      history,
      supportingArtifact,
      completion,
      newBrainstorm: { visible: true },
      canvasWorkspace: buildCanvasWorkspace(session, options, mode, history, supportingArtifact, completion, currentDecision)
    };
  }

  const api = {
    RECENT_CONTEXT_LIMIT,
    WORKSPACE_MODE_FOCUSED,
    WORKSPACE_MODE_OVERVIEW,
    deriveMainstageView
  };

  if (typeof module !== 'undefined') {
    module.exports = api;
  }
  globalScope.brainstormMainstage = api;
})(typeof window !== 'undefined' ? window : globalThis);
