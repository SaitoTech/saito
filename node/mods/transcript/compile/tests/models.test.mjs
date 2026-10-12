import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import {
  MODELS,
  LANGUAGES,
  MODEL_CACHE,
  selection,
  modelURL,
  modelState,
  downloadModel,
  removeModel,
  readSelection,
  startSelection,
  persistModels
} from '../../web/models.mjs';
import { showModelManager } from '../../web/model-manager.mjs';
import { TranscriptRuntime } from '../../web/runtime.mjs';
const require = createRequire(import.meta.url);
const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');

const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(t, dom = false) {
  const cached = new Map();
  const cache = {
    keys: async () => [...cached.keys()].map((url) => ({ url })),
    match: async (url) => cached.get(url)?.clone(),
    put: async (url, response) => cached.set(url, response.clone()),
    delete: async (url) => cached.delete(url)
  };
  t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const saved = new Map();
  const override = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  };
  override('caches', {
    open: async (name) => {
      assert.equal(name, MODEL_CACHE);
      return cache;
    }
  });
  let window;
  if (dom) {
    window = new JSDOM('', { url: 'https://saito.test' }).window;
    override('window', window);
    override('document', window.document);
    override('localStorage', window.localStorage);
    window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new window.Event('close'));
    };
  }
  t.after(async () => {
    if (dom) await new Promise((resolve) => setTimeout(resolve, 25));
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    window?.close();
  });
  return { cache, cached };
}
const file = (path, content) => ({
  path,
  bytes: content.length,
  sha256: createHash('sha256').update(content).digest('hex')
});
const smallModel = {
  ...MODELS[0],
  files: [file('config.json', 'ok'), file('tokenizer.json', 'ok')]
};
const button = (text) =>
  [...document.querySelectorAll('button')].find((node) => node.textContent === text);

test('downloads go directly to pinned upstream URLs, verify data, resume and remove only one model', async (t) => {
  const { cached, cache } = setup(t);
  const other = modelURL(MODELS[1], MODELS[1].files[0]);
  await cache.put(other, new Response('other model'));
  await cache.put(modelURL(smallModel, smallModel.files[0]), new Response('ok'));
  const progress = [];
  await downloadModel(smallModel, { onProgress: (value) => progress.push(value) });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[0], modelURL(smallModel, smallModel.files[1]));
  assert.deepEqual(progress.at(-1), { loaded: 4, total: 4 });
  assert.equal((await modelState(smallModel)).ready, true);
  await downloadModel(smallModel);
  assert.equal(fetch.mock.callCount(), 1);
  await removeModel(smallModel);
  assert.deepEqual(await modelState(smallModel), { ready: false, bytes: 0 });
  assert.ok(cached.has(other));
});

