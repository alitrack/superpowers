const assert = require('assert');
const path = require('path');

const ADAPTER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-runtime-adapter.cjs');

let adapterModule;
try {
  adapterModule = require(ADAPTER_PATH);
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

  console.log('\n--- Codex Runtime Adapter ---');

  await test('fake adapter starts with the first structured question', async () => {
    const adapter = adapterModule.createFakeCodexRuntimeAdapter();
    const session = await adapter.createSession({ sessionId: 'session-1' });

    assert.strictEqual(session.backendMode, 'fake');
    assert.strictEqual(session.currentMessage.type, 'question');
    assert.strictEqual(session.currentMessage.questionId, 'root-goal');
    assert.strictEqual(session.currentMessage.provenance.generationMode, 'fake-flow');
    assert.deepStrictEqual(session.history, []);
  });

  await test('fake adapter advances history and current message when an answer is submitted', async () => {
    const adapter = adapterModule.createFakeCodexRuntimeAdapter();
    const session = await adapter.createSession({ sessionId: 'session-2' });

    const updated = await adapter.submitAnswer(session, {
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['host-ux'],
      text: null,
      rawInput: '2'
    });

    assert.strictEqual(updated.backendMode, 'fake');
    assert.strictEqual(updated.currentMessage.type, 'question');
    assert.strictEqual(updated.currentMessage.questionId, 'host-confirm');
    assert.strictEqual(updated.history.length, 1);
  });

  await test('fake adapter can resume a persisted session snapshot', async () => {
    const adapter = adapterModule.createFakeCodexRuntimeAdapter();
    const session = await adapter.createSession({ sessionId: 'session-3' });
    const updated = await adapter.submitAnswer(session, {
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['backend-logic'],
      text: null,
      rawInput: '3'
    });

    const resumed = await adapter.resumeSession(updated);

    assert.strictEqual(resumed.backendMode, 'fake');
    assert.strictEqual(resumed.currentMessage.type, 'question');
    assert.strictEqual(resumed.currentMessage.questionId, 'backend-details');
    assert.strictEqual(resumed.history.length, 1);
  });

  await test('fake adapter can start from a user-provided seed instead of the generic intake question', async () => {
    const adapter = adapterModule.createFakeCodexRuntimeAdapter();
    const session = await adapter.createSession({
      sessionId: 'session-seeded-1',
      initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
    });

    assert.strictEqual(session.backendMode, 'fake');
    assert.strictEqual(session.currentMessage.type, 'question');
    assert.notStrictEqual(session.currentMessage.questionId, 'root-goal');
    assert.strictEqual(session.strategyState.phase, 'reframe');
    assert.strictEqual(session.strategyState.problemFrame.summary, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(session.strategyState.decisionTrail[0].kind, 'topic');
  });

  await test('real adapter prefers app-server provider when it can create a session', async () => {
    const calls = [];
    const adapter = adapterModule.createCodexRuntimeAdapter({
      providers: {
        'app-server': {
          createSession(input) {
            calls.push(['app-server', input.sessionId]);
            return {
              sessionId: input.sessionId,
              backendMode: 'app-server',
              providerSession: { threadId: 'thread-1' },
              currentQuestionId: 'root-goal',
              history: [],
              currentMessage: { type: 'question', questionId: 'root-goal' }
            };
          }
        },
        exec: {
          createSession() {
            calls.push(['exec']);
            throw new Error('exec should not be used');
          }
        }
      }
    });

    const session = await adapter.createSession({ sessionId: 'session-4' });

    assert.strictEqual(session.backendMode, 'app-server');
    assert.deepStrictEqual(calls, [['app-server', 'session-4']]);
  });

  await test('real adapter falls back to exec provider when app-server createSession fails', async () => {
    const calls = [];
    const adapter = adapterModule.createCodexRuntimeAdapter({
      providers: {
        'app-server': {
          createSession() {
            calls.push('app-server');
            throw new Error('app-server unavailable');
          }
        },
        exec: {
          createSession(input) {
            calls.push('exec');
            return {
              sessionId: input.sessionId,
              backendMode: 'exec',
              providerSession: { transcriptId: 'transcript-1' },
              currentQuestionId: 'root-goal',
              history: [],
              currentMessage: { type: 'question', questionId: 'root-goal' }
            };
          }
        }
      }
    });

    const session = await adapter.createSession({ sessionId: 'session-5' });

    assert.strictEqual(session.backendMode, 'exec');
    assert.deepStrictEqual(calls, ['app-server', 'exec']);
  });

  await test('real adapter routes follow-up answers to the persisted backend mode', async () => {
    const calls = [];
    const adapter = adapterModule.createCodexRuntimeAdapter({
      providers: {
        'app-server': {
          createSession() {
            throw new Error('not needed');
          },
          submitAnswer(snapshot, answer) {
            calls.push(['app-server', snapshot.sessionId, answer.questionId]);
            return {
              ...snapshot,
              currentQuestionId: 'host-confirm',
              currentMessage: { type: 'question', questionId: 'host-confirm' },
              history: [{ questionId: 'root-goal', answer: 'Host UX' }]
            };
          }
        },
        exec: {
          submitAnswer() {
            calls.push(['exec']);
            throw new Error('exec should not be used');
          }
        }
      }
    });

    const updated = await adapter.submitAnswer({
      sessionId: 'session-6',
      backendMode: 'app-server',
      providerSession: { threadId: 'thread-6' },
      currentQuestionId: 'root-goal',
      history: [],
      currentMessage: { type: 'question', questionId: 'root-goal' }
    }, {
      type: 'answer',
      questionId: 'root-goal',
      answerMode: 'option',
      optionIds: ['host-ux'],
      text: null,
      rawInput: '2'
    });

    assert.strictEqual(updated.backendMode, 'app-server');
    assert.strictEqual(updated.currentMessage.questionId, 'host-confirm');
    assert.deepStrictEqual(calls, [['app-server', 'session-6', 'root-goal']]);
  });

  await test('advances facilitation state from scope to reframe using the first answer', async () => {
    const next = adapterModule.advanceStrategyStateFromAnswer({
      phase: 'scope',
      nextLearningGoal: 'understand-the-core-problem',
      problemFrame: null,
      candidateDirections: [],
      selectionCriteria: [],
      decisionTrail: []
    }, {
      type: 'question',
      questionId: 'topic',
      title: 'Brainstorming Topic',
      questionType: 'ask_text',
      options: []
    }, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A tool that helps teams shape rough product ideas',
      rawInput: 'A tool that helps teams shape rough product ideas'
    });

    assert.strictEqual(next.phase, 'reframe');
    assert.strictEqual(next.nextLearningGoal, 'select-the-best-problem-frame');
    assert.strictEqual(next.problemFrame.summary, 'A tool that helps teams shape rough product ideas');
    assert.strictEqual(next.decisionTrail.length, 1);
  });

  await test('builds a skill-first prompt that explicitly invokes $brainstorming', async () => {
    const skillPolicy = adapterModule.loadBrainstormingSkillPolicy();
    assert(skillPolicy.includes('Source skill file: skills/brainstorming/SKILL.md'));
    assert(skillPolicy.includes('ask questions one at a time to refine the idea'));

    const reframePrompt = adapterModule.buildBrainstormTurnPrompt({
      strategyState: {
        phase: 'reframe',
        nextLearningGoal: 'select-the-best-problem-frame',
        problemFrame: {
          summary: 'A tool that helps teams shape rough product ideas'
        },
        candidateDirections: [],
        selectionCriteria: [],
        decisionTrail: []
      },
      history: [
        { questionId: 'topic', question: 'Brainstorming Topic', answer: 'A tool that helps teams shape rough product ideas' }
      ]
    }, {
      completionMode: 'summary',
      initialPrompt: 'A tool that helps teams shape rough product ideas'
    });

    assert(reframePrompt.includes('$brainstorming'));
    assert(reframePrompt.includes('User request:'));
    assert(reframePrompt.includes('Required skill bootstrap:'));
    assert(reframePrompt.includes('Source skill file: skills/brainstorming/SKILL.md'));
    assert(reframePrompt.includes('Before you produce any user-facing content, actually read these skill files from the repository'));
    assert(reframePrompt.includes('skills/using-superpowers/SKILL.md'));
    assert(reframePrompt.includes('ask questions one at a time to refine the idea'));
    assert(reframePrompt.includes('A tool that helps teams shape rough product ideas'));
    assert(!reframePrompt.includes('Current facilitation intent:'));
    assert(!reframePrompt.includes('Brainstorming phase:'));

    const divergePrompt = adapterModule.buildBrainstormTurnPrompt({
      strategyState: {
        phase: 'diverge',
        nextLearningGoal: 'generate-distinct-directions',
        problemFrame: {
          summary: 'Help teams turn rough product ideas into sharper decisions'
        },
        candidateDirections: [],
        selectionCriteria: [],
        decisionTrail: [
          { kind: 'problem-frame', value: 'Help teams turn rough product ideas into sharper decisions' }
        ]
      },
      history: [
        { questionId: 'topic', question: 'Brainstorming Topic', answer: 'A tool that helps teams shape rough product ideas' },
        { questionId: 'reframe', question: 'Which framing matters most?', answer: 'Help teams turn rough product ideas into sharper decisions' }
      ]
    }, { completionMode: 'summary' });

    assert(divergePrompt.includes('$brainstorming'));
    assert(divergePrompt.includes('Browser host contract:'));
    assert(divergePrompt.includes('Help teams turn rough product ideas into sharper decisions'));
  });

  await test('creates a structured handoff summary from facilitation state', async () => {
    const summary = adapterModule.createBrainstormSummary({
      phase: 'handoff',
      nextLearningGoal: 'summarize-the-selected-path',
      problemFrame: {
        summary: 'Help teams turn rough product ideas into sharper decisions'
      },
      candidateDirections: [
        { id: 'workspace', label: 'Collaborative workspace' },
        { id: 'wizard', label: 'Guided question flow' }
      ],
      selectionCriteria: [
        { id: 'speed', label: 'Fastest path to value' }
      ],
      decisionTrail: [
        { kind: 'topic', value: 'A tool that helps teams shape rough product ideas' },
        { kind: 'problem-frame', value: 'Help teams turn rough product ideas into sharper decisions' },
        { kind: 'direction', value: 'Guided question flow' },
        { kind: 'criterion', value: 'Fastest path to value' },
        { kind: 'selected-path', value: 'Guided question flow for product teams' }
      ]
    }, [
      { questionId: 'topic', question: 'Brainstorming Topic', answer: 'A tool that helps teams shape rough product ideas' }
    ]);

    assert.strictEqual(summary.type, 'summary');
    assert.strictEqual(summary.title, 'Recommendation: Guided question flow for product teams');
    assert(summary.text.includes('Recommendation'));
    assert(summary.text.includes('Problem Framing'));
    assert(summary.text.includes('Explored Approaches'));
    assert(summary.text.includes('Design / Execution Draft'));
    assert(summary.text.includes('Risks / Open Questions'));
    assert(summary.text.includes('Next Actions'));
    assert(summary.text.includes('Why This Path Currently Wins'));
    assert(summary.text.includes('Guided question flow for product teams'));
    assert(summary.text.includes('Collaborative workspace'));
    assert(summary.text.includes('Fastest path to value'));
    assert.strictEqual(summary.synthesis.recommendation, 'Guided question flow for product teams');
    assert(summary.deliverable, 'deliverable should be attached');
    assert.strictEqual(summary.deliverable.isComplete, true);
    assert.strictEqual(summary.deliverable.completionGateVersion, 'finished-deliverable-v1');
    assert(Array.isArray(summary.deliverable.sections));
    assert.strictEqual(summary.answers.length, 1);
  });

  await test('does not let the adapter auto-finish locally when the runtime still wants to ask a follow-up question', async () => {
    const provider = adapterModule.createExecCodexRuntimeProvider({
      runExec: async () => ({
        agentText: JSON.stringify({
          type: 'question',
          questionType: 'ask_text',
          questionId: 'follow-up',
          title: 'What evidence should the final output include before we conclude?',
          description: '',
          options: [],
          allowTextOverride: true,
          textOverrideLabel: 'Type supporting evidence'
        })
      })
    });

    const result = await provider.submitAnswer({
      sessionId: 'exec-incomplete-1',
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
      answerMode: 'text',
      optionIds: [],
      text: '',
      rawInput: ''
    });

    assert.strictEqual(result.currentMessage.type, 'question');
    assert.strictEqual(result.currentMessage.questionId, 'follow-up');
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();
