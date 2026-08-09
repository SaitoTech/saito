const marked = require('marked');

module.exports = (app, mod, tx) => {
  if (!tx) {
    return '<div class="view-post-error">No post data available</div>';
  }

  const msg = tx.returnMessage();
  const data = msg.data || {};

  const title = data.title || null;
  const subtitle = data.subtitle || null;
  const bodyText = data.content || data.text || '';
  const images = Array.isArray(data.images) ? data.images : [];
  const image = data.image || null;
  const imageUrl = data.imageUrl || null;
  const timestamp = tx.timestamp || data.timestamp || Date.now();

  let featureImageUrl = null;
  if (imageUrl) {
    featureImageUrl = imageUrl;
  } else if (image) {
    const mimeType = 'image/png';
    featureImageUrl = `data:image/${mimeType};base64,${image}`;
  }

  const imageMap = new Map();
  if (Array.isArray(images)) {
    for (const img of images) {
      if (img && img.id && img.data && img.mime) {
        imageMap.set(img.id, img);
      }
    }
  }

  const renderMarkdown = (markdown) => {
    if (!markdown) return '';

    let processedMarkdown = markdown;
    const imageReferenceRegex = /!\[([^\]]*)\]\(stack:image:([^)]+)\)/g;

    processedMarkdown = processedMarkdown.replace(imageReferenceRegex, (match, alt, imageId) => {
      const imageObj = imageMap.get(imageId);
      if (imageObj && imageObj.data) {
        const mimeType = imageObj.mime || 'image/png';
        const dataUrl = `data:${mimeType};base64,${imageObj.data}`;
        return `![${alt}](${dataUrl})`;
      } else {
        console.warn('Stack: Image reference not found:', imageId);
        const placeholderUrl = '/saito/img/dreamscape.png';
        return `![${alt || 'Image not found'}](${placeholderUrl})`;
      }
    });

    let html = '';

    processedMarkdown = processedMarkdown.replace(
      /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g,
      (_, alt, dataUrl) => `<img src="${dataUrl}" alt="${alt || ''}" />`
    );

    let markdownHtml = marked.parse(processedMarkdown);

    if (app.browser.sanitize) {
      html = app.browser.sanitize(markdownHtml, true);
    } else {
      html = app.browser.escapeHTML ? app.browser.escapeHTML(markdownHtml) : markdownHtml;
    }

    const host = (typeof window !== 'undefined' && window.location && window.location.host) || '';
    html = html.replace(/<a\s+([^>]*)>/gi, (match, attrs) => {
      if (attrs.includes('saito-link')) return match;
      const hrefMatch = attrs.match(/href=["']([^"']*)["']/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const isLocal = href && host && href.indexOf(host) !== -1;
      const extra = isLocal
        ? " data-link='local_link'"
        : ' target="_blank" rel="noopener noreferrer"';
      return `<a ${extra} class="saito-link" ${attrs}>`;
    });

    html = html.replace(/<h1[^>]*>/gi, '<h2>');
    html = html.replace(/<\/h1>/gi, '</h2>');

    return html;
  };

  const processedBody = renderMarkdown(bodyText);

  const hasTitle = title && title.trim().length > 0;
  const hasSubtitle = subtitle && subtitle.trim().length > 0;
  const hasBody = processedBody && processedBody.trim().length > 0;

  if (!hasTitle && !hasBody) {
    return '<div class="view-post-error">No post content available</div>';
  }

  return `
    <div class="view-post">
      <article class="article">
        ${
          featureImageUrl
            ? `
          <div class="feature">
            <img src="${app.browser.escapeHTML(featureImageUrl)}" alt="${hasTitle ? app.browser.escapeHTML(title) : 'Post image'}" />
          </div>
        `
            : ''
        }

        <header class="header">
          ${
            hasTitle
              ? `
            <h1 class="title">${app.browser.escapeHTML(title)}</h1>
          `
              : ''
          }

          ${
            hasSubtitle
              ? `
            <p class="subtitle">${app.browser.escapeHTML(subtitle)}</p>
          `
              : ''
          }

          <div class="attribution">
            <div id="stack-view-post-author-container" class="author">
              <!-- SaitoUser component will be rendered here by JavaScript -->
            </div>

            <div class="actions">
              <a href="#" id="stack-view-post-build-on" class="badge is-hidden" aria-label="Edit" title="Edit">
                <i class="fa-solid fa-pencil"></i>
              </a>
              <a href="#" id="stack-view-post-subscribe" class="badge is-hidden" aria-label="Follow" title="Follow">
                <i class="fa-solid fa-user-plus"></i>
              </a>
              <a href="#" id="stack-view-post-share" class="badge" aria-label="Share Post" title="Share Post">
                <i class="fa-solid fa-share-nodes"></i>
              </a>
            </div>
          </div>
        </header>

        ${
          hasBody
            ? `
          <div class="body">
            <div class="content richtext-content">
              ${processedBody}
            </div>
          </div>
        `
            : ''
        }

        <footer class="footer">
          <div id="next-post" class="footer-slot"></div>
          <div id="previous-post" class="footer-slot"></div>
        </footer>
      </article>
    </div>
  `;
};
