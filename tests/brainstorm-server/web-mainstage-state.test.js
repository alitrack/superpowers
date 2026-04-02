const assert = require('assert');

const {
  deriveMainstageView
} = require('../../skills/brainstorming/scripts/web-mainstage.cjs');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function buildHistory(count) {
  return Array.from({ length: count }, (_, index) => ({
    questionId: `q-${index + 1}`,
    question: `Question ${index + 1}`,
    answer: `Answer ${index + 1}`
  }));
}

test('classifies active sessions into question mode and keeps the current decision primary', () => {
  const view = deriveMainstageView({
    id: 'session-question',
    seedPrompt: 'How should this brainstorming product feel more product-like?',
    history: buildHistory(2),
    currentMessage: {
      type: 'question',
      questionId: 'seed-path',
      title: 'Which path should become the working direction?',
      description: 'Choose one path so the draft can converge.'
    },
    workflow: {
      visibleStage: {
        id: 'confirm-design',
        title: 'Confirm the direction',
        description: 'Choose the path that should become the working direction.'
      }
    }
  });

  assert.strictEqual(view.mode, 'question');
  assert.strictEqual(view.primaryMessage.questionId, 'seed-path');
  assert.strictEqual(view.currentDecision.title, 'Which path should become the working direction?');
  assert.strictEqual(view.history.visibleEntries.length, 2);
  assert.strictEqual(view.history.hiddenCount, 0);
  assert.strictEqual(view.newBrainstorm.visible, true);
  assert(view.canvasWorkspace, 'expected derived canvas workspace');
  assert.strictEqual(view.canvasWorkspace.mode, 'focused');
  assert(view.canvasWorkspace.treeCanvas, 'expected tree canvas model');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.topicNode.kind, 'topic');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.parentPath.at(-1).kind, 'round');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.kind, 'round');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.questionId, 'seed-path');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.parentPath.at(-1).id, 'round-q-2');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.isActive, true);
  assert.strictEqual(view.canvasWorkspace.treeCanvas.convergenceNode, null);
  assert.strictEqual(view.canvasWorkspace.treeCanvas.artifactNode, null);
  assert.strictEqual(view.canvasWorkspace.treeCanvas.hiddenCount, 0);
  assert(view.canvasWorkspace.graphWorkspace, 'expected graph workspace');
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'topic'));
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'round'));
  assert(view.canvasWorkspace.graphWorkspace.edges.some((edge) => edge.target === 'round-seed-path'));
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'round-seed-path');
  assert(view.canvasWorkspace.inspector, 'expected secondary inspector');
  assert(view.canvasWorkspace.dock.hasNewBrainstormEntry);
});

test('keeps comparison options inside the active round node and renders a linear round trunk', () => {
  const view = deriveMainstageView({
    id: 'session-compare',
    seedPrompt: 'How should the product stop feeling like a rigid form?',
    history: [
      {
        questionId: 'seed-reframe',
        question: 'Which framing matters most for this brainstorming session?',
        answer: 'Fix the facilitation gap'
      }
    ],
    currentMessage: {
      type: 'question',
      questionId: 'seed-directions',
      questionType: 'pick_many',
      title: 'Which directions are worth exploring as serious paths?',
      description: 'Choose the directions that deserve serious comparison.',
      options: [
        { id: 'facilitation-engine', label: 'Dynamic facilitation engine', description: 'Drive the next move from session state.' },
        { id: 'interaction-redesign', label: 'Interaction model redesign', description: 'Make the flow feel collaborative.' },
        { id: 'decision-workflow', label: 'Decision-quality workflow', description: 'Improve tradeoff quality and commitments.' }
      ],
      allowTextOverride: true
    },
    workflow: {
      visibleStage: {
        id: 'compare-directions',
        title: 'Compare possible directions',
        description: 'Review the current options so the session can narrow toward the strongest path.'
      }
    }
  });

  assert.strictEqual(view.mode, 'question');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.questionId, 'seed-directions');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.parentPath.length, 1);
  assert.strictEqual(view.canvasWorkspace.treeCanvas.parentPath[0].id, 'round-seed-reframe');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.kind, 'round');
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'round-seed-directions');
  assert(!view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'option'));
  assert(view.canvasWorkspace.graphWorkspace.edges.some((edge) => (
    edge.source === 'round-seed-reframe' && edge.target === 'round-seed-directions'
  )));
  assert.strictEqual(view.canvasWorkspace.inspector.selectedNodeId, 'round-seed-directions');
  assert.strictEqual(view.canvasWorkspace.inspector.selectedNode.kind, 'round');
  assert.deepStrictEqual(
    view.canvasWorkspace.graphWorkspace.fitNodeIds,
    [
      'round-seed-reframe',
      'round-seed-directions'
    ]
  );
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.workspaceMode, 'focused');
});

