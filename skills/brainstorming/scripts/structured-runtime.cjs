const structuredHost = require('./structured-host.cjs');

const STRUCTURED_DEMO_FLOW = {
  initialQuestionId: 'root-goal',
  questions: {
    'root-goal': {
      type: 'question',
      questionType: 'pick_one',
      questionId: 'root-goal',
      title: 'What do you want to converge on first?',
      description: 'The next question is selected by backend-side runtime state, not by the host renderer.',
      allowTextOverride: true,
      textOverrideLabel: 'Or type a custom starting point',
      metadata: {
        step: 1,
        path: ['root-goal'],
        expectsArtifact: 'summary'
      },
      options: [
        { id: 'requirements', label: 'Requirements', description: 'Clarify goals, scope, and constraints.', next: 'requirements-constraints' },
        { id: 'host-ux', label: 'Host UX', description: 'Decide how the host should render the flow.', next: 'host-confirm' },
        { id: 'backend-logic', label: 'Backend logic', description: 'Decide how branching should work.', next: 'backend-details' }
      ]
    },
    'requirements-constraints': {
      type: 'question',
      questionType: 'pick_many',
      questionId: 'requirements-constraints',
      title: 'Which constraints matter most right now?',
      description: 'This branch demonstrates multi-select plus text override.',
      allowTextOverride: true,
      textOverrideLabel: 'Add another constraint in your own words',
      metadata: {
        step: 2,
        path: ['root-goal', 'requirements-constraints'],
        expectsArtifact: 'summary'
      },
      options: [
        { id: 'speed', label: 'Speed', description: 'Ship a thin but working version quickly.' },
        { id: 'consistency', label: 'Consistency', description: 'Make all hosts follow the same contract.' },
        { id: 'simplicity', label: 'Simplicity', description: 'Keep the renderer thin and easy to reason about.' }
      ],
      next: null
    },
    'host-confirm': {
      type: 'question',
      questionType: 'confirm',
      questionId: 'host-confirm',
      title: 'Should hosts stay renderer-only and avoid local branching?',
      description: 'This branch demonstrates confirm questions.',
      allowTextOverride: true,
      textOverrideLabel: 'Reply with nuance instead of a strict yes/no',
      metadata: {
        step: 2,
        path: ['root-goal', 'host-confirm'],
        expectsArtifact: 'summary'
      },
      next: null
    },
    'backend-details': {
      type: 'question',
      questionType: 'ask_text',
      questionId: 'backend-details',
      title: 'What backend-side rule do you most want to preserve?',
      description: 'This branch demonstrates free-text-first questioning.',
      allowTextOverride: true,
      metadata: {
        step: 2,
        path: ['root-goal', 'backend-details'],
        expectsArtifact: 'summary'
      }
    }
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStructuredRuntime(flow = STRUCTURED_DEMO_FLOW) {
  let session = structuredHost.createSession(flow);
  let currentMessage = structuredHost.createQuestionMessage(flow, flow.initialQuestionId, session.history);

  return {
    getCurrentMessage() {
      return clone(currentMessage);
    },

    applyAnswer(answer) {
      if (!currentMessage || currentMessage.type !== 'question') {
        return clone(currentMessage);
      }

      const next = structuredHost.applyAnswer(session, answer);
      session = next.state;
      currentMessage = next.message;
      return clone(currentMessage);
    },

    reset() {
      session = structuredHost.createSession(flow);
      currentMessage = structuredHost.createQuestionMessage(flow, flow.initialQuestionId, session.history);
      return clone(currentMessage);
    }
  };
}

module.exports = {
  STRUCTURED_DEMO_FLOW,
  createStructuredRuntime
};
