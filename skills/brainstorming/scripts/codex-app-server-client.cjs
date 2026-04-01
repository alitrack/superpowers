const { EventEmitter } = require('events');
const { spawn } = require('child_process');

const REQUEST_TIMEOUT_MS = 60000;
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

function readPositiveIntEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
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

function buildDefaultAppServerArgs(options) {
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

  args.push('app-server');
  return args;
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
  return target;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'RUNTIME_TIMEOUT';
      reject(error);
    }, ms);

    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readId(message) {
  if (!message || !Object.prototype.hasOwnProperty.call(message, 'id')) {
    return null;
  }
  const id = message.id;
  if (typeof id === 'string' || typeof id === 'number') {
    return String(id);
  }
  return null;
}

class CodexAppServerClient extends EventEmitter {
  constructor(options) {
    super();
    this.command = options && options.command ? options.command : 'codex';
    this.args = options && Array.isArray(options.args)
      ? options.args.slice()
      : buildDefaultAppServerArgs(options);
    this.env = options && options.env ? { ...options.env } : { ...process.env };
    this.cwd = options && options.cwd ? options.cwd : process.cwd();
    this.spawnImpl = options && options.spawnImpl ? options.spawnImpl : spawn;
    this.requestTimeoutMs = options && options.requestTimeoutMs
      ? options.requestTimeoutMs
      : (readPositiveIntEnv('BRAINSTORM_APP_SERVER_REQUEST_TIMEOUT_MS') || REQUEST_TIMEOUT_MS);
    this.defaultModelProvider = getModelProviderOverride(options);
    this.defaultModel = getModelOverride(options);
    this.defaultReasoningEffort = getReasoningEffortOverride(options);
    this.defaultReasoningSummary = getReasoningSummaryOverride(options);
    this.defaultServiceTier = getServiceTierOverride(options);

    this.process = null;
    this.stdin = null;
    this.initialized = false;
    this.startPromise = null;
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
  }

  async startThread(input) {
    await this.ensureStarted();
    const params = {
      cwd: input && input.cwd ? input.cwd : this.cwd,
      approvalPolicy: input && input.approvalPolicy ? input.approvalPolicy : 'on-request',
      sandbox: input && input.sandbox ? input.sandbox : 'workspace-write'
    };
    assignIfDefined(params, 'baseInstructions', input && input.baseInstructions);
    assignIfDefined(params, 'developerInstructions', input && input.developerInstructions);
    assignIfDefined(params, 'model', input && input.model ? input.model : this.defaultModel);
    assignIfDefined(params, 'modelProvider', input && Object.prototype.hasOwnProperty.call(input, 'modelProvider')
      ? input.modelProvider
      : this.defaultModelProvider);
    assignIfDefined(params, 'serviceTier', input && input.serviceTier ? input.serviceTier : this.defaultServiceTier);

    const result = await this.sendRequest('thread/start', params);

    return {
      threadId: result.thread && result.thread.id ? result.thread.id : null,
      cwd: result.cwd || (input && input.cwd ? input.cwd : this.cwd),
      result
    };
  }

  async resumeThread(input) {
    await this.ensureStarted();
    const params = {
      threadId: input.threadId,
      persistExtendedHistory: true
    };
    assignIfDefined(params, 'cwd', input && input.cwd);
    assignIfDefined(params, 'baseInstructions', input && input.baseInstructions);
    assignIfDefined(params, 'developerInstructions', input && input.developerInstructions);
    assignIfDefined(params, 'model', input && input.model ? input.model : this.defaultModel);
    assignIfDefined(params, 'modelProvider', input && Object.prototype.hasOwnProperty.call(input, 'modelProvider')
      ? input.modelProvider
      : this.defaultModelProvider);
    assignIfDefined(params, 'serviceTier', input && input.serviceTier ? input.serviceTier : this.defaultServiceTier);

    const result = await this.sendRequest('thread/resume', params);

    return {
      threadId: result.thread && result.thread.id ? result.thread.id : null,
      cwd: result.cwd || this.cwd,
      result
    };
  }

