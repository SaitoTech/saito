const marked = require('marked');

module.exports = (app, mod, tx) => {
  if (!tx) {
    return '<div class="stack-view-post-error">No post data available</div>';
  }

  // Extract transaction data
  const msg = tx.returnMessage();
  const data = msg.data || {};

  // Extract fields - use content for body, never summary
  const title = data.title || null;
  const subtitle = data.subtitle || null;
  const bodyText = data.content || data.text || ''; // Use 'content' field (preferred), fallback to 'text'
  const images = Array.isArray(data.images) ? data.images : []; // Embedded content images array
  const image = data.image || null; // Teaser/header image (singular, separate)
  const imageUrl = data.imageUrl || null;
  const url = data.url || null;
  const timestamp = tx.timestamp || data.timestamp || Date.now();

  // Get feature image URL (only if exists) - this is the teaser/header image
  let featureImageUrl = null;
  if (imageUrl) {
    featureImageUrl = imageUrl;
  } else if (image) {
    // Convert base64 to data URL
    const mimeType = 'image/png'; // Default
    featureImageUrl = `data:image/${mimeType};base64,${image}`;
  }

  // Create image lookup map for resolving stack:image: references
  const imageMap = new Map();
  if (Array.isArray(images)) {
    for (const img of images) {
      if (img && img.id && img.data && img.mime) {
        imageMap.set(img.id, img);
      }
    }
  }

  // Render markdown body text to HTML with image reference resolution
  const renderMarkdown = (markdown) => {
    if (!markdown) return '';

    // Resolve stack:image:<imageId> references before markdown processing
    let processedMarkdown = markdown;
    const imageReferenceRegex = /!\[([^\]]*)\]\(stack:image:([^)]+)\)/g;

    processedMarkdown = processedMarkdown.replace(imageReferenceRegex, (match, alt, imageId) => {
      const imageObj = imageMap.get(imageId);
      if (imageObj && imageObj.data) {
        // Construct data URL from stored image data
        const mimeType = imageObj.mime || 'image/png';
        const dataUrl = `data:${mimeType};base64,${imageObj.data}`;
        return `![${alt}](${dataUrl})`;
      } else {
        // Image reference not found - render broken image placeholder
        console.warn('Stack: Image reference not found:', imageId);
        const placeholderUrl = '/saito/img/dreamscape.png';
        return `![${alt || 'Image not found'}](${placeholderUrl})`;
      }
    });

    let html = '';

    // LEGACY IMAGE FIX: convert markdown images containing data URLs
    //
    // this prevents sanitize from breaking image display in practice
    //
    processedMarkdown = processedMarkdown.replace(
      /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g,
      (_, alt, dataUrl) => `<img src="${dataUrl}" alt="${alt || ''}" />`
    );

    // Parse markdown FIRST so [text](url) becomes <a> before sanitize's urlRegexp runs.
    // Otherwise urlRegexp wraps URLs inside markdown links and corrupts them.
    let markdownHtml = marked.parse(processedMarkdown);

    // Use browser sanitize (sanitizeHtml, bare-URL linkify, emoji). Markdown links
    // are already <a> tags; urlRegexp does not match inside href attributes.
    if (app.browser.sanitize) {
      html = app.browser.sanitize(markdownHtml, true);
    } else {
      html = app.browser.escapeHTML ? app.browser.escapeHTML(markdownHtml) : markdownHtml;
    }

    // Add target/rel/class to all links (browser.sanitize only patches the first).
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

    // Remove H1 tags from body content (title is already rendered separately)
    // Convert H1 to H2 to preserve heading hierarchy
    html = html.replace(/<h1[^>]*>/gi, '<h2>');
    html = html.replace(/<\/h1>/gi, '</h2>');

    return html;
  };

  const processedBody = renderMarkdown(bodyText);

  // Render only what exists - strict rules
  const hasTitle = title && title.trim().length > 0;
  const hasSubtitle = subtitle && subtitle.trim().length > 0;
  const hasBody = processedBody && processedBody.trim().length > 0;

  // If nothing to render, return empty
  if (!hasTitle && !hasBody) {
    return '<div class="stack-view-post-error">No post content available</div>';
  }

  return `
    <div class="stack-view-post">
      <article class="stack-view-post-article">
        ${
          featureImageUrl
            ? `
          <div class="stack-view-post-feature-image">
            <img src="${app.browser.escapeHTML(featureImageUrl)}" alt="${hasTitle ? app.browser.escapeHTML(title) : 'Post image'}" />
          </div>
        `
            : ''
        }
        
        <header class="stack-view-post-header">
          ${
            hasTitle
              ? `
            <h1 class="stack-view-post-title">${app.browser.escapeHTML(title)}</h1>
          `
              : ''
          }
          
          ${
            hasSubtitle
              ? `
            <p class="stack-view-post-subtitle">${app.browser.escapeHTML(subtitle)}</p>
          `
              : ''
          }
          
          <div class="stack-view-post-attribution">
            <div id="stack-view-post-author-container" class="stack-view-post-author-container">
              <!-- SaitoUser component will be rendered here by JavaScript -->
            </div>
            
            <div class="stack-view-post-actions">
              <a href="#" id="stack-view-post-build-on" class="stack-view-post-action-badge" aria-label="Edit" title="Edit" style="display: none;">
                <i class="fa-solid fa-pencil"></i>
              </a>
              <a href="#" id="stack-view-post-share" class="stack-view-post-action-badge" aria-label="Share Post" title="Share Post">
                <i class="fa-solid fa-share-nodes"></i>
              </a>
            </div>
          </div>
        </header>
        
        ${
          hasBody
            ? `
          <div class="stack-view-post-body">
            <div class="stack-view-post-content richtext-content">
              ${processedBody}
            </div>
          </div>
        `
            : ''
        }
        
        <footer class="stack-view-post-footer">
          <div class="stack-view-post-footer-divider"></div>
        </footer>
      </article>
    </div>
  `;
};
