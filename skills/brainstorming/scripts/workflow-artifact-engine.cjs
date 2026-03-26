const { runCodexExecWithSchema } = require('./codex-exec-runner.cjs');

const SPEC_DRAFT_SCHEMA = {
  type: 'object',
  required: [
    'specTitle',
    'specMarkdown',
    'reviewStatus',
    'reviewIssues',
    'reviewRecommendations',
    'reviewPromptTitle',
    'reviewPromptDescription'
  ],
  properties: {
    specTitle: { type: 'string' },
    specMarkdown: { type: 'string' },
    reviewStatus: { enum: ['approved', 'issues_found'] },
    reviewIssues: { type: 'array', items: { type: 'string' } },
    reviewRecommendations: { type: 'array', items: { type: 'string' } },
    reviewPromptTitle: { type: 'string' },
    reviewPromptDescription: { type: 'string' }
  }
};

const PLAN_DRAFT_SCHEMA = {
  type: 'object',
  required: [
    'planTitle',
    'planMarkdown',
    'completionTitle',
    'completionText',
    'artifactType'
  ],
  properties: {
    planTitle: { type: 'string' },
    planMarkdown: { type: 'string' },
    completionTitle: { type: 'string' },
    completionText: { type: 'string' },
    artifactType: { type: 'string' }
  }
};

function slugify(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'brainstorm-workflow';
}

function currentDatePrefix() {
  return new Date().toISOString().slice(0, 10);
}

function parseStructuredAgentOutput(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Hidden workflow engine returned empty agent output');
  }
  return JSON.parse(text);
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function buildSpecPrompt(input, fileName) {
  const summary = input.summary || {};
  const priorSpecArtifact = input.specArtifact || {};
  const review = input.review || {};
  const revisionNotes = typeof input.revisionNotes === 'string' && input.revisionNotes.trim()
    ? input.revisionNotes.trim()
    : null;
  return [
    'You are running the hidden workflow step that turns a completed brainstorm into a design spec.',
    'Actually read these repository files before producing the result:',
    '- skills/brainstorming/SKILL.md',
    '- skills/brainstorming/spec-document-reviewer-prompt.md',
    'Do not write files. Return JSON only matching the provided schema.',
    `Target output path: docs/superpowers/specs/${fileName}`,
    '',
    'Write a reviewable design document that matches the brainstorming intent and is ready for implementation planning.',
    'Then review that spec using the reviewer template and return the review outcome in the same JSON response.',
    '',
    `Seed prompt: ${input.session && input.session.seedPrompt ? input.session.seedPrompt : '(none)'}`,
    `Brainstorm title: ${summary.title || 'Brainstorming Summary'}`,
    '',
    'Brainstorm summary text:',
    summary.text || '(none)',
    '',
    'Current draft markdown:',
    priorSpecArtifact.previewText || priorSpecArtifact.markdown || '(no prior draft)',
    '',
    'Latest review status:',
    review.status || '(none)',
    '',
    'Latest review issues:',
    Array.isArray(review.issues) && review.issues.length > 0
      ? review.issues.map((issue) => `- ${issue}`).join('\n')
      : '- none',
    '',
    'Latest review recommendations:',
    Array.isArray(review.recommendations) && review.recommendations.length > 0
      ? review.recommendations.map((item) => `- ${item}`).join('\n')
      : '- none',
    '',
    'Revision notes from the workflow:',
    revisionNotes || '(none)'
  ].join('\n');
}

function buildPlanPrompt(input, fileName) {
  const specArtifact = input.specArtifact || {};
  return [
    'You are running the hidden workflow step that turns an approved design spec into an implementation plan.',
    'Actually read these repository files before producing the result:',
    '- skills/writing-plans/SKILL.md',
    '- skills/brainstorming/SKILL.md',
    'Do not write files. Return JSON only matching the provided schema.',
    `Target output path: docs/superpowers/plans/${fileName}`,
    '',
    'Generate an implementation plan that follows the writing-plans skill structure and remains aligned with the approved spec.',
    '',
    `Seed prompt: ${input.session && input.session.seedPrompt ? input.session.seedPrompt : '(none)'}`,
    `Spec title: ${specArtifact.title || 'Approved Workflow Spec'}`,
    `Spec path: ${specArtifact.relativePath || specArtifact.fileName || '(not available)'}`,
    '',
    'Approved spec markdown:',
    specArtifact.previewText || '(none)'
  ].join('\n');
}

