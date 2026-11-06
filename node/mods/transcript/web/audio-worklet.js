// Each participant has a separate processor. Audio never leaves this browser.
class TranscriptAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1600);
    this.offset = 0;
    this.sum = 0;
    this.count = 0;
    this.phase = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data.type !== 'flush' || this.stopped) return;
      this.stopped = true;
      if (this.offset) {
        const tail = this.buffer.slice(0, this.offset);
        this.port.postMessage(tail, [tail.buffer]);
        this.offset = 0;
      }
      this.port.postMessage({ type: 'flushed' });
    };
  }

  process(inputs) {
    if (this.stopped) return true;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      this.sum += sample;
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.buffer[this.offset++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (this.offset === this.buffer.length) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(1600);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('transcript-audio', TranscriptAudioProcessor);
