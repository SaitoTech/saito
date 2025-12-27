/**
 * Choose Draft Overlay Template
 * 
 * Two-pane chooser: Resume existing draft OR start new post
 */
module.exports = (app, mod, drafts = []) => {
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

  return `
    <div class="stack-choose-draft-overlay">
      <div class="stack-choose-draft-content">
        <h2 class="stack-choose-draft-title">Resume a draft or start a new post</h2>
        
        <div class="stack-choose-draft-panes">
          <!-- LEFT PANE: Existing Drafts -->
          <div class="stack-choose-draft-pane stack-choose-draft-pane-drafts">
            <div class="stack-choose-draft-list">
              ${drafts.map((draft, index) => `
                <div class="stack-choose-draft-row" data-draft-id="${draft.id || ''}">
                  <div class="stack-choose-draft-row-content">
                    <div class="stack-choose-draft-row-title">${draft.title || 'Untitled draft'}</div>
                    ${draft.lastModified ? `
                      <div class="stack-choose-draft-row-meta">${formatDate(draft.lastModified)}</div>
                    ` : ''}
                  </div>
                  <div class="stack-choose-draft-delete-icon" title="Delete draft">
                    <i class="fas fa-trash"></i>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- RIGHT PANE: Start New -->
          <div class="stack-choose-draft-pane stack-choose-draft-pane-new">
            <div class="stack-choose-draft-new-card" id="stack-choose-draft-create-new">
              <div class="stack-choose-draft-new-icon">+</div>
              <div class="stack-choose-draft-new-title">Start a new post</div>
              <div class="stack-choose-draft-new-subtitle">Create a fresh draft</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};
