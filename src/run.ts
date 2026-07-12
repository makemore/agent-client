/**
 * RunHandle — SSE subscription with AsyncIterable interface.
 *
 * Wraps EventSource and exposes events as an async iterator with a bounded
 * queue. Terminal events (run.succeeded, run.failed, etc.) are never dropped.
 * Debug/heartbeat events are dropped oldest-first when the queue exceeds
 * the bound.
 */

import type { AgentEvent, AgentEventType } from './types/index.js';
import { isStreamCompletionEvent } from './types/index.js';

const QUEUE_BOUND = 256;

/** Event types considered low-priority (droppable under backpressure). */
const LOW_PRIORITY: ReadonlySet<string> = new Set([
  'run.heartbeat',
  'state.checkpoint',
  'progress.update',
]);

/** All SSE event names the client listens for. */
const SSE_EVENT_NAMES: readonly string[] = [
  'assistant.message',
  'assistant.delta',
  'tool.call',
  'tool.result',
  'tool.progress',
  'content.blocks',
  'sub_agent.start',
  'sub_agent.end',
  'custom',
  'error',
  'run.started',
  'run.succeeded',
  'run.failed',
  'run.cancelled',
  'run.timed_out',
  'run.suspended',
  'run.resumed',
  'client.action.required',
  'run.heartbeat',
  'state.checkpoint',
  'step.started',
  'step.completed',
  'step.failed',
  'step.skipped',
  'step.retrying',
  'progress.update',
  'memory.update',
];

export interface RunHandle {
  /** The run ID. */
  readonly runId: string;
  /** Async iterator over events. Completes on terminal/waiting event or close(). */
  events(): AsyncIterable<AgentEvent>;
  /** Close the SSE connection. The async iterator will complete. */
  close(): void;
}

/**
 * Subscribe to SSE events for a run.
 *
 * @param url  Full SSE URL (with token query param if needed).
 * @param runId  The run ID (for the handle).
 */
export function subscribeToRun(url: string, runId: string): RunHandle {
  const queue: AgentEvent[] = [];
  let resolve: ((value: IteratorResult<AgentEvent>) => void) | null = null;
  let done = false;

  const eventSource = new EventSource(url);

  function enqueue(event: AgentEvent): void {
    if (done) return;

    // Backpressure: if queue is full, drop oldest low-priority events
    while (queue.length >= QUEUE_BOUND) {
      const idx = queue.findIndex((e) => LOW_PRIORITY.has(e.type));
      if (idx >= 0) {
        queue.splice(idx, 1);
      } else {
        // All high-priority — drop oldest non-terminal
        const nonTermIdx = queue.findIndex((e) => !isStreamCompletionEvent(e.type));
        if (nonTermIdx >= 0) queue.splice(nonTermIdx, 1);
        else break; // shouldn't happen
      }
    }

    // If someone is waiting, resolve immediately
    if (resolve) {
      const r = resolve;
      resolve = null;
      r({ value: event, done: false });
    } else {
      queue.push(event);
    }

    // If this completes the active stream, finish cleanly.
    if (isStreamCompletionEvent(event.type)) {
      finish();
    }
  }

  function finish(): void {
    if (done) return;
    done = true;
    eventSource.close();
    // Wake any pending next() call
    if (resolve) {
      const r = resolve;
      resolve = null;
      r({ value: undefined as unknown as AgentEvent, done: true });
    }
  }

  // Register listeners for every known event type
  for (const name of SSE_EVENT_NAMES) {
    eventSource.addEventListener(name, (evt: Event) => {
      try {
        const raw = JSON.parse((evt as MessageEvent).data);
        const payload = raw.payload ?? raw;
        enqueue({ type: name as AgentEventType, payload } as AgentEvent);
      } catch {
        // Unparseable event — skip
      }
    });
  }

  // EventSource error → close stream (matches existing agent-frontend behaviour)
  eventSource.onerror = () => {
    finish();
  };

  const asyncIterator: AsyncIterableIterator<AgentEvent> = {
    next(): Promise<IteratorResult<AgentEvent>> {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift()!, done: false });
      }
      if (done) {
        return Promise.resolve({ value: undefined as unknown as AgentEvent, done: true });
      }
      return new Promise<IteratorResult<AgentEvent>>((r) => {
        resolve = r;
      });
    },
    return(): Promise<IteratorResult<AgentEvent>> {
      finish();
      return Promise.resolve({ value: undefined as unknown as AgentEvent, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return {
    runId,
    events() {
      return asyncIterator;
    },
    close() {
      finish();
    },
  };
}
