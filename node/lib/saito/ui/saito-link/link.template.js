module.exports = (link) => {
  let html = `
  <div class="link-preview">
          <a class="saito-link" `;

  let info = ['title', 'display_url', 'description'];

  if (!link.url.includes(window.location.host)) {
    html += `target="_blank" rel='noopener noreferrer' `;
  } else {
    html += `data-link="local_link" `;

    info = ['title', 'description'];

    // ---> Use a respondTo to further customize which info to include and add a class...
  }

  let img_src = '/saito/img/dreamscape.png';
  if (link.src) {
    img_src = link.src;
  }

  html += `href="${link.url}">
            <div class="link-container">
              <div class="link-img ${link.show_photo ? 'has-picture' : ''}">
                <img src="${img_src}">
              </div>
              <div class="link-info">`;
  for (let i = 0; i < info.length; i++) {
    html += `<div class="link-${info[i]}">${link[info[i]]}</div>`;
  }

  html += `</div>
            </div>
          </a>
        </div>
    `;
  return html;
};
