let SaitoS = require('saito-js/saito');
const S = SaitoS.default || SaitoS;

function toStorage(value) {
	if (value === undefined || value === null) {
		return 0;
	}
	if (typeof value === 'bigint') {
		return value.toString();
	}
	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}
	return value;
}

async function computeSupplyTotals(app, treasury, graveyard, totalFees, previousBlockUnpaid) {
	const data = (await S.getInstance().getBalanceSnapshot([])).toString();
	const parts = data.split(' ');
	const nums = parts
		.slice(1)
		.filter((s) => s.includes('\n'))
		.map((s) => s.split('\n')[0]);
	const utxoTotal = nums.reduce((acc, n) => acc + BigInt(n), BigInt(0));
	const totalSupply =
		utxoTotal +
		BigInt(treasury) +
		BigInt(graveyard) +
		BigInt(totalFees) +
		BigInt(previousBlockUnpaid);

	return {
		utxo: utxoTotal,
		total_supply: totalSupply,
	};
}

async function buildBlockStatistics(app, block) {
	const {
		id,
		hash,
		totalFees,
		totalFeesNew,
		totalFeesAtr,
		totalFeesCumulative,
		avgTotalFees,
		avgTotalFeesNew,
		avgTotalFeesAtr,
		totalPayoutRouting,
		totalPayoutMining,
		totalPayoutTreasury,
		totalPayoutGraveyard,
		totalPayoutAtr,
		avgPayoutRouting,
		avgPayoutMining,
		avgPayoutTreasury,
		avgPayoutGraveyard,
		avgPayoutAtr,
		avgFeePerByte,
		feePerByte,
		avgNolanRebroadcastPerBlock,
		burnFee,
		difficulty,
		previousBlockUnpaid,
		hasGoldenTicket,
		treasury,
		graveyard,
	} = block;

	const stats = {
		block_id: toStorage(id),
		block_hash: hash,
		treasury: toStorage(treasury),
		graveyard: toStorage(graveyard),
		total_fees: toStorage(totalFees),
		total_fees_new: toStorage(totalFeesNew),
		total_fees_atr: toStorage(totalFeesAtr),
		total_fees_cumulative: toStorage(totalFeesCumulative),
		avg_total_fees: toStorage(avgTotalFees),
		avg_total_fees_new: toStorage(avgTotalFeesNew),
		avg_total_fees_atr: toStorage(avgTotalFeesAtr),
		total_payout_routing: toStorage(totalPayoutRouting),
		total_payout_mining: toStorage(totalPayoutMining),
		total_payout_treasury: toStorage(totalPayoutTreasury),
		total_payout_graveyard: toStorage(totalPayoutGraveyard),
		total_payout_atr: toStorage(totalPayoutAtr),
		avg_payout_routing: toStorage(avgPayoutRouting),
		avg_payout_mining: toStorage(avgPayoutMining),
		avg_payout_treasury: toStorage(avgPayoutTreasury),
		avg_payout_graveyard: toStorage(avgPayoutGraveyard),
		avg_payout_atr: toStorage(avgPayoutAtr),
		avg_fee_per_byte: toStorage(avgFeePerByte),
		fee_per_byte: toStorage(feePerByte),
		avg_nolan_rebroadcast_per_block: toStorage(avgNolanRebroadcastPerBlock),
		burn_fee: toStorage(burnFee),
		difficulty: toStorage(difficulty),
		previous_block_unpaid: toStorage(previousBlockUnpaid),
		has_golden_ticket: toStorage(hasGoldenTicket),
	};

	const supply = await computeSupplyTotals(
		app,
		treasury,
		graveyard,
		totalFees,
		previousBlockUnpaid
	);
	stats.utxo = toStorage(supply.utxo);
	stats.total_supply = toStorage(supply.total_supply);

	return stats;
}

module.exports = {
	buildBlockStatistics,
};
