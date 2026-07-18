module.exports = (preview) => {
  let html = `
  <div class="saito-link-preview">
          <a `;

  let info = ['title', 'display_url', 'description'];

  let include_graphics = true;

  if (!preview.url.includes(window.location.host)) {
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
  if (preview.src) {
    img_src = preview.src;
  }

  html += `href="${preview.url}">`;
  if (include_graphics) {
    html += `<div class="saito-link-preview-img ${preview.show_photo ? 'has-picture' : ''}">
                <img src="${img_src}">
              </div>`;
  }
  if (info.length > 0) {
    html += `<div class="saito-link-preview-info">`;
    for (let i = 0; i < info.length; i++) {
      html += `<div class="saito-link-preview-${info[i].replace(/_/g, '-')}">${preview[info[i]]}</div>`;
    }
    html += '</div>';
  }

  html += `
          </a>
        </div>
    `;
  return html;
};
