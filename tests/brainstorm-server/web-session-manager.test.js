const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MANAGER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/web-session-manager.cjs');

let createSessionManager;
try {
  ({ createSessionManager } = require(MANAGER_PATH));
} catch (error) {
  console.error(`Cannot load ${MANAGER_PATH}: ${error.message}`);
  process.exit(1);
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-web-session-'));
    try {
      await fn(tmpDir);
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error.message}`);
      failed++;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log('\n--- Web Session Manager ---');

  await test('creates isolated sessions with distinct ids', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const first = await manager.createSession({ completionMode: 'summary' });
    const second = await manager.createSession({ completionMode: 'summary' });

    assert.notStrictEqual(first.id, second.id);
    assert.strictEqual(first.backendMode, 'exec');
    assert.strictEqual(first.currentMessage.questionId, 'topic');
    assert.strictEqual(second.currentMessage.questionId, 'topic');
  });

  await test('persists backend session state across manager instances', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-1', pendingRequestId: 'request-1' },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          providerSession: { threadId: 'thread-1', pendingRequestId: null },
          currentMessage: {
            type: 'summary',
            text: `The user wants to brainstorm: ${answer.text}`,
            path: ['topic'],
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });

    await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.backendMode, 'app-server');
    assert.strictEqual(reloaded.providerSession.threadId, 'thread-1');
    assert.strictEqual(reloaded.currentMessage.type, 'summary');
    assert.strictEqual(reloaded.history.length, 1);
  });

  await test('persists facilitation strategy state and passes it back into later turns', async (tmpDir) => {
    let sawPersistedStrategyStateOnSubmit = false;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-strategy-1', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem',
            problemFrame: null,
            candidateDirections: [],
            selectionCriteria: [],
            decisionTrail: []
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        sawPersistedStrategyStateOnSubmit = Boolean(
          snapshot.strategyState
          && snapshot.strategyState.phase === 'scope'
          && snapshot.strategyState.nextLearningGoal === 'understand-the-core-problem'
        );
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: 'goal',
          strategyState: {
            phase: 'reframe',
            nextLearningGoal: 'identify-the-highest-value-outcome',
            problemFrame: {
              summary: answer.text
            },
            candidateDirections: [],
            selectionCriteria: [],
            decisionTrail: [
              {
                kind: 'problem-frame',
                value: answer.text
              }
            ]
          },
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'goal',
            title: 'Primary outcome',
            description: '',
            options: [
              { id: 'clarity', label: 'Clarify the idea', description: '' },
              { id: 'plan', label: 'Turn it into a plan', description: '' }
            ],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });
    assert.strictEqual(session.strategyState.phase, 'scope');
    assert.strictEqual(session.strategyState.nextLearningGoal, 'understand-the-core-problem');

    const updated = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A tool that helps product teams shape rough ideas',
      rawInput: 'A tool that helps product teams shape rough ideas'
    });

    assert.strictEqual(sawPersistedStrategyStateOnSubmit, true);
    assert.strictEqual(updated.strategyState.phase, 'reframe');
    assert.strictEqual(updated.strategyState.problemFrame.summary, 'A tool that helps product teams shape rough ideas');

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.strategyState.phase, 'reframe');
    assert.strictEqual(reloaded.strategyState.nextLearningGoal, 'identify-the-highest-value-outcome');
    assert.strictEqual(reloaded.strategyState.decisionTrail.length, 1);
  });

  await test('persists the initial seed prompt and passes it into runtime session creation', async (tmpDir) => {
    let receivedInitialPrompt = null;
    const runtimeAdapter = {
      async createSession(input) {
        receivedInitialPrompt = input.initialPrompt;
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-seed-1', pendingRequestId: null },
          currentQuestionId: 'seed-reframe',
          strategyState: {
            phase: 'reframe',
            nextLearningGoal: 'select-the-best-problem-frame',
            problemFrame: {
              summary: input.initialPrompt
            },
            candidateDirections: [],
            shortlistedDirections: [],
            selectionCriteria: [],
            selectedCriterion: null,
            selectedPath: null,
            decisionTrail: [
              { kind: 'topic', value: input.initialPrompt }
            ]
          },
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'pick_one',
            questionId: 'seed-reframe',
            title: 'Which framing matters most?',
            description: '',
            options: [
              { id: 'facilitation', label: 'Facilitation gap', description: '' },
              { id: 'ux', label: 'Interaction mismatch', description: '' }
            ],
            allowTextOverride: true
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({
      completionMode: 'summary',
      initialPrompt: 'We have a brainstorming tool, but it still feels like a form.'
    });

    assert.strictEqual(receivedInitialPrompt, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(session.seedPrompt, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(session.currentMessage.questionId, 'seed-reframe');

    const reloadedManager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const reloaded = reloadedManager.getSession(session.id);
    assert.strictEqual(reloaded.seedPrompt, 'We have a brainstorming tool, but it still feels like a form.');
    assert.strictEqual(reloaded.strategyState.phase, 'reframe');
  });

  await test('creates a real artifact for artifact-mode sessions', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided question flow',
            text: `The user wants to brainstorm: ${answer.text}`,
            path: ['topic'],
            answers: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            synthesis: {
              recommendation: 'Guided question flow',
              problemFrame: answer.text,
              decisionCriterion: 'Most user clarity',
              exploredDirections: ['Guided question flow', 'Collaborative workspace'],
              shortlistedDirections: ['Guided question flow'],
              alternatives: ['Collaborative workspace'],
              reasoning: ['Guided question flow keeps the session focused on one decision at a time.'],
              decisionTrail: [
                { kind: 'topic', value: answer.text },
                { kind: 'criterion', value: 'Most user clarity' },
                { kind: 'selected-path', value: 'Guided question flow' }
              ],
              nextValidation: ['Validate that users can follow the facilitation without feeling trapped by the flow.']
            }
          }
        };
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'artifact' });

    const completed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A visual brainstorming assistant',
      rawInput: 'A visual brainstorming assistant'
    });

    assert.strictEqual(completed.currentMessage.type, 'artifact_ready');
    assert(completed.artifact, 'artifact metadata should be persisted');
    assert(fs.existsSync(completed.artifact.filePath), 'artifact file should exist');
    const artifactText = fs.readFileSync(completed.artifact.filePath, 'utf-8');
    assert(artifactText.includes('Structured Brainstorming Result'));
    assert(artifactText.includes('## Recommendation'));
    assert(artifactText.includes('## Explored Approaches'));
    assert(artifactText.includes('## Design / Execution Draft'));
    assert(artifactText.includes('## Risks / Open Questions'));
    assert(artifactText.includes('## Next Actions'));
    assert(artifactText.includes('## Why This Path Currently Wins'));
  });

  await test('persists provenance for visible questions and final deliverables', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-prov-1', turnId: 'turn-prov-q1' },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What should we brainstorm?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true,
            provenance: {
              backendMode: 'app-server',
              generationMode: 'real-skill-runtime',
              requiredSkills: ['skills/using-superpowers/SKILL.md', 'skills/brainstorming/SKILL.md'],
              providerTrace: { threadId: 'thread-prov-1', turnId: 'turn-prov-q1' },
              timestamp: '2026-03-25T00:00:00.000Z'
            }
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What should we brainstorm?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided question flow',
            text: 'Recommendation\n- Choose: Guided question flow',
            path: ['topic'],
            answers: [{ questionId: 'topic', question: 'What should we brainstorm?', answer: answer.text }],
            deliverable: {
              isComplete: true,
              completionGateVersion: 'finished-deliverable-v1',
              sections: [
                { id: 'recommendation', title: 'Recommendation', items: ['Choose: Guided question flow'] },
                { id: 'problem-framing', title: 'Problem Framing', items: [answer.text] },
                { id: 'explored-approaches', title: 'Explored Approaches', items: ['Guided question flow', 'Collaborative workspace'] },
                { id: 'design-execution-draft', title: 'Design / Execution Draft', items: ['Start with a single-thread guided flow.'] },
                { id: 'risks-open-questions', title: 'Risks / Open Questions', items: ['Validate whether the flow feels too rigid.'] },
                { id: 'next-actions', title: 'Next Actions', items: ['Prototype one full session.'] }
              ]
            },
            provenance: {
              backendMode: 'app-server',
              generationMode: 'real-skill-runtime',
              requiredSkills: ['skills/using-superpowers/SKILL.md', 'skills/brainstorming/SKILL.md'],
              providerTrace: { threadId: 'thread-prov-1', turnId: 'turn-prov-summary' },
              timestamp: '2026-03-25T00:01:00.000Z',
              completionGateVersion: 'finished-deliverable-v1'
            }
          }
        };
      }
    };

    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });
    const session = await manager.createSession({ completionMode: 'summary' });
    const completed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A product that turns rough ideas into decisions',
      rawInput: 'A product that turns rough ideas into decisions'
    });

    const provenance = manager.getSessionProvenance(session.id);
    assert.strictEqual(provenance.questions.length, 1);
    assert.strictEqual(provenance.questions[0].generationMode, 'real-skill-runtime');
    assert.strictEqual(provenance.questions[0].providerTrace.threadId, 'thread-prov-1');
    assert.strictEqual(provenance.finalResult.generationMode, 'real-skill-runtime');
    assert.strictEqual(provenance.finalResult.completionGateVersion, 'finished-deliverable-v1');
    assert.strictEqual(completed.provenance.finalResult.generationMode, 'real-skill-runtime');
  });

  await test('fails explicitly when the runtime adapter cannot create a real session', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        throw new Error('No supported Codex backend is available');
      }
    };
    const manager = createSessionManager({ dataDir: tmpDir, runtimeAdapter });

    await assert.rejects(
      () => manager.createSession({ completionMode: 'summary' }),
      /No supported Codex backend is available/
    );

    const sessionsDir = path.join(tmpDir, 'sessions');
    const sessionFiles = fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir) : [];
    assert.strictEqual(sessionFiles.length, 0);
  });

  await test('full-skill workflow falls back to a local seeded session when real runtime creation fails', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession() {
        throw new Error('No supported Codex backend is available');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter
    });

    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'A browser-first workflow for non-technical users'
    });

    assert.strictEqual(session.workflow.mode, 'full_skill');
    assert.strictEqual(session.backendMode, 'fake');
    assert.strictEqual(session.currentMessage.type, 'question');
    assert(session.currentMessage.provenance);
    assert.strictEqual(session.currentMessage.provenance.generationMode, 'fake-flow');
  });

  await test('full-skill workflow falls back on answer submission when the real backend times out', async (tmpDir) => {
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-submit-timeout', pendingRequestId: 'req-1' },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem'
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer() {
        return new Promise(() => {});
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      runtimeAdapter,
      runtimeSubmitTimeoutMs: 10
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill',
      initialPrompt: 'A browser-first workflow for non-technical users'
    });

    const afterFallback = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'Build a product that hides engineering details but still reaches spec plus plan.',
      rawInput: 'Build a product that hides engineering details but still reaches spec plus plan.'
    });

    assert.strictEqual(afterFallback.backendMode, 'fake');
    assert.strictEqual(afterFallback.currentMessage.type, 'question');
    assert.strictEqual(afterFallback.currentMessage.questionId, 'seed-reframe');
    const inspection = manager.getSessionInspection(session.id);
    assert(inspection.workflow.hiddenActivity.some((entry) => entry.kind === 'runtime-fallback'));
  });

  await test('full-skill workflow pauses for spec review and then completes with a spec-and-plan bundle', async (tmpDir) => {
    let specDraftCalls = 0;
    let planDraftCalls = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'exec',
          providerSession: { transcriptId: `transcript-${input.sessionId}` },
          currentQuestionId: 'topic',
          history: [],
          strategyState: {
            phase: 'scope',
            nextLearningGoal: 'understand-the-core-problem'
          },
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided workflow',
            text: 'Recommendation\n- Choose: Guided workflow',
            path: ['topic'],
            answers: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
            deliverable: {
              title: 'Recommendation: Guided workflow',
              completionGateVersion: 'finished-deliverable-v1',
              isComplete: true,
              sections: [
                { id: 'recommendation', title: 'Recommendation', items: ['Choose: Guided workflow'] },
                { id: 'problem-framing', title: 'Problem Framing', items: [answer.text] },
                { id: 'explored-approaches', title: 'Explored Approaches', items: ['Guided workflow', 'Manual facilitator'] },
                { id: 'why-this-path-currently-wins', title: 'Why This Path Currently Wins', items: ['It keeps the user in one clear flow.'] },
                { id: 'alternatives-still-worth-remembering', title: 'Alternatives Still Worth Remembering', items: ['Manual facilitator'] },
                { id: 'design-execution-draft', title: 'Design / Execution Draft', items: ['Draft the browser workflow and approval gates.'] },
                { id: 'risks-open-questions', title: 'Risks / Open Questions', items: ['Validate whether the workflow feels too hidden.'] },
                { id: 'next-actions', title: 'Next Actions', items: ['Draft the spec and implementation plan.'] }
              ]
            },
            provenance: {
              backendMode: 'exec',
              generationMode: 'real-skill-runtime',
              requiredSkills: ['skills/using-superpowers/SKILL.md', 'skills/brainstorming/SKILL.md'],
              timestamp: '2026-03-25T00:02:00.000Z'
            }
          }
        };
      }
    };
    const workflowEngine = {
      async createSpecDraft(input) {
        specDraftCalls += 1;
        assert.strictEqual(input.summary.title, 'Recommendation: Guided workflow');
        return {
          specArtifact: {
            title: 'Brainstorm Workflow Design',
            fileName: '2026-03-25-brainstorm-workflow-design.md',
            markdown: '# Brainstorm Workflow Design\n\n## Goal\n\nShip a full-skill browser workflow.\n'
          },
          review: {
            status: 'approved',
            issues: [],
            recommendations: ['Keep the first version focused on spec + plan completion.']
          },
          reviewPrompt: {
            title: 'Review the drafted workflow document',
            description: 'The first draft is ready. Review it, then confirm if it is accurate enough to continue into the implementation plan.',
            approveLabel: 'Looks right, continue',
            reviseLabel: 'Needs changes first'
          }
        };
      },
      async createPlan(input) {
        planDraftCalls += 1;
        assert.strictEqual(input.specArtifact.title, 'Brainstorm Workflow Design');
        return {
          planArtifact: {
            title: 'Brainstorm Workflow Implementation Plan',
            fileName: '2026-03-25-brainstorm-workflow.md',
            markdown: '# Brainstorm Workflow Implementation Plan\n\n> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.\n'
          },
          completion: {
            title: 'Spec and plan are ready',
            text: 'The workflow package is ready for review and implementation planning.',
            artifactType: 'workflow_bundle'
          }
        };
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeAdapter,
      workflowEngine
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill'
    });

    const afterBrainstorm = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser product that hides engineering details but still runs the full brainstorming workflow',
      rawInput: 'A browser product that hides engineering details but still runs the full brainstorming workflow'
    });

    assert.strictEqual(specDraftCalls, 1);
    assert.strictEqual(afterBrainstorm.currentMessage.type, 'question');
    assert.strictEqual(afterBrainstorm.currentMessage.questionType, 'confirm');
    assert.strictEqual(afterBrainstorm.currentMessage.questionId, 'workflow-review-spec');
    assert.strictEqual(afterBrainstorm.workflow.mode, 'full_skill');
    assert.strictEqual(afterBrainstorm.workflow.visibleStage.id, 'review-spec');
    assert.strictEqual(afterBrainstorm.workflow.status, 'awaiting_user');
    assert(afterBrainstorm.workflow.specArtifact);
    assert(fs.existsSync(afterBrainstorm.workflow.specArtifact.filePath), 'spec artifact should be written to disk');

    const approved = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'workflow-review-spec',
      answerMode: 'confirm',
      optionIds: ['yes'],
      text: null,
      rawInput: 'yes'
    });

    assert.strictEqual(planDraftCalls, 1);
    assert.strictEqual(approved.currentMessage.type, 'artifact_ready');
    assert.strictEqual(approved.workflow.visibleStage.id, 'plan-ready');
    assert.strictEqual(approved.workflow.status, 'complete');
    assert(approved.workflow.planArtifact);
    assert(fs.existsSync(approved.workflow.planArtifact.filePath), 'plan artifact should be written to disk');
    assert(approved.artifact, 'bundle artifact metadata should be persisted');
    assert(approved.finishedResult, 'finished result snapshot should be persisted');
    assert.strictEqual(approved.finishedResult.exportPaths.jsonPath, `/api/sessions/${approved.id}/result`);
    assert.strictEqual(approved.finishedResult.exportPaths.markdownPath, `/api/sessions/${approved.id}/result.md`);
    assert.strictEqual(approved.finishedResult.sections[0].title, 'Recommendation');
    assert.strictEqual(approved.finishedResult.supportingArtifacts.length, 3);
    assert(approved.currentMessage.deliverable, 'artifact_ready payload should carry normalized deliverable');
    assert(approved.currentMessage.finishedResult, 'artifact_ready payload should expose finished result snapshot');
    assert.strictEqual(approved.currentMessage.resultExportPaths.jsonPath, `/api/sessions/${approved.id}/result`);

    const bundleText = fs.readFileSync(approved.artifact.filePath, 'utf-8');
    assert(bundleText.includes('Spec and Plan Bundle'));
    assert(bundleText.includes('Brainstorm Workflow Design'));
    assert(bundleText.includes('Brainstorm Workflow Implementation Plan'));

    const finishedResult = manager.getFinishedResult(session.id);
    assert.strictEqual(finishedResult.recommendationTitle, 'Choose: Guided workflow');
    assert(finishedResult.sections.some((section) => section.title === 'Next Actions'));

    const finishedMarkdown = manager.getFinishedResultMarkdown(session.id);
    assert(finishedMarkdown.includes('Structured Brainstorming Result'));
    assert(finishedMarkdown.includes('Choose: Guided workflow'));
    assert(!finishedMarkdown.includes('Spec and Plan Bundle'));

    const reloaded = manager.getSession(session.id);
    assert.strictEqual(reloaded.workflow.status, 'complete');
    assert.strictEqual(reloaded.currentMessage.type, 'artifact_ready');
    assert(reloaded.finishedResult, 'finished result snapshot should survive reload');
  });

  await test('retries hidden spec review automatically before surfacing the user review gate', async (tmpDir) => {
    let specDraftCalls = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-review-retry', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided workflow',
            text: 'Recommendation\n- Choose: Guided workflow',
            path: ['topic'],
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };
    const workflowEngine = {
      async createSpecDraft() {
        specDraftCalls += 1;
        if (specDraftCalls === 1) {
          return {
            specArtifact: {
              title: 'Brainstorm Workflow Design',
              fileName: '2026-03-25-brainstorm-workflow-design.md',
              markdown: '# Brainstorm Workflow Design\n\n## Goal\n\nTighten the scope.\n'
            },
            review: {
              status: 'issues_found',
              issues: ['Scope is still too broad.'],
              recommendations: ['Keep V1 focused on a single browser-first workflow.']
            },
            reviewPrompt: {
              title: 'Review the drafted workflow document',
              description: 'Review the drafted document before continuing to the plan.'
            }
          };
        }

        return {
          specArtifact: {
            title: 'Brainstorm Workflow Design',
            fileName: '2026-03-25-brainstorm-workflow-design.md',
            markdown: '# Brainstorm Workflow Design\n\n## Goal\n\nKeep V1 focused.\n'
          },
          review: {
            status: 'approved',
            issues: [],
            recommendations: ['Looks ready to continue.']
          },
          reviewPrompt: {
            title: 'Review the drafted workflow document',
            description: 'Review the drafted document before continuing to the plan.'
          }
        };
      },
      async createPlan() {
        throw new Error('createPlan should not be called in this test');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeAdapter,
      workflowEngine,
      reviewRetryBudget: 3
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill'
    });

    const afterBrainstorm = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser product that hides engineering details but still runs the full workflow',
      rawInput: 'A browser product that hides engineering details but still runs the full workflow'
    });

    assert.strictEqual(specDraftCalls, 2);
    assert.strictEqual(afterBrainstorm.currentMessage.questionId, 'workflow-review-spec');
    assert.strictEqual(afterBrainstorm.workflow.review.attemptCount, 2);
    assert.strictEqual(afterBrainstorm.workflow.review.status, 'approved');
    assert(afterBrainstorm.workflow.checkpoints.length >= 2);

    const inspection = manager.getSessionInspection(session.id);
    assert(Array.isArray(inspection.workflow.hiddenActivity));
    assert(inspection.workflow.hiddenActivity.some((entry) => entry.reviewStatus === 'issues_found'));
    assert(Array.isArray(inspection.workflow.skillChecklist));
    assert.strictEqual(
      inspection.workflow.skillChecklist.find((entry) => entry.id === 'spec-review-loop').status,
      'completed'
    );
  });

  await test('surfaces a blocked review state and resumes after the user adds guidance', async (tmpDir) => {
    let specDraftCalls = 0;
    const runtimeAdapter = {
      async createSession(input) {
        return {
          sessionId: input.sessionId,
          backendMode: 'app-server',
          providerSession: { threadId: 'thread-review-blocked', pendingRequestId: null },
          currentQuestionId: 'topic',
          history: [],
          currentMessage: {
            type: 'question',
            questionType: 'ask_text',
            questionId: 'topic',
            title: 'What do you want to brainstorm about?',
            description: 'Start with the core topic.',
            options: [],
            allowTextOverride: true
          }
        };
      },
      async submitAnswer(snapshot, answer) {
        return {
          ...snapshot,
          history: [{ questionId: 'topic', question: 'What do you want to brainstorm about?', answer: answer.text }],
          currentQuestionId: null,
          currentMessage: {
            type: 'summary',
            title: 'Recommendation: Guided workflow',
            text: 'Recommendation\n- Choose: Guided workflow',
            path: ['topic'],
            answers: [{ questionId: 'topic', answer: answer.text }]
          }
        };
      }
    };
    const workflowEngine = {
      async createSpecDraft(input) {
        specDraftCalls += 1;
        if (specDraftCalls <= 2) {
          return {
            specArtifact: {
              title: 'Blocked Workflow Design',
              fileName: '2026-03-25-blocked-workflow-design.md',
              markdown: '# Blocked Workflow Design\n\n## Gap\n\nNeeds more direction.\n'
            },
            review: {
              status: 'issues_found',
              issues: ['The document still lacks a crisp boundary.'],
              recommendations: ['State exactly what V1 includes and excludes.']
            },
            reviewPrompt: {
              title: 'Review the drafted workflow document',
              description: 'Review the drafted document before continuing to the plan.'
            }
          };
        }

        assert((input.revisionNotes || '').includes('Narrow the V1 scope'));
        return {
          specArtifact: {
            title: 'Recovered Workflow Design',
            fileName: '2026-03-25-recovered-workflow-design.md',
            markdown: '# Recovered Workflow Design\n\n## Scope\n\nNarrow the V1 scope.\n'
          },
          review: {
            status: 'approved',
            issues: [],
            recommendations: ['Ready for user review.']
          },
          reviewPrompt: {
            title: 'Review the drafted workflow document',
            description: 'Review the drafted document before continuing to the plan.'
          }
        };
      },
      async createPlan() {
        throw new Error('createPlan should not be called in this test');
      }
    };

    const manager = createSessionManager({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeAdapter,
      workflowEngine,
      reviewRetryBudget: 2
    });
    const session = await manager.createSession({
      completionMode: 'artifact',
      workflowMode: 'full_skill'
    });

    const blocked = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'topic',
      answerMode: 'text',
      optionIds: [],
      text: 'A browser product that still stalls when the draft is too broad',
      rawInput: 'A browser product that still stalls when the draft is too broad'
    });

    assert.strictEqual(specDraftCalls, 2);
    assert.strictEqual(blocked.workflow.status, 'blocked');
    assert.strictEqual(blocked.workflow.visibleStage.id, 'review-blocked');
    assert.strictEqual(blocked.currentMessage.questionId, 'workflow-revise-spec');
    assert(blocked.workflow.blocked);
    assert.strictEqual(blocked.workflow.blocked.canResume, true);
    assert(blocked.workflow.checkpoints.some((entry) => entry.stageId === 'review-blocked'));

    const resumed = await manager.submitAnswer(session.id, {
      type: 'answer',
      questionId: 'workflow-revise-spec',
      answerMode: 'text',
      optionIds: [],
      text: 'Narrow the V1 scope to one browser workflow that ends at spec plus plan.',
      rawInput: 'Narrow the V1 scope to one browser workflow that ends at spec plus plan.'
    });

    assert.strictEqual(specDraftCalls, 3);
    assert.strictEqual(resumed.workflow.status, 'awaiting_user');
    assert.strictEqual(resumed.workflow.visibleStage.id, 'review-spec');
    assert.strictEqual(resumed.currentMessage.questionId, 'workflow-review-spec');
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests();
