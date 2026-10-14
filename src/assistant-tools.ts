import { EventType, PROTOCOL_VERSION, type RunStartedEvent, type RunFinishedEvent, type RunErrorEvent, type ToolCallStartEvent, type ToolCallArgsEvent, type ToolCallEndEvent, type ToolCallResultEvent } from '@ag-ui/core';

export type ToolName = 'take_picture' | 'generate_try_on' | 'show_try_on' | 'prepare_checkout' | 'show_checkout';
export type ToolEvent = RunStartedEvent | RunFinishedEvent | RunErrorEvent | ToolCallStartEvent | ToolCallArgsEvent | ToolCallEndEvent | ToolCallResultEvent;
export interface ToolStep {
  tool: ToolName;
  status: 'running' | 'done' | 'error';
  message: string;
}
export type ToolHandlers = Record<ToolName, (signal: AbortSignal) => Promise<void>>;

const picture = /^(?:take|snap|capture)(?: (?:a|the|my|one))? (?:photo|picture|snapshot)(?: of me)?(?: (?:with|using) (?:my|the) (?:webcam|camera))?$/;
const selectedProduct = '(?:it|this|that|(?:the|this|that|my|selected) [a-z]+(?: [a-z]+){0,2})';
const tryOn = new RegExp(`^(?:try ${selectedProduct} on|try on ${selectedProduct}|(?:generate|create|make)(?: (?:a|my|the))? (?:try on|photo preview)(?: (?:preview|image))?|show me wearing ${selectedProduct}|put ${selectedProduct} on me|preview ${selectedProduct}(?: with my photo)?)$`);

/** A deliberately narrow local router. Anything else remains a normal search request. */
export function parseToolCommand(text: string): ToolName[] | null {
  let command = text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
  if (!command || /\b(?:don't|dont|do not|not|never|no|stop|cancel)\b/.test(command)) return null;
  command = command.replace(/[.!?]+$/, '').replace(/^(?:(?:please|can you|could you|would you|will you)[, ]+){1,3}/, '').replace(/[, ]+please$/, '');
  if (/\b(?:tomorrow|later|eventually|next week)\b/.test(command)) return null;
  if (new RegExp(`^(?:(?:i want to )?buy ${selectedProduct}|(?:proceed to |start |prepare |go to |open )?check ?out|purchase ${selectedProduct})$`).test(command)) return ['prepare_checkout', 'show_checkout'];
  if (picture.test(command)) return ['take_picture'];
  if (tryOn.test(command)) return ['generate_try_on', 'show_try_on'];
  const steps = command.split(/(?:,? and then |,? and |,? then |, )/);
  if (steps.length === 2 && picture.test(steps[0]) && tryOn.test(steps[1])) return ['take_picture', 'generate_try_on', 'show_try_on'];
  return null;
}

const messages: Record<ToolName, Record<ToolStep['status'], string>> = {
  prepare_checkout: { running: 'Preparing your checkout…', done: 'Your merchant checkout is ready.', error: 'Checkout could not be prepared. Review the checkout message and retry.' },
  show_checkout: { running: 'Opening checkout review…', done: 'Review your product, then continue to the merchant to pay.', error: 'Checkout review could not open. Exit VR and try again.' },
  take_picture: { running: 'Taking your picture…', done: 'Your picture is ready.', error: 'The picture could not be taken. Check the camera and try again.' },
  generate_try_on: { running: 'Generating your product photo preview…', done: 'Your preview is ready.', error: 'The preview could not be generated. Check your photo and selected product, then try again.' },
  show_try_on: { running: 'Opening your try-on…', done: 'Showing your before and after.', error: 'The try-on could not be shown. Please try again.' },
};

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Tool plan cancelled.', 'AbortError');
}

let localThreadId: string | undefined;

/**
 * Runs a bounded, deterministic local plan; there is no LLM planner or SSE transport.
 * The optional event stream uses AG-UI lifecycle events but carries no photos or credentials.
 * Cancellation never marks stale work done or advances to another tool.
 */
export async function runToolPlan(
  plan: readonly ToolName[], handlers: ToolHandlers,
  onStep: (step: ToolStep) => void, signal: AbortSignal,
  onEvent?: (event: ToolEvent) => void,
): Promise<void> {
  const threadId = localThreadId ??= crypto.randomUUID();
  const runId = crypto.randomUUID();
  const emit = (event: ToolEvent) => onEvent?.({ ...event, timestamp: Date.now() });
  let failureMessage = 'The requested tools could not finish. Please try again.';
  emit({ type: EventType.RUN_STARTED, threadId, runId, protocolVersion: PROTOCOL_VERSION, metadata: { orchestration: 'deterministic-local' } });
  try {
    checkAbort(signal);
    for (const tool of plan) {
      checkAbort(signal);
      const toolCallId = crypto.randomUUID();
      emit({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: tool });
      checkAbort(signal);
      emit({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: '{}' });
      checkAbort(signal);
      // TOOL_CALL_END closes argument streaming; the result follows execution.
      emit({ type: EventType.TOOL_CALL_END, toolCallId });
      checkAbort(signal);
      onStep({ tool, status: 'running', message: messages[tool].running });
      checkAbort(signal);
      let onAbort: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_, reject) => {
          onAbort = () => reject(new DOMException('Tool plan cancelled.', 'AbortError'));
          signal.addEventListener('abort', onAbort, { once: true });
        });
        await Promise.race([handlers[tool](signal), cancelled]);
        checkAbort(signal);
      } catch {
        checkAbort(signal);
        failureMessage = messages[tool].error;
        onStep({ tool, status: 'error', message: failureMessage });
        throw new Error(failureMessage);
      } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
      }
      emit({ type: EventType.TOOL_CALL_RESULT, toolCallId, messageId: crypto.randomUUID(), role: 'tool', content: messages[tool].done });
      checkAbort(signal);
      onStep({ tool, status: 'done', message: messages[tool].done });
      checkAbort(signal);
    }
    emit({ type: EventType.RUN_FINISHED, threadId, runId });
  } catch {
    const message = signal.aborted ? 'Tool plan cancelled.' : failureMessage;
    emit({ type: EventType.RUN_ERROR, code: signal.aborted ? 'ABORTED' : 'TOOL_FAILED', message });
    checkAbort(signal);
    throw new Error(message);
  }
}
