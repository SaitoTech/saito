/**
 * Manual block-production peer requests for the Token Supply admin controls.
 * Request names are module-prefixed (`explorer-…`) so routers can attribute them.
 */
const EXPLORER_PRODUCE_BLOCK_REQUEST = 'explorer-new-block-with-no-gt';
const EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST = 'explorer-new-block-with-gt';

/**
 * Whether Explorer may expose / honor manual produce-block controls.
 *
 * Disabled when:
 * - the spam module is installed (automated block/tx generation already owns timing)
 * - consensus.disable_block_production is set (Admin "production"/observer node mode)
 * - NODE_ENV is prod/production on the Node side (deployed hosts that set the env flag)
 */
function allowsManualBlockProduction(app) {
	if (!app) {
		return false;
	}

	if (app.modules?.returnModule('spam')) {
		return false;
	}

	if (app.options?.consensus?.disable_block_production === true) {
		return false;
	}

	// Server-side only: browsers do not reliably see process.env.
	if (app.BROWSER == 0) {
		const nodeEnv = String(process.env.NODE_ENV || '')
			.trim()
			.toLowerCase();
		if (nodeEnv === 'prod' || nodeEnv === 'production') {
			return false;
		}
	}

	return true;
}

module.exports = {
	EXPLORER_PRODUCE_BLOCK_REQUEST,
	EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
	allowsManualBlockProduction,
};
