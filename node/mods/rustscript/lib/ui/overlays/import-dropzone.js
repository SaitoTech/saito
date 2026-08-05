/**
 * Shared import dropzone markup + drag/click wiring for transaction and script importers.
 */

function dropzoneMarkup({
  id = 'rs-import-drop-zone',
  ariaLabel = 'Import file',
  lead = 'drag and drop a file here',
  clickHint = 'or click here',
  accept = '.saito,.json,application/json,text/plain'
} = {}) {
  return `
        <div id="${id}" class="rs-import-dropzone" tabindex="0" role="button" aria-label="${ariaLabel}">
          <svg class="rs-import-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="rs-import-dropzone-lead">${lead}</p>
          <p class="rs-import-dropzone-click">${clickHint}</p>
          <input type="file" class="rs-import-file-input" accept="${accept}" hidden />
        </div>`;
}

function bindDropzone(root, { onFile } = {}) {
  if (!root || typeof onFile !== 'function') {
    return;
  }

  const dropZone = root.querySelector('.rs-import-dropzone');
  const fileInput = root.querySelector('.rs-import-file-input');
  if (!dropZone || !fileInput) {
    return;
  }

  const setDragActive = (active) => {
    dropZone.classList.toggle('is-dragover', active);
  };

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  dropZone.addEventListener('dragenter', (e) => {
    prevent(e);
    setDragActive(true);
  });
  dropZone.addEventListener('dragover', (e) => {
    prevent(e);
    setDragActive(true);
  });
  dropZone.addEventListener('dragleave', (e) => {
    prevent(e);
    setDragActive(false);
  });
  dropZone.addEventListener('drop', (e) => {
    prevent(e);
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      onFile(file);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      onFile(file);
    }
    fileInput.value = '';
  });
}

module.exports = {
  dropzoneMarkup,
  bindDropzone
};
