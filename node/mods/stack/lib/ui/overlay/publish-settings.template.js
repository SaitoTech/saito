/**
 * Publish Settings Overlay Template
 *
 * Guided publishing flow: access selector (left) + step content (right).
 * Private / Subscription open a lightweight wizard; Public publishes in one click.
 */
module.exports = (app, mod, postState = {}, wizardState = {}) => {
  const parent_id = mod.create_post_ui && mod.create_post_ui.parent_id ? mod.create_post_ui.parent_id : null;
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
    wizardState.hasAccessKey === true ||
    wizardState.createNftStatus === 'waiting' ||
    wizardState.createNftStatus === 'confirmed';
  const isWaiting = wizardState.createNftStatus === 'waiting';
  const isConfirmed = wizardState.createNftStatus === 'confirmed';
  const isListedInStore = wizardState.isListedInStore === true;

  const getStepContent = () => {
    if (step === 1) {
      if (isPublic) {
        return {
          title: '',
          body: `
            <div class="stack-publish-option-copy">
              <p class="stack-publish-option-heading">Public Post</p>
            </div>
          `
        };
      }
      if (isPrivate) {
        return {
          title: '',
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
          title: '',
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

    if (step === 2) {
      if (isPrivate || isSubscription) {
        const checklistSecondLabel = isWaiting ? `${keyLabel} Created` : `${keysLabel} Created`;
        const createQuantity = wizardState.createQuantity || 1;
        const checklistHtml = `
          <div class="stack-publish-checklist stack-publish-checklist-matrix">
            <div class="stack-publish-check-row stack-publish-check-row-complete">
              <span class="stack-publish-check-mark">✓</span>
              <span>Blog Post Created</span>
            </div>
            <div class="stack-publish-check-row${hasAccessKey ? ' stack-publish-check-row-complete' : ''}">
              <span class="stack-publish-check-mark">${hasAccessKey ? '✓' : '○'}</span>
              <span>${checklistSecondLabel}</span>
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

        if (isWaiting) {
          return {
            title: '',
            body: `
              <div class="stack-publish-waiting-panel">
                ${checklistHtml}
                <div class="stack-publish-waiting-divider"></div>
                <p>Your ${keyLabel} has been broadcast to the Saito network.</p>
                <p>Waiting for confirmation...</p>
                <div class="stack-publish-confirmation-progress" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <p>Estimated confirmation time:</p>
                <p id="stack-publish-countdown" class="stack-publish-countdown">29</p>
                <p>seconds remaining</p>
                <p id="stack-publish-reassurance" class="stack-publish-reassurance">Your wallet will update automatically.</p>
              </div>
            `
          };
        }

        if (isListedInStore) {
          return {
            title: '',
            body: `
              ${checklistHtml}
              <div class="stack-publish-followup-state">
                <p class="stack-publish-followup-heading">Ready to publish</p>
                <ul class="stack-publish-followup-points">
                  <li>Your Store listing will activate once the blockchain confirms it.</li>
                  <li>Go ahead and publish your post.</li>
                </ul>
              </div>
            `
          };
        }

        if (isConfirmed) {
          return {
            title: '',
            body: `
              ${checklistHtml}
              <div class="stack-publish-followup-state">
                <p class="stack-publish-followup-heading">Your ${keysLabel} are in your wallet</p>
                <div class="stack-publish-suggestion">
                  <p class="stack-publish-suggestion-label">Helpful next step</p>
                  <ul class="stack-publish-followup-points">
                    <li>
                      <span id="stack-list-access-key-link" class="saito-anchor stack-publish-inline-link"><span>List your ${keysLabel} on the Saito Store</span></span>
                    </li>
                  </ul>
                </div>
              </div>
            `
          };
        }

        return {
          title: '',
          body: `
            ${checklistHtml}
            ${
              wizardState.createNftStatus === 'cancelled'
                ? `
                  <div class="stack-publish-followup-state">
                    <p class="stack-publish-followup-heading">Having trouble?</p>
                    <ul class="stack-publish-followup-points">
                      <li>You can publish now without creating ${keysLabel}.</li>
                      <li>You can also create Stack ${keyLabel} NFTs later from your wallet.</li>
                    </ul>
                  </div>
                `
                : hasAccessKey
                  ? `
                    <div class="stack-publish-followup-state">
                      <div class="stack-publish-suggestion">
                        <p class="stack-publish-suggestion-label">Helpful next step</p>
                        <ul class="stack-publish-followup-points">
                          <li>
                            <span id="stack-list-access-key-link" class="saito-anchor stack-publish-inline-link"><span>List your ${keysLabel} on the Saito Store</span></span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  `
                  : `
                    <div class="stack-publish-followup-state">
                      <p class="stack-publish-followup-heading">Create ${createQuantity} ${keysLabel}</p>
                      <ul class="stack-publish-followup-points">
                        <li>
                          <span id="stack-create-access-key-link" class="saito-anchor stack-publish-inline-link stack-publish-inline-link-strong"><span>Click here</span></span>
                          to mint them now.
                        </li>
                      </ul>
                    </div>
                  `
            }
          `
        };
      }
      // Fallback (should not reach for public)
      return {
        title: keyLabel,
        body: `
          <p>You'll need a ${keyLabel} for this post.</p>
          <p>We'll help you create one.</p>
        `
      };
    }

    return {
      title: '',
      body: ``
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
  } else {
    primaryAction = 'publish';
  }

  const showBack = isRestricted && step > 1;
  const showPublishImmediately = isRestricted && step === 1;
  const waitingDisabled = isWaiting ? ' disabled' : '';

  const leftActionHtml = (() => {
    if (showBack) {
      return `
        <button id="stack-publish-back-btn" class="stack-publish-back-btn" type="button" aria-label="Back"${waitingDisabled}>
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      `;
    }
    if (showPublishImmediately) {
      return `
        <div id="stack-publish-immediately" class="saito-anchor stack-publish-immediately">
          <span>or skip access controls and publish immediately...</span>
        </div>
      `;
    }
    return `<div class="stack-publish-action-spacer"></div>`;
  })();

  return `
    <div class="stack-publish-overlay">
      <div class="stack-publish-content">
        <div class="stack-publish-header">
          <h3 class="stack-publish-overlay-title">who can read this post?</h3>
          <i
            id="stack-publish-delete-draft-btn"
            class="fa-solid fa-trash stack-publish-delete-draft-icon"
            title="Delete Draft"
            role="button"
            tabindex="0"
          ></i>
        </div>

        <div class="stack-publish-cards">

          <!-- LEFT: ACCESS SELECTION -->
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

          <!-- RIGHT: EXPLANATION / WIZARD STEP -->
          <div class="stack-publish-card stack-publish-card-main${isWaiting ? ' stack-publish-card-main-waiting' : ''}">
            <div id="stack-publish-step-panel" class="stack-publish-step-panel" data-step="${step}">
              ${stepContent.title ? `<h3 class="stack-publish-card-title">${stepContent.title}</h3>` : ''}
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
            class="stack-publish-primary-action-btn${isWaiting ? ' stack-publish-primary-action-btn-disabled' : ''}"
            type="button"
            data-action="${primaryAction}"${waitingDisabled}
          >
            ${primaryLabel}
          </button>
        </div>
      </div>
    </div>
  `;
};
