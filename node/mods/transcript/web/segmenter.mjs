// Energy gating prevents Whisper hallucinations on silence. Keep 200 ms of lead-in,
// finish on 500 ms of quiet, and cap speech chunks at four seconds for live transcript.
export class Segmenter {
  constructor(emit) {
    this.emit = emit;
    this.frames = [];
    this.preroll = [];
    this.speech = 0;
    this.quiet = 0;
  }

  push(audio, at) {
    const rms = Math.sqrt(audio.reduce((sum, value) => sum + value * value, 0) / audio.length);
    const voiced = rms >= 0.008;
    if (!this.frames.length) {
      if (!voiced) {
        this.preroll.push({ audio, at });
        this.preroll = this.preroll.slice(-2);
        return;
      }
      this.frames = this.preroll;
      this.preroll = [];
    }
    this.frames.push({ audio, at });
    this.speech += voiced ? audio.length : 0;
    this.quiet = voiced ? 0 : this.quiet + audio.length;
    if (this.quiet >= 8000 || this.frames.length >= 40) this.flush();
  }

  flush() {
    if (this.speech >= 3200) {
      const length = this.frames.reduce((sum, frame) => sum + frame.audio.length, 0);
      const audio = new Float32Array(length);
      let offset = 0;
      for (const frame of this.frames) {
        audio.set(frame.audio, offset);
        offset += frame.audio.length;
      }
      this.emit({ audio, start: this.frames[0].at, end: this.frames.at(-1).at + 100 });
    }
    this.frames = [];
    this.preroll = [];
    this.speech = 0;
    this.quiet = 0;
  }
}
