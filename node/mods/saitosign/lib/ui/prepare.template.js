function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(value) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function signersHTML(view) {
  const people = view.signers
    .map((signer) => {
      const arrived = signer.arrived ? ' arrived' : '';
      return `
        <li class="row signer${arrived}">
          <button type="button" class="open" data-open-signer="${signer.index}">
            <i class="fa-solid fa-user" aria-hidden="true"></i>
            <span class="label">${escapeHTML(signer.name)}</span>
          </button>
        </li>
      `;
    })
    .join('');

  const form = view.adding_signer
    ? `
      <form class="add-signer">
        <input data-signer-name type="text" placeholder="name or email" aria-label="Signer name" autocomplete="name" />
        <button type="submit" class="primary">Add</button>
      </form>
    `
    : '';

  return `
    <ul class="people">${people}</ul>
    ${form}
  `;
}

function signerAction(view) {
  if (view.adding_signer) {
    return '';
  }
  return '<button type="button" class="plus" data-add-signer aria-label="Add signer">+</button>';
}

function fieldListHTML(view) {
  if (!view.field_list.length) {
    return '';
  }

  return `
    <ul class="field-list">
      ${view.field_list
        .map(
          (field) => `
            <li class="row">
              <button type="button" class="open" data-open-field="${field.id}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i>
                <span class="label">${escapeHTML(field.type)} · ${escapeHTML(field.name)} · page ${field.page}</span>
              </button>
            </li>
          `
        )
        .join('')}
    </ul>
  `;
}

function fieldsSectionHTML(view) {
  if (!view.signers.length) {
    return '';
  }

  const hint = view.placing
    ? '<p class="hint">Highlight the area of the document where this field belongs.</p>'
    : '';

  return `
    <section class="fields-panel">
      <div class="section-head">
        <p class="title">Actions</p>
        <button type="button" class="plus" data-add-field aria-pressed="${view.placing ? 'true' : 'false'}" aria-label="Add field">+</button>
      </div>
      ${hint}
      ${fieldListHTML(view)}
    </section>
  `;
}

function railHTML(view) {
  const notice = view.notice ? `<p class="notice">${escapeHTML(view.notice)}</p>` : '';
  const exportable = view.edited ? ' primary' : '';
  const disabled = view.edited ? '' : ' disabled';

  return `
    <div class="identity">
      <p class="name">SaitoSign</p>
      <p class="file">${escapeHTML(view.file_name)}</p>
    </div>

    <section class="signers-panel">
      <div class="section-head">
        <p class="title">Signers</p>
        ${signerAction(view)}
      </div>
      ${signersHTML(view)}
    </section>

    ${fieldsSectionHTML(view)}
    ${notice}

    <button type="button" class="export${exportable}" data-export${disabled}>Export as SaitoSign</button>
  `;
}

function fieldsHTML(page) {
  const placed = page.fields
    .map(
      (field) => `
        <button type="button" class="field" data-field-id="${field.id}" style="left:${pct(field.x)};top:${pct(field.y)};width:${pct(field.width)};height:${pct(field.height)}">
          <span class="text">${escapeHTML(field.type)} · ${escapeHTML(field.name)}</span>
        </button>
      `
    )
    .join('');

  const draft = page.draft
    ? `
      <div class="field draft" style="left:${pct(page.draft.x)};top:${pct(page.draft.y)};width:${pct(page.draft.width)};height:${pct(page.draft.height)}">
        <span class="text">${escapeHTML(page.draft.type)} · ${escapeHTML(page.draft.name)}</span>
      </div>
    `
    : '';

  return placed + draft;
}

function pagesHTML(view) {
  const placing = view.placing ? ' placing' : '';
  return view.pages
    .map(
      (page) => `
        <article class="pdf-page" data-page="${page.page}">
          <iframe class="page" title="${escapeHTML(view.file_name)}, page ${page.page}"></iframe>
          <div class="fields${placing}">${fieldsHTML(page)}</div>
        </article>
      `
    )
    .join('');
}

