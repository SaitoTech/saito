const getImageUrl = (base64String) => {
  if (!base64String) return null;
  if (base64String.startsWith('data:image/')) return base64String;
  if (base64String.startsWith('http')) return base64String;

  const isPNG = base64String.charAt(0) === 'i';
  const isJPEG = base64String.charAt(0) === '/';
  const isGIF = base64String.charAt(0) === 'R';

  let mimeType = 'jpeg';
  if (isPNG) mimeType = 'png';
  if (isGIF) mimeType = 'gif';

  return `data:image/${mimeType};base64,${base64String}`;
};

const BlogTemplate = (app, mod, post) => {
  let source = '';
  if (post.image) {
    source = getImageUrl(post.image);
  } else if (post.imageUrl) {
    source = post.imageUrl;
  }

  let date = app.browser.formatDate(post.timestamp);

  let html = `
  <div class="post-view">
      <article class="post-content">
        <div class="post-content-body">
          <div class="post-actions"></div>

          <header class="post-header">
            <h4 class="post-title">${post.title}</h4>
            <p class="byline">
              <span>Published by </span> 
              <span style="color: 'var(--saito-primary)'">
                ${app.keychain.returnUsername(post.publicKey)}
              </span>
              <span> on ${date.month} ${date.day}, ${date.year}</span>
            </p>
          </header>`;

  if (source) {
    html += `<div class="post-image-container">
              <img src=${source} alt=${post.title} class="post-header-image" />
            </div>`;
  }
  //${parseMarkdown(post.content)}
  html += `<div class="post-body richtext-content">
            ${app.browser.sanitize(post.content, true)}        
          </div>
        </div>
      </article>
    </div>`;

  return html;
};

module.exports = BlogTemplate;
