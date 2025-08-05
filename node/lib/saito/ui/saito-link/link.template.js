module.exports = (link) => {
  let html = `
  <div class="link-preview">
          <a class="saito-link" `;

  if (!link.url.includes(window.location.host)) {
    html += `target="_blank" rel='noopener noreferrer' `;
  } else {
    html += `data-link="local_link" `;
  }

  let style = '';
  if (link.src) {
    style = `background-image: url(${link.src});`;
  }

  html += `href="${link.url}">
            <div class="link-container">
              <div class="link-img ${link.show_photo ? 'has-picture' : ''}" style="${style}"></div>
              <div class="link-info">
                <div class="link-title">${link.title}</div>
                <div class="link-url">${link.url}</div>
                <div class="link-description">${link.description}</div>
              </div>
            </div>
          </a>
        </div>
    `;
  return html;
};
