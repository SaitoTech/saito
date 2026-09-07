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
  if (imageUrl && app.browser.isSafeMediaUrl(imageUrl)) {
    featureImageUrl = imageUrl;
  } else if (image) {
    const dataUrl = `data:image/png;base64,${image}`;
    if (app.browser.isSafeMediaUrl(dataUrl)) {
      featureImageUrl = dataUrl;
    }
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
      (_, alt, dataUrl) => {
        if (!app.browser.isSafeMediaUrl(dataUrl)) {
          return '';
        }
        return `<img src="${app.browser.escapeHTML(dataUrl)}" alt="${app.browser.escapeHTML(alt || '')}" />`;
      }
    );

    let markdownHtml = marked.parse(processedMarkdown);

    if (app.browser.sanitize) {
      html = app.browser.sanitize(markdownHtml, false);
    } else {
      html = app.browser.escapeHTML ? app.browser.escapeHTML(markdownHtml) : markdownHtml;
    }

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

  const authorPublicKey =
    tx.from && tx.from.length > 0 ? tx.from[0].publicKey || tx.from[0].address || '' : '';

  let authorLabel = 'Author';
  if (authorPublicKey) {
    if (authorPublicKey === mod.STACK_OFFICIAL_PUBLICKEY) {
      authorLabel = 'SaitoOfficial';
    } else if (authorPublicKey === mod.publicKey) {
      authorLabel = 'My Posts';
    } else if (app.keychain && typeof app.keychain.returnUsername === 'function') {
      authorLabel = app.keychain.returnUsername(authorPublicKey) || authorLabel;
    }
  }

  const displayTitle = hasTitle ? title.trim() : 'Untitled post';
  const stackHomePath = mod.returnStackPath ? mod.returnStackPath() : `/${mod.slug}`;
  const authorFeedPath = authorPublicKey
    ? mod.returnStackPath
      ? mod.returnStackPath(authorPublicKey)
      : `/${mod.slug}/${authorPublicKey}`
    : stackHomePath;

  return `
    <div class="view-post">
      <article class="article">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a class="crumb" href="${app.browser.escapeHTML(stackHomePath)}">Saito Stack</a>
          <span class="sep" aria-hidden="true">&gt;</span>
          <a class="crumb" href="${app.browser.escapeHTML(authorFeedPath)}">${app.browser.escapeHTML(authorLabel)}</a>
          <span class="sep" aria-hidden="true">&gt;</span>
          <span class="current">${app.browser.escapeHTML(displayTitle)}</span>
        </nav>

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
      </article>
    </div>
  `;
};
