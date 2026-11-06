require('pdfjs-dist/legacy/build/pdf.worker.entry');
const pdfjs = require('pdfjs-dist/legacy/build/pdf');

const documents = new Map();
const jobs = new WeakMap();

function bytesFromBase64(value) {
  const clean = String(value || '').replace(/\s/g, '');
  if (typeof atob !== 'function') {
    return Uint8Array.from(Buffer.from(clean, 'base64'));
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function documentKey(entry) {
  return entry?.url || `${entry?.name || 'document.pdf'}:${entry?.pdf?.length || 0}`;
}

function openDocument(entry) {
  const key = documentKey(entry);
  if (!documents.has(key)) {
    const task = pdfjs.getDocument({
      data: bytesFromBase64(entry.pdf),
      useWorkerFetch: false,
      isEvalSupported: false
    });
    const pending = task.promise.catch((err) => {
      documents.delete(key);
      throw err;
    });
    documents.set(key, { task, pending });
  }
  return documents.get(key).pending;
}

function releaseDocuments() {
  documents.forEach((session) => {
    session.task.destroy();
  });
  documents.clear();
}

function releasePage(pageEl) {
  const job = jobs.get(pageEl);
  if (job) {
    job.cancelled = true;
    if (job.task) {
      job.task.cancel();
    }
    jobs.delete(pageEl);
  }
  const canvas = pageEl.querySelector('canvas.page');
  if (!canvas) {
    return;
  }
  if (canvas.width || canvas.height) {
    canvas.width = 0;
    canvas.height = 0;
  }
  delete canvas.dataset.drawn;
}

async function paintPage(pageEl, entry, localPage) {
  const canvas = pageEl.querySelector('canvas.page');
  if (!canvas || !entry?.pdf) {
    return;
  }
  const cssWidth = Math.floor(pageEl.clientWidth);
  if (cssWidth < 40) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const mark = `${documentKey(entry)}|${localPage}|${cssWidth}|${ratio}`;
  if (canvas.dataset.drawn === mark && canvas.width > 0) {
    return;
  }

  const previous = jobs.get(pageEl);
  if (previous) {
    previous.cancelled = true;
    previous.task?.cancel();
  }
  const job = { cancelled: false, task: null };
  jobs.set(pageEl, job);

  const pdf = await openDocument(entry);
  if (job.cancelled || jobs.get(pageEl) !== job) {
    return;
  }
  const page = await pdf.getPage(localPage);
  if (job.cancelled || jobs.get(pageEl) !== job) {
    return;
  }
  const unscaled = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (cssWidth / unscaled.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({
    canvasContext: canvas.getContext('2d', { alpha: false }),
    viewport
  });
  job.task = task;
  try {
    await task.promise;
  } catch (err) {
    if (job.cancelled || err?.name === 'RenderingCancelledException') {
      return;
    }
    throw err;
  }
  if (job.cancelled || jobs.get(pageEl) !== job) {
    return;
  }
  canvas.dataset.drawn = mark;
}

module.exports = {
  paintPage,
  releasePage,
  releaseDocuments
};
