/**
 * Canonical Store marketplace categories.
 * Single source of truth for browsing labels and persisted category values.
 */
const STORE_CATEGORIES = Object.freeze({
  APPS_AND_GAMES: 'Apps & Games',
  THEMES: 'Themes',
  TOKENS_AND_NFTS: 'Tokens & NFTs',
  ACCESS_KEYS: 'Access Keys',
  MERCHANDISE: 'Merchandise',
  OTHER: 'Other'
});

/** Ordered list for Store navigation / browsing UI. */
const STORE_CATEGORY_LIST = Object.freeze([
  STORE_CATEGORIES.APPS_AND_GAMES,
  STORE_CATEGORIES.THEMES,
  STORE_CATEGORIES.TOKENS_AND_NFTS,
  STORE_CATEGORIES.ACCESS_KEYS,
  STORE_CATEGORIES.MERCHANDISE,
  STORE_CATEGORIES.OTHER
]);

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

function categoryViewKey(category = '') {
  return String(category)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isStoreCategory(category = '') {
  return STORE_CATEGORY_LIST.includes(String(category || ''));
}

function normalizePageSize(page_size) {
  const n = Number(page_size);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

function normalizePage(page) {
  const n = Number(page);
  if (!Number.isFinite(n) || n <= 0) {
    return 1;
  }
  return Math.floor(n);
}

function normalizeOffset(offset) {
  const n = Number(offset);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

/**
 * Protocol / module NFT type → Store category.
 * Unknown and empty types resolve to Other.
 *
 * @param {string} nft_type
 * @returns {string} one of STORE_CATEGORIES values
 */
function mapNFTTypeToCategory(nft_type = '') {
  const type = String(nft_type || '').trim();

  switch (type) {
    case 'image':
    case 'token':
      return STORE_CATEGORIES.TOKENS_AND_NFTS;
    case 'css':
      return STORE_CATEGORIES.THEMES;
    case 'js':
    case 'stack':
    case 'nwasm-nft-mod':
      return STORE_CATEGORIES.APPS_AND_GAMES;
    case 'vault-nft-key':
      return STORE_CATEGORIES.ACCESS_KEYS;
    case 'text':
    case 'json':
    default:
      return STORE_CATEGORIES.OTHER;
  }
}

module.exports = {
  STORE_CATEGORIES,
  STORE_CATEGORY_LIST,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  categoryViewKey,
  isStoreCategory,
  normalizePageSize,
  normalizePage,
  normalizeOffset,
  mapNFTTypeToCategory
};
