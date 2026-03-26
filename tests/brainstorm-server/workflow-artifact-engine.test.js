const assert = require('assert');
const path = require('path');

const ENGINE_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/workflow-artifact-engine.cjs');

let createExecWorkflowEngine;
try {
  ({ createExecWorkflowEngine } = require(ENGINE_PATH));
} catch (error) {
  console.error(`Cannot load ${ENGINE_PATH}: ${error.message}`);
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

  console.log('\n--- Workflow Artifact Engine ---');

  await test('uses codex-backed structured outputs to produce spec and plan drafts', async () => {
    const prompts = [];
    const engine = createExecWorkflowEngine({
      runExec: async (prompt, schema, options) => {
        prompts.push({ prompt, schema, options });
        if (prompts.length === 1) {
          return {
            threadId: 'thread-spec',
            agentText: JSON.stringify({
              specTitle: 'Workflow Design',
              specMarkdown: '# Workflow Design\n\n## Goal\n\nShip the browser workflow.\n',
              reviewStatus: 'approved',
              reviewIssues: [],
              reviewRecommendations: ['Keep the first release narrow.'],
              reviewPromptTitle: 'Review the drafted workflow document',
              reviewPromptDescription: 'Please review the first draft before the plan is generated.'
            })
          };
        }

        return {
          threadId: 'thread-plan',
          agentText: JSON.stringify({
            planTitle: 'Workflow Plan',
            planMarkdown: '# Workflow Plan\n\n## Task 1\n\n- [ ] Implement it.\n',
            completionTitle: 'Spec and plan are ready',
            completionText: 'Both artifacts are ready for review.',
            artifactType: 'workflow_bundle'
          })
        };
      }
    });

    const specDraft = await engine.createSpecDraft({
      session: {
        seedPrompt: 'Build a browser-first workflow that hides engineering mechanics.'
      },
      summary: {
        title: 'Recommendation: Guided workflow',
        text: 'Recommendation\n- Choose: Guided workflow'
      },
      cwd: '/tmp/brainstorm-workflow-engine'
    });

    assert.strictEqual(specDraft.specArtifact.title, 'Workflow Design');
    assert.strictEqual(specDraft.review.status, 'approved');
    assert.strictEqual(prompts.length, 1);
    assert(prompts[0].prompt.includes('skills/brainstorming/SKILL.md'));

    const planDraft = await engine.createPlan({
      session: {
        seedPrompt: 'Build a browser-first workflow that hides engineering mechanics.'
      },
      summary: {
        title: 'Recommendation: Guided workflow',
        text: 'Recommendation\n- Choose: Guided workflow'
      },
      specArtifact: {
        title: specDraft.specArtifact.title,
        fileName: specDraft.specArtifact.fileName,
        relativePath: `docs/superpowers/specs/${specDraft.specArtifact.fileName}`,
        previewText: specDraft.specArtifact.markdown
      },
      cwd: '/tmp/brainstorm-workflow-engine'
    });

    assert.strictEqual(planDraft.planArtifact.title, 'Workflow Plan');
    assert.strictEqual(planDraft.completion.artifactType, 'workflow_bundle');
    assert.strictEqual(prompts.length, 2);
    assert(prompts[1].prompt.includes('skills/writing-plans/SKILL.md'));
  });

  await test('falls back to the local workflow engine when codex exec fails', async () => {
    const engine = createExecWorkflowEngine({
      runExec: async () => {
        throw new Error('unexpected status 502 Bad Gateway: Upstream request failed');
      }
    });

    const specDraft = await engine.createSpecDraft({
      session: {
        seedPrompt: 'Build a browser-first workflow that still produces a usable fallback spec.'
      },
      summary: {
        title: 'Recommendation: Guided workflow',
        text: 'Recommendation\n- Choose: Guided workflow',
        deliverable: {
          sections: [
            { title: 'Recommendation', items: ['Choose: Guided workflow'] },
            { title: 'Problem Framing', items: ['Keep the UI non-technical.'] }
          ]
        }
      },
      cwd: '/tmp/brainstorm-workflow-engine'
    });

    assert.strictEqual(specDraft.review.status, 'approved');
    assert(specDraft.specArtifact.markdown.includes('# Recommendation: Guided workflow'));

    const planDraft = await engine.createPlan({
      session: {
        seedPrompt: 'Build a browser-first workflow that still produces a usable fallback spec.'
      },
      summary: {
        title: 'Recommendation: Guided workflow',
        text: 'Recommendation\n- Choose: Guided workflow'
      },
      specArtifact: {
        title: specDraft.specArtifact.title,
        fileName: specDraft.specArtifact.fileName,
        relativePath: `docs/superpowers/specs/${specDraft.specArtifact.fileName}`,
        previewText: specDraft.specArtifact.markdown
      },
      cwd: '/tmp/brainstorm-workflow-engine'
    });

    assert.strictEqual(planDraft.completion.artifactType, 'workflow_bundle');
    assert(planDraft.planArtifact.markdown.includes('# Recommendation: Guided workflow Implementation Plan'));
    assert(!planDraft.planArtifact.markdown.toLowerCase().includes('subagent'));
    assert(!planDraft.planArtifact.markdown.toLowerCase().includes('skill'));
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
