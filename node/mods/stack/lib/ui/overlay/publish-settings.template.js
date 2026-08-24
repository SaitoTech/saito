/**
 * Publish Settings Overlay Template
 *
 * Guided publishing flow: access selector (left) + step content (right).
 * Private / Subscription open a lightweight wizard; Public publishes in one click.
 * Distribution options (profile link, RedSquare tweet) are identical for all access levels.
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

	const profileLinkChecked = wizardState.linkToProfile !== false;
	const tweetOnPublishChecked = wizardState.tweetOnPublish !== false;

	const distributionHtml = `
    <div class="distribution">
      <label class="option">
        <input
          type="checkbox"
          class="saito-checkbox"
          data-action="toggle-profile-link"
          ${profileLinkChecked ? 'checked' : ''}
        />
        <span>Add my Stack to my profile</span>
      </label>
      <label class="option">
        <input
          type="checkbox"
          class="saito-checkbox"
          data-action="toggle-tweet-on-publish"
          ${tweetOnPublishChecked ? 'checked' : ''}
        />
        <span>Tweet this article on publish</span>
      </label>
    </div>
  `;

	const getStepContent = () => {
		if (step === 1) {
			let accessSummary = 'Anyone can read.';
			if (isPrivate) {
				accessSummary = 'Readers must have an Access Key.';
			} else if (isSubscription) {
				accessSummary = 'Readers must have an Active Subscription.';
			}

			return {
				body: `
          <div class="option-copy">
            <p class="heading">${accessSummary}</p>
            ${distributionHtml}
          </div>
        `
			};
		}

		if (step === 2 && (isPrivate || isSubscription)) {
			const checklistHtml = `
          <div class="checklist matrix">
            <div class="check-row complete">
              <span class="mark">✓</span>
              <span>Blog Post Created</span>
            </div>
            <div class="check-row${hasAccessKey ? ' complete' : ''}">
              <span class="mark">${hasAccessKey ? '✓' : '○'}</span>
              <span>${keysLabel} Created</span>
            </div>
            ${
							isListedInStore
								? `
            <div class="check-row complete">
              <span class="mark">✓</span>
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
              <div class="followup">
                <p class="guidance">Everything is Ready. Go ahead and publish your post.</p>
              </div>
            `
				};
			}

			if (isConfirmed || hasAccessKey) {
				return {
					body: `
              ${checklistHtml}
              <div class="followup">
                <p class="guidance">Would you like to list some ${keysLabel} for sale?</p>
                <p class="guidance">
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
            <div class="followup">
              <p class="guidance">You can publish now without creating ${keysLabel}, or create Stack ${keyLabel} NFTs later from your wallet.</p>
            </div>
          `
				};
			}

			return {
				body: `
            ${checklistHtml}
            <div class="followup">
              <p class="guidance">Your wallet does not have any ${keysLabel}.</p>
              <p class="guidance">
                <span id="stack-create-access-key-link" class="saito-text-link">▸ click here to mint some now</span>
              </p>
            </div>
          `
			};
		}

		return {
			body: `
          <p class="guidance">You'll need a ${keyLabel} for this post. We'll help you create one.</p>
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
        <span id="stack-publish-immediately" class="saito-text-link immediately" role="button" tabindex="0">or skip access controls and publish immediately...</span>
      `;
		}
		return `<div class="spacer"></div>`;
	})();

	return `
    <div class="publish">
      <div class="content">
        <div class="header">
          <h3 class="title">who can read this post?</h3>
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

        <div class="cards">

          <div class="card card access">
            <div class="access-list">
              <label class="access-card ${isPublic ? 'active' : ''}" data-access="public">
                <input
                  type="checkbox"
                  name="stack-publish-access"
                  value="public"
                  ${isPublic ? 'checked' : ''}
                  class="saito-checkbox access-checkbox"
                />
                <div class="card-body">
                  <div class="label">Public</div>
                </div>
              </label>

              <label class="access-card ${isPrivate ? 'active' : ''}" data-access="private">
                <input
                  type="checkbox"
                  name="stack-publish-access"
                  value="private"
                  ${isPrivate ? 'checked' : ''}
                  class="saito-checkbox access-checkbox"
                />
                <div class="card-body">
                  <div class="label">Private</div>
                </div>
              </label>

              <label class="access-card ${isSubscription ? 'active' : ''}" data-access="subscription">
                <input
                  type="checkbox"
                  name="stack-publish-access"
                  value="subscription"
                  ${isSubscription ? 'checked' : ''}
                  class="saito-checkbox access-checkbox"
                />
                <div class="card-body">
                  <div class="label">Subscription</div>
                </div>
              </label>
            </div>
          </div>

          <div class="card card main">
            <div id="stack-publish-step-panel" class="step" data-step="${step}">
              <div class="edu">
                ${stepContent.body}
              </div>
            </div>
          </div>

        </div>

        <div class="actions">
          <div class="actions-left">
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
