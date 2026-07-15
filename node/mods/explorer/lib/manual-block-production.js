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

/**
 * Browser: whether manual block controls may be shown.
 */
function canShowManualBlockControls(app, mod) {
	if (!app || !mod?.enable_manual_testing) {
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
	canShowManualBlockControls,
	allowsManualTestingOnServer,
};