test('classifies spec approval checkpoints into review mode and exposes the draft as supporting context', () => {
  const view = deriveMainstageView({
    id: 'session-review',
    history: buildHistory(4),
    currentMessage: {
      type: 'question',
      questionId: 'workflow-review-spec',
      title: 'Review the drafted workflow document',
      description: 'Confirm whether the draft is accurate enough to continue.'
    },
    workflow: {
      visibleStage: {
        id: 'review-spec',
        title: 'Review the drafted document',
        description: 'Check the draft before continuing.'
      },
      specArtifact: {
        title: 'Structured Brainstorming Workflow Design',
        previewText: '# Draft Spec\n\n## Context\nReview this draft.'
      }
    }
  });

  assert.strictEqual(view.mode, 'review');
  assert.strictEqual(view.primaryMessage.questionId, 'workflow-review-spec');
  assert(view.supportingArtifact, 'expected supporting artifact for review checkpoint');
  assert.strictEqual(view.supportingArtifact.title, 'Structured Brainstorming Workflow Design');
  assert.strictEqual(view.history.visibleEntries.length, 3);
  assert.strictEqual(view.history.hiddenCount, 1);
  assert(view.canvasWorkspace, 'expected derived canvas workspace');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.kind, 'round');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.branchAttachments.length, 0);
  assert(view.canvasWorkspace.inspector.sections.some((section) => section.kind === 'selected-node'));
  assert(view.canvasWorkspace.inspector.sections.some((section) => (
    section.kind === 'supporting-artifact'
    && section.title === 'Structured Brainstorming Workflow Design'
  )));
});

test('synthesizes an active review round when persisted roundGraph has no current mainline round', () => {
  const view = deriveMainstageView({
    id: 'session-review-synthetic-round',
    seedPrompt: 'How should the product avoid dropping review checkpoints?',
    history: buildHistory(4),
    roundGraph: {
      schemaVersion: 1,
      topicNodeId: 'topic-root',
      currentMainlineRoundId: null,
      activeRoundId: 'round-question-4',
      rounds: [
        {
          id: 'round-question',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'topic-root',
          questionId: 'question',
          title: 'Question 1',
          previewText: '',
          answerSummary: 'Answer 1',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 1' }
        },
        {
          id: 'round-question-2',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question',
          questionId: 'question',
          title: 'Question 2',
          previewText: '',
          answerSummary: 'Answer 2',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 2' }
        },
        {
          id: 'round-question-3',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question-2',
          questionId: 'question',
          title: 'Question 3',
          previewText: '',
          answerSummary: 'Answer 3',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 3' }
        },
        {
          id: 'round-question-4',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question-3',
          questionId: 'question',
          title: 'Question 4',
          previewText: '',
          answerSummary: 'Answer 4',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 4' }
        }
      ]
    },
    currentMessage: {
      type: 'question',
      questionType: 'confirm',
      questionId: 'workflow-review-spec',
      title: 'Review the drafted workflow document',
      description: 'The first draft is ready. Review it, then confirm if it is accurate enough to continue.',
      options: [
        { id: 'yes', label: 'Looks right, continue', description: 'Proceed with the current draft.' },
        { id: 'no', label: 'Needs changes first', description: 'Capture changes before continuing.' }
      ],
      allowTextOverride: false
    },
    workflow: {
      visibleStage: {
        id: 'review-spec',
        title: 'Review the drafted document',
        description: 'Check the draft before continuing.'
      },
      specArtifact: {
        title: 'Structured Brainstorming Workflow Design',
        previewText: '# Draft Spec\n\n## Context\nReview this draft.'
      }
    }
  });

  assert.strictEqual(view.mode, 'review');
  assert(view.canvasWorkspace.treeCanvas.activeNode, 'expected synthesized active review node');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.questionId, 'workflow-review-spec');
  assert(view.canvasWorkspace.treeCanvas.activeNode.message, 'expected active review node message');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.message.questionId, 'workflow-review-spec');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.parentId, 'round-question-4');
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'round-workflow-review-spec');
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => (
    node.id === 'round-workflow-review-spec'
    && node.data.message
    && node.data.message.questionId === 'workflow-review-spec'
    && node.data.readOnly === false
  )));
  assert(view.canvasWorkspace.graphWorkspace.edges.some((edge) => (
    edge.source === 'round-question-4' && edge.target === 'round-workflow-review-spec'
  )));
});

