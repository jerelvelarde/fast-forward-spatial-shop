import assert from 'node:assert/strict';
import test from 'node:test';
import { EventType } from '@ag-ui/core';
import { EventSchema } from '@ag-ui/core/schemas';
import { parseToolCommand, runToolPlan, type ToolHandlers, type ToolName, type ToolStep, type ToolEvent } from '../src/assistant-tools.js';

test('routes explicit picture commands with optional polite phrasing', () => {
  for (const text of ['take a picture', 'Take a photo.', 'capture photo', 'snap my picture', 'Please take a picture of me!', 'Could you please take a photo using my webcam?']) {
    assert.deepEqual(parseToolCommand(text), ['take_picture'], text);
  }
});

test('routes explicit try-on commands', () => {
  for (const text of ['try it on', 'try on the backpack', 'generate try-on', 'show me wearing it', 'Put this bag on me', 'Create my try on preview, please']) {
    assert.deepEqual(parseToolCommand(text), ['generate_try_on', 'show_try_on'], text);
  }
});

test('capture-and-try-on commands execute all three named tools', () => {
  for (const text of ['take a picture and try it on', 'Please take a photo and then show me wearing it.', 'capture a photo, then generate a try-on', 'snap a picture, try this backpack on']) {
    assert.deepEqual(parseToolCommand(text), ['take_picture', 'generate_try_on', 'show_try_on'], text);
  }
});

test('product requests, negation, and vague mentions do not trigger camera tools', () => {
  for (const text of [
    'Find a camping backpack under 150 USD', 'camera backpack', 'backpack for taking pictures',
    'I want a photographic backpack', 'find a bag so I can take a picture',
    'take a picture of a camera backpack under $150', 'Do not take a picture', "Don't take a photo",
    'please never take a picture', 'take a picture and do not try it on',
    'can you find something to try on', 'show me backpacks', 'take a picture tomorrow', '',
  ]) assert.equal(parseToolCommand(text), null, text);
});

function handlers(log: ToolName[]): ToolHandlers {
  return {
    prepare_checkout: async () => { log.push('prepare_checkout'); },
    show_checkout: async () => { log.push('show_checkout'); },
    take_picture: async () => { log.push('take_picture'); },
    generate_try_on: async () => { log.push('generate_try_on'); },
    show_try_on: async () => { log.push('show_try_on'); },
  };
}

test('runner emits sequential running/done steps and forwards the same cancellation signal', async () => {
  const log: ToolName[] = [];
  const events: ToolStep[] = [];
  const controller = new AbortController();
  const tools = handlers(log);
  tools.take_picture = async signal => { assert.equal(signal, controller.signal); log.push('take_picture'); };
  await runToolPlan(['take_picture', 'generate_try_on', 'show_try_on'], tools, step => events.push(step), controller.signal);
  assert.deepEqual(log, ['take_picture', 'generate_try_on', 'show_try_on']);
  assert.deepEqual(events.map(({ tool, status }) => `${tool}:${status}`), ['take_picture:running', 'take_picture:done', 'generate_try_on:running', 'generate_try_on:done', 'show_try_on:running', 'show_try_on:done']);
});

test('a failed tool stops the plan and emits a safe message without raw service details', async () => {
  const log: ToolName[] = [];
  const events: ToolStep[] = [];
  const tools = handlers(log);
  tools.generate_try_on = async () => { throw new Error('secret-provider-response'); };
  await assert.rejects(runToolPlan(['take_picture', 'generate_try_on', 'show_try_on'], tools, step => events.push(step), new AbortController().signal), /try-on could not be generated/);
  assert.deepEqual(log, ['take_picture']);
  assert.equal(events[events.length - 1].status, 'error');
  assert.ok(events.every(step => !step.message.includes('secret-provider-response')));
});

test('an already cancelled plan never invokes a tool', async () => {
  const log: ToolName[] = [];
  const events: ToolStep[] = [];
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runToolPlan(['take_picture'], handlers(log), step => events.push(step), controller.signal), { name: 'AbortError' });
  assert.deepEqual(log, []); assert.deepEqual(events, []);
});

test('cancellation during a tool settles promptly and ignores its eventual completion', async () => {
  const log: ToolName[] = [];
  const events: ToolStep[] = [];
  const controller = new AbortController();
  let complete!: () => void;
  const tools = handlers(log);
  tools.take_picture = () => new Promise<void>(resolve => { complete = resolve; });
  const running = runToolPlan(['take_picture', 'generate_try_on', 'show_try_on'], tools, step => events.push(step), controller.signal);
  controller.abort();
  await assert.rejects(running, { name: 'AbortError' });
  complete();
  await Promise.resolve();
  assert.deepEqual(log, []);
  assert.deepEqual(events.map(({ tool, status }) => `${tool}:${status}`), ['take_picture:running']);
});