test('invalid downloads and aborted downloads never become installed', async (t) => {
  setup(t);
  fetch.mock.mockImplementation(async () => new Response('NO'));
  await assert.rejects(downloadModel(smallModel), /verification failed/);
  assert.equal((await modelState(smallModel)).bytes, 0);
  fetch.mock.mockImplementation(async () => new Response('too large'));
  await assert.rejects(downloadModel(smallModel), /verification failed/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(downloadModel(smallModel, { signal: controller.signal }), {
    name: 'AbortError'
  });
  assert.equal((await modelState(smallModel)).ready, false);
});

test('failed network or storage writes remain retryable', async (t) => {
  const { cache } = setup(t);
  fetch.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(downloadModel(smallModel), /503/);
  fetch.mock.mockImplementation(async () => new Response('ok'));
  t.mock.method(cache, 'put', async () => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  await assert.rejects(downloadModel(smallModel), { name: 'QuotaExceededError' });
  assert.equal((await modelState(smallModel)).ready, false);
  cache.put.mock.restore();
  await downloadModel(smallModel);
  assert.equal((await modelState(smallModel)).ready, true);
});

test('catalog and preferences limit selections to supported models and languages', () => {
  assert.equal(MODELS.length, 4);
  assert.equal(LANGUAGES.length, 99);
  assert.deepEqual(selection({ model: 'arbitrary/remote-model', language: 'fr' }), selection());
  assert.equal(selection({ model: MODELS[0].id, language: 'fr' }).language, 'auto');
  assert.equal(selection({ model: MODELS[1].id, language: 'fr' }).language, 'fr');
  assert.equal(selection({ model: MODELS[1].id, language: 'unsupported' }).language, 'auto');
  for (const model of MODELS) {
    assert.match(model.revision, /^[a-f0-9]{40}$/);
    assert.equal(model.files.length, 7);
    for (const file of model.files) assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
});

test('picker requires a complete download and saves multilingual choice without fetching audio', async (t) => {
  const { cache } = setup(t, true);
  let used;
  const finished = showModelManager({
    start: true,
    onUse: (value) => {
      used = value;
    }
  });
  await tick();
  assert.equal(button('Start transcript').disabled, true);
  assert.equal(document.querySelector('[aria-label="Spoken language"]').disabled, true);
  for (const file of MODELS[1].files)
    await cache.put(modelURL(MODELS[1], file), new Response('cached'));
  const models = document.querySelector('[aria-label="Speech model"]');
  models.value = MODELS[1].id;
  models.onchange();
  await tick();
  const languages = document.querySelector('[aria-label="Spoken language"]');
  assert.equal(languages.disabled, false);
  languages.value = 'fr';
  assert.equal(button('Start transcript').disabled, false);
  button('Start transcript').click();
  assert.deepEqual((await finished).selection, { model: MODELS[1].id, language: 'fr' });
  assert.deepEqual(readSelection(), used);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(document.querySelector('dialog'), null);
});

test('closing a download aborts the request and leaves capture off', async (t) => {
  setup(t, true);
  let signal;
  fetch.mock.mockImplementation((url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason))
    );
  });
  const finished = showModelManager();
  await tick();
  const downloading = button('Download').onclick();
  await tick();
  button('Cancel download').click();
  assert.equal(await finished, null);
  await downloading;
  assert.equal(signal.aborted, true);
  assert.equal((await modelState(MODELS[0])).ready, false);
});

test('ending a call aborts automatic download and prevents delayed capture', async (t) => {
  setup(t, true);
  const runtime = new TranscriptRuntime({});
  runtime.toggle = async () => assert.fail('Call already ended');
  let closes = 0;
  const context = {
    close: async () => {
      closes++;
    }
  };
  let signal;
  fetch.mock.mockImplementation((url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason))
    );
  });
  const starting = runtime.configureAndToggle(
    {
      streams: { active: true },
      room_obj: { call_id: 'call' }
    },
    context
  );
  await tick();
  assert.ok(signal, 'Start must download without a second click');
  await runtime.endCall();
  await starting;
  assert.equal(signal.aborted, true);
  assert.equal(closes, 1);
  assert.equal(runtime.capturing, false);
  assert.equal(document.querySelector('.transcript-model-manager'), null);
});

test('Start uses the saved model immediately when downloaded', async (t) => {
  const { cache } = setup(t, true);
  for (const file of MODELS[1].files)
    await cache.put(modelURL(MODELS[1], file), new Response('cached'));
  localStorage.setItem(
    'saito-transcript-model',
    JSON.stringify({ model: MODELS[1].id, language: 'fr' })
  );
  const runtime = new TranscriptRuntime({});
  const call = { streams: { active: true }, room_obj: { call_id: 'call' } };
  const context = { close: () => assert.fail('Audio needed for capture') };
  let starts = 0;
  runtime.toggle = async (activeCall, audio) => {
    starts++;
    assert.equal(activeCall, call);
    assert.equal(audio, context);
  };
  await runtime.configureAndToggle(call, context);
  assert.equal(starts, 1);
  assert.deepEqual(runtime.modelSelection, { model: MODELS[1].id, language: 'fr' });
  assert.equal(document.querySelector('.transcript-model-manager'), null);
});