test('selecting a materialized branch run makes it the active round while preserving the mainline round on the trunk', () => {
  const view = deriveMainstageView({
    id: 'session-branch-run',
    seedPrompt: 'How should the product stop feeling like a form?',
    history: [
      {
        questionId: 'seed-reframe',
        question: 'Which framing matters most for this brainstorming session?',
        answer: 'Fix the facilitation gap'
      },
      {
        questionId: 'seed-directions',
        question: 'Which directions are worth exploring as serious paths?',
        answer: 'Dynamic facilitation engine, Interaction model redesign'
      }
    ],
    strategyState: {
      phase: 'converge',
      nextLearningGoal: 'choose-the-most-important-decision-criterion',
      shortlistedDirections: [
        { id: 'facilitation-engine', label: 'Dynamic facilitation engine', description: 'Drive the next move from session state.' },
        { id: 'interaction-redesign', label: 'Interaction model redesign', description: 'Make the flow feel collaborative.' }
      ],
      branchRuns: [
        {
          id: 'branch-run-seed-directions-facilitation-engine',
          parentQuestionId: 'seed-directions',
          sourceOptionId: 'facilitation-engine',
          title: 'Dynamic facilitation engine',
          status: 'active',
          currentQuestionId: 'branch-run-seed-directions-facilitation-engine-detail',
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'branch-run-seed-directions-facilitation-engine-detail',
            title: 'What is the strongest concrete version of "Dynamic facilitation engine"?',
            description: 'Capture the strongest concrete shape of this branch.',
            options: [],
            allowTextOverride: true
          },
          history: []
        },
        {
          id: 'branch-run-seed-directions-interaction-redesign',
          parentQuestionId: 'seed-directions',
          sourceOptionId: 'interaction-redesign',
          title: 'Interaction model redesign',
          status: 'paused',
          history: []
        }
      ],
      selectedBranchRunId: 'branch-run-seed-directions-facilitation-engine'
    },
    currentMessage: {
      type: 'question',
      questionId: 'seed-criterion',
      questionType: 'pick_one',
      title: 'Which criterion should decide the winner?',
      description: 'Choose the criterion that should drive convergence.',
      options: [
        { id: 'clarity', label: 'Most user clarity', description: 'Choose the path that is easiest to understand.' },
        { id: 'speed', label: 'Fastest path to value', description: 'Choose the path that creates value soonest.' }
      ]
    },
    workflow: {
      visibleStage: {
        id: 'compare-directions',
        title: 'Compare possible directions',
        description: 'Review the current options so the session can narrow toward the strongest path.'
      }
    }
  });

  assert.strictEqual(view.mode, 'question');
  assert.strictEqual(view.currentDecision.title, 'What is the strongest concrete version of "Dynamic facilitation engine"?');
  assert(view.canvasWorkspace.treeCanvas.decisionNode, 'expected preserved mainline decision node');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.decisionNode.kind, 'round');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.decisionNode.id, 'round-seed-criterion');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.kind, 'round');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode.id, 'branch-run-seed-directions-facilitation-engine');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.branchRunNodes.length, 1);
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'branch-run-seed-directions-facilitation-engine');
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'round'));
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.workspaceMode, 'focused');
});

