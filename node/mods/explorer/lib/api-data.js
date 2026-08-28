const { computeSupplyBuckets } = require('./supply-accounting');

function toDecimalString(value) {
  if (value === undefined || value === null || value === '') {
    return '0';
  }

  return typeof value === 'bigint' ? value.toString() : String(value);
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

async function getUtxoSetValue(app, mod, block) {
  const indexed = await mod?.database?.getStatisticsByBlockHash?.(String(block.hash));
  if (indexed?.calculated_total_supply != null && indexed.calculated_total_supply !== '') {
    return toDecimalString(indexed.calculated_total_supply);
  }

  const supply = await computeSupplyBuckets(app, mod, block);
  return toDecimalString(supply.calculated_total_supply ?? supply.utxo);
}

async function buildExplorerApiData(app, mod) {
  const blocks = await app?.core?.blockchain?.getBlocks?.(1, false);
  const latest = Array.isArray(blocks) && blocks.length ? blocks[0] : null;

  if (!latest?.hash) {
    throw new Error('latest block unavailable');
  }

  return {
    supply: {
      utxo_set_value: await getUtxoSetValue(app, mod, latest),
      treasury: toDecimalString(latest.treasury),
      graveyard: toDecimalString(latest.graveyard)
    },
    blocks: {
      latest_block_id: toSafeNumber(latest.id),
      latest_block_hash: String(latest.hash),
      latest_block_time: toSafeNumber(latest.timestamp),
      latest_block_producer: String(latest.creator || latest.instance?.creator || '')
    }
  };
}

module.exports = {
  buildExplorerApiData,
  getUtxoSetValue,
  toDecimalString,
  toSafeNumber
};