function readerHTML(view) {
  const at_start = view.page <= 1 ? ' disabled' : '';
  const at_end = view.page >= view.page_count ? ' disabled' : '';
  const zoom_out = view.zoom <= (view.zoom_min || 1) + 0.01 ? ' disabled' : '';
  const zoom_in = view.zoom >= view.zoom_max ? ' disabled' : '';
  return `
    <div class="pages">
      <button type="button" data-page="prev" aria-label="Previous page"${at_start}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
      <label class="where">
        <input data-page-input type="number" min="1" max="${view.page_count}" value="${view.page}" aria-label="Page number" />
        <span>of ${view.page_count}</span>
      </label>
      <button type="button" data-page="next" aria-label="Next page"${at_end}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    </div>
    <div class="zoom">
      <button type="button" data-zoom="out" aria-label="Zoom out"${zoom_out}><i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i></button>
      <button type="button" data-zoom="in" aria-label="Zoom in"${zoom_in}><i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i></button>
    </div>
  `;
}

function signerFormHTML(view) {
  const verified = view.verified ? ' checked' : '';
  const signed = view.signed ? ' checked' : '';

  return `
    <section class="saitosign-user">
      <div class="facts">
        <label class="fact">
          name:
          <input data-user-name type="text" value="${escapeHTML(view.name || '')}" autocomplete="name" />
        </label>
        <label class="fact">
          email:
          <input data-user-email type="text" value="${escapeHTML(view.email || '')}" autocomplete="email" />
        </label>
        <div class="fact">
          <span>public key:</span>
          <p>${escapeHTML(view.publickey || '')}</p>
        </div>
      </div>
      <label class="status">
        <input type="checkbox" disabled${verified}>
        has verified
      </label>
      <label class="status">
        <input type="checkbox" disabled${signed}>
        signed verified
      </label>
      <div class="actions">
        <button type="button" data-remove-signer-confirm>delete user</button>
        <button type="button" class="primary" data-update-user>Update</button>
      </div>
    </section>
  `;
}

function fieldFormHTML(view) {
  const types = ['signature', 'initial', 'date']
    .map((type) => {
      const selected = view.type === type ? ' selected' : '';
      return `<option value="${type}"${selected}>${type}</option>`;
    })
    .join('');

  const signers = view.signers
    .map((signer) => {
      const selected = signer.index === view.signer_index ? ' selected' : '';
      return `<option value="${signer.index}"${selected}>${escapeHTML(signer.name)}</option>`;
    })
    .join('');

  const remove = view.existing
    ? '<button type="button" data-remove-field>Delete Action</button>'
    : '';

  return `
    <form class="saitosign-field">
      <label>
        Who
        <select data-field-signer>
          ${signers}
          <option value="new">Add New Signer</option>
        </select>
      </label>
      <div class="new-signer" hidden>
        <input data-new-signer type="text" placeholder="name or email" aria-label="Signer name" autocomplete="name" />
        <button type="button" data-create-signer>Add</button>
      </div>
      <label>
        What
        <select data-field-type>${types}</select>
      </label>
      <div class="actions">
        ${remove}
        <button type="submit" class="primary">${view.existing ? 'Update' : 'Place'}</button>
      </div>
    </form>
  `;
}

function prepareTemplate(view) {
  return `
    <main class="prepare">
      <aside class="rail">${railHTML(view)}</aside>
      <section class="stage">
        <div class="sheet-wrap">
          <div class="sheet-sizer">
            <div class="sheet">
              ${pagesHTML(view)}
            </div>
          </div>
        </div>
        <div class="reader">
          ${readerHTML(view)}
        </div>
      </section>
    </main>
  `;
}

module.exports = prepareTemplate;
module.exports.rail = railHTML;
module.exports.fields = fieldsHTML;
module.exports.reader = readerHTML;
module.exports.fieldForm = fieldFormHTML;
module.exports.signerForm = signerFormHTML;