test('keeps a submitted historical question round as a frozen question snapshot after a child round is appended', () => {
  const view = deriveMainstageView({
    id: 'session-frozen-history',
    seedPrompt: 'How should the tree preserve question identity?',
    history: [
      {
        questionId: 'question',
        question: '选择本轮测试的核心问题框架',
        answer: '功能正确性优先（推荐）'
      }
    ],
    roundGraph: {
      schemaVersion: 1,
      topicNodeId: 'topic-root',
      currentMainlineRoundId: 'round-question-2',
      activeRoundId: 'round-question-2',
      rounds: [
        {
          id: 'round-question',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'topic-root',
          questionId: 'question',
          title: '选择本轮测试的核心问题框架',
          previewText: '',
          answerSummary: '功能正确性优先（推荐）',
          status: 'complete',
          message: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'question',
            title: '选择本轮测试的核心问题框架',
            description: '',
            options: [
              { id: 'A', label: '功能正确性优先（推荐）', description: '验证修复是否恢复预期行为。' },
              { id: 'B', label: '回归风险优先', description: '关注修复是否破坏旧能力。' }
            ],
            allowTextOverride: true
          }
        },
        {
          id: 'round-question-2',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question',
          questionId: 'question',
          title: '选择要并行展开的测试方向',
          previewText: '',
          answerSummary: null,
          status: 'active',
          message: {
            type: 'question',
            questionType: 'pick_many',
            questionId: 'question',
            title: '选择要并行展开的测试方向',
            description: '',
            options: [
              { id: 'A', label: '接口契约验证（推荐）', description: '验证输出契约。' },
              { id: 'B', label: '关键业务场景链路', description: '验证真实路径。' }
            ],
            allowTextOverride: true
          }
        }
      ]
    },
    currentMessage: {
      type: 'question',
      questionType: 'pick_many',
      questionId: 'question',
      title: '选择要并行展开的测试方向',
      description: '',
      options: [
        { id: 'A', label: '接口契约验证（推荐）', description: '验证输出契约。' },
        { id: 'B', label: '关键业务场景链路', description: '验证真实路径。' }
      ],
      allowTextOverride: true
    },
    workflow: {
      visibleStage: {
        id: 'compare-directions',
        title: 'Compare possible directions',
        description: 'Review the current options so the session can narrow toward the strongest path.'
      }
    }
  });

  assert.strictEqual(view.canvasWorkspace.treeCanvas.parentPath.length, 1);
  assert(view.canvasWorkspace.treeCanvas.parentPath[0].message, 'historical round should keep question snapshot');
  assert.strictEqual(
    view.canvasWorkspace.treeCanvas.parentPath[0].message.title,
    '选择本轮测试的核心问题框架'
  );
  const historicalGraphNode = view.canvasWorkspace.graphWorkspace.nodes.find((node) => node.id === 'round-question');
  assert(historicalGraphNode, 'expected historical graph node');
  assert(historicalGraphNode.data.message, 'historical graph node should still render question message');
  assert.strictEqual(historicalGraphNode.data.message.title, '选择本轮测试的核心问题框架');
  assert.strictEqual(historicalGraphNode.data.readOnly, false);
  assert.deepStrictEqual(historicalGraphNode.data.contextSelection, {
    type: 'mainline',
    questionId: 'question',
    roundId: 'round-question',
    nodeId: null
  });
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'round-question-2');
});

test('does not re-identify historical rounds from current mutable questionId when persisted round ids differ', () => {
  const view = deriveMainstageView({
    id: 'session-reused-question-id',
    seedPrompt: 'How should repeated provider ids behave?',
    history: [],
    roundGraph: {
      schemaVersion: 1,
      topicNodeId: 'topic-root',
      currentMainlineRoundId: 'round-question-2',
      activeRoundId: 'round-question-2',
      rounds: [
        {
          id: 'round-question',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'topic-root',
          questionId: 'question',
          title: '第一题',
          previewText: '',
          answerSummary: 'A',
          status: 'complete',
          message: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'question',
            title: '第一题',
            description: '',
            options: [{ id: 'A', label: 'A', description: '' }],
            allowTextOverride: true
          }
        },
        {
          id: 'round-question-2',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question',
          questionId: 'question',
          title: '第二题',
          previewText: '',
          answerSummary: null,
          status: 'active',
          message: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'question',
            title: '第二题',
            description: '',
            options: [{ id: 'B', label: 'B', description: '' }],
            allowTextOverride: true
          }
        }
      ]
    },
    currentMessage: {
      type: 'question',
      questionType: 'pick_one',
      questionId: 'question',
      title: '第二题',
      description: '',
      options: [{ id: 'B', label: 'B', description: '' }],
      allowTextOverride: true
    },
    workflow: {
      visibleStage: {
        id: 'compare-directions',
        title: 'Compare possible directions',
        description: 'Review the current options so the session can narrow toward the strongest path.'
      }
    }
  });

  const roundQuestionNode = view.canvasWorkspace.graphWorkspace.nodes.find((node) => node.id === 'round-question');
  const roundQuestion2Node = view.canvasWorkspace.graphWorkspace.nodes.find((node) => node.id === 'round-question-2');
  assert(roundQuestionNode, 'expected first persisted round');
  assert(roundQuestion2Node, 'expected second persisted round');
  assert.strictEqual(roundQuestionNode.data.title, '第一题');
  assert.strictEqual(roundQuestion2Node.data.title, '第二题');
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'round-question-2');
  assert(view.canvasWorkspace.graphWorkspace.edges.some((edge) => (
    edge.source === 'round-question' && edge.target === 'round-question-2'
  )));
});

