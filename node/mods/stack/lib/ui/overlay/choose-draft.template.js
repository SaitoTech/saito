module.exports = (app, mod, drafts = [], draftCount = 0) => {
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const displayedDrafts = drafts.slice(0, 3);
  const showCreateNew = draftCount < 3;

  return `
    <div class="choose-draft">
      <div class="body">
        <h2 class="title">Resume a draft or start a new post</h2>
        
        <div class="list">
          ${displayedDrafts
            .map(
              (draft) => `
            <div class="row" data-draft-id="${draft.id || ''}">
              <div class="content">
                <div class="header">
                  <div class="label">${app.browser.escapeHTML(draft.title || 'Untitled')}</div>
                  <i class="fa-solid fa-trash delete" data-draft-id="${draft.id || ''}" title="Delete draft"></i>
                </div>
                ${
                  draft.lastModified
                    ? `
                  <div class="meta">${formatDate(draft.lastModified)}</div>
                `
                    : ''
                }
              </div>
            </div>
          `
            )
            .join('')}

          ${
            showCreateNew
              ? `
            <div class="row create" id="stack-choose-draft-create-new">
              <div class="content">
                <div class="header">
                  <div class="label">
                    <i class="fa-solid fa-plus"></i>Create New Post
                  </div>
                </div>
              </div>
            </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
  `;
};
