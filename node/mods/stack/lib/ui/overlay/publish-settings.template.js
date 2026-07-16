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
  const hasAccessKey = wizardState.hasAccessKey === true;
  const isListedInStore = wizardState.isListedInStore === true;

  // Persistent Stack options (defaults initialized in mod.load())
  const stackOptions = (mod.load && mod.load()) || app.options.stack || {};
  const hasCreatedKeys = stackOptions.has_created_keys === true;
  const showStatusPanel = hasCreatedKeys;

  const getStepContent = () => {
    if (step === 1) {
      if (isPublic) {
        return {
          title: 'Public',
          body: `
            <p>Anyone can read this article.</p>
            <p>Click to publish immediately to the network.</p>
          `
        };
      }
      if (isPrivate) {
        return {
          title: 'Private',
          body: `
            <p>You control who has access.</p>
            <p>Readers must have an NFT you create to access your posts.</p>
            <p>Click "Next" for help managing Access NFTs.</p>
          `
        };
      }
      if (isSubscription) {
        return {
          title: 'Subscription',
          body: `
            <p>You control who has access.</p>
            <p>Readers must have an NFT Subscription to your content.</p>
            <p>Click "Next" for help managing Subscription NFTs.</p>
          `
        };
      }
    }

    if (step === 2) {
      if (isPrivate) {
        return {
          title: '',
          body: `
            <p>Readers need an Access Key</p>
            <p>It takes about 30 seconds to
              <span id="stack-publish-create-keys-link" class="saito-anchor stack-publish-inline-link"><span>create them and list them on the Saito Store</span></span>.
            </p>
            <div class="stack-publish-checklist">
              <label class="stack-publish-check-row">
                <input type="checkbox" class="stack-publish-status-checkbox" disabled ${hasAccessKey ? 'checked' : ''} />
                <span>Access Keys Created</span>
              </label>
              <label class="stack-publish-check-row">
                <input type="checkbox" class="stack-publish-status-checkbox" disabled ${isListedInStore ? 'checked' : ''} />
                <span>Access Keys Listed on Saito Store</span>
              </label>
            </div>
            <p class="stack-publish-first-time">
              First time user?
              <span id="stack-publish-tokens-link" class="saito-anchor stack-publish-inline-link"><span>Click here</span></span>
              for enough tokens to try this out...
            </p>
            <div
              class="stack-publish-status-panel stack-publish-status-info${showStatusPanel ? '' : ' stack-publish-status-panel-hidden'}"
              id="stack-publish-status-panel"
              data-state="info"
              aria-hidden="${showStatusPanel ? 'false' : 'true'}"
            >
              <div class="stack-publish-status-panel-body"></div>
            </div>
          `
        };
      }
      if (isSubscription) {
        return {
          title: '',
          body: `
            <p>Readers need a Subscription to read your posts.</p>
            <p>Subscriptions are valid for 12 months.</p>
            <p>
              <span id="stack-publish-create-keys-link" class="saito-anchor stack-publish-inline-link"><span>Click here to create as many subscriptions as you need</span></span>.
            </p>
            <div class="stack-publish-checklist">
              <label class="stack-publish-check-row">
                <input type="checkbox" class="stack-publish-status-checkbox" disabled ${hasAccessKey ? 'checked' : ''} />
                <span>Subscription Keys Created</span>
              </label>
              <label class="stack-publish-check-row">
                <input type="checkbox" class="stack-publish-status-checkbox" disabled ${isListedInStore ? 'checked' : ''} />
                <span>Subscription Keys Listed on Saito Store</span>
              </label>
            </div>
            <p class="stack-publish-first-time">
              First time user?
              <span id="stack-publish-tokens-link" class="saito-anchor stack-publish-inline-link"><span>Click here</span></span>
              for enough tokens to try this out...
            </p>
            <div
              class="stack-publish-status-panel stack-publish-status-info${showStatusPanel ? '' : ' stack-publish-status-panel-hidden'}"
              id="stack-publish-status-panel"
              data-state="info"
              aria-hidden="${showStatusPanel ? 'false' : 'true'}"
            >
              <div class="stack-publish-status-panel-body"></div>
            </div>
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

    if (step === 3) {
      if (isListedInStore) {
        return {
          title: 'Store Listing',
          body: `
            <p>Your ${keyLabel} is already listed in the Saito Store.</p>
            <p>Continue to publish your article.</p>
          `
        };
      }
      return {
        title: 'Store Listing',
        body: `
          <p>List your ${keyLabel} in the Saito Store so readers can find it.</p>
          <p>You can skip this and list it later if you prefer.</p>
        `
      };
    }

    // Step 4 — ready to publish
    return {
      title: 'Ready to publish',
      body: `
        <p>Your access setup looks good.</p>
        <p>Publish when you're ready.</p>
      `
    };
  };

  const stepContent = getStepContent();

  let primaryLabel = publishButtonText;
  let primaryAction = 'publish';
  if (isRestricted) {
    if (step < 4) {
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

  const leftActionHtml = (() => {
    if (showBack) {
      return `
        <button id="stack-publish-back-btn" class="saito-button-secondary stack-publish-back-btn" type="button">
          Back
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
          <h3 class="stack-publish-overlay-title">Who can read this post?</h3>
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
                  class="stack-publish-access-checkbox"
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
                  class="stack-publish-access-checkbox"
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
                  class="stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Subscription</div>
                </div>
              </label>
            </div>
          </div>

          <!-- RIGHT: EXPLANATION / WIZARD STEP -->
          <div class="stack-publish-card stack-publish-card-main">
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
            class="stack-publish-primary-action-btn"
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