test('caps recent context at three steps by default while keeping the full mainline trunk visible on the tree', () => {
  const session = {
    id: 'session-history',
    history: buildHistory(5),
    currentMessage: {
      type: 'question',
      questionId: 'criterion',
      title: 'Which decision rule matters most?'
    },
    workflow: {
      visibleStage: {
        id: 'compare-directions',
        title: 'Compare possible directions',
        description: 'Use the recent trail while choosing the next path.'
      }
    }
  };

  const collapsed = deriveMainstageView(session);
  const expanded = deriveMainstageView(session, { historyExpanded: true, workspaceMode: 'overview' });

  assert.deepStrictEqual(
    collapsed.history.visibleEntries.map((entry) => entry.questionId),
    ['q-3', 'q-4', 'q-5']
  );
  assert.strictEqual(collapsed.history.hiddenCount, 2);
  assert.strictEqual(collapsed.history.canExpand, true);
  assert.strictEqual(expanded.history.visibleEntries.length, 5);
  assert.strictEqual(expanded.history.hiddenCount, 0);
  assert.strictEqual(expanded.history.expanded, true);
  assert.strictEqual(collapsed.canvasWorkspace.mode, 'focused');
  assert.strictEqual(expanded.canvasWorkspace.mode, 'overview');
  assert.strictEqual(collapsed.canvasWorkspace.treeCanvas.hiddenCount, 2);
  assert.strictEqual(expanded.canvasWorkspace.treeCanvas.hiddenCount, 0);
  assert.strictEqual(collapsed.canvasWorkspace.treeCanvas.parentPath.length, 5);
  assert.strictEqual(expanded.canvasWorkspace.treeCanvas.parentPath.length, 5);
  assert(collapsed.canvasWorkspace.graphWorkspace.edges.some((edge) => (
    edge.source === 'topic-root' && edge.target === 'round-q-1'
  )));
  assert(collapsed.canvasWorkspace.graphWorkspace.edges.some((edge) => (
    edge.source === 'round-q-4' && edge.target === 'round-q-5'
  )));
});

test('selecting a path node shows that node in the context panel', () => {
  const view = deriveMainstageView({
    id: 'session-path-selection',
    seedPrompt: 'How should the product stop feeling like a form?',
    history: buildHistory(3),
    currentMessage: {
      type: 'question',
      questionId: 'seed-path',
      title: 'Which path should become the working direction?',
      description: 'Choose one path so the draft can converge.'
    },
    workflow: {
      visibleStage: {
        id: 'confirm-design',
        title: 'Confirm the direction',
        description: 'Choose the path that should become the working direction.'
      }
    }
  }, {
    inspectedCardId: 'round-q-2'
  });

  assert.strictEqual(view.canvasWorkspace.inspector.selectedNodeId, 'round-q-2');
  assert(view.canvasWorkspace.inspector.selectedNode, 'expected selected node');
  assert.strictEqual(view.canvasWorkspace.inspector.selectedNode.title, 'Question 2');
  assert.strictEqual(view.canvasWorkspace.inspector.selectedNode.body, 'Answer 2');
});

