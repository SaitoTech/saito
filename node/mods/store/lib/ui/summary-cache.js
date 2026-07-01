const Summary = require('../summary');
const { returnDemoSummaries } = require('../summary');

function syncSummaryCache(mod, data) {
	const summary = data instanceof Summary ? data : new Summary(mod.app, mod, data);
	if (!summary.id) {
		return null;
	}

	mod.summaries[summary.id] = summary;
	return summary;
}

function removeSummaryFromCache(mod, summary_id) {
	delete mod.summaries[summary_id];
}

function getSummariesForSale(mod) {
	const summaries = Object.values(mod.summaries).filter((summary) => summary.isActive());
	if (summaries.length > 0) {
		return summaries;
	}

	return returnDemoSummaries(mod.app, mod);
}

module.exports = {
	syncSummaryCache,
	removeSummaryFromCache,
	getSummariesForSale
};
