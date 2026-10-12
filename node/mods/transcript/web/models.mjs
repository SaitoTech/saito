import { MODELS, LANGUAGES } from './model-catalog.mjs';

export { MODELS, LANGUAGES };
export const MODEL_CACHE = 'saito-transcript-models-v1';
const SETTINGS_KEY = 'saito-transcript-model';
export const modelURL = (model, file) =>
  `https://huggingface.co/${model.id}/resolve/${model.revision}/${file.path}`;

export function selection(value = {}) {
  value ||= {};
  const model = MODELS.find((item) => item.id === value.model) || MODELS[0];
  const language =
    model.multilingual && LANGUAGES.includes(value.language) ? value.language : 'auto';
  return { model: model.id, language };
}

export function readSelection() {
  try {
    return selection(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
  } catch {
    return selection();
  }
}

export function saveSelection(value) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(selection(value)));
}

export async function modelCache() {
  if (!globalThis.caches)
    throw new Error('Model storage requires HTTPS and browser storage access.');
  return caches.open(MODEL_CACHE);
}

export async function modelState(model, cache = null) {
  cache ||= await modelCache();
  // Inspect keys instead of reading large cached model bodies into memory.
  const keys = new Set((await cache.keys()).map((request) => request.url));
  return stateFromKeys(model, keys);
}

function stateFromKeys(model, keys) {
  const files = model.files.filter((file) => keys.has(modelURL(model, file)));
  return {
    ready: files.length === model.files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0)
  };
}

export async function modelStates() {
  const cache = await modelCache();
  const keys = new Set((await cache.keys()).map((request) => request.url));
  return new Map(MODELS.map((model) => [model.id, stateFromKeys(model, keys)]));
}

export async function startSelection() {
  const chosen = readSelection();
  const states = await modelStates();
  if (states.get(chosen.model).ready) return { chosen, downloaded: true };
  const available = MODELS.find((model) => states.get(model.id).ready);
  return {
    chosen: available ? selection({ ...chosen, model: available.id }) : selection(),
    downloaded: !!available
  };
}

export async function persistModels() {
  try {
    const storage = globalThis.navigator?.storage;
    if (await storage?.persisted?.()) return true;
    return !!(await storage?.persist?.());
  } catch {
    // Best-effort disk caching still works if eviction protection is declined.
    return false;
  }
}

export async function removeModel(model) {
  const cache = await modelCache();
  await Promise.all(model.files.map((file) => cache.delete(modelURL(model, file))));
}

export async function downloadModel(model, { signal, onProgress = () => {} } = {}) {
  void persistModels();
  const cache = await modelCache();
  const total = model.files.reduce((sum, file) => sum + file.bytes, 0);
  let loaded = 0;
  for (const file of model.files) {
    signal?.throwIfAborted();
    const url = modelURL(model, file);
    if (await cache.match(url)) {
      loaded += file.bytes;
      onProgress({ loaded, total });
      continue;
    }
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`Download failed (${response.status}). Please try again.`);
    const reader = response.body.getReader();
    const data = new Uint8Array(file.bytes);
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > data.length) {
        await reader.cancel();
        throw new Error('Model verification failed. Please retry the download.');
      }
      data.set(value, length);
      length += value.length;
      onProgress({ loaded: loaded + length, total });
    }
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    if (length !== file.bytes || hash !== file.sha256)
      throw new Error('Model verification failed. Please retry the download.');
    signal?.throwIfAborted();
    await cache.put(url, new Response(data, { headers: { 'Content-Length': String(length) } }));
    loaded += length;
    onProgress({ loaded, total });
  }
}
