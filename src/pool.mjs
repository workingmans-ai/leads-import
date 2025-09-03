export class Pool {
  constructor(limit = 3) {
    this.limit = limit;
    this.active = 0;
    this.q = [];
  }
  run(fn) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          this.active--;
          this._next();
        }
      };
      this.q.push(task);
      this._next();
    });
  }
  _next() {
    while (this.active < this.limit && this.q.length) this.q.shift()();
  }
}
