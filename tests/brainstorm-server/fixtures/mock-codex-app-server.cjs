#!/usr/bin/env node

let isInitialized = false;
let clientNotified = false;

function write(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

process.stdin.setEncoding('utf8');

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const message = JSON.parse(line);
    const method = message.method;

    if (method === 'initialize') {
      isInitialized = true;
      write({
        id: message.id,
        result: {
          userAgent: 'mock-codex-app-server',
          platformFamily: 'unix',
          platformOs: 'linux'
        }
      });
      continue;
    }

    if (method === 'initialized') {
      clientNotified = true;
      continue;
    }

    if (method === 'thread/start') {
      if (!isInitialized || !clientNotified) {
        write({ id: message.id, error: { code: -32600, message: 'Not initialized' } });
      } else {
        write({
          id: message.id,
          result: {
            thread: {
              id: 'thread-mock',
              preview: '',
              ephemeral: false,
              modelProvider: 'openai',
              createdAt: 1,
              updatedAt: 1,
              status: 'idle',
              path: '/tmp/thread-mock',
              cwd: message.params && message.params.cwd ? message.params.cwd : process.cwd(),
              cliVersion: 'test',
              source: 'cli',
              agentNickname: null,
              agentRole: null,
              gitInfo: null,
              name: null,
              turns: []
            },
            model: 'gpt-test',
            modelProvider: 'openai',
            serviceTier: null,
            cwd: message.params && message.params.cwd ? message.params.cwd : process.cwd(),
            approvalPolicy: 'on-request',
            approvalsReviewer: { type: 'user' },
            sandbox: { type: 'workspaceWrite', writableRoots: [], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
            reasoningEffort: null
          }
        });
      }
      continue;
    }

    if (method === 'thread/resume') {
      if (!isInitialized || !clientNotified) {
        write({ id: message.id, error: { code: -32600, message: 'Not initialized' } });
      } else {
        write({
          id: message.id,
          result: {
            thread: {
              id: message.params.threadId,
              preview: '',
              ephemeral: false,
              modelProvider: 'openai',
              createdAt: 1,
              updatedAt: 1,
              status: 'idle',
              path: '/tmp/thread-mock',
              cwd: process.cwd(),
              cliVersion: 'test',
              source: 'cli',
              agentNickname: null,
              agentRole: null,
              gitInfo: null,
              name: null,
              turns: []
            },
            model: 'gpt-test',
            modelProvider: 'openai',
            serviceTier: null,
            cwd: process.cwd(),
            approvalPolicy: 'on-request',
            approvalsReviewer: { type: 'user' },
            sandbox: { type: 'workspaceWrite', writableRoots: [], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
            reasoningEffort: null
          }
        });
      }
      continue;
    }

    if (method === 'turn/start') {
      if (!isInitialized || !clientNotified) {
        write({ id: message.id, error: { code: -32600, message: 'Not initialized' } });
      } else {
        write({
          id: message.id,
          result: {
            turn: {
              id: 'turn-mock',
              items: [],
              status: 'in_progress',
              error: null
            }
          }
        });

        write({
          id: 'server-request-1',
          method: 'item/tool/requestUserInput',
          params: {
            threadId: message.params.threadId,
            turnId: 'turn-mock',
            itemId: 'item-1',
            questions: [
              {
                id: 'question-1',
                header: 'Topic',
                question: 'What are you brainstorming about?',
                isOther: false,
                isSecret: false,
                options: null
              }
            ]
          }
        });
      }
      continue;
    }

    if (!method && message.id === 'server-request-1') {
      const firstAnswer = (((message.result || {}).answers || {})['question-1'] || {}).answers || [];
      const answerText = firstAnswer.length > 0 ? String(firstAnswer[0]) : 'unknown';

      write({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread-mock',
          turnId: 'turn-mock',
          delta: JSON.stringify({
            type: 'summary',
            text: `The user wants to brainstorm: ${answerText}`,
            path: ['question-1'],
            answers: [
              {
                questionId: 'question-1',
                answer: answerText
              }
            ]
          })
        }
      });

      write({
        method: 'turn/completed',
        params: {
          threadId: 'thread-mock',
          turn: {
            id: 'turn-mock',
            status: 'completed',
            items: [],
            error: null
          }
        }
      });
      continue;
    }

    write({ id: message.id || null, result: {} });
  }
});
