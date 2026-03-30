const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RUNNER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/codex-exec-runner.cjs');
const FIXTURE_PATH = path.join(__dirname, 'fixtures/mock-codex-exec.cjs');

let runCodexExec;
let buildDefaultExecArgs;
let runCodexExecWithSchema;
let normalizeSchemaForCodex;
let buildRuntimeOutputSchema;
try {
  ({ runCodexExec, runCodexExecWithSchema, buildDefaultExecArgs, normalizeSchemaForCodex, buildRuntimeOutputSchema } = require(RUNNER_PATH));
} catch (error) {
  console.error(`Cannot load ${RUNNER_PATH}: ${error.message}`);
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

  console.log('\n--- Codex Exec Runner ---');

  await test('builds default exec args with product-safe codex overrides', async () => {
    const previousProvider = process.env.BRAINSTORM_CODEX_MODEL_PROVIDER;
    const previousModel = process.env.BRAINSTORM_CODEX_MODEL;
    delete process.env.BRAINSTORM_CODEX_MODEL_PROVIDER;
    delete process.env.BRAINSTORM_CODEX_MODEL;

    try {
      const args = buildDefaultExecArgs('Prompt body', { cwd: '/tmp/exec-defaults' }, '/tmp/schema.json');
      assert(args.includes('--disable'));
      assert(args.includes('apply_patch_freeform'));
      assert(args.includes('child_agents_md'));
      assert(args.includes('memories'));
      assert(args.includes('model="gpt-5.3-codex"'));
      assert(!args.includes('model_provider="openai"'));
      assert(args.includes('/tmp/schema.json'));
      assert(args.includes('/tmp/exec-defaults'));
    } finally {
      if (previousProvider === undefined) {
        delete process.env.BRAINSTORM_CODEX_MODEL_PROVIDER;
      } else {
        process.env.BRAINSTORM_CODEX_MODEL_PROVIDER = previousProvider;
      }
      if (previousModel === undefined) {
        delete process.env.BRAINSTORM_CODEX_MODEL;
      } else {
        process.env.BRAINSTORM_CODEX_MODEL = previousModel;
      }
    }
  });

  await test('parses the final agent message from codex exec JSONL output', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-codex-exec-runner-'));
    const result = await runCodexExec('Prompt body', {
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd
    });

    assert.strictEqual(result.threadId, 'thread-exec-mock');
    assert.strictEqual(typeof result.agentText, 'string');
    assert(result.agentText.includes('"type":"question"'));
  });

  await test('supports a custom output schema for hidden workflow generation', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-codex-exec-runner-schema-'));
    const result = await runCodexExecWithSchema('Prompt body', {
      type: 'object',
      required: ['specMarkdown', 'planMarkdown'],
      properties: {
        specMarkdown: { type: 'string' },
        planMarkdown: { type: 'string' }
      }
    }, {
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd
    });

    assert.strictEqual(result.threadId, 'thread-exec-mock');
    assert.strictEqual(typeof result.agentText, 'string');
    assert(result.agentText.includes('"type":"question"'));
  });

  await test('normalizes object schemas for codex output-schema compatibility', async () => {
    const normalized = normalizeSchemaForCodex({
      type: 'object',
      required: ['outer'],
      properties: {
        outer: {
          type: 'object',
          required: ['value'],
          properties: {
            value: { const: 'fixed' },
            description: { type: 'string' }
          }
        }
      }
    });

    assert.strictEqual(normalized.additionalProperties, false);
    assert.deepStrictEqual(normalized.required, ['outer']);
    assert.strictEqual(normalized.properties.outer.additionalProperties, false);
    assert.deepStrictEqual(normalized.properties.outer.required, ['value', 'description']);
    assert.strictEqual(normalized.properties.outer.properties.value.type, 'string');
  });

  await test('builds a codex-compatible runtime schema without top-level anyOf', async () => {
    const schema = buildRuntimeOutputSchema();

    assert.strictEqual(schema.type, 'object');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(schema, 'anyOf'), false);
    assert.deepStrictEqual(schema.required, [
      'type',
      'questionType',
      'questionId',
      'title',
      'description',
      'options',
      'allowTextOverride',
      'textOverrideLabel'
    ]);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
