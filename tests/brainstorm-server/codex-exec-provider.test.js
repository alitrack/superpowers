const assert = require('assert');
const path = require('path');

const ADAPTER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-runtime-adapter.cjs');

let createExecCodexRuntimeProvider;
try {
  ({ createExecCodexRuntimeProvider } = require(ADAPTER_PATH));
} catch (error) {
  console.error(`Cannot load ${ADAPTER_PATH}: ${error.message}`);
  process.exit(1);
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

  console.log('\n--- Codex Exec Provider ---');

  await test('creates the first structured question from codex exec JSON output', async () => {
    const prompts = [];
    const provider = createExecCodexRuntimeProvider({
      runExec: async (prompt) => {
        prompts.push(prompt);
        return {
          agentText: JSON.stringify({
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            allowTextOverride: true
          })
        };
      }
    });

    const session = await provider.createSession({ sessionId: 'exec-1' });

    assert.strictEqual(session.backendMode, 'exec');
    assert.strictEqual(session.currentMessage.type, 'question');
    assert.strictEqual(session.currentMessage.questionId, 'topic');
    assert.strictEqual(session.history.length, 0);
    assert.strictEqual(prompts.length, 1);
    assert(prompts[0].includes('$brainstorming'));
    assert(prompts[0].includes('Source skill file: skills/brainstorming/SKILL.md'));
    assert(prompts[0].includes('skills/using-superpowers/SKILL.md'));
    assert(prompts[0].includes('actually read these skill files from the repository'));
    assert(prompts[0].includes('ask questions one at a time to refine the idea'));
    assert(session.strategyState, 'strategyState should be initialized');
    assert.strictEqual(session.strategyState.phase, 'scope');
    assert.strictEqual(session.strategyState.nextLearningGoal, 'understand-the-core-problem');
  });

  await test('normalizes common id/value question payloads into the shared contract', async () => {
    const provider = createExecCodexRuntimeProvider({
      runExec: async () => ({
        agentText: JSON.stringify({
          type: 'question',
          questionType: 'pick_one',
          id: 'brainstorm_focus',
          title: 'Please choose the focus for this brainstorming session.',
          options: [
            { label: 'Product idea', value: 'product_idea' },
            { label: 'Feature plan', value: 'feature_plan' }
          ]
        })
      })
    });

    const session = await provider.createSession({ sessionId: 'exec-compat-1' });

    assert.strictEqual(session.currentMessage.type, 'question');
    assert.strictEqual(session.currentMessage.questionId, 'brainstorm_focus');
    assert.strictEqual(session.currentMessage.title, 'Please choose the focus for this brainstorming session.');
    assert.deepStrictEqual(session.currentMessage.options, [
      { id: 'product_idea', label: 'Product idea', description: '' },
      { id: 'feature_plan', label: 'Feature plan', description: '' }
    ]);
  });

  await test('expands bare option markers when the runtime provides the full text in description', async () => {
    const provider = createExecCodexRuntimeProvider({
      runExec: async () => ({
        agentText: JSON.stringify({
          type: 'question',
          questionType: 'pick_one',
          questionId: 'article_mode',
          title: '请选择文章体例',
          options: [
            { id: 'option-a', label: 'A', description: '理论评论型文章' },
            { id: 'option-b', label: 'B', description: '调研报告型文章' },
            { id: 'option-c', label: 'C', description: '政策建议型文章' }
          ]
        })
      })
    });

    const session = await provider.createSession({ sessionId: 'exec-compat-2' });

    assert.deepStrictEqual(session.currentMessage.options, [
      { id: 'option-a', label: 'A. 理论评论型文章', description: '' },
      { id: 'option-b', label: 'B. 调研报告型文章', description: '' },
      { id: 'option-c', label: 'C. 政策建议型文章', description: '' }
    ]);
  });

  await test('continues from persisted transcript and returns a completion message', async () => {
    const prompts = [];
    const provider = createExecCodexRuntimeProvider({
      runExec: async (prompt) => {
        prompts.push(prompt);
        if (prompts.length === 1) {
          return {
            agentText: '```json\n{"type":"question","questionType":"ask_text","questionId":"topic","title":"What do you want to brainstorm about?","description":"Start with the core topic.","allowTextOverride":true}\n```'
          };
        }

        return {
          agentText: JSON.stringify({
            type: 'summary',
            text: 'The user wants to brainstorm a browser-first research assistant.',
            path: ['topic'],
            answers: [
              { questionId: 'topic', answer: 'A browser-first research assistant' }
            ]
          })
        };
      }
    });

    const session = await provider.createSession({ sessionId: 'exec-2' });
    const updated = await provider.submitAnswer(session, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser-first research assistant',
      rawInput: 'A browser-first research assistant'
    });

    assert.strictEqual(updated.backendMode, 'exec');
    assert.strictEqual(updated.currentMessage.type, 'summary');
    assert.strictEqual(updated.history.length, 1);
    assert.strictEqual(updated.history[0].questionId, 'topic');
    assert.strictEqual(prompts.length, 2);
    assert(prompts[1].includes('$brainstorming'));
    assert(prompts[1].includes('A browser-first research assistant'));
    assert(updated.strategyState, 'strategyState should be preserved');
  });

  await test('persists candidate directions, selection criteria, and the final path across a multi-step brainstorm', async () => {
    const prompts = [];
    const provider = createExecCodexRuntimeProvider({
      runExec: async (prompt) => {
        prompts.push(prompt);
        if (prompts.length === 1) {
          return {
            agentText: JSON.stringify({
              type: 'question',
              questionType: 'pick_many',
              questionId: 'directions',
              title: 'Which directions are worth exploring further?',
              options: [
                { id: 'workspace', label: 'Collaborative workspace' },
                { id: 'wizard', label: 'Guided question flow' },
                { id: 'planner', label: 'Experiment planner' }
              ]
            })
          };
        }

        if (prompts.length === 2) {
          return {
            agentText: JSON.stringify({
              type: 'question',
              questionType: 'pick_one',
              questionId: 'criterion',
              title: 'Which criterion should decide the winner?',
              options: [
                { id: 'speed', label: 'Fastest path to value' },
                { id: 'clarity', label: 'Most user clarity' }
              ]
            })
          };
        }

        if (prompts.length === 3) {
          return {
            agentText: JSON.stringify({
              type: 'question',
              questionType: 'pick_one',
              questionId: 'path',
              title: 'Which path should we commit to?',
              options: [
                { id: 'wizard', label: 'Guided question flow' },
                { id: 'planner', label: 'Experiment planner' }
              ]
            })
          };
        }

        return {
          agentText: JSON.stringify({
            type: 'summary',
            title: 'Recommendation: Guided question flow',
            text: [
              'Recommendation',
              '- Choose: Guided question flow',
              '',
              'Why This Path Currently Wins',
              '- Fastest path to value',
              '',
              'Alternatives Still Worth Remembering',
              '- Experiment planner'
            ].join('\n'),
            path: ['directions', 'criterion', 'path'],
            answers: [
              { questionId: 'directions', answer: 'Guided question flow, Experiment planner' },
              { questionId: 'criterion', answer: 'Fastest path to value' },
              { questionId: 'path', answer: 'Guided question flow' }
            ]
          })
        };
      }
    });

    const session = await provider.createSession({
      sessionId: 'exec-3',
      strategyState: {
        phase: 'diverge',
        nextLearningGoal: 'generate-distinct-directions',
        problemFrame: {
          summary: 'Help teams turn rough product ideas into sharper decisions'
        },
        decisionTrail: [
          { kind: 'problem-frame', value: 'Help teams turn rough product ideas into sharper decisions' }
        ]
      }
    });

    assert.strictEqual(session.currentMessage.questionId, 'directions');
    assert.deepStrictEqual(session.strategyState.candidateDirections.map((entry) => entry.label), [
      'Collaborative workspace',
      'Guided question flow',
      'Experiment planner'
    ]);

    const afterDirections = await provider.submitAnswer(session, {
      type: 'answer',
      questionId: 'directions',
      answerMode: 'option',
      optionIds: ['wizard', 'planner'],
      text: null,
      rawInput: '2,3'
    });

    assert.strictEqual(afterDirections.strategyState.phase, 'converge');
    assert.strictEqual(afterDirections.strategyState.nextLearningGoal, 'choose-the-most-important-decision-criterion');
    assert.deepStrictEqual(afterDirections.strategyState.shortlistedDirections.map((entry) => entry.label), [
      'Guided question flow',
      'Experiment planner'
    ]);
    assert.deepStrictEqual(afterDirections.strategyState.selectionCriteria.map((entry) => entry.label), [
      'Fastest path to value',
      'Most user clarity'
    ]);

    const afterCriterion = await provider.submitAnswer(afterDirections, {
      type: 'answer',
      questionId: 'criterion',
      answerMode: 'option',
      optionIds: ['speed'],
      text: null,
      rawInput: '1'
    });

    assert.strictEqual(afterCriterion.strategyState.nextLearningGoal, 'commit-to-a-path');
    assert.strictEqual(afterCriterion.strategyState.selectedCriterion.label, 'Fastest path to value');
    assert.strictEqual(afterCriterion.currentMessage.questionId, 'path');

    const completed = await provider.submitAnswer(afterCriterion, {
      type: 'answer',
      questionId: 'path',
      answerMode: 'option',
      optionIds: ['wizard'],
      text: null,
      rawInput: '1'
    });

    assert.strictEqual(completed.currentMessage.type, 'summary');
    assert.strictEqual(completed.strategyState.selectedPath.label, 'Guided question flow');
    assert.strictEqual(completed.currentMessage.title, 'Recommendation: Guided question flow');
    assert(completed.currentMessage.text.includes('Recommendation'));
    assert(completed.currentMessage.text.includes('Why This Path Currently Wins'));
    assert(completed.currentMessage.text.includes('Alternatives Still Worth Remembering'));
    assert(completed.currentMessage.text.includes('Guided question flow'));
    assert(completed.currentMessage.text.includes('Experiment planner'));
    assert(completed.currentMessage.text.includes('Fastest path to value'));
    assert.strictEqual(prompts.length, 4);
  });

  await test('does not auto-finish locally when the runtime keeps the brainstorm open', async () => {
    const provider = createExecCodexRuntimeProvider({
      runExec: async () => ({
        agentText: JSON.stringify({
          type: 'question',
          questionType: 'ask_text',
          questionId: 'follow-up',
          title: 'What evidence should this article include before we conclude?',
          description: '',
          options: [],
          allowTextOverride: true,
          textOverrideLabel: 'Type supporting evidence'
        })
      })
    });

    const result = await provider.submitAnswer({
      sessionId: 'exec-follow-up-1',
      backendMode: 'exec',
      providerSession: {
        completionMode: 'summary',
        transcript: []
      },
      strategyState: {
        phase: 'converge',
        nextLearningGoal: 'commit-to-a-path',
        problemFrame: null,
        candidateDirections: [],
        shortlistedDirections: [],
        selectionCriteria: [],
        selectedCriterion: null,
        selectedPath: null,
        decisionTrail: []
      },
      currentQuestionId: 'path',
      history: [],
      currentMessage: {
        type: 'question',
        questionType: 'pick_one',
        questionId: 'path',
        title: 'Which path should we commit to?',
        options: [],
        metadata: {
          brainstormIntent: 'commit_path'
        }
      }
    }, {
      type: 'answer',
      questionId: 'path',
      answerMode: 'option',
      optionIds: ['article'],
      text: null,
      rawInput: '1'
    });

    assert.strictEqual(result.currentMessage.type, 'question');
    assert.strictEqual(result.currentMessage.questionId, 'follow-up');
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
