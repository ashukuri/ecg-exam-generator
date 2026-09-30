/**
 * Deterministic Priority Event Queue for the Master Timeline
 *
 * Ordering invariant:
 * 1. timestamp (ascending)
 * 2. priority (ascending)
 * 3. insertionOrder (ascending, strictly monotonic)
 *
 * Guarantees identical processing order for concurrent events given identical scenario + seed.
 */

import { PhysiologicalEvent } from './events';

function compareEvents(a: PhysiologicalEvent, b: PhysiologicalEvent): number {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.insertionOrder - b.insertionOrder;
}

export type DraftPhysiologicalEvent =
  PhysiologicalEvent extends infer E
    ? E extends PhysiologicalEvent
      ? Omit<E, 'insertionOrder'>
      : never
    : never;

export class EventPriorityQueue {
  private heap: PhysiologicalEvent[] = [];
  private nextInsertionOrder = 0;

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Enqueues an event, automatically assigning a strictly monotonic insertionOrder.
   */
  enqueue(eventDraft: DraftPhysiologicalEvent): PhysiologicalEvent {
    const event = {
      ...eventDraft,
      insertionOrder: this.nextInsertionOrder++,
    } as PhysiologicalEvent;

    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
    return event;
  }

  peek(): PhysiologicalEvent | undefined {
    return this.heap[0];
  }

  dequeue(): PhysiologicalEvent | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  /**
   * Removes scheduled future impulses matching a predicate (e.g., when sinus node is reset by a PAC).
   */
  removeWhere(predicate: (ev: PhysiologicalEvent) => boolean): void {
    const filtered = this.heap.filter((ev) => !predicate(ev));
    if (filtered.length !== this.heap.length) {
      this.heap = filtered;
      // Rebuild heap
      for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
        this.sinkDown(i);
      }
    }
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const current = this.heap[idx]!;
      const parent = this.heap[parentIdx]!;
      if (compareEvents(current, parent) < 0) {
        this.heap[idx] = parent;
        this.heap[parentIdx] = current;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private sinkDown(index: number): void {
    let idx = index;
    const length = this.heap.length;
    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let smallest = idx;

      if (
        leftIdx < length &&
        compareEvents(this.heap[leftIdx]!, this.heap[smallest]!) < 0
      ) {
        smallest = leftIdx;
      }
      if (
        rightIdx < length &&
        compareEvents(this.heap[rightIdx]!, this.heap[smallest]!) < 0
      ) {
        smallest = rightIdx;
      }
      if (smallest !== idx) {
        const tmp = this.heap[idx]!;
        this.heap[idx] = this.heap[smallest]!;
        this.heap[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}
