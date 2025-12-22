/**
 * Post Teaser Template
 * 
 * A reusable component for displaying blog post previews.
 * 
 * Required fields:
 * - author (publicKey or author object)
 * - title (with fallback)
 * - postId (for click handling)
 * 
 * Optional fields:
 * - image (feature image URL)
 * - excerpt (preview text)
 * - accessLevel (for access indicator - only shown if not 'public')
 */
module.exports = (app, mod, post) => {
  // Extract required fields
  const publicKey = post.publicKey || post.author?.publicKey || post.author || '';
  const title = post.title || 'Untitled post';
  const postId = post.id || post.signature || post.sig || '';
  
  // Extract optional fields
  const image = post.image || post.imageUrl || null;
  const excerpt = post.excerpt || null;
  const accessLevel = post.accessLevel || post.subscriptionTier || 'public';
  
  // Generate author display using Saito user component
  const identicon = app.keychain.returnIdenticon(publicKey);
  const username = app.keychain.returnUsername(publicKey) || 
                   app.keychain.returnIdentifierByPublicKey(publicKey) || 
                   publicKey.slice(0, 8) + '...';
  
  // Determine if access indicator should be shown (only if not public)
  const showAccessIndicator = accessLevel && accessLevel !== 'public' && accessLevel !== 'free';
  
  // Limit excerpt length (approximately 150 characters, 3 lines)
  let displayExcerpt = null;
  if (excerpt) {
    const maxLength = 150;
    displayExcerpt = excerpt.length > maxLength 
      ? excerpt.substring(0, maxLength).trim() + '...'
      : excerpt;
  }
  
  return `
    <article class="stack-post-teaser" data-post-id="${postId}" data-public-key="${publicKey}">
      ${image ? `
        <div class="stack-post-teaser-image">
          <img src="${app.browser.escapeHTML(image)}" alt="${app.browser.escapeHTML(title)}" />
          ${showAccessIndicator ? `
            <div class="stack-post-teaser-access-indicator">
              <i class="fa-solid fa-lock"></i>
            </div>
          ` : ''}
        </div>
      ` : `
        ${showAccessIndicator ? `
          <div class="stack-post-teaser-image stack-post-teaser-image-placeholder">
            <i class="fa-solid fa-newspaper"></i>
            <div class="stack-post-teaser-access-indicator">
              <i class="fa-solid fa-lock"></i>
            </div>
          </div>
        ` : ''}
      `}
      
      <div class="stack-post-teaser-content">
        <div class="stack-post-teaser-author">
          <div class="saito-identicon-box">
            <img class="saito-identicon" src="${identicon}" data-id="${publicKey}">
          </div>
          ${app.browser.returnAddressHTML(publicKey, false)}
        </div>
        
        <h3 class="stack-post-teaser-title">${app.browser.escapeHTML(title)}</h3>
        
        ${displayExcerpt ? `
          <p class="stack-post-teaser-excerpt">${app.browser.escapeHTML(displayExcerpt)}</p>
        ` : ''}
      </div>
    </article>
  `;
};