test('cancellation from a step callback cannot start the next tool', async () => {
  const log: ToolName[] = [];
  const controller = new AbortController();
  await assert.rejects(runToolPlan(['take_picture', 'generate_try_on'], handlers(log), step => {
    if (step.tool === 'take_picture' && step.status === 'done') controller.abort();
  }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(log, ['take_picture']);
});

test('AG-UI events validate against installed schemas and preserve call/result ordering', async () => {
  const events: ToolEvent[] = [];
  const plan: ToolName[] = ['take_picture', 'generate_try_on', 'show_try_on'];
  const verifyBeforeExecution = async () => {
    assert.equal(events[events.length - 1].type, EventType.TOOL_CALL_END);
  };
  const tools: ToolHandlers = { prepare_checkout: verifyBeforeExecution, show_checkout: verifyBeforeExecution, take_picture: verifyBeforeExecution, generate_try_on: verifyBeforeExecution, show_try_on: verifyBeforeExecution };
  await runToolPlan(plan, tools, () => {}, new AbortController().signal, event => {
    assert.doesNotThrow(() => EventSchema.parse(event)); events.push(event);
  });
  assert.deepEqual(events.map(event => event.type), [EventType.RUN_STARTED, ...plan.flatMap(() => [EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT]), EventType.RUN_FINISHED]);
  const start = events[0]; const end = events[events.length - 1];
  assert.equal(start.type, EventType.RUN_STARTED); assert.equal(end.type, EventType.RUN_FINISHED);
  if (start.type !== EventType.RUN_STARTED || end.type !== EventType.RUN_FINISHED) return;
  assert.equal(start.runId, end.runId); assert.equal(start.threadId, end.threadId);
  assert.equal(start.metadata?.orchestration, 'deterministic-local');
  const ids = new Set<string>();
  for (let index = 0; index < plan.length; index++) {
    const [call, args, closed, result] = events.slice(1 + index * 4, 5 + index * 4);
    assert.equal(call.type, EventType.TOOL_CALL_START);
    if (call.type !== EventType.TOOL_CALL_START) continue;
    ids.add(call.toolCallId);
    assert.equal(call.toolCallName, plan[index]);
    for (const event of [args, closed, result]) assert.equal('toolCallId' in event && event.toolCallId, call.toolCallId);
    assert.equal(args.type === EventType.TOOL_CALL_ARGS && args.delta, '{}');
    assert.equal(result.type === EventType.TOOL_CALL_RESULT && result.role, 'tool');
  }
  assert.equal(ids.size, plan.length);
});

test('AG-UI failure terminates with RUN_ERROR and carries no raw service payload', async () => {
  const events: ToolEvent[] = [];
  const tools = handlers([]);
  tools.take_picture = async () => { throw new Error('data:image/jpeg;base64,private-photo token=private-token'); };
  await assert.rejects(runToolPlan(['take_picture', 'generate_try_on'], tools, () => {}, new AbortController().signal, event => events.push(event)));
  events.forEach(event => EventSchema.parse(event));
  assert.deepEqual(events.map(event => event.type), [EventType.RUN_STARTED, EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.RUN_ERROR]);
  const terminal = events[events.length - 1];
  assert.equal(terminal.type === EventType.RUN_ERROR && terminal.code, 'TOOL_FAILED');
  assert.doesNotMatch(JSON.stringify(events), /private-photo|private-token|data:image/);
});

test('AG-UI cancellation emits one terminal error and no stale tool result', async () => {
  const events: ToolEvent[] = [];
  const controller = new AbortController();
  let complete!: () => void;
  const tools = handlers([]);
  tools.take_picture = () => new Promise<void>(resolve => { complete = resolve; });
  const running = runToolPlan(['take_picture', 'generate_try_on'], tools, () => {}, controller.signal, event => events.push(event));
  controller.abort();
  await assert.rejects(running, { name: 'AbortError' });
  complete(); await Promise.resolve();
  events.forEach(event => EventSchema.parse(event));
  assert.deepEqual(events.map(event => event.type), [EventType.RUN_STARTED, EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.RUN_ERROR]);
  const terminal = events[events.length - 1];
  assert.equal(terminal.type === EventType.RUN_ERROR && terminal.code, 'ABORTED');
});


test('buy and checkout commands prepare a review without a payment tool', () => {
  for (const text of ['buy it', 'buy this backpack', 'I want to buy that bag', 'Please checkout', 'check out', 'proceed to checkout', 'open checkout']) {
    assert.deepEqual(parseToolCommand(text), ['prepare_checkout', 'show_checkout']);
  }
  for (const text of ["don't buy it", 'buy this backpack tomorrow', 'find a backpack I can buy', 'buy two backpacks', 'pay 150 dollars']) assert.equal(parseToolCommand(text), null);
});