  async startTurn(input) {
    await this.ensureStarted();
    const params = {
      threadId: input.threadId,
      input: Array.isArray(input.input) ? input.input : []
    };
    assignIfDefined(params, 'cwd', input && input.cwd);
    assignIfDefined(params, 'approvalPolicy', input && input.approvalPolicy);
    assignIfDefined(params, 'approvalsReviewer', input && input.approvalsReviewer);
    assignIfDefined(params, 'effort', input && input.effort ? input.effort : this.defaultReasoningEffort);
    assignIfDefined(params, 'model', input && input.model ? input.model : this.defaultModel);
    assignIfDefined(params, 'outputSchema', input && input.outputSchema);
    assignIfDefined(params, 'personality', input && input.personality);
    assignIfDefined(params, 'sandboxPolicy', input && input.sandboxPolicy);
    assignIfDefined(params, 'serviceTier', input && input.serviceTier ? input.serviceTier : this.defaultServiceTier);
    assignIfDefined(params, 'summary', input && input.summary ? input.summary : this.defaultReasoningSummary);

    const result = await this.sendRequest('turn/start', params);

    return {
      turnId: result.turn && result.turn.id ? result.turn.id : null,
      result
    };
  }

  async sendServerResponse(input) {
    await this.ensureStarted();
    await this.writeMessage({
      jsonrpc: '2.0',
      id: input.requestId,
      result: input.result
    });
  }

  async ensureStarted() {
    if (this.initialized && this.process && !this.process.killed) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      if (!this.process || this.process.killed) {
        await this.startProcess();
      }

      const initResult = await this.sendRequest('initialize', {
        clientInfo: {
          name: 'superpowers-brainstorm-server',
          version: '0.0.1'
        },
        capabilities: {}
      });

      if (!initResult || typeof initResult !== 'object') {
        throw new Error('codex app-server initialize returned invalid result');
      }

      await this.sendNotification('initialized', {});
      this.initialized = true;
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startProcess() {
    this.process = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.stdin = this.process.stdin;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');

    this.process.stdout.on('data', (chunk) => {
      this.handleStdoutChunk(chunk);
    });

    this.process.stderr.on('data', (chunk) => {
      this.stderrBuffer += chunk;
      this.emit('stderr', chunk);
    });

    this.process.on('exit', (code, signal) => {
      this.initialized = false;
      const error = new Error(`codex app-server exited (code=${code}, signal=${signal || 'none'})`);
      this.rejectAllPending(error);
      this.emit('exit', { code, signal });
    });
  }

  handleStdoutChunk(chunk) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.emit('parse-error', { line, error });
        continue;
      }

      if (message.method) {
        const event = {
          requestId: readId(message),
          method: message.method,
          params: message.params || null,
          raw: message
        };

        if (event.requestId) {
          this.emit('server-request', event);
        } else {
          this.emit('notification', event);
        }
        continue;
      }

      const responseId = readId(message);
      if (responseId && this.pendingRequests.has(responseId)) {
        const pending = this.pendingRequests.get(responseId);
        this.pendingRequests.delete(responseId);
        pending.resolve(message);
      }
    }
  }

  async sendRequest(method, params) {
    const id = String(this.nextRequestId++);
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });

    await this.writeMessage({
      jsonrpc: '2.0',
      id,
      method,
      params
    });

    const response = await withTimeout(promise, this.requestTimeoutMs, method);
    if (response.error) {
      throw new Error(response.error.message || `${method} failed`);
    }
    if (!Object.prototype.hasOwnProperty.call(response, 'result')) {
      throw new Error(`${method} response missing result`);
    }
    return response.result;
  }

  async sendNotification(method, params) {
    await this.writeMessage({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  async writeMessage(payload) {
    if (!this.stdin) {
      throw new Error('codex app-server stdin is not available');
    }
    const line = JSON.stringify(payload) + '\n';
    await new Promise((resolve, reject) => {
      this.stdin.write(line, 'utf8', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  rejectAllPending(error) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      this.pendingRequests.delete(id);
      pending.reject(error);
    }
  }

  async dispose() {
    this.initialized = false;
    this.rejectAllPending(new Error('codex app-server client disposed'));

    if (this.process && !this.process.killed) {
      this.process.kill();
      await new Promise((resolve) => {
        this.process.once('exit', () => resolve());
        setTimeout(resolve, 500);
      });
    }

    this.process = null;
    this.stdin = null;
  }
}

function createCodexAppServerClient(options) {
  return new CodexAppServerClient(options || {});
}

module.exports = {
  buildDefaultAppServerArgs,
  CodexAppServerClient,
  createCodexAppServerClient
};
