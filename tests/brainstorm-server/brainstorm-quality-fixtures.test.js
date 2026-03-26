const assert = require('assert');
const path = require('path');

const ADAPTER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-runtime-adapter.cjs');

let advanceStrategyStateFromAnswer;
let buildBrainstormTurnPrompt;
let createBrainstormSummary;
let normalizeStrategyState;
try {
  ({
    advanceStrategyStateFromAnswer,
    buildBrainstormTurnPrompt,
    createBrainstormSummary,
    normalizeStrategyState
  } = require(ADAPTER_PATH));
} catch (error) {
  console.error(`Cannot load ${ADAPTER_PATH}: ${error.message}`);
  process.exit(1);
}

const fixtures = [
  {
    name: 'fuzzy product idea',
    topic: 'A tool that helps product teams shape rough ideas',
    reframes: [
      'Help teams turn rough product ideas into sharper decisions',
      'Reduce the time from vague concept to a testable experiment',
      'Make early product discussions less chaotic and opinion-driven'
    ],
    chosenReframe: 'Help teams turn rough product ideas into sharper decisions',
    directions: [
      { id: 'workspace', label: 'Collaborative workspace' },
      { id: 'wizard', label: 'Guided question flow' },
      { id: 'planner', label: 'Experiment planner' }
    ]
  },
  {
    name: 'differentiation problem',
    topic: 'We already have a product idea, but it feels too similar to competitors',
    reframes: [
      'Find the unique wedge that competitors ignore',
      'Choose one painful workflow to dominate first',
      'Define a sharper promise instead of a broader feature list'
    ],
    chosenReframe: 'Find the unique wedge that competitors ignore',
    directions: [
      { id: 'segment', label: 'Own a narrow user segment' },
      { id: 'workflow', label: 'Own a painful workflow end to end' },
      { id: 'insight', label: 'Own the strategic insight layer' }
    ]
  },
  {
    name: 'team alignment case',
    topic: 'Our team keeps talking past each other about what to build next',
    reframes: [
      'Create one shared decision frame before debating solutions',
      'Expose where assumptions differ instead of debating features',
      'Turn alignment into a concrete prioritization ritual'
    ],
    chosenReframe: 'Expose where assumptions differ instead of debating features',
    directions: [
      { id: 'ritual', label: 'Weekly decision ritual' },
      { id: 'board', label: 'Shared assumptions board' },
      { id: 'brief', label: 'One-page decision brief' }
    ]
  },
  {
    name: 'execution planning case',
    topic: 'We know the goal, but the team still cannot decide what to do next Monday',
    reframes: [
      'Reduce the goal into the next irreversible decision',
      'Turn the goal into a sequence of small experiments',
      'Expose the riskiest dependency before planning work'
    ],
    chosenReframe: 'Turn the goal into a sequence of small experiments',
    directions: [
      { id: 'milestone', label: 'Milestone-based rollout' },
      { id: 'experiment', label: 'Experiment-first plan' },
      { id: 'risk', label: 'Risk-burn-down plan' }
    ]
  }
];

function createTopicQuestion() {
  return {
    type: 'question',
    questionType: 'ask_text',
    questionId: 'topic',
    title: 'What should we brainstorm?',
    options: []
  };
}

function createReframeQuestion(fixture) {
  return {
    type: 'question',
    questionType: 'pick_one',
    questionId: 'reframe',
    title: 'Which framing matters most?',
    options: fixture.reframes.map((label, index) => ({
      id: `reframe-${index + 1}`,
      label
    })),
    metadata: {
      brainstormIntent: 'reframe_problem'
    }
  };
}

