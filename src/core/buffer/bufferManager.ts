export class BufferManager<T> {
  private _buffer: T[] = [];
  private _capacity: number;

  constructor(capacity: number) {
    this._capacity = capacity;
  }

  enqueue(item: T): boolean {
    if (this.isFull()) {
      return false;
    }
    this._buffer.push(item);
    return true;
  }

  dequeue(): T | undefined {
    return this._buffer.shift();
  }

  isFull(): boolean {
    return this._buffer.length >= this._capacity;
  }

  get size(): number {
    return this._buffer.length;
  }
}
