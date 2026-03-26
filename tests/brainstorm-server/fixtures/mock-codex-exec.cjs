#!/usr/bin/env node

process.stdout.write(JSON.stringify({
  type: 'thread.started',
  thread_id: 'thread-exec-mock'
}) + '\n');

process.stdout.write(JSON.stringify({
  type: 'item.completed',
  item: {
    id: 'item_1',
    type: 'agent_message',
    text: '{"type":"question","questionType":"ask_text","questionId":"topic","title":"What do you want to brainstorm about?","description":"Start with the core topic.","allowTextOverride":true}'
  }
}) + '\n');

process.stdout.write(JSON.stringify({
  type: 'turn.completed',
  usage: {
    input_tokens: 10,
    output_tokens: 10
  }
}) + '\n');