function createDivergeQuestion(fixture) {
  return {
    type: 'question',
    questionType: 'pick_many',
    questionId: 'directions',
    title: 'Which directions are worth exploring further?',
    options: fixture.directions,
    metadata: {
      brainstormIntent: 'generate_directions'
    }
  };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    }
  }

  console.log('\n--- Brainstorm Quality Fixtures ---');

  await test('planner fixtures keep the first three turns focused on reframing and divergence', async () => {
    for (const fixture of fixtures) {
      const scopeState = normalizeStrategyState();
      const topicQuestion = createTopicQuestion();
      const afterTopic = advanceStrategyStateFromAnswer(scopeState, topicQuestion, {
        type: 'answer',
        questionId: 'topic',
        answerMode: 'text',
        optionIds: [],
        text: fixture.topic,
        rawInput: fixture.topic
      });

      const reframePrompt = buildBrainstormTurnPrompt({
        strategyState: afterTopic,
        history: [{ questionId: 'topic', question: 'What should we brainstorm?', answer: fixture.topic }]
      }, { completionMode: 'summary' });

      assert.strictEqual(afterTopic.phase, 'reframe', `${fixture.name}: expected reframe after topic`);
      assert(reframePrompt.includes('Current facilitation intent: reframe_problem'), `${fixture.name}: missing reframe intent`);
      assert(reframePrompt.includes('Recommended questionType: pick_one'), `${fixture.name}: missing pick_one reframe`);
      assert(reframePrompt.includes('Do not fall back to generic intake fields'), `${fixture.name}: missing anti-intake guardrail`);

      const reframeQuestion = createReframeQuestion(fixture);
      const chosenReframeId = reframeQuestion.options.find((option) => option.label === fixture.chosenReframe).id;
      const afterReframe = advanceStrategyStateFromAnswer(afterTopic, reframeQuestion, {
        type: 'answer',
        questionId: 'reframe',
        answerMode: 'option',
        optionIds: [chosenReframeId],
        text: null,
        rawInput: chosenReframeId
      });

      const divergePrompt = buildBrainstormTurnPrompt({
        strategyState: afterReframe,
        history: [
          { questionId: 'topic', question: 'What should we brainstorm?', answer: fixture.topic },
          { questionId: 'reframe', question: 'Which framing matters most?', answer: fixture.chosenReframe }
        ]
      }, { completionMode: 'summary' });

      assert.strictEqual(afterReframe.phase, 'diverge', `${fixture.name}: expected diverge after reframe`);
      assert(divergePrompt.includes('Current facilitation intent: generate_directions'), `${fixture.name}: missing diverge intent`);
      assert(divergePrompt.includes('Recommended questionType: pick_many'), `${fixture.name}: missing pick_many divergence`);
      assert(divergePrompt.includes('generate 2-5 distinct directions'), `${fixture.name}: missing distinct directions guidance`);
      assert(divergePrompt.includes(fixture.chosenReframe), `${fixture.name}: missing chosen reframe context`);

      const divergeQuestion = createDivergeQuestion(fixture);
      const afterDirections = advanceStrategyStateFromAnswer(
        {
          ...afterReframe,
          candidateDirections: fixture.directions
        },
        divergeQuestion,
        {
          type: 'answer',
          questionId: 'directions',
          answerMode: 'option',
          optionIds: fixture.directions.slice(0, 2).map((option) => option.id),
          text: null,
          rawInput: fixture.directions.slice(0, 2).map((option) => option.id).join(',')
        }
      );

      const convergePrompt = buildBrainstormTurnPrompt({
        strategyState: afterDirections,
        history: [
          { questionId: 'topic', question: 'What should we brainstorm?', answer: fixture.topic },
          { questionId: 'reframe', question: 'Which framing matters most?', answer: fixture.chosenReframe },
          { questionId: 'directions', question: 'Which directions are worth exploring further?', answer: fixture.directions.slice(0, 2).map((option) => option.label).join(', ') }
        ]
      }, { completionMode: 'summary' });

      assert.strictEqual(afterDirections.phase, 'converge', `${fixture.name}: expected converge after divergence`);
      assert.strictEqual(afterDirections.nextLearningGoal, 'choose-the-most-important-decision-criterion', `${fixture.name}: missing criterion step`);
      assert(convergePrompt.includes('Current facilitation intent: compare_directions'), `${fixture.name}: missing compare intent`);
      assert(convergePrompt.includes('Recommended questionType: pick_one'), `${fixture.name}: missing converge pick_one`);
    }
  });

  await test('planner fixtures converge to a finished deliverable instead of a shallow recap', async () => {
    for (const fixture of fixtures) {
      const completed = createBrainstormSummary({
        phase: 'handoff',
        nextLearningGoal: 'summarize-the-selected-path',
        problemFrame: {
          summary: fixture.chosenReframe
        },
        candidateDirections: fixture.directions,
        shortlistedDirections: fixture.directions.slice(0, 2),
        selectionCriteria: [
          { id: 'clarity', label: 'Most user clarity' }
        ],
        selectedCriterion: { id: 'clarity', label: 'Most user clarity' },
        selectedPath: fixture.directions[0],
        decisionTrail: [
          { kind: 'topic', value: fixture.topic },
          { kind: 'problem-frame', value: fixture.chosenReframe },
          { kind: 'selected-path', value: fixture.directions[0].label }
        ]
      }, [
        { questionId: 'topic', question: 'What should we brainstorm?', answer: fixture.topic }
      ]);

      assert.strictEqual(completed.type, 'summary', `${fixture.name}: should emit summary`);
      assert(completed.deliverable && completed.deliverable.isComplete, `${fixture.name}: deliverable should be complete`);
      assert(completed.text.includes('Explored Approaches'), `${fixture.name}: missing explored approaches`);
      assert(completed.text.includes('Design / Execution Draft'), `${fixture.name}: missing design draft`);
      assert(completed.text.includes('Risks / Open Questions'), `${fixture.name}: missing risks/open questions`);
      assert(completed.text.includes('Next Actions'), `${fixture.name}: missing next actions`);
    }
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
