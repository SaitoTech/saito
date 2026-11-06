import { Segmenter } from './segmenter.mjs';

// Capture checkpoints are independent of speech boundaries and model throughput.
export class AudioBlocks {
  constructor(emit) {
    this.emit = emit;
    this.frames = [];
    this.samples = 0;
  }

  push(audio, at) {
    if (!this.samples) this.start = at;
    this.frames.push(audio);
    this.samples += audio.length;
    if (this.samples >= 16000) this.flush();
  }

  flush(final = false) {
    if (!this.samples && !final) return;
    const audio = new Float32Array(this.samples);
    let offset = 0;
    for (const frame of this.frames) {
      audio.set(frame, offset);
      offset += frame.length;
    }
    const start = this.start ?? 0;
    const end = start + audio.length / 16;
    this.emit({ audio, start, end, final });
    this.start = end;
    this.frames = [];
    this.samples = 0;
  }
}

// Apply the existing silence gate only after the raw blocks have been persisted.
export function speechBatch(blocks) {
  const first = blocks[0];
  const length = blocks.reduce((sum, block) => sum + block.audio.length, 0);
  const audio = new Float32Array(length);
  let offset = 0;
  for (const block of blocks) {
    audio.set(block.audio, offset);
    offset += block.audio.length;
  }
  const speech = [];
  const segmenter = new Segmenter((chunk) => speech.push(chunk));
  for (let i = 0; i < length; i += 1600)
    segmenter.push(audio.subarray(i, Math.min(length, i + 1600)), i / 16);
  segmenter.flush();
  if (!speech.length) return null;
  const start = Math.round(speech[0].start * 16);
  const end = Math.min(length, Math.round(speech.at(-1).end * 16));
  return {
    audio: audio.slice(start, end),
    start: first.start + start / 16,
    end: first.start + end / 16
  };
}
