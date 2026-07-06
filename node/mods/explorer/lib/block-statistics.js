const { buildBlockSupplyStats } = require('./supply-accounting');

async function buildBlockStatistics(app, mod, block) {
	return buildBlockSupplyStats(app, mod, block);
}

module.exports = {
	buildBlockStatistics,
};
