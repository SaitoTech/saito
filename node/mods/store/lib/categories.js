/**
 * Canonical Store marketplace categories.
 * Single source of truth for browsing labels and persisted category values.
 */
const STORE_CATEGORIES = Object.freeze({
  APPS_AND_GAMES: 'Apps & Games',
  EXTENSIONS: 'Extensions',
  THEMES: 'Themes',
  IMAGE_NFTS: 'Image NFTs',
  TOKENS: 'Tokens',
  ACCESS_KEYS: 'Access Keys',
  MERCHANDISE: 'Merchandise',
  OTHER: 'Other'
});

/** Ordered list for Store navigation / browsing UI. */
const STORE_CATEGORY_LIST = Object.freeze([
  STORE_CATEGORIES.APPS_AND_GAMES,
  STORE_CATEGORIES.EXTENSIONS,
  STORE_CATEGORIES.THEMES,
  STORE_CATEGORIES.IMAGE_NFTS,
  STORE_CATEGORIES.TOKENS,
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
      return STORE_CATEGORIES.IMAGE_NFTS;
    case 'token':
      return STORE_CATEGORIES.TOKENS;
    case 'css':
      return STORE_CATEGORIES.THEMES;
    case 'js':
      return STORE_CATEGORIES.EXTENSIONS;
    case 'stack':
    case 'nwasm-nft-mod':
      return STORE_CATEGORIES.APPS_AND_GAMES;
    case 'vault-nft-key':
    case 'vault-nft-rental':
    case 'store-nft-rental':
      return STORE_CATEGORIES.ACCESS_KEYS;
    case 'text':
    case 'json':
    default:
      return STORE_CATEGORIES.OTHER;
  }
}

/**
 * Vault rental NFT that the Store RENT picker lists as rental source inventory.
 * Exact type only — not vault-nft-key / vault masters, not store-nft-rental.
 */
function isVaultRentalNftType(nft_type = '') {
  return (
    String(nft_type || '')
      .trim()
      .toLowerCase() === 'vault-nft-rental'
  );
}

/**
 * NFTs eligible for the Store SELL picker.
 * Vault rental NFTs are RENT-only; Store disposable rentals are not ordinary sell stock.
 */
function isSellableNftType(nft_type = '') {
  const type = String(nft_type || '')
    .trim()
    .toLowerCase();
  if (type === 'vault-nft-rental') {
    return false;
  }
  if (type === 'store-nft-rental') {
    return false;
  }
  return true;
}

/**
 * Buyer-facing rental listing detection from summary + listing txmsg.listing.
 */
function isStoreRentalListing(summary = {}, listing_meta = {}) {
  if (String(listing_meta?.listing_mode || '').toLowerCase() === 'rent') {
    return true;
  }
  const nft_type =
    (typeof summary?.nft?.returnType === 'function' ? summary.nft.returnType() : '') ||
    summary?.nft?.nft_type ||
    summary?.productType ||
    '';
  return String(nft_type).trim().toLowerCase() === 'store-nft-rental';
}

function normalizeListingMode(mode = 'sell') {
  return String(mode || '').toLowerCase() === 'rent' ? 'rent' : 'sell';
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
  mapNFTTypeToCategory,
  isVaultRentalNftType,
  isSellableNftType,
  isStoreRentalListing,
  normalizeListingMode
};
