/**
 * Publish Settings Overlay Template
 *
 * Guided publishing flow: access selector (left) + step content (right).
 * Private / Subscription open a lightweight wizard; Public publishes in one click.
 */
module.exports = (app, mod, postState = {}, wizardState = {}) => {
	const parent_id =
		mod.create_post_ui && mod.create_post_ui.parent_id ? mod.create_post_ui.parent_id : null;
	const publishButtonText = parent_id ? 'Update' : 'Publish';
	const accessLevel = postState.accessLevel || 'public';
	const step = wizardState.step || 1;

	const isPublic = accessLevel === 'public';
	const isPrivate = accessLevel === 'private';
	const isSubscription = accessLevel === 'subscription';
	const isRestricted = isPrivate || isSubscription;

	const keyLabel = isSubscription ? 'Subscription Key' : 'Access Key';
	const keysLabel = isSubscription ? 'Subscription Keys' : 'Access Keys';
	const hasAccessKey =
		wizardState.hasAccessKey === true || wizardState.createNftStatus === 'confirmed';
	const isConfirmed = wizardState.createNftStatus === 'confirmed';
	const isListedInStore = wizardState.isListedInStore === true;
	const createQuantity = wizardState.createQuantity || 1;

	const getStepContent = () => {
		if (step === 1) {
			if (isPublic) {
				return {
					body: `
            <div class="stack-publish-option-copy">
              <p class="stack-publish-option-heading">Anyone can read.</p>
            </div>
          `
				};
			}
			if (isPrivate) {
				return {
					body: `
            <div class="stack-publish-option-copy">
              <p class="stack-publish-option-heading">Restricted Post</p>
              <ul class="stack-publish-option-points">
                <li>Readers must have an Access Key.</li>
                <li>Click NEXT to manage access controls.</li>
              </ul>
            </div>
          `
				};
			}
			if (isSubscription) {
				return {
					body: `
            <div class="stack-publish-option-copy">
              <p class="stack-publish-option-heading">Restricted Post</p>
              <ul class="stack-publish-option-points">
                <li>Readers must have an Active Subscription.</li>
                <li>Click NEXT to manage access controls.</li>
              </ul>
            </div>
          `
				};
			}
		}

		if (step === 2 && (isPrivate || isSubscription)) {
			const checklistHtml = `
          <div class="stack-publish-checklist stack-publish-checklist-matrix">
            <div class="stack-publish-check-row stack-publish-check-row-complete">
              <span class="stack-publish-check-mark">✓</span>
              <span>Blog Post Created</span>
            </div>
            <div class="stack-publish-check-row${hasAccessKey ? ' stack-publish-check-row-complete' : ''}">
              <span class="stack-publish-check-mark">${hasAccessKey ? '✓' : '○'}</span>
              <span>${keysLabel} Created</span>
            </div>
            ${
							isListedInStore
								? `
            <div class="stack-publish-check-row stack-publish-check-row-complete">
              <span class="stack-publish-check-mark">✓</span>
              <span>${keysLabel} Listed</span>
            </div>
                `
								: ''
						}
          </div>
        `;

			if (isListedInStore) {
				return {
					body: `
              ${checklistHtml}
              <div class="stack-publish-followup-state">
                <p class="stack-publish-guidance">Everything is Ready. Go ahead and publish your post.</p>
              </div>
            `
				};
			}

			if (isConfirmed || hasAccessKey) {
				return {
					body: `
              ${checklistHtml}
              <div class="stack-publish-followup-state">
                <p class="stack-publish-guidance">Would you like to list some ${keysLabel} for sale?</p>
                <p class="stack-publish-guidance">
                  <span id="stack-list-access-key-link" class="saito-text-link">▸ click here to upload to the Saito Store</span>
                </p>
              </div>
            `
				};
			}

			if (wizardState.createNftStatus === 'cancelled') {
				return {
					body: `
            ${checklistHtml}
            <div class="stack-publish-followup-state">
              <p class="stack-publish-guidance">You can publish now without creating ${keysLabel}, or create Stack ${keyLabel} NFTs later from your wallet.</p>
            </div>
          `
				};
			}

			return {
				body: `
            ${checklistHtml}
            <div class="stack-publish-followup-state">
              <p class="stack-publish-guidance">Your wallet does not have any ${keysLabel}.</p>
              <p class="stack-publish-guidance">
                <span id="stack-create-access-key-link" class="saito-text-link">▸ click here to mint some now</span>
              </p>
            </div>
          `
			};
		}

		return {
			body: `
          <p class="stack-publish-guidance">You'll need a ${keyLabel} for this post. We'll help you create one.</p>
        `
		};
	};

	const stepContent = getStepContent();

	let primaryLabel = publishButtonText;
	let primaryAction = 'publish';
	if (isRestricted) {
		if (step < 2) {
			primaryLabel = 'Next →';
			primaryAction = 'next';
		} else {
			primaryLabel = publishButtonText;
			primaryAction = 'publish';
		}
	}

	const showBack = isRestricted && step > 1;
	const showPublishImmediately = isRestricted && step === 1;

	const leftActionHtml = (() => {
		if (showBack) {
			return `
        <button id="stack-publish-back-btn" class="saito-button-square" type="button" aria-label="Back">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
      `;
		}
		if (showPublishImmediately) {
			return `
        <span id="stack-publish-immediately" class="saito-text-link stack-publish-immediately" role="button" tabindex="0">or skip access controls and publish immediately...</span>
      `;
		}
		return `<div class="stack-publish-action-spacer"></div>`;
	})();

	return `
    <div class="stack-publish-overlay">
      <div class="stack-publish-content">
        <div class="stack-publish-header">
          <h3 class="stack-publish-overlay-title">who can read this post?</h3>
          <button
            type="button"
            id="stack-publish-delete-draft-btn"
            class="saito-icon-button"
            title="Delete Draft"
            aria-label="Delete Draft"
          >
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </button>
        </div>

        <div class="stack-publish-cards">

          <div class="stack-publish-card stack-publish-card-access">
            <div class="stack-publish-access-cards">
              <label class="stack-publish-access-card ${isPublic ? 'stack-publish-access-card-active' : ''}" data-access="public">
                <input
                  type="checkbox"
                  name="stack-publish-access"
                  value="public"
                  ${isPublic ? 'checked' : ''}
                  class="saito-checkbox stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Public</div>
                </div>
              </label>

              <label class="stack-publish-access-card ${isPrivate ? 'stack-publish-access-card-active' : ''}" data-access="private">
                <input
                  type="checkbox"
                  name="stack-publish-access"
                  value="private"
                  ${isPrivate ? 'checked' : ''}
                  class="saito-checkbox stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Private</div>
                </div>
              </label>

              <label class="stack-publish-access-card ${isSubscription ? 'stack-publish-access-card-active' : ''}" data-access="subscription">
                <input
                  type="checkbox"
                  name="stack-publish-access"
                  value="subscription"
                  ${isSubscription ? 'checked' : ''}
                  class="saito-checkbox stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Subscription</div>
                </div>
              </label>
            </div>
          </div>

          <div class="stack-publish-card stack-publish-card-main">
            <div id="stack-publish-step-panel" class="stack-publish-step-panel" data-step="${step}">
              <div class="stack-publish-educational-content">
                ${stepContent.body}
              </div>
            </div>
          </div>

        </div>

        <div class="stack-publish-global-action">
          <div class="stack-publish-global-action-left">
            ${leftActionHtml}
          </div>
          <button
            id="stack-publish-primary-btn"
            class="saito-button-primary"
            type="button"
            data-action="${primaryAction}"
          >
            ${primaryLabel}
          </button>
        </div>
      </div>
    </div>
  `;
};
