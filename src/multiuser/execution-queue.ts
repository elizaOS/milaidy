/**
 * Execution queue scaffolding for multi-user tool actions.
 *
 * Default implementation is in-memory and process-local. It is suitable for
 * local/dev and single-instance deployments. For production scale, replace
 * with a durable broker-backed implementation behind the same interface.
 */

export interface ExecutionTask<TPayload = unknown> {
  id: string;
  userId: string;
  dedupeKey?: string;
  payload: TPayload;
  createdAt: number;
}

export interface ExecutionQueueStats {
  queued: number;
  inFlight: number;
}

export interface ExecutionQueue<TPayload = unknown> {
  enqueue(task: ExecutionTask<TPayload>): boolean;
  dequeue(): ExecutionTask<TPayload> | null;
  markDone(taskId: string): void;
  stats(): ExecutionQueueStats;
}

export class InMemoryExecutionQueue<TPayload = unknown>
  implements ExecutionQueue<TPayload>
{
  private readonly queue: Array<ExecutionTask<TPayload>> = [];
  private readonly inFlight = new Set<string>();
  private readonly dedupeKeys = new Set<string>();
  private readonly maxQueued: number;

  constructor(opts?: { maxQueued?: number }) {
    this.maxQueued = Math.max(1, opts?.maxQueued ?? 10_000);
  }

  enqueue(task: ExecutionTask<TPayload>): boolean {
    if (this.queue.length >= this.maxQueued) return false;
    if (task.dedupeKey && this.dedupeKeys.has(task.dedupeKey)) return false;

    this.queue.push(task);
    if (task.dedupeKey) this.dedupeKeys.add(task.dedupeKey);
    return true;
  }

  dequeue(): ExecutionTask<TPayload> | null {
    const task = this.queue.shift() ?? null;
    if (!task) return null;
    this.inFlight.add(task.id);
    return task;
  }

  markDone(taskId: string): void {
    this.inFlight.delete(taskId);
  }

  /**
   * Clears dedupe marker when a task is canceled before running.
   */
  cancel(taskId: string): void {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx < 0) return;
    const [task] = this.queue.splice(idx, 1);
    if (task?.dedupeKey) this.dedupeKeys.delete(task.dedupeKey);
  }

  stats(): ExecutionQueueStats {
    return {
      queued: this.queue.length,
      inFlight: this.inFlight.size,
    };
  }
}
