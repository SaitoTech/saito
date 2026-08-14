module.exports = () => `
<main class="nftstudio">
  <aside class="tools" aria-label="NFT Studio tools">
    <header class="tools-header">
      <span class="tools-title">Tools</span>
      <button type="button" class="saito-button-square" data-action="toggle-tools" title="Collapse tools" aria-label="Collapse tools" aria-expanded="true">
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
    </header>

    <div class="tool-fields">
      <label class="field" for="nftstudio-title">
        <span>Name</span>
        <input id="nftstudio-title" class="saito-input" type="text" maxlength="120" />
      </label>
      <label class="field" for="nftstudio-type">
        <span>Type</span>
        <select id="nftstudio-type" class="saito-form-select">
          <option value="js">JavaScript</option>
          <option value="css">CSS</option>
        </select>
      </label>
    </div>

    <div class="tool-actions">
      <button type="button" class="tool-option" data-action="new" title="New NFT">
        <i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i><span class="tool-label">New</span>
      </button>
      <button type="button" class="tool-option" data-action="save" title="Save draft">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span class="tool-label">Save draft</span>
      </button>
      <button type="button" class="tool-option" data-action="import" title="Import file">
        <i class="fa-solid fa-file-import" aria-hidden="true"></i><span class="tool-label">Import</span>
      </button>
      <button type="button" class="tool-option" data-action="export" title="Export file">
        <i class="fa-solid fa-file-export" aria-hidden="true"></i><span class="tool-label">Export</span>
      </button>
      <input class="file-input treated" type="file" accept=".js,.css,text/javascript,text/css" hidden />
    </div>

    <div class="draft-status" role="status" aria-live="polite"></div>
  </aside>

  <section class="workspace">
    <article class="panel editor-panel">
      <header class="panel-header">
        <span class="filename"></span>
        <div class="panel-actions">
          <div class="validation" data-state="unchecked" role="status" aria-live="polite">
            <span class="light" aria-hidden="true"></span>
            <span class="message">Not checked</span>
            <button type="button" class="saito-button-square" data-action="validate" title="Recheck code" aria-label="Recheck code">
              <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
            </button>
          </div>
          <button type="button" class="saito-button-square" data-action="toggle-preview" title="Show side-by-side preview" aria-label="Show side-by-side preview" aria-pressed="false" hidden>
            <i class="fa-solid fa-table-columns" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="editor-stage">
        <div class="editor" aria-label="NFT source editor"></div>
        <div class="primary-actions" aria-label="NFT actions">
          <button type="button" class="saito-button-square" data-action="run" title="Run NFT" aria-label="Run NFT">
            <i class="fa-solid fa-play" aria-hidden="true"></i><span>Run</span>
          </button>
          <button type="button" class="saito-button-square" data-action="publish" title="Publish NFT" aria-label="Publish NFT">
            <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Publish</span>
          </button>
        </div>
      </div>
      <pre class="error" role="status" aria-live="polite">Not checked</pre>
    </article>

    <article class="panel preview-panel" hidden>
      <header class="panel-header">
        <span>Preview</span>
      </header>
      <iframe class="preview" title="CSS theme preview" sandbox=""></iframe>
    </article>
  </section>
</main>
`;