function createLocalWorkflowEngine() {
  return {
    async createSpecDraft(input) {
      const summary = input.summary || {};
      const deliverable = summary.deliverable || {};
      const sections = Array.isArray(deliverable.sections) ? deliverable.sections : [];
      const topic = input.session && input.session.seedPrompt
        ? input.session.seedPrompt
        : (summary.title || 'Structured Brainstorming Workflow');
      const slug = slugify(topic).slice(0, 48);
      const specTitle = summary.title || 'Structured Brainstorming Workflow Design';
      const lines = [
        `# ${specTitle}`,
        '',
        '## Goal',
        '',
        'Create a browser-first workflow that takes the user from a rough question to a reviewable spec and implementation plan.',
        '',
        '## Context',
        '',
        input.session && input.session.seedPrompt
          ? input.session.seedPrompt
          : (summary.text || 'No seed prompt captured.'),
        ''
      ];

      for (const section of sections) {
        lines.push(`## ${section.title}`);
        lines.push('');
        for (const item of section.items || []) {
          lines.push(`- ${item}`);
        }
        lines.push('');
      }

      return {
        specArtifact: {
          title: specTitle,
          fileName: `${currentDatePrefix()}-${slug}-design.md`,
          markdown: lines.join('\n')
        },
        review: {
          status: 'approved',
          issues: [],
          recommendations: ['Keep V1 focused on spec and plan completion before implementation.']
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
      const specArtifact = input.specArtifact || {};
      const slug = slugify(specArtifact.title || (input.session && input.session.seedPrompt) || 'brainstorm-workflow').slice(0, 48);
      const planTitle = `${specArtifact.title || 'Brainstorm Workflow'} Implementation Plan`;
      return {
        planArtifact: {
          title: planTitle,
          fileName: `${currentDatePrefix()}-${slug}.md`,
          markdown: [
            `# ${planTitle}`,
            '',
            '## Goal',
            '',
            `Build the workflow described in "${specArtifact.title || 'the approved design'}" and stop at a reviewable spec plus implementation plan completion state.`,
            '',
            '## Delivery Shape',
            '',
            '- Keep the browser experience outcome-first and non-technical.',
            '- Let the backend handle hidden workflow automation, review loops, and checkpoint persistence.',
            '- Stop when the workflow can present a reviewable design document and implementation plan together.',
            '',
            '## Workstream 1: Workflow State Model',
            '',
            '- Persist both the user-visible stage and the hidden internal stage.',
            '- Store review checkpoints, draft artifacts, and the final bundle metadata in session state.',
            '',
            '## Workstream 2: Review Experience',
            '',
            '- Show one active decision at a time.',
            '- Let the user review draft documents without exposing internal engineering mechanics.',
            '- Preserve a resumable path when the workflow needs more direction.',
            '',
            '## Workstream 3: Verification',
            '',
            '- Add regression coverage for the full workflow through final bundle creation.',
            '- Verify automation-boundary behavior for hidden steps and confirmation-only decisions.',
            '- Run a browser smoke flow that ends at a reviewable bundle.',
            ''
          ].join('\n')
        },
        completion: {
          title: 'Spec and plan are ready',
          text: 'The workflow package is ready for review and implementation planning.',
          artifactType: 'workflow_bundle'
        }
      };
    }
  };
}

function createExecWorkflowEngine(options) {
  const runExec = options && options.runExec ? options.runExec : runCodexExecWithSchema;
  const fallbackEngine = options && options.fallbackEngine ? options.fallbackEngine : createLocalWorkflowEngine();
  const execTimeoutMs = options && typeof options.execTimeoutMs === 'number'
    ? options.execTimeoutMs
    : 10000;
  if (typeof runExec !== 'function') {
    throw new Error('createExecWorkflowEngine requires a runExec function');
  }

  return {
    async createSpecDraft(input) {
      const titleSource = input.summary && input.summary.title
        ? input.summary.title
        : (input.session && input.session.seedPrompt ? input.session.seedPrompt : 'brainstorm-workflow');
      const fileName = `${currentDatePrefix()}-${slugify(titleSource).slice(0, 48)}-design.md`;
      try {
        const result = await withTimeout(
          runExec(
            buildSpecPrompt(input, fileName),
            SPEC_DRAFT_SCHEMA,
            { cwd: input.cwd || process.cwd() }
          ),
          execTimeoutMs,
          'workflow spec generation'
        );
        const payload = parseStructuredAgentOutput(result.agentText);
        return {
          specArtifact: {
            title: payload.specTitle,
            fileName,
            markdown: payload.specMarkdown
          },
          review: {
            status: payload.reviewStatus,
            issues: Array.isArray(payload.reviewIssues) ? payload.reviewIssues : [],
            recommendations: Array.isArray(payload.reviewRecommendations) ? payload.reviewRecommendations : []
          },
          reviewPrompt: {
            title: payload.reviewPromptTitle,
            description: payload.reviewPromptDescription,
            approveLabel: 'Looks right, continue',
            reviseLabel: 'Needs changes first'
          }
        };
      } catch (_error) {
        return fallbackEngine.createSpecDraft(input);
      }
    },

    async createPlan(input) {
      const titleSource = input.specArtifact && input.specArtifact.title
        ? input.specArtifact.title
        : (input.session && input.session.seedPrompt ? input.session.seedPrompt : 'brainstorm-workflow');
      const fileName = `${currentDatePrefix()}-${slugify(titleSource).slice(0, 48)}.md`;
      try {
        const result = await withTimeout(
          runExec(
            buildPlanPrompt(input, fileName),
            PLAN_DRAFT_SCHEMA,
            { cwd: input.cwd || process.cwd() }
          ),
          execTimeoutMs,
          'workflow plan generation'
        );
        const payload = parseStructuredAgentOutput(result.agentText);
        return {
          planArtifact: {
            title: payload.planTitle,
            fileName,
            markdown: payload.planMarkdown
          },
          completion: {
            title: payload.completionTitle,
            text: payload.completionText,
            artifactType: payload.artifactType
          }
        };
      } catch (_error) {
        return fallbackEngine.createPlan(input);
      }
    }
  };
}

module.exports = {
  createLocalWorkflowEngine,
  createExecWorkflowEngine
};
