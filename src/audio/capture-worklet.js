// Runs on the audio thread: batches 128-frame quanta into 1024-sample blocks and posts them.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(1024);
    this.fill = 0;
    this.total = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const n = Math.min(ch.length - i, this.block.length - this.fill);
      this.block.set(ch.subarray(i, i + n), this.fill);
      this.fill += n;
      i += n;
      if (this.fill === this.block.length) {
        const out = this.block;
        this.port.postMessage({ samples: out, endIndex: this.total + this.fill }, [out.buffer]);
        this.total += this.fill;
        this.block = new Float32Array(1024);
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
