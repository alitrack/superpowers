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

  function getCurrentChoiceBadge(message) {
    const questionId = message && message.questionId ? message.questionId : '';
    if (questionId === 'seed-criterion') {
      return 'Criterion';
    }
    if (questionId === 'seed-path') {
      return 'Path';
    }
    if (questionId === 'seed-directions') {
      return 'Direction';
    }
    return 'Option';
  }

  function getStrategyState(session) {
    return session && session.strategyState && typeof session.strategyState === 'object'
      ? session.strategyState
      : {};
  }

  function buildRoundId(questionId, seenCounts) {
    const normalized = String(questionId || 'round')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'round';
    const nextCount = (seenCounts.get(normalized) || 0) + 1;
    seenCounts.set(normalized, nextCount);
    return nextCount === 1 ? `round-${normalized}` : `round-${normalized}-${nextCount}`;
  }

  function doesRoundRepresentMessage(round, message) {
    if (!round || !message || message.type !== 'question') {
      return false;
    }
    const roundMessage = round.message && typeof round.message === 'object'
      ? round.message
      : null;
    const roundQuestionId = roundMessage && roundMessage.questionId
      ? roundMessage.questionId
      : round.questionId;
    const roundTitle = roundMessage && roundMessage.title
      ? roundMessage.title
      : round.title;

    return Boolean(
      roundQuestionId
      && message.questionId
      && roundQuestionId === message.questionId
      && roundTitle === message.title
    );
  }

  function buildUniqueRoundId(rounds, questionId) {
    const normalized = String(questionId || 'current')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'current';
    const existingIds = new Set(
      Array.isArray(rounds)
        ? rounds.map((round) => round && round.id).filter(Boolean)
        : []
    );
    let nextId = `round-${normalized}`;
    let suffix = 2;
    while (existingIds.has(nextId)) {
      nextId = `round-${normalized}-${suffix}`;
      suffix += 1;
    }
    return nextId;
  }

  function getWorkflowReviewAnswerSummary(session, reviewMessage) {
    const workflow = session && session.workflow && typeof session.workflow === 'object'
      ? session.workflow
      : {};
    const checkpoints = Array.isArray(workflow.approvalCheckpoints) ? workflow.approvalCheckpoints : [];
    const reviewCheckpoint = checkpoints.find((checkpoint) => checkpoint && checkpoint.questionId === 'workflow-review-spec');
    const reviewOptions = reviewMessage && Array.isArray(reviewMessage.options) ? reviewMessage.options : [];

    if (reviewCheckpoint && reviewCheckpoint.decision === 'approved') {
      const approvedOption = reviewOptions.find((option) => option.id === 'yes');
      return approvedOption ? approvedOption.label : 'Looks right, continue';
    }
    if (reviewCheckpoint && reviewCheckpoint.decision === 'needs_changes') {
      const reviseOption = reviewOptions.find((option) => option.id === 'no');
      return reviseOption ? reviseOption.label : 'Needs changes first';
    }
    return null;
  }

  function normalizeRoundGraph(session, roundGraph) {
    if (!roundGraph || typeof roundGraph !== 'object' || !Array.isArray(roundGraph.rounds)) {
      return roundGraph;
    }
    const rounds = roundGraph.rounds.slice();
    const currentMessage = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : null;
    if (!currentMessage || currentMessage.type !== 'question') {
      const workflow = session && session.workflow && typeof session.workflow === 'object'
        ? session.workflow
        : {};
      const visibleStageId = workflow.visibleStage && workflow.visibleStage.id
        ? workflow.visibleStage.id
        : null;
      const hasWorkflowReviewRound = rounds.some((round) => round && round.questionId === 'workflow-review-spec');

      if (
        workflow.mode === 'full_skill'
        && visibleStageId === 'plan-ready'
        && !hasWorkflowReviewRound
      ) {
        const mainlineRounds = rounds.filter((round) => round && round.lane === 'mainline');
        const parentRoundId = mainlineRounds.length > 0
          ? mainlineRounds[mainlineRounds.length - 1].id
          : (roundGraph.topicNodeId || 'topic-root');
        const reviewMessage = {
          type: 'question',
          questionType: 'confirm',
          questionId: 'workflow-review-spec',
          title: 'Review the drafted workflow document',
          description: 'Review the drafted document and confirm whether it is accurate enough to continue into the implementation plan.',
          options: [
            { id: 'yes', label: 'Looks right, continue', description: 'Proceed with the current draft.' },
            { id: 'no', label: 'Needs changes first', description: 'Capture changes before continuing.' }
          ],
          allowTextOverride: false
        };
        rounds.push({
          id: buildUniqueRoundId(rounds, 'workflow-review-spec'),
          kind: 'round',
          lane: 'mainline',
          parentRoundId,
          questionId: 'workflow-review-spec',
          title: reviewMessage.title,
          previewText: reviewMessage.description,
          answerSummary: getWorkflowReviewAnswerSummary(session, reviewMessage),
          status: 'complete',
          message: reviewMessage
        });
        return {
          ...roundGraph,
          rounds
        };
      }

      return roundGraph;
    }
    let currentMainlineRoundId = roundGraph.currentMainlineRoundId || null;
    let currentRoundIndex = currentMainlineRoundId
      ? rounds.findIndex((round) => round && round.id === currentMainlineRoundId)
      : -1;

    if (currentRoundIndex < 0 || !doesRoundRepresentMessage(rounds[currentRoundIndex], currentMessage)) {
      currentRoundIndex = rounds.findIndex((round) => doesRoundRepresentMessage(round, currentMessage));
      currentMainlineRoundId = currentRoundIndex >= 0 ? rounds[currentRoundIndex].id : null;
    }

    if (currentRoundIndex >= 0) {
      const existingRound = rounds[currentRoundIndex];
      const selectedBranchRunId = getStrategyState(session).selectedBranchRunId || null;
      const nextStatus = selectedBranchRunId ? 'available' : 'active';
      const needsUpdate = (
        existingRound.message !== currentMessage
        || existingRound.status !== nextStatus
        || (existingRound.previewText || '') !== (currentMessage.description || '')
      );
      if (!needsUpdate && currentMainlineRoundId === roundGraph.currentMainlineRoundId) {
        return roundGraph;
      }
      rounds[currentRoundIndex] = {
        ...existingRound,
        title: currentMessage.title || existingRound.title || 'Current question',
        previewText: currentMessage.description || existingRound.previewText || '',
        status: nextStatus,
        message: currentMessage
      };
      return {
        ...roundGraph,
        currentMainlineRoundId,
        activeRoundId: selectedBranchRunId || currentMainlineRoundId,
        rounds
      };
    }

    const mainlineRounds = rounds.filter((round) => round && round.lane === 'mainline');
    const parentRoundId = mainlineRounds.length > 0
      ? mainlineRounds[mainlineRounds.length - 1].id
      : (roundGraph.topicNodeId || 'topic-root');
    const syntheticRoundId = buildUniqueRoundId(rounds, currentMessage.questionId || 'current');
    const selectedBranchRunId = getStrategyState(session).selectedBranchRunId || null;

    rounds.push({
      id: syntheticRoundId,
      kind: 'round',
      lane: 'mainline',
      parentRoundId,
      questionId: currentMessage.questionId || null,
      title: currentMessage.title || 'Current question',
      previewText: currentMessage.description || '',
      answerSummary: null,
      status: selectedBranchRunId ? 'available' : 'active',
      message: currentMessage
    });

    return {
      ...roundGraph,
      currentMainlineRoundId: syntheticRoundId,
      activeRoundId: selectedBranchRunId || syntheticRoundId,
      rounds
    };
  }

  function buildDerivedRoundGraph(session) {
    const history = Array.isArray(session && session.history) ? session.history : [];
    const currentMessage = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : null;
    const strategyState = getStrategyState(session);
    const seenCounts = new Map();
    const roundIdsByQuestionId = new Map();
    const rounds = [];
    let previousRoundId = 'topic-root';

    history.forEach((entry, index) => {
      const roundId = buildRoundId(entry && entry.questionId ? entry.questionId : `step-${index + 1}`, seenCounts);
      rounds.push({
        id: roundId,
        kind: 'round',
        lane: 'mainline',
        parentRoundId: previousRoundId,
        questionId: entry && entry.questionId ? entry.questionId : null,
        title: entry && entry.question ? entry.question : `Step ${index + 1}`,
        previewText: entry && entry.answer ? entry.answer : '',
        answerSummary: entry && entry.answer ? entry.answer : '',
        status: 'complete',
        message: null
      });
      previousRoundId = roundId;
      if (entry && entry.questionId) {
        roundIdsByQuestionId.set(entry.questionId, roundId);
      }
    });

    let currentMainlineRoundId = null;
    if (currentMessage && currentMessage.type === 'question') {
      currentMainlineRoundId = buildRoundId(currentMessage.questionId || 'current', seenCounts);
      rounds.push({
        id: currentMainlineRoundId,
        kind: 'round',
        lane: 'mainline',
        parentRoundId: previousRoundId,
        questionId: currentMessage.questionId || null,
        title: currentMessage.title || 'Current question',
        previewText: currentMessage.description || '',
        answerSummary: null,
        status: strategyState.selectedBranchRunId ? 'available' : 'active',
        message: currentMessage
      });
      if (currentMessage.questionId) {
        roundIdsByQuestionId.set(currentMessage.questionId, currentMainlineRoundId);
      }
    }

    const branchRuns = Array.isArray(strategyState.branchRuns)
      ? strategyState.branchRuns.filter((branchRun) => branchRun && typeof branchRun === 'object')
      : [];
    branchRuns.forEach((branchRun) => {
      const branchMessage = branchRun.currentMessage && typeof branchRun.currentMessage === 'object'
        ? branchRun.currentMessage
        : null;
      rounds.push({
        id: branchRun.id,
        kind: 'round',
        lane: 'branch',
        parentRoundId: roundIdsByQuestionId.get(branchRun.parentQuestionId)
          || currentMainlineRoundId
          || previousRoundId
          || 'topic-root',
        questionId: branchRun.currentQuestionId || null,
        title: branchMessage && branchMessage.title
          ? branchMessage.title
          : (branchRun.title || branchRun.sourceOptionId || 'Branch round'),
        previewText: branchMessage && branchMessage.description
          ? branchMessage.description
          : ((branchRun.resultSummary && branchRun.resultSummary.text) || branchRun.description || ''),
        answerSummary: branchRun.resultSummary && branchRun.resultSummary.text
          ? branchRun.resultSummary.text
          : null,
        status: branchRun.status || 'paused',
        sourceAnswer: {
          optionId: branchRun.sourceOptionId || null,
          label: branchRun.title || branchRun.sourceOptionId || null
        },
        sourceOptionId: branchRun.sourceOptionId || null,
        message: branchMessage
      });
    });

    return {
      schemaVersion: 1,
      topicNodeId: 'topic-root',
      currentMainlineRoundId,
      activeRoundId: typeof strategyState.selectedBranchRunId === 'string' && strategyState.selectedBranchRunId
        ? strategyState.selectedBranchRunId
        : currentMainlineRoundId,
      rounds
    };
  }

  function getRoundGraph(session) {
    if (session && session.roundGraph && typeof session.roundGraph === 'object' && Array.isArray(session.roundGraph.rounds)) {
      return normalizeRoundGraph(session, session.roundGraph);
    }
    return buildDerivedRoundGraph(session);
  }

  function getMaterializedBranchRuns(session) {
    const strategyState = getStrategyState(session);
    return Array.isArray(strategyState.branchRuns)
      ? strategyState.branchRuns.filter((branchRun) => branchRun && typeof branchRun === 'object')
      : [];
  }

  function getSelectedBranchRun(session) {
    const strategyState = getStrategyState(session);
    const branchRuns = getMaterializedBranchRuns(session);
    const selectedId = typeof strategyState.selectedBranchRunId === 'string'
      ? strategyState.selectedBranchRunId
      : null;
    if (!selectedId) {
      return null;
    }
    return branchRuns.find((branchRun) => branchRun.id === selectedId) || null;
  }

  function canStartBranchFromRound(round) {
    return Boolean(
      round
      && round.lane === 'mainline'
      && round.status !== 'active'
      && round.message
      && round.message.type === 'question'
    );
  }

  function buildCurrentChoiceOptions(session, workspaceMode) {
    const message = session && session.currentMessage && typeof session.currentMessage === 'object'
      ? session.currentMessage
      : null;
    if (
      !message
      || message.type !== 'question'
      || !Array.isArray(message.options)
      || message.options.length === 0
      || REVIEW_QUESTION_IDS.has(message.questionId)
    ) {
      return [];
    }

    const visibleOptions = workspaceMode === WORKSPACE_MODE_OVERVIEW
      ? message.options
      : message.options.slice(0, 6);
    const badge = getCurrentChoiceBadge(message);

    const strategyState = getStrategyState(session);
    const shortlistedIds = Array.isArray(strategyState.shortlistedDirections)
      ? strategyState.shortlistedDirections.map((option) => option && option.id).filter(Boolean)
      : [];
    const materializedIds = getMaterializedBranchRuns(session)
      .map((branchRun) => branchRun.sourceOptionId)
      .filter(Boolean);

    return visibleOptions.map((option, index) => {
      const isShortlisted = shortlistedIds.includes(option.id);
      const isMaterialized = materializedIds.includes(option.id);
      return createWorkbenchNode(
      `option-${message.questionId || 'question'}-${option.id || index + 1}`,
      'option',
      option.label || option.id || `Option ${index + 1}`,
      option.description || '',
      {
        badge,
        label: 'Current option',
        status: isMaterialized ? 'materialized' : (isShortlisted ? 'shortlisted' : 'candidate'),
        previewText: option.description || option.label || option.id || '',
        questionId: message.questionId || null
      }
      );
    });
  }

  function buildMaterializedBranchRunNodes(session, selectedBranchRunId) {
    return getMaterializedBranchRuns(session)
      .filter((branchRun) => branchRun.id !== selectedBranchRunId)
      .map((branchRun) => {
        const isComplete = branchRun.status === 'complete' || Boolean(branchRun.resultSummary);
        return createWorkbenchNode(
          branchRun.id,
          'branch-run',
          branchRun.title || branchRun.sourceOptionId || 'Branch run',
          isComplete
            ? ((branchRun.resultSummary && branchRun.resultSummary.text) || branchRun.description || '')
            : ((branchRun.currentMessage && branchRun.currentMessage.description) || branchRun.description || ''),
          {
            badge: isComplete ? 'Branch Result' : 'Branch Run',
            label: 'Branch run',
            status: branchRun.status || (isComplete ? 'complete' : 'paused'),
            previewText: isComplete
              ? ((branchRun.resultSummary && branchRun.resultSummary.text) || branchRun.description || '')
              : ((branchRun.currentMessage && branchRun.currentMessage.description) || branchRun.description || ''),
            questionId: branchRun.currentQuestionId || null
          }
        );
      });
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
      parentId: resolved.parentId || null,
      lane: resolved.lane || null,
      message: resolved.message || null,
      answerSummary: resolved.answerSummary || null,
      sourceAnswer: resolved.sourceAnswer || null,
      sourceOptionId: resolved.sourceOptionId || null,
      branchRunId: resolved.branchRunId || null,
      questionNodeId: resolved.questionNodeId || null,
      depth: typeof resolved.depth === 'number' ? resolved.depth : 0,
      status: resolved.status || 'context',
      isActive: Boolean(resolved.isActive),
      readOnly: Boolean(resolved.readOnly),
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

  function buildTreeCanvas(session, mode, historyModel, supportingArtifact, completion, currentDecision, workspaceMode) {
    const roundGraph = getRoundGraph(session);
    const roundMap = new Map(
      Array.isArray(roundGraph && roundGraph.rounds)
        ? roundGraph.rounds.map((round) => [round.id, round])
        : []
    );
    const activeRoundId = roundGraph && roundGraph.activeRoundId ? roundGraph.activeRoundId : null;
    const currentMainlineRoundId = roundGraph && roundGraph.currentMainlineRoundId
      ? roundGraph.currentMainlineRoundId
      : null;
    const mainlineRounds = Array.isArray(roundGraph && roundGraph.rounds)
      ? roundGraph.rounds.filter((round) => round.lane === 'mainline')
      : [];
    const branchRounds = Array.isArray(roundGraph && roundGraph.rounds)
      ? roundGraph.rounds.filter((round) => round.lane === 'branch')
      : [];
    const visibleHistory = historyModel && Array.isArray(historyModel.visibleEntries)
      ? historyModel.visibleEntries
      : [];
    const topicNode = createWorkbenchNode(
      'topic-root',
      'topic',
      session && session.seedPrompt ? session.seedPrompt : 'Brainstorm topic',
      session && session.seedPrompt
        ? 'The seed prompt that started this session.'
        : 'Start a session to create a visible branch path.',
      {
        badge: 'Topic Root',
        label: 'Topic Root',
        status: 'complete',
        depth: 0
      }
    );

    function createRoundNode(round, overrides) {
      const resolved = overrides && typeof overrides === 'object' ? overrides : {};
      const isBranch = round && round.lane === 'branch';
      const preview = resolved.body != null ? resolved.body : (round.previewText || round.answerSummary || '');
      const node = createWorkbenchNode(
        round.id,
        'round',
        resolved.title || round.title || 'Round',
        preview,
        {
          badge: resolved.badge || (isBranch ? 'Branch Round' : 'Round'),
          label: resolved.label || (isBranch ? 'Branch round' : 'Round'),
          status: resolved.status || round.status || 'context',
          previewText: preview,
          questionId: round.questionId || null,
          parentId: round.parentRoundId || 'topic-root',
          lane: round.lane || null,
          branchRunId: round.branchRunId || null,
          questionNodeId: round.nodeId || null,
          message: Object.prototype.hasOwnProperty.call(resolved, 'message')
            ? resolved.message
            : (round.message || null),
          answerSummary: round.answerSummary || null,
          sourceAnswer: round.sourceAnswer || null,
          sourceOptionId: round.sourceOptionId || null,
          depth: resolved.depth || 0,
          isActive: Boolean(resolved.isActive),
          readOnly: Object.prototype.hasOwnProperty.call(resolved, 'readOnly')
            ? Boolean(resolved.readOnly)
            : !Boolean(resolved.isActive),
          inspectable: true
        }
      );
      if (resolved.metaPills) {
        node.metaPills = resolved.metaPills;
      }
      return node;
    }

    const completedMainlineRounds = mainlineRounds.filter((round) => round.id !== currentMainlineRoundId);
    const pathRounds = completedMainlineRounds;
    const parentPath = pathRounds.map((round, index) => createRoundNode(round, {
      badge: 'Answered Round',
      label: `Round ${index + 1}`,
      status: round.status || 'complete',
      depth: index + 1,
      readOnly: !canStartBranchFromRound(round)
    }));

    let decisionNode = null;
    let activeNode = null;
    if (mode !== 'completion' && mode !== 'summary') {
      const selectedBranchRun = getSelectedBranchRun(session);
      const currentMainlineRound = currentMainlineRoundId ? roundMap.get(currentMainlineRoundId) : null;
      if (currentMainlineRound) {
        const mainlineRoundNode = createRoundNode(currentMainlineRound, {
          badge: mode === 'review' ? 'Approval Round' : 'Current Round',
          label: mode === 'review' ? 'Approval Round' : 'Current Round',
          status: selectedBranchRun ? 'available' : 'active',
          depth: parentPath.length + 1,
          isActive: !selectedBranchRun,
          message: currentMainlineRound.message,
          readOnly: Boolean(selectedBranchRun),
          metaPills: buildMetaPills(session, historyModel, workspaceMode)
        });
        if (selectedBranchRun) {
          decisionNode = mainlineRoundNode;
        } else {
          activeNode = mainlineRoundNode;
        }
      }
      if (selectedBranchRun) {
        const selectedRound = roundMap.get(selectedBranchRun.id);
        if (selectedRound) {
          activeNode = createRoundNode(selectedRound, {
            badge: selectedRound.status === 'complete' ? 'Branch Result' : 'Branch Round',
            label: 'Branch round',
            status: selectedRound.status || 'active',
            depth: parentPath.length + 2,
            isActive: true,
            message: selectedRound.message,
            readOnly: false,
            metaPills: [
              selectedBranchRun.title || 'Branch round',
              selectedBranchRun.status || 'active',
              workspaceMode
            ]
          });
        }
      }
    }

    const branchRunNodes = branchRounds
      .filter((round) => round.id !== activeRoundId)
      .map((round) => createRoundNode(round, {
        badge: round.status === 'complete' ? 'Branch Result' : 'Branch Round',
        label: 'Branch round',
        status: round.status || 'paused',
        readOnly: true
      }));

    const branchAttachments = [];

    const convergenceNode = completion
      ? createWorkbenchNode(
          'completion-convergence',
          'convergence',
          completion.recommendationTitle || completion.title || 'Converged result',
          completion.recommendationSummary || completion.description || '',
          {
            badge: 'Converged Result',
            label: 'Converged Result',
            status: 'complete',
            depth: parentPath.length + 1,
            previewText: completion.recommendationSummary || completion.description || '',
            inspectable: true
          }
        )
      : null;

    const artifactNode = mode === 'completion' && completion
      ? createWorkbenchNode(
          'completion-artifact',
          'artifact',
          completion.bundlePath ? 'Result artifact is ready' : 'Result artifact',
          completion.bundlePath || 'Open the finished result exports and bundle from this node.',
          {
            badge: 'Result Artifact',
            label: 'Result Artifact',
            status: 'complete',
            depth: parentPath.length + 2,
            previewText: completion.bundlePath || 'Finished exports are attached to this result.',
            inspectable: true
          }
        )
      : null;

    const resultNodes = [];

    return {
      topicNode,
      roundGraph,
      hiddenCount: historyModel ? historyModel.hiddenCount : 0,
      parentPath,
      decisionNode,
      activeNode,
      siblingBranches: [],
      branchRunNodes,
      branchAttachments,
      convergenceNode,
      artifactNode,
      resultNodes,
      geometry: {
        layout: workspaceMode === WORKSPACE_MODE_OVERVIEW ? 'overview-tree' : 'focused-tree',
        branchCount: branchRunNodes.length,
        pathDepth: parentPath.length
      }
    };
  }

  function buildInspector(treeCanvas, completion, stage, supportingArtifact) {
    const pathNodes = Array.isArray(treeCanvas && treeCanvas.parentPath) ? treeCanvas.parentPath : [];
    const decisionNode = treeCanvas && treeCanvas.decisionNode ? treeCanvas.decisionNode : null;
    const siblingBranches = Array.isArray(treeCanvas && treeCanvas.siblingBranches) ? treeCanvas.siblingBranches : [];
    const branchRunNodes = Array.isArray(treeCanvas && treeCanvas.branchRunNodes) ? treeCanvas.branchRunNodes : [];
    const branchAttachments = Array.isArray(treeCanvas && treeCanvas.branchAttachments) ? treeCanvas.branchAttachments : [];
    const resultNodes = Array.isArray(treeCanvas && treeCanvas.resultNodes) ? treeCanvas.resultNodes : [];
    const convergenceNode = treeCanvas && treeCanvas.convergenceNode ? treeCanvas.convergenceNode : null;
    const artifactNode = treeCanvas && treeCanvas.artifactNode ? treeCanvas.artifactNode : null;
    const inspectableNodes = []
      .concat(artifactNode ? [artifactNode] : [])
      .concat(convergenceNode ? [convergenceNode] : [])
      .concat(branchAttachments)
      .concat(siblingBranches)
      .concat(branchRunNodes)
      .concat(resultNodes)
      .concat(pathNodes)
      .concat(decisionNode ? [decisionNode] : [])
      .concat(treeCanvas && treeCanvas.topicNode ? [treeCanvas.topicNode] : [])
      .concat(treeCanvas && treeCanvas.activeNode ? [treeCanvas.activeNode] : []);
    const selectedNode = inspectableNodes.find((node) => node.id === (treeCanvas && treeCanvas.selectedNodeId))
      || (treeCanvas && treeCanvas.activeNode)
      || artifactNode
      || convergenceNode
      || branchAttachments[0]
      || siblingBranches[0]
      || branchRunNodes[0]
      || resultNodes[0]
      || pathNodes[0]
      || decisionNode
      || (treeCanvas && treeCanvas.topicNode)
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

    if (supportingArtifact && supportingArtifact.previewText) {
      sections.push({
        id: 'supporting-artifact',
        kind: 'supporting-artifact',
        title: supportingArtifact.title || 'Current draft',
        body: supportingArtifact.previewText
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

  function createGraphNode(node, options) {
    if (!node) {
      return null;
    }
    const resolvedOptions = options && typeof options === 'object' ? options : {};
    const extraData = resolvedOptions.data && typeof resolvedOptions.data === 'object'
      ? resolvedOptions.data
      : {};
    return {
      id: node.id,
      type: node.kind === 'review-draft' ? 'attachment' : node.kind,
      ...(resolvedOptions.dragHandle ? { dragHandle: resolvedOptions.dragHandle } : {}),
      data: {
        kind: node.kind === 'review-draft' ? 'attachment' : node.kind,
        badge: node.badge || node.label || 'Node',
        title: node.title || 'Node',
        body: node.previewText || node.body || '',
        metaPills: Array.isArray(node.metaPills) ? node.metaPills : [],
        message: node.message || null,
        readOnly: Boolean(node.readOnly),
        compact: Boolean(node.message),
        ...(extraData || {})
      }
    };
  }

  function buildGraphWorkspace(session, treeCanvas, completion, inspector, workspaceMode) {
    const nodes = [];
    const edges = [];
    const pathNodes = Array.isArray(treeCanvas && treeCanvas.parentPath) ? treeCanvas.parentPath : [];
    const decisionNode = treeCanvas && treeCanvas.decisionNode ? treeCanvas.decisionNode : null;
    const branchRunNodes = Array.isArray(treeCanvas && treeCanvas.branchRunNodes) ? treeCanvas.branchRunNodes : [];
    const attachmentNodes = Array.isArray(treeCanvas && treeCanvas.branchAttachments) ? treeCanvas.branchAttachments : [];
    const resultNodes = Array.isArray(treeCanvas && treeCanvas.resultNodes) ? treeCanvas.resultNodes : [];
    const activeNode = treeCanvas && treeCanvas.activeNode ? treeCanvas.activeNode : null;
    const convergenceNode = treeCanvas && treeCanvas.convergenceNode ? treeCanvas.convergenceNode : null;
    const artifactNode = treeCanvas && treeCanvas.artifactNode ? treeCanvas.artifactNode : null;
    const topicNode = treeCanvas && treeCanvas.topicNode ? treeCanvas.topicNode : null;
    const fitNodeIds = [];
    const mainlineRoundNodes = []
      .concat(pathNodes)
      .concat(decisionNode ? [decisionNode] : [])
      .concat(activeNode && activeNode.lane !== 'branch' ? [activeNode] : []);
    const visibleBranchRunNodes = []
      .concat(activeNode && activeNode.lane === 'branch' ? [activeNode] : [])
      .concat(branchRunNodes);

    function trackFitNode(node) {
      if (!node || fitNodeIds.includes(node.id)) {
        return;
      }
      fitNodeIds.push(node.id);
    }

    const topicGraphNode = createGraphNode(topicNode);
    if (topicGraphNode) {
      nodes.push(topicGraphNode);
    }

    let previousVisibleMainlineId = topicNode ? topicNode.id : null;
    mainlineRoundNodes.forEach((node) => {
      nodes.push(createGraphNode(node, {
        data: {
          contextSelection: {
            type: 'mainline',
            questionId: node.questionId || null,
            roundId: node.id,
            nodeId: node.questionNodeId || null
          },
          readOnly: node.readOnly
        },
        dragHandle: node.isActive ? '.brainstorm-flow-node__drag-handle' : null
      }));

      const sourceId = previousVisibleMainlineId || 'topic-root';
      if (sourceId) {
        edges.push({
          id: `${sourceId}->${node.id}`,
          source: sourceId,
          target: node.id,
          type: 'smoothstep'
        });
      }
      previousVisibleMainlineId = node.id;
    });

    const visibleNodeIds = new Set(
      [topicNode ? topicNode.id : null]
        .concat(mainlineRoundNodes.map((node) => node.id))
        .concat(visibleBranchRunNodes.map((node) => node.id))
        .filter(Boolean)
    );
    const branchAnchorId = decisionNode
      ? decisionNode.id
      : (mainlineRoundNodes.length > 0
        ? mainlineRoundNodes[mainlineRoundNodes.length - 1].id
        : (topicNode ? topicNode.id : null));

    visibleBranchRunNodes.forEach((node) => {
      nodes.push(createGraphNode(node, {
        data: {
          contextSelection: {
            type: 'branch-run',
            branchRunId: node.branchRunId || node.id,
            roundId: node.id,
            nodeId: node.questionNodeId || null
          },
          readOnly: node.readOnly
        },
        dragHandle: node.isActive ? '.brainstorm-flow-node__drag-handle' : null
      }));

      const sourceId = node.parentId && visibleNodeIds.has(node.parentId)
        ? node.parentId
        : (branchAnchorId || 'topic-root');
      if (sourceId) {
        edges.push({
          id: `${sourceId}->${node.id}`,
          source: sourceId,
          target: node.id,
          type: 'smoothstep'
        });
      }
    });

    attachmentNodes.forEach((node) => {
      nodes.push(createGraphNode(node));
      const sourceId = decisionNode
        ? decisionNode.id
        : (activeNode ? activeNode.id : (pathNodes.length > 0 ? pathNodes[pathNodes.length - 1].id : (topicNode ? topicNode.id : null)));
      if (sourceId) {
        edges.push({
          id: `${sourceId}->${node.id}`,
          source: sourceId,
          target: node.id,
          type: 'smoothstep'
        });
      }
    });

    if (convergenceNode) {
      nodes.push(createGraphNode(convergenceNode));
      const previousNodeId = activeNode
        ? activeNode.id
        : (decisionNode
          ? decisionNode.id
          : (pathNodes.length > 0 ? pathNodes[pathNodes.length - 1].id : null));
      if (previousNodeId) {
        edges.push({
          id: `${previousNodeId}->${convergenceNode.id}`,
          source: previousNodeId,
          target: convergenceNode.id,
          type: 'smoothstep'
        });
      }
    }

    if (artifactNode) {
      nodes.push(createGraphNode(artifactNode, {
        data: {
          exportPaths: completion && completion.exportPaths ? completion.exportPaths : null
        }
      }));
      if (convergenceNode) {
        edges.push({
          id: `${convergenceNode.id}->${artifactNode.id}`,
          source: convergenceNode.id,
          target: artifactNode.id,
          type: 'smoothstep'
        });
      }
    }

    resultNodes.forEach((node) => {
      nodes.push(createGraphNode(node));
      const sourceId = artifactNode
        ? artifactNode.id
        : (convergenceNode ? convergenceNode.id : (activeNode ? activeNode.id : (decisionNode ? decisionNode.id : null)));
      if (sourceId) {
        edges.push({
          id: `${sourceId}->${node.id}`,
          source: sourceId,
          target: node.id,
          type: 'smoothstep'
        });
      }
    });

    if (activeNode) {
      if (pathNodes.length > 1) {
        trackFitNode(pathNodes[pathNodes.length - 2]);
      }
      if (pathNodes.length > 0) {
        trackFitNode(pathNodes[pathNodes.length - 1]);
      }
      trackFitNode(activeNode);
      branchRunNodes.forEach(trackFitNode);
      attachmentNodes.forEach(trackFitNode);
    } else if (convergenceNode || artifactNode || resultNodes.length > 0) {
      if (pathNodes.length > 1) {
        trackFitNode(pathNodes[pathNodes.length - 2]);
      }
      if (pathNodes.length > 0) {
        trackFitNode(pathNodes[pathNodes.length - 1]);
      }
      trackFitNode(convergenceNode);
      trackFitNode(artifactNode);
      resultNodes.forEach(trackFitNode);
    } else {
      trackFitNode(topicNode);
      if (pathNodes.length > 0) {
        trackFitNode(pathNodes[pathNodes.length - 1]);
      }
    }

    return {
      nodes,
      edges,
      focusNodeId: activeNode
        ? activeNode.id
        : (decisionNode
          ? decisionNode.id
          : (artifactNode ? artifactNode.id : (convergenceNode ? convergenceNode.id : (topicNode ? topicNode.id : null)))),
      selectedNodeId: inspector && inspector.selectedNodeId ? inspector.selectedNodeId : null,
      fitNodeIds: fitNodeIds.length > 0 ? fitNodeIds : nodes.map((node) => node.id),
      layoutSignature: JSON.stringify({
        nodeIds: nodes.map((node) => node.id),
        edgeIds: edges.map((edge) => edge.id),
        focusNodeId: activeNode
          ? activeNode.id
          : (decisionNode
            ? decisionNode.id
            : (artifactNode ? artifactNode.id : (convergenceNode ? convergenceNode.id : (topicNode ? topicNode.id : null)))),
        selectedNodeId: inspector && inspector.selectedNodeId ? inspector.selectedNodeId : null,
        workspaceMode,
        fitNodeIds: fitNodeIds.length > 0 ? fitNodeIds : nodes.map((node) => node.id)
      })
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
    const treeCanvas = buildTreeCanvas(
      session,
      mode,
      historyModel,
      supportingArtifact,
      completion,
      currentDecision,
      workspaceMode
    );
    treeCanvas.selectedNodeId = resolvedOptions.inspectedCardId || null;
    const inspector = buildInspector(treeCanvas, completion, stage, supportingArtifact);
    const graphWorkspace = buildGraphWorkspace(session, treeCanvas, completion, inspector, workspaceMode);
    graphWorkspace.workspaceMode = workspaceMode;

    return {
      mode: workspaceMode,
      treeCanvas,
      graphWorkspace,
      inspector,
      dock: {
        hasNewBrainstormEntry: true,
        hasFullHistoryEntry: historyModel.canExpand || historyModel.expanded,
        canToggleWorkspaceMode: true,
        workspaceMode
      }
    };
  }

  function deriveMainstageView(session, options) {
    if (!session) {
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

    if (!session.currentMessage) {
      const processing = session.processing && typeof session.processing === 'object'
        ? session.processing
        : null;
      const currentDecision = {
        label: 'Current Decision',
        title: session.seedPrompt || 'Preparing session',
        description: processing && processing.state === 'running'
          ? 'The first runtime turn is still running in background.'
          : 'This session has no active question yet.'
      };
      const history = buildHistoryModel(session, options);
      return {
        mode: 'processing',
        primaryMessage: null,
        currentDecision,
        stage: session.workflow && session.workflow.visibleStage ? session.workflow.visibleStage : null,
        history,
        supportingArtifact: null,
        completion: null,
        newBrainstorm: { visible: true },
        canvasWorkspace: buildCanvasWorkspace(session, options, 'empty', history, null, null, currentDecision)
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

    const selectedBranchRun = getSelectedBranchRun(session);
    const currentDecision = selectedBranchRun
      ? {
          label: 'Branch Run',
          title: selectedBranchRun.currentMessage && selectedBranchRun.currentMessage.title
            ? selectedBranchRun.currentMessage.title
            : (selectedBranchRun.title || 'Branch run'),
          description: selectedBranchRun.currentMessage && selectedBranchRun.currentMessage.description
            ? selectedBranchRun.currentMessage.description
            : ((selectedBranchRun.resultSummary && selectedBranchRun.resultSummary.text) || selectedBranchRun.description || 'Continue this selected branch from the tree.')
        }
      : buildCurrentDecision(session, mode);
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
