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
  assert(view.canvasWorkspace.decisionTree, 'expected decision tree model');
  assert.strictEqual(view.canvasWorkspace.activeStage.kind, 'active-decision');
  assert.strictEqual(view.canvasWorkspace.activeStage.questionId, 'seed-path');
  assert.strictEqual(view.canvasWorkspace.decisionTree.pathNodes.at(-1).id, 'active-seed-path');
  assert.strictEqual(view.canvasWorkspace.decisionTree.pathNodes.at(-1).isActive, true);
  assert.strictEqual(view.canvasWorkspace.decisionTree.hiddenCount, 0);
  assert(view.canvasWorkspace.contextPanel, 'expected context panel');
  assert(view.canvasWorkspace.dock.hasNewBrainstormEntry);
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
  assert.strictEqual(view.canvasWorkspace.activeStage.kind, 'review-decision');
  assert(view.canvasWorkspace.decisionTree.contextNodes.some((node) => node.kind === 'review-draft'));
  assert(view.canvasWorkspace.contextPanel.sections.some((section) => section.kind === 'selected-node'));
});

test('caps recent context at three steps by default but reveals the full history on demand', () => {
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
  assert.strictEqual(collapsed.canvasWorkspace.decisionTree.hiddenCount, 2);
  assert.strictEqual(expanded.canvasWorkspace.decisionTree.hiddenCount, 0);
  assert(expanded.canvasWorkspace.decisionTree.pathNodes.length > collapsed.canvasWorkspace.decisionTree.pathNodes.length);
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
    inspectedCardId: 'history-q-2'
  });

  assert.strictEqual(view.canvasWorkspace.contextPanel.selectedNodeId, 'history-q-2');
  assert(view.canvasWorkspace.contextPanel.selectedNode, 'expected selected node');
  assert.strictEqual(view.canvasWorkspace.contextPanel.selectedNode.title, 'Question 2');
  assert.strictEqual(view.canvasWorkspace.contextPanel.selectedNode.body, 'Answer 2');
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
  assert.strictEqual(view.canvasWorkspace.activeStage.kind, 'completion-cluster');
  assert(view.canvasWorkspace.decisionTree.resultNodes.length >= 1);
  assert.strictEqual(view.canvasWorkspace.contextPanel.packageItems.length, 3);
  assert(view.canvasWorkspace.contextPanel.sections.some((section) => section.kind === 'result-section'));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
