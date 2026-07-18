module.exports = (link) => {
  let html = `
  <div class="saito-link-preview">
          <a class="saito-link" `;

  let info = ['title', 'display_url', 'description'];

  let include_graphics = true;

  if (!link.url.includes(window.location.host)) {
    html += `target="_blank" rel='noopener noreferrer' `;
  } else {
    html += `data-link="local_link" `;

    //info = ['title', 'description'];
    let index = link.url.indexOf(window.location.host) + window.location.host.length + 1;
    let slug = link.url.substring(index);
    if (slug.includes('/')) {
      slug = slug.split('/')[0];
    }
    if (slug.includes('?')) {
      slug = slug.split('?')[0];
    }

    let filters = link.app.modules.returnFirstRespondTo('saito-filter-link', {
      modname: link.mod.returnName(),
      slug,
      url: link.url
    });

    if (filters?.info) {
      info = filters?.info;
    }

    if (filters?.no_photo) {
      include_graphics = false;
    }

    // ---> Use a respondTo to further customize which info to include and add a class...
  }

  let img_src = '/saito/img/dreamscape.png';
  if (link.src) {
    img_src = link.src;
  }

  html += `href="${link.url}">`;
  if (include_graphics) {
    html += `<div class="saito-link-img ${link.show_photo ? 'has-picture' : ''}">
                <img src="${img_src}">
              </div>`;
  }
  if (info.length > 0) {
    html += `<div class="saito-link-info">`;
    for (let i = 0; i < info.length; i++) {
      html += `<div class="saito-link-${info[i]}">${link[info[i]]}</div>`;
    }
    html += '</div>';
  }

  html += `
          </a>
        </div>
    `;
  return html;
};
