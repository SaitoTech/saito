/**
 * Manual block-production peer requests for the Token Supply admin controls.
 */
const EXPLORER_ENSURE_TEST_MODE_REQUEST = 'explorer-ensure-test-mode';
const EXPLORER_SUBMIT_FEE_TRANSACTION_REQUEST = 'explorer-submit-fee-transaction';
const EXPLORER_PRODUCE_BLOCK_REQUEST = 'explorer-new-block-with-no-gt';
const EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST = 'explorer-new-block-with-gt';

function isSpamInstalled(app) {
  return Boolean(app?.modules?.returnModule('spam'));
}

function isProductionNodeEnv() {
  const nodeEnv = String(process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  return nodeEnv === 'prod' || nodeEnv === 'production';
}

function normalizeHostname(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();

  if (!raw) {
    return '';
  }

  if (raw === '::1' || raw === '[::1]') {
    return '::1';
  }

  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return String(url.hostname || '')
      .replace(/^\[|\]$/g, '')
      .toLowerCase();
  } catch (err) {
    return raw.split('/')[0].split(':')[0];
  }
}

function getManualTestingHost(app) {
  if (app?.BROWSER == 1 && typeof window !== 'undefined') {
    const browserHost = window?.location?.hostname || window?.location?.host;
    if (browserHost) {
      return normalizeHostname(browserHost);
    }
  }

  return normalizeHostname(
    app?.options?.server?.endpoint?.host || app?.options?.server?.host || ''
  );
}

function isAllowedManualTestingHost(host) {
  const hostname = normalizeHostname(host);

  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.includes('staging') ||
    hostname.includes('testnet')
  );
}

/**
 * Browser: whether manual block controls may be shown.
 */
function canShowManualBlockControls(app, mod) {
  if (!app || !mod?.enable_manual_testing) {
    return false;
  }

  if (!isAllowedManualTestingHost(getManualTestingHost(app))) {
    return false;
  }

  if (isSpamInstalled(app)) {
    return false;
  }

  if (app.BROWSER == 0 && isProductionNodeEnv()) {
    return false;
  }

  return true;
}

/**
 * Server: whether Explorer may enter test mode or honor produce requests.
 */
function allowsManualTestingOnServer(app, mod) {
  if (!app || !mod?.enable_manual_testing) {
    return false;
  }

  if (!isAllowedManualTestingHost(getManualTestingHost(app))) {
    return false;
  }

  if (isSpamInstalled(app)) {
    return false;
  }

  if (app.BROWSER == 0 && isProductionNodeEnv()) {
    return false;
  }

  return true;
}

module.exports = {
  EXPLORER_ENSURE_TEST_MODE_REQUEST,
  EXPLORER_SUBMIT_FEE_TRANSACTION_REQUEST,
  EXPLORER_PRODUCE_BLOCK_REQUEST,
  EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
  normalizeHostname,
  getManualTestingHost,
  isAllowedManualTestingHost,
  canShowManualBlockControls,
  allowsManualTestingOnServer
};