test('Settings uses SaitoOverlay and closing via backdrop aborts a download without starting capture', async (t) => {
  setup(t, true);
  const app = {
    browser: { addElementToDom: (html) => document.body.insertAdjacentHTML('beforeend', html) }
  };
  const overlay = new SaitoOverlay(app, {});
  const runtime = new TranscriptRuntime(app, { createOverlay: () => overlay });
  runtime.prepareAudio = () => assert.fail('Settings must not open audio');
  let signal;
  fetch.mock.mockImplementation((url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason))
    );
  });
  const settings = runtime.openSettings();
  await tick();
  assert.ok(
    document.querySelector('.saito-overlay .transcript-model-manager .saito-overlay-form-header')
  );
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(button('Start transcript'), undefined);
  const downloading = button('Download').onclick();
  await tick();
  document.querySelector('.saito-overlay-backdrop').click();
  assert.equal(await settings, null);
  await downloading;
  assert.equal(signal.aborted, true);
  assert.equal(runtime.capturing, false);
  assert.equal(document.querySelector('.saito-overlay'), null);
});

test('Start downloads the default once, starts automatically and reuses it next time', async (t) => {
  setup(t, true);
  const previousFiles = MODELS[0].files;
  MODELS[0].files = smallModel.files;
  t.after(() => {
    MODELS[0].files = previousFiles;
  });
  localStorage.setItem(
    'saito-transcript-model',
    JSON.stringify({ model: MODELS[3].id, language: 'fr' })
  );
  const runtime = new TranscriptRuntime({});
  const call = { streams: { active: true }, room_obj: { call_id: 'call' } };
  const context = { close: () => assert.fail('Must reuse resumed audio for capture') };
  let starts = 0;
  runtime.toggle = async (activeCall, audio) => {
    assert.equal(activeCall, call);
    assert.equal(audio, context);
    starts++;
  };
  await runtime.configureAndToggle(call, context);
  assert.equal(starts, 1);
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(runtime.modelSelection, { model: MODELS[0].id, language: 'auto' });
  assert.equal(document.querySelector('.transcript-model-manager'), null);
  await runtime.configureAndToggle(call, context);
  assert.equal(starts, 2);
  assert.equal(fetch.mock.callCount(), 2);
});

test('Start prefers an available model over downloading another', async (t) => {
  const { cache } = setup(t, true);
  for (const file of MODELS[2].files)
    await cache.put(modelURL(MODELS[2], file), new Response('cached'));
  assert.deepEqual(await startSelection(), {
    chosen: { model: MODELS[2].id, language: 'auto' },
    downloaded: true
  });
  assert.equal(fetch.mock.callCount(), 0);
});

test('dropdown marks every complete model and updates after removal', async (t) => {
  const { cache } = setup(t, true);
  for (const model of [MODELS[0], MODELS[1]])
    for (const file of model.files) await cache.put(modelURL(model, file), new Response('cached'));
  await cache.put(modelURL(MODELS[2], MODELS[2].files[0]), new Response('partial'));
  const settings = showModelManager();
  await tick();
  const options = document.querySelector('[aria-label="Speech model"]').options;
  assert.match(options[0].textContent, /\(downloaded\)$/);
  assert.match(options[1].textContent, /\(downloaded\)$/);
  assert.doesNotMatch(options[2].textContent, /downloaded/);
  await button('Remove download').onclick();
  assert.doesNotMatch(options[0].textContent, /downloaded/);
  assert.match(options[1].textContent, /\(downloaded\)$/);
  button('Close').click();
  await settings;
});

test('persistent storage is requested but refusal does not block disk caching', async (t) => {
  setup(t);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let requested = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        persisted: async () => false,
        persist: async () => {
          requested++;
          return false;
        }
      }
    }
  });
  t.after(() => Object.defineProperty(globalThis, 'navigator', descriptor));
  assert.equal(await persistModels(), false);
  assert.equal(requested, 1);
  await downloadModel(smallModel);
  assert.equal((await modelState(smallModel)).ready, true);
  assert.equal(requested, 2);
});
