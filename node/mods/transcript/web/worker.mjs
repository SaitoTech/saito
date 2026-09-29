import { pipeline, env } from './vendor/transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
// Works without COOP/COEP headers (which would break existing call integrations).
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let transcriber;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (progress) => self.postMessage({ type: 'progress', progress })
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'transcribe') {
      const result = await transcriber(data.audio, {
        return_timestamps: false,
        max_new_tokens: 128
      });
      self.postMessage({ type: 'result', id: data.id, text: result.text.trim() });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: error.message || String(error) });
  }
};
