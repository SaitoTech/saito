import {
  MODELS,
  LANGUAGES,
  readSelection,
  saveSelection,
  modelStates,
  downloadModel,
  removeModel
} from './models.mjs';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const megabytes = (bytes) => `${Math.round(bytes / 1000000)} MB`;

// The caller can prepare audio in onUse while still inside the button gesture.
export function showModelManager({
  start = false,
  onUse,
  overlay,
  initialSelection,
  autoStart = false,
  signal
} = {}) {
  const existing = document.querySelector('.transcript-model-manager');
  if (existing) {
    existing.focus();
    return Promise.resolve(null);
  }
  let chosen = initialSelection || readSelection();
  let controller;
  let busy = false;
  let closed = false;
  let result = null;
  let refreshId = 0;
  const dialog = element(
    overlay ? 'div' : 'dialog',
    undefined,
    `saito-overlay-panel saito-overlay-form transcript-model-manager${overlay ? '' : ' transcript-dialog'}`
  );
  dialog.setAttribute('aria-label', 'Transcript models');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  const header = element('div', undefined, 'saito-overlay-form-header');
  const title = element('h2', 'Transcript models', 'saito-overlay-form-header-title');
  header.append(title);
  const description = element(
    'p',
    'Download models directly from Hugging Face to this browser. Audio stays on your device.'
  );
  const modelLabel = element('label', 'Speech model');
  const models = element('select');
  models.setAttribute('aria-label', 'Speech model');
  const modelLabelText = (model) =>
    `${model.label} · ${megabytes(model.files.reduce((sum, file) => sum + file.bytes, 0))}`;
  for (const model of MODELS) {
    const option = element('option', modelLabelText(model));
    option.value = model.id;
    models.append(option);
  }
  models.value = chosen.model;
  modelLabel.append(models);
  const hint = element(
    'p',
    'Tiny is faster and uses less memory. Base may improve accuracy but needs more processing time.'
  );
  const languageLabel = element('label', 'Spoken language');
  const languages = element('select');
  languages.setAttribute('aria-label', 'Spoken language');
  const auto = element('option', 'Detect automatically');
  auto.value = 'auto';
  languages.append(auto);
  const names = new Intl.DisplayNames(['en'], { type: 'language' });
  const options = LANGUAGES.map((code) => [code, names.of(code)]).sort((a, b) =>
    a[1].localeCompare(b[1])
  );
  for (const [code, name] of options) {
    const option = element('option', name);
    option.value = code;
    languages.append(option);
  }
  languages.value = chosen.language;
  languageLabel.append(languages);
  const languageHint = element('p');
  const cacheHint = element(
    'p',
    'Downloads stay in this browser across restarts. Clearing site data removes them.'
  );
  const status = element('p', 'Checking downloads…', 'transcript-dialog-status');
  status.setAttribute('role', 'status');
  const progress = element('progress');
  progress.max = 100;
  progress.hidden = true;
  progress.setAttribute('aria-label', 'Model download progress');
  const actions = element('div', undefined, 'saito-button-row transcript-dialog-actions');
  const download = element('button', 'Download', 'saito-button-secondary');
  const remove = element('button', 'Remove download', 'saito-button-secondary');
  const use = element('button', start ? 'Start transcript' : 'Use model', 'saito-button-primary');
  const close = element('button', 'Close', 'saito-button-secondary');
  actions.append(download, remove, use, close);
  dialog.append(
    header,
    description,
    modelLabel,
    hint,
    languageLabel,
    languageHint,
    cacheHint,
    status,
    progress,
    actions
  );
  const selected = () => MODELS.find((model) => model.id === models.value);
  const errorMessage = (error) =>
    error.name === 'QuotaExceededError'
      ? 'Not enough browser storage. Remove a download or free space, then retry.'
      : error.message || 'Model storage is unavailable.';
  const refresh = async () => {
    const id = ++refreshId;
    const model = selected();
    models.disabled = busy;
    languages.disabled = busy || !model.multilingual;
    languageHint.textContent = model.multilingual
      ? 'Transcribes in the spoken language. Selecting a language can help with short speech segments.'
      : 'This model recognizes English only. Choose a multilingual model for other languages.';
    close.textContent = busy ? 'Cancel download' : 'Close';
    download.disabled = remove.disabled = use.disabled = true;
    if (busy) return;
    try {
      const states = await modelStates();
      if (closed || id !== refreshId) return;
      for (const [index, item] of MODELS.entries()) {
        models.options[index].textContent =
          modelLabelText(item) + (states.get(item.id).ready ? ' (downloaded)' : '');
      }
      const state = states.get(model.id);
      status.textContent = state.ready
        ? 'Downloaded · ready on this device'
        : state.bytes
          ? `Partially downloaded · ${megabytes(state.bytes)} saved. Download to resume.`
          : 'Not downloaded';
      download.disabled = state.ready;
      remove.disabled = !state.bytes;
      use.disabled = !state.ready;
    } catch (error) {
      if (!closed && id === refreshId) status.textContent = errorMessage(error);
    }
  };
  models.onchange = () => {
    void refresh();
  };
  download.onclick = async () => {
    if (busy) return;
    busy = true;
    controller = new AbortController();
    progress.value = 0;
    progress.hidden = false;
    status.textContent = 'Connecting to Hugging Face…';
    void refresh();
    let failure;
    try {
      await downloadModel(selected(), {
        signal: controller.signal,
        onProgress: ({ loaded, total }) => {
          if (closed) return;
          progress.value = Math.min(100, (loaded / total) * 100);
          status.textContent = `Downloading: ${Math.round(progress.value)}% · ${megabytes(loaded)} / ${megabytes(total)}`;
        }
      });
    } catch (error) {
      failure = error;
    } finally {
      busy = false;
      progress.hidden = true;
      if (!closed) {
        await refresh();
        if (failure) status.textContent = errorMessage(failure);
        else if (autoStart && !use.disabled) use.onclick();
      }
    }
  };
  remove.onclick = async () => {
    if (busy) return;
    busy = true;
    void refresh();
    let failure;
    try {
      await removeModel(selected());
    } catch (error) {
      failure = error;
    }
    busy = false;
    if (!closed) {
      await refresh();
      if (failure) status.textContent = errorMessage(failure);
    }
  };
  use.onclick = () => {
    chosen = { model: models.value, language: selected().multilingual ? languages.value : 'auto' };
    try {
      saveSelection(chosen);
      result = { selection: chosen, context: onUse?.(chosen) };
      dismiss();
    } catch (error) {
      status.textContent = errorMessage(error);
    }
  };
  const dismiss = () => (overlay ? overlay.close() : dialog.close());
  close.onclick = dismiss;
  const previousFocus = document.activeElement;
  const keydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not(:disabled), select:not(:disabled)')];
      const first = controls[0];
      const last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  const finished = new Promise((resolve) => {
    const onClose = () => {
      if (closed) return;
      closed = true;
      controller?.abort();
      signal?.removeEventListener('abort', dismiss);
      document.removeEventListener('keydown', keydown);
      dialog.remove();
      previousFocus?.focus();
      resolve(result);
    };
    if (overlay) {
      overlay.show('<div class="transcript-model-mount"></div>', onClose);
      document
        .querySelector(`#saito-overlay${overlay.ordinal} .transcript-model-mount`)
        .replaceWith(dialog);
      document.addEventListener('keydown', keydown);
      models.focus();
    } else {
      dialog.addEventListener('close', onClose, { once: true });
      document.body.append(dialog);
      dialog.showModal();
    }
  });
  signal?.addEventListener('abort', dismiss, { once: true });
  if (signal?.aborted) dismiss();
  else if (autoStart) void download.onclick();
  else void refresh();
  return finished;
}
