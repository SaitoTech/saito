const { verifyTransactionSender } = require('./signature');

const CATEGORY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NFT_ID = /^[0-9a-fA-F]{66}$/;
const LISTING_SIGNATURE = /^[0-9a-fA-F]{128}$/;
const MAX_CATEGORIES = 30;
const MAX_NAME = 40;
const FEATURED_LABEL_ID = 'featured';
const DEFAULT_FEATURED_NAME = 'Featured Items';
const MAX_FEATURED = 200;
const RESERVED_IDS = new Set(['admin', 'moderate', 'cache', 'listing', 'category', 'featured', 's']);
const OWNER_FIELDS = ['store_key', 'seller_public_key', 'public_key', 'publickey', 'owner', 'seller'];

const LEGACY_MARKET_CATEGORIES = [
  ['Apps & Games', 'apps-and-games', 'Apps & Games'],
  ['Extensions', 'extensions', 'Extensions'],
  ['Themes', 'themes', 'Themes'],
  ['Image NFTs', 'image-nfts', 'Image NFTs'],
  ['Tokens', 'tokens', 'Tokens'],
  ['Access Keys', 'access-keys', 'Access Keys'],
  ['Merchandise', 'merchandise', 'Merchandise'],
  ['Other', 'other', 'Other']
];

function isCategoryId(value = '') {
  const id = String(value || '');
  return id.length >= 1 && id.length <= 32 && CATEGORY_ID.test(id) && !RESERVED_IDS.has(id);
}

function isNftId(value = '') {
  return NFT_ID.test(String(value || ''));
}

function isListingSignature(value = '') {
  return LISTING_SIGNATURE.test(String(value || ''));
}

function normalizeCategoryId(value = '') {
  const id = String(value || '').trim();
  return isCategoryId(id) ? id : '';
}

function payloadHasOwnerField(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => payloadHasOwnerField(entry));
  }
  return OWNER_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function validateFeaturedName(value, categories = []) {
  const name = String(value == null ? DEFAULT_FEATURED_NAME : value)
    .trim()
    .replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME) {
    throw new Error('Invalid featured name');
  }
  if (
    (Array.isArray(categories) ? categories : []).some(
      (entry) => String(entry?.name || '').trim().toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error('That category already exists');
  }
  return name;
}

function validateCategories(categories) {
  if (!Array.isArray(categories)) {
    throw new Error('Categories must be a list');
  }
  if (categories.length > MAX_CATEGORIES) {
    throw new Error('A store can have at most 30 categories');
  }
  const ids = new Set();
  const names = new Set();
  const clean = [];
  categories.forEach((entry, index) => {
    if (payloadHasOwnerField(entry)) {
      throw new Error('Owner identity fields are not allowed');
    }
    const category_id = String(entry?.category_id || entry?.id || '').trim();
    const name = String(entry?.name || '').trim();
    const listing_order = String(entry?.listing_order || 'newest').trim();
    if (!isCategoryId(category_id)) {
      throw new Error('Invalid category id');
    }
    if (!name || name.length > MAX_NAME) {
      throw new Error('Invalid category name');
    }
    if (name.toLowerCase() === 'featured' || category_id === 'featured') {
      throw new Error('Featured is reserved');
    }
    if (listing_order !== 'newest' && listing_order !== 'alphabetical') {
      throw new Error('Invalid listing order');
    }
    if (ids.has(category_id)) {
      throw new Error('Duplicate category id');
    }
    const name_key = name.toLowerCase();
    if (names.has(name_key)) {
      throw new Error('Duplicate category name');
    }
    ids.add(category_id);
    names.add(name_key);
    clean.push({
      category_id,
      name,
      sort_order: index,
      listing_order
    });
  });
  return clean;
}

function validateFeaturedIds(featured) {
  if (!Array.isArray(featured)) {
    throw new Error('Featured listings must be a list');
  }
  if (featured.length > MAX_FEATURED) {
    throw new Error('A store can feature at most 200 assets');
  }
  const seen = new Set();
  return featured.map((value) => {
    const nft_id = String(value || '').trim().toLowerCase();
    if (!isNftId(nft_id)) {
      throw new Error('Invalid NFT id');
    }
    if (seen.has(nft_id)) {
      throw new Error('Duplicate NFT id');
    }
    seen.add(nft_id);
    return nft_id;
  });
}

function navigationPayload(tx) {
  const message = typeof tx?.returnMessage === 'function' ? tx.returnMessage() : tx?.msg;
  const data = message?.data && typeof message.data === 'object' ? message.data : message;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid payload');
  }
  if (payloadHasOwnerField(data)) {
    throw new Error('Owner identity fields are not allowed');
  }
  return data;
}

