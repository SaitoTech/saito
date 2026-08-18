module.exports = (preview) => {
  const esc = (value) => preview.app.browser.escapeHTML(String(value ?? ''));
  const hrefUrl = preview.app.browser.isSafeHref(preview.url) ? preview.url : '#';
  const isLocal =
    preview.url &&
    typeof window !== 'undefined' &&
    window.location?.host &&
    String(preview.url).includes(window.location.host);

  let html = `
  <div class="saito-link-preview">
          <a `;

  let info = ['title', 'display_url', 'description'];

  let include_graphics = true;

  if (!isLocal) {
    html += `target="_blank" rel='noopener noreferrer' `;
  } else {
    html += `data-link="local_link" `;

    let index = preview.url.indexOf(window.location.host) + window.location.host.length + 1;
    let slug = preview.url.substring(index);
    if (slug.includes('/')) {
      slug = slug.split('/')[0];
    }
    if (slug.includes('?')) {
      slug = slug.split('?')[0];
    }

    let filters = preview.app.modules.returnFirstRespondTo('saito-filter-link', {
      modname: preview.mod.returnName(),
      slug,
      url: preview.url
    });

    if (filters?.info) {
      info = filters?.info;
    }

    if (filters?.no_photo) {
      include_graphics = false;
    }
  }

  let img_src = '/saito/img/dreamscape.png';
  if (preview.src && preview.app.browser.isSafeMediaUrl(preview.src)) {
    img_src = preview.src;
  }

  html += `href="${esc(hrefUrl)}">`;
  if (include_graphics) {
    html += `<div class="saito-link-preview-img ${preview.show_photo ? 'has-picture' : ''}">
                <img src="${esc(img_src)}">
              </div>`;
  }
  if (info.length > 0) {
    html += `<div class="saito-link-preview-info">`;
    for (let i = 0; i < info.length; i++) {
      const key = info[i];
      const className = String(key).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!className) {
        continue;
      }
      html += `<div class="saito-link-preview-${className}">${esc(preview[key])}</div>`;
    }
    html += '</div>';
  }

  html += `
          </a>
        </div>
    `;
  return html;
};
