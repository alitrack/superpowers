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
  const expanded = deriveMainstageView(session, { historyExpanded: true });

  assert.deepStrictEqual(
    collapsed.history.visibleEntries.map((entry) => entry.questionId),
    ['q-3', 'q-4', 'q-5']
  );
  assert.strictEqual(collapsed.history.hiddenCount, 2);
  assert.strictEqual(collapsed.history.canExpand, true);
  assert.strictEqual(expanded.history.visibleEntries.length, 5);
  assert.strictEqual(expanded.history.hiddenCount, 0);
  assert.strictEqual(expanded.history.expanded, true);
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
  assert.strictEqual(view.completion.bundlePath, '/api/sessions/session-complete/artifacts/current');
  assert.strictEqual(view.completion.artifacts.length, 2);
  assert.strictEqual(view.newBrainstorm.visible, true);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
