import { pipeline, env } from './vendor/transformers.min.js';
import { MODELS, selection, modelCache, modelState } from './models.mjs';

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useFSCache = false;
env.useCustomCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
// Works without COOP/COEP headers (which would break existing call integrations).
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let transcriber;
let model;
let language;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      const chosen = selection(data.selection);
      model = MODELS.find((item) => item.id === chosen.model);
      language = chosen.language;
      env.customCache = await modelCache();
      if (!(await modelState(model, env.customCache)).ready)
        throw new Error('Download the selected model in Transcript models first.');
      transcriber = await pipeline('automatic-speech-recognition', model.id, {
        revision: model.revision,
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (progress) => self.postMessage({ type: 'progress', progress })
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'transcribe') {
      const result = await transcriber(data.audio, {
        return_timestamps: false,
        max_new_tokens: 128,
        ...(model.multilingual
          ? { task: 'transcribe', ...(language !== 'auto' ? { language } : {}) }
          : {})
      });
      self.postMessage({ type: 'result', id: data.id, text: result.text.trim() });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: error.message || String(error) });
  }
};