test('switches finished artifact sessions into a dedicated completion mode', () => {
  const view = deriveMainstageView({
    id: 'session-complete',
    seedPrompt: 'How do we turn this into a complete product?',
    history: buildHistory(4),
    currentMessage: {
      type: 'artifact_ready',
      title: 'Spec and plan are ready',
      text: 'The workflow finished with a reviewable design spec and implementation plan.',
      path: '/api/sessions/session-complete/artifacts/current',
      artifactType: 'workflow_bundle'
    },
    finishedResult: {
      title: 'Recommendation: Browser-first result surface',
      recommendationTitle: 'Choose: Browser-first result surface',
      recommendationSummary: 'Show the mature brainstorm deliverable before the supporting package.',
      sections: [
        {
          id: 'recommendation',
          title: 'Recommendation',
          items: ['Choose: Browser-first result surface']
        },
        {
          id: 'next-actions',
          title: 'Next Actions',
          items: ['Ship the result panel and export actions.']
        }
      ],
      exportPaths: {
        jsonPath: '/api/sessions/session-complete/result',
        markdownPath: '/api/sessions/session-complete/result.md'
      },
      supportingArtifacts: [
        {
          kind: 'bundle',
          label: 'Result Bundle',
          title: 'session-complete-bundle.md',
          path: '/api/sessions/session-complete/artifacts/current',
          previewText: 'Spec and plan bundle.'
        },
        {
          kind: 'spec',
          label: 'Design Spec',
          title: 'Structured Brainstorming Workflow Design',
          path: 'docs/superpowers/specs/demo.md',
          previewText: '# Design Spec'
        },
        {
          kind: 'plan',
          label: 'Implementation Plan',
          title: 'Structured Brainstorming Workflow Plan',
          path: 'docs/superpowers/plans/demo.md',
          previewText: '# Implementation Plan'
        }
      ]
    },
    workflow: {
      visibleStage: {
        id: 'plan-ready',
        title: 'Spec and plan are ready',
        description: 'The workflow finished with a reviewable design spec and implementation plan.'
      },
      specArtifact: {
        title: 'Structured Brainstorming Workflow Design',
        relativePath: 'docs/superpowers/specs/demo.md',
        previewText: '# Design Spec'
      },
      planArtifact: {
        title: 'Structured Brainstorming Workflow Plan',
        relativePath: 'docs/superpowers/plans/demo.md',
        previewText: '# Implementation Plan'
      }
    }
  });

  assert.strictEqual(view.mode, 'completion');
  assert(view.completion, 'expected completion payload');
  assert.strictEqual(view.completion.recommendationTitle, 'Choose: Browser-first result surface');
  assert.strictEqual(view.completion.exportPaths.markdownPath, '/api/sessions/session-complete/result.md');
  assert.strictEqual(view.completion.sections.length, 2);
  assert.strictEqual(view.completion.supportingArtifacts.length, 3);
  assert.strictEqual(view.newBrainstorm.visible, true);
  assert(view.canvasWorkspace, 'expected derived canvas workspace');
  assert(view.canvasWorkspace.graphWorkspace, 'expected graph workspace');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode, null);
  assert(view.canvasWorkspace.treeCanvas.convergenceNode, 'expected convergence node');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.convergenceNode.kind, 'convergence');
  assert(view.canvasWorkspace.treeCanvas.artifactNode, 'expected artifact node');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.artifactNode.kind, 'artifact');
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'convergence'));
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'artifact'));
  assert(!view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'result-section'));
  assert(view.canvasWorkspace.graphWorkspace.edges.some((edge) => (
    edge.source === 'completion-convergence' && edge.target === 'completion-artifact'
  )));
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'completion-artifact');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.resultNodes.length, 0);
  assert.strictEqual(view.canvasWorkspace.inspector.packageItems.length, 3);
  assert.strictEqual(view.canvasWorkspace.inspector.selectedNode.kind, 'artifact');
  assert(view.canvasWorkspace.inspector.sections.some((section) => section.kind === 'result-section'));
});

