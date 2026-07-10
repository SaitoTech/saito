const LOG_PREFIX = '[Explorer Manual Production]';

function logManualProduction(message) {
	console.log(`${LOG_PREFIX} ${message}`);
}

function logManualProductionError(functionName, err) {
	const message = err?.message || String(err);
	console.error(`${LOG_PREFIX} ERROR in ${functionName}: ${message}`);
	if (err?.stack) {
		console.error(`${LOG_PREFIX} stack: ${err.stack}`);
	}
}

module.exports = {
	logManualProduction,
	logManualProductionError,
};
