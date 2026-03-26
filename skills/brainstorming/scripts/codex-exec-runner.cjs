const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';
const DEFAULT_REASONING_EFFORT = 'low';
const DEFAULT_REASONING_SUMMARY = 'none';
const DEFAULT_VERBOSITY = 'low';
const DEFAULT_SERVICE_TIER = 'fast';
const DEFAULT_DISABLED_FEATURES = Object.freeze([
  'apply_patch_freeform',
  'child_agents_md',
  'memories'
]);

const STRUCTURED_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['type'],
  anyOf: [
    {
      type: 'object',
      required: ['type', 'questionType', 'questionId', 'title'],
      properties: {
        type: { const: 'question' },
        questionType: { enum: ['pick_one', 'pick_many', 'confirm', 'ask_text'] },
        questionId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'label'],
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        allowTextOverride: { type: 'boolean' },
        textOverrideLabel: { type: 'string' }
      }
    },
    {
      type: 'object',
      required: ['type', 'text'],
      properties: {
        type: { const: 'summary' },
        text: { type: 'string' },
        path: { type: 'array', items: { type: 'string' } },
        answers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['questionId', 'answer'],
            properties: {
              questionId: { type: 'string' },
              answer: { type: 'string' }
            }
          }
        }
      }
    },
    {
      type: 'object',
      required: ['type', 'artifactType', 'title', 'text'],
      properties: {
        type: { const: 'artifact_ready' },
        artifactType: { type: 'string' },
        title: { type: 'string' },
        text: { type: 'string' },
        path: { type: 'string' },
        artifactMarkdown: { type: 'string' }
      }
    }
  ]
};

function readOption(options, key) {
  if (options && Object.prototype.hasOwnProperty.call(options, key)) {
    return options[key];
  }
  return undefined;
}

function readStringEnv(name) {
  const value = process.env[name];
  return value ? value : undefined;
}

function getModelProviderOverride(options) {
  const value = readOption(options, 'modelProvider');
  if (value !== undefined) {
    return value;
  }
  return readStringEnv('BRAINSTORM_CODEX_MODEL_PROVIDER');
}

function getModelOverride(options) {
  const value = readOption(options, 'model');
  if (value !== undefined) {
    return value;
  }
  return readStringEnv('BRAINSTORM_CODEX_MODEL') || DEFAULT_CODEX_MODEL;
}

function getReasoningEffortOverride(options) {
  const value = readOption(options, 'reasoningEffort');
  if (value !== undefined) {
    return value;
  }
  return readStringEnv('BRAINSTORM_CODEX_REASONING_EFFORT') || DEFAULT_REASONING_EFFORT;
}

function getReasoningSummaryOverride(options) {
  const value = readOption(options, 'reasoningSummary');
  if (value !== undefined) {
    return value;
  }
  return readStringEnv('BRAINSTORM_CODEX_REASONING_SUMMARY') || DEFAULT_REASONING_SUMMARY;
}

function getVerbosityOverride(options) {
  const value = readOption(options, 'verbosity');
  if (value !== undefined) {
    return value;
  }
  return readStringEnv('BRAINSTORM_CODEX_VERBOSITY') || DEFAULT_VERBOSITY;
}

function getServiceTierOverride(options) {
  const value = readOption(options, 'serviceTier');
  if (value !== undefined) {
    return value;
  }
  return readStringEnv('BRAINSTORM_CODEX_SERVICE_TIER') || DEFAULT_SERVICE_TIER;
}

function shouldDisableExperimentalFeatures(options) {
  const override = readOption(options, 'disableExperimentalFeatures');
  if (typeof override === 'boolean') {
    return override;
  }
  const envValue = process.env.BRAINSTORM_CODEX_DISABLE_EXPERIMENTAL_FEATURES;
  if (!envValue) {
    return true;
  }
  return envValue !== '0' && envValue.toLowerCase() !== 'false';
}

function createSchemaFile(schemaObject) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-codex-schema-'));
  const filePath = path.join(dir, 'structured-output-schema.json');
  fs.writeFileSync(filePath, JSON.stringify(schemaObject, null, 2));
  return { dir, filePath };
}

function buildDefaultExecArgs(prompt, options, schemaPath) {
  const cwd = options && options.cwd ? options.cwd : process.cwd();
  const provider = getModelProviderOverride(options);
  const model = getModelOverride(options);
  const reasoningEffort = getReasoningEffortOverride(options);
  const reasoningSummary = getReasoningSummaryOverride(options);
  const verbosity = getVerbosityOverride(options);
  const serviceTier = getServiceTierOverride(options);
  const args = [];

  if (shouldDisableExperimentalFeatures(options)) {
    for (const feature of DEFAULT_DISABLED_FEATURES) {
      args.push('--disable', feature);
    }
  }
  if (provider) {
    args.push('-c', `model_provider="${provider}"`);
  }
  if (model) {
    args.push('-c', `model="${model}"`);
  }
  if (reasoningEffort) {
    args.push('-c', `model_reasoning_effort="${reasoningEffort}"`);
  }
  if (reasoningSummary) {
    args.push('-c', `model_reasoning_summary="${reasoningSummary}"`);
  }
  if (verbosity) {
    args.push('-c', `model_verbosity="${verbosity}"`);
  }
  if (serviceTier) {
    args.push('-c', `service_tier="${serviceTier}"`);
  }

  args.push(
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--output-schema',
    schemaPath,
    '-C',
    cwd,
    prompt
  );

  return args;
}

function runCodexExecWithSchema(prompt, schemaObject, options) {
  const cwd = options && options.cwd ? options.cwd : process.cwd();
  const command = options && options.command ? options.command : 'codex';
  const schema = !options || !Array.isArray(options.args)
    ? createSchemaFile(schemaObject)
    : null;
  const args = options && Array.isArray(options.args)
    ? options.args.slice()
    : buildDefaultExecArgs(prompt, options, schema.filePath);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: options && options.env ? { ...options.env } : { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrText = '';
    let threadId = null;
    let agentText = null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        let event;
        try {
          event = JSON.parse(line);
        } catch (_error) {
          continue;
        }

        if (event.type === 'thread.started' && event.thread_id) {
          threadId = event.thread_id;
        }

        if (event.type === 'item.completed' && event.item && event.item.type === 'agent_message') {
          agentText = event.item.text || '';
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrText += chunk;
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (schema) {
        fs.rmSync(schema.dir, { recursive: true, force: true });
      }
      if (code !== 0) {
        reject(new Error(stderrText.trim() || `codex exec exited with code ${code}`));
        return;
      }

      if (!agentText) {
        reject(new Error('codex exec did not produce a final agent message'));
        return;
      }

      resolve({
        threadId,
        agentText,
        stderrText: stderrText.trim()
      });
    });
  });
}

function runCodexExec(prompt, options) {
  return runCodexExecWithSchema(prompt, STRUCTURED_OUTPUT_SCHEMA, options);
}

module.exports = {
  buildDefaultExecArgs,
  runCodexExec,
  runCodexExecWithSchema
};