test('backfills the workflow review round for completed full-skill sessions that were persisted before review nodes were logged', () => {
  const view = deriveMainstageView({
    id: 'session-complete-with-legacy-workflow-rounds',
    seedPrompt: 'How should the browser product carry review checkpoints into the final graph?',
    history: buildHistory(4),
    roundGraph: {
      schemaVersion: 1,
      topicNodeId: 'topic-root',
      currentMainlineRoundId: null,
      activeRoundId: 'round-question-4',
      rounds: [
        {
          id: 'round-question',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'topic-root',
          questionId: 'question',
          title: 'Question 1',
          previewText: '',
          answerSummary: 'Answer 1',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 1' }
        },
        {
          id: 'round-question-2',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question',
          questionId: 'question',
          title: 'Question 2',
          previewText: '',
          answerSummary: 'Answer 2',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 2' }
        },
        {
          id: 'round-question-3',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question-2',
          questionId: 'question',
          title: 'Question 3',
          previewText: '',
          answerSummary: 'Answer 3',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 3' }
        },
        {
          id: 'round-question-4',
          kind: 'round',
          lane: 'mainline',
          parentRoundId: 'round-question-3',
          questionId: 'question',
          title: 'Question 4',
          previewText: '',
          answerSummary: 'Answer 4',
          status: 'complete',
          message: { type: 'question', questionId: 'question', title: 'Question 4' }
        }
      ]
    },
    currentMessage: {
      type: 'artifact_ready',
      title: 'Spec and plan are ready',
      text: 'The workflow finished with a reviewable design spec and implementation plan.',
      artifactType: 'workflow_bundle'
    },
    finishedResult: {
      title: 'Guided result',
      recommendationTitle: 'Choose: Guided result',
      recommendationSummary: 'Keep the review checkpoint visible before the final artifact.',
      sections: [
        {
          id: 'recommendation',
          title: 'Recommendation',
          items: ['Keep the review checkpoint visible before the final artifact.']
        }
      ],
      supportingArtifacts: []
    },
    workflow: {
      mode: 'full_skill',
      visibleStage: {
        id: 'plan-ready',
        title: 'Spec and plan are ready',
        description: 'The workflow finished with a reviewable design spec and implementation plan.'
      },
      approvalCheckpoints: [
        {
          kind: 'spec_review',
          decision: 'approved',
          questionId: 'workflow-review-spec'
        }
      ]
    }
  });

  assert(view.canvasWorkspace.treeCanvas.parentPath.some((node) => node.questionId === 'workflow-review-spec'));
  const reviewNode = view.canvasWorkspace.treeCanvas.parentPath.find((node) => node.questionId === 'workflow-review-spec');
  assert(reviewNode, 'expected synthetic review node in completion path');
  assert.strictEqual(reviewNode.answerSummary, 'Looks right, continue');
});

test('switches finished summary sessions into a convergence focus without inventing an artifact node', () => {
  const view = deriveMainstageView({
    id: 'session-summary',
    seedPrompt: 'How do we stop the browser product from feeling like a wizard?',
    history: buildHistory(3),
    currentMessage: {
      type: 'summary',
      title: 'Recommendation: Topic-rooted canvas',
      text: 'Recommendation\nProblem Framing\nWhy This Path Currently Wins'
    },
    finishedResult: {
      title: 'Topic-rooted canvas',
      recommendationTitle: 'Recommendation: Topic-rooted canvas',
      recommendationSummary: 'Keep the topic as the visible root and let the result converge in-canvas.',
      sections: [
        {
          id: 'recommendation',
          title: 'Recommendation',
          items: ['Use a single topic-rooted canvas.']
        }
      ],
      supportingArtifacts: []
    },
    workflow: {
      visibleStage: {
        id: 'summary-ready',
        title: 'Summary ready',
        description: 'The result converged and is ready to review.'
      }
    }
  });

  assert.strictEqual(view.mode, 'summary');
  assert(view.canvasWorkspace.graphWorkspace, 'expected graph workspace');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.activeNode, null);
  assert(view.canvasWorkspace.treeCanvas.convergenceNode, 'expected convergence node');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.convergenceNode.kind, 'convergence');
  assert.strictEqual(view.canvasWorkspace.treeCanvas.artifactNode, null);
  assert(view.canvasWorkspace.graphWorkspace.nodes.some((node) => node.type === 'convergence'));
  assert.strictEqual(view.canvasWorkspace.graphWorkspace.focusNodeId, 'completion-convergence');
  assert.strictEqual(view.canvasWorkspace.inspector.selectedNode.kind, 'convergence');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