function storeKeyForPayload(mod, tx, data, sender) {
  if (!sender) {
    throw new Error('Invalid signature');
  }
  const scope = data.scope == null || data.scope === '' ? '' : String(data.scope);
  if (scope && scope !== 'main') {
    throw new Error('Invalid scope');
  }
  if (scope === 'main') {
    if (typeof mod.isStoreAdmin !== 'function' || !mod.isStoreAdmin(tx)) {
      throw new Error('Unauthorized');
    }
    return '';
  }
  return sender;
}

function verifiedSender(app, tx) {
  const sender = verifyTransactionSender(app, tx);
  if (!sender) {
    throw new Error('Invalid signature');
  }
  return sender;
}

async function receiveModifyStoreNavigation(mod, tx) {
  const sender = verifiedSender(mod?.app, tx);
  const data = navigationPayload(tx);
  const categories = validateCategories(data.categories);
  const store_key = storeKeyForPayload(mod, tx, data, sender);
  const db = mod.warehouse?.db;
  if (!db?.replaceStoreCategories) {
    throw new Error('Store database unavailable');
  }
  const fallback = store_key ? DEFAULT_FEATURED_NAME : 'Featured';
  const featured_name = validateFeaturedName(
    Object.prototype.hasOwnProperty.call(data, 'featured_name') ? data.featured_name : fallback,
    categories
  );
  const featured_visible =
    data.featured_visible === false || data.featured_visible === 0 || data.featured_visible === '0'
      ? 0
      : 1;
  const stored = categories.slice();
  stored.push({
    category_id: FEATURED_LABEL_ID,
    name: featured_name,
    sort_order: -1,
    listing_order: 'newest',
    visible: featured_visible
  });
  await db.replaceStoreCategories(store_key, stored);
  return { ok: 1, store_key, categories, featured_name, featured_visible };
}

async function receiveModifyStoreFeatured(mod, tx) {
  const sender = verifiedSender(mod?.app, tx);
  const data = navigationPayload(tx);
  const featured = validateFeaturedIds(data.featured);
  const store_key = storeKeyForPayload(mod, tx, data, sender);
  const db = mod.warehouse?.db;
  if (!db?.replaceStoreFeatured) {
    throw new Error('Store database unavailable');
  }
  if (store_key) {
    for (const nft_id of featured) {
      const owned = await db.nftHasActiveListing(nft_id, { seller: store_key });
      if (!owned) {
        throw new Error('Featured asset is not an active listing for this store');
      }
    }
  } else {
    const whitelist = mod.returnMarketplaceWhitelist?.() || [];
    for (const nft_id of featured) {
      const eligible = await db.nftHasActiveListing(nft_id, {
        marketplace: { whitelist_sellers: whitelist }
      });
      if (!eligible) {
        throw new Error('Featured asset is not eligible for the main Store');
      }
    }
  }
  await db.replaceStoreFeatured(store_key, featured);
  return { ok: 1, store_key, featured };
}

function parseStorePath(slug = 'store', pathname = '') {
  const empty = {
    publicKey: '',
    admin: false,
    moderate: false,
    category: '',
    featured: false,
    signature: '',
    nft_id: ''
  };
  const base = '/' + String(slug || 'store');
  const path = String(pathname || '');
  if (path !== base && !path.startsWith(`${base}/`)) {
    return empty;
  }
  const segments = path
    .substring(base.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch (err) {
        return segment;
      }
    });

  if (!segments.length) {
    return { ...empty, featured: true };
  }
  if (segments.length === 1 && segments[0] === 'moderate') {
    return { ...empty, moderate: true };
  }
  if (segments.length === 1 && segments[0] === 'cache') {
    return { ...empty, featured: true };
  }
  if (segments.length === 2 && segments[0] === 'listing') {
    return { ...empty, signature: segments[1] };
  }
  if (segments.length === 2 && segments[0] === 'category' && isCategoryId(segments[1])) {
    return { ...empty, category: segments[1], featured: false };
  }
  if (segments.length === 1) {
    return { ...empty, publicKey: segments[0], featured: true };
  }
  if (segments.length === 2 && segments[1] === 'admin') {
    return { ...empty, publicKey: segments[0], admin: true };
  }
  if (segments.length === 2) {
    const tail = segments[1];
    if (isListingSignature(tail)) {
      return { ...empty, publicKey: segments[0], signature: tail };
    }
    if (isNftId(tail)) {
      return { ...empty, publicKey: segments[0], nft_id: tail };
    }
    if (isCategoryId(tail)) {
      return { ...empty, publicKey: segments[0], category: tail, featured: false };
    }
  }
  return empty;
}

module.exports = {
  LEGACY_MARKET_CATEGORIES,
  isCategoryId,
  isNftId,
  isListingSignature,
  normalizeCategoryId,
  payloadHasOwnerField,
  FEATURED_LABEL_ID,
  DEFAULT_FEATURED_NAME,
  validateFeaturedName,
  validateCategories,
  validateFeaturedIds,
  receiveModifyStoreNavigation,
  receiveModifyStoreFeatured,
  parseStorePath
};
