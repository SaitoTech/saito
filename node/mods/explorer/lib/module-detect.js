const { formatTransactionTypeName } = require('./transaction-types');

const REQUEST_TO_MODULE = {
  'chat message': 'Chat',
  'chat history': 'Chat',
  'request blocks': 'Explorer',
  'request block': 'Explorer',
  'request transaction': 'Explorer',
  'request supply': 'Explorer',
  'request address': 'Explorer',
  send: 'Wallet',
  receive: 'Wallet',
  registry: 'Registry',
  'registry lookup': 'Registry',
  register: 'Registry',
  record: 'Registry',
  store: 'Store',
  'store purchase': 'Store',
  purchase: 'Store',
  buy: 'Store',
  sell: 'Store',
  'arcade create': 'Arcade',
  'arcade accept': 'Arcade',
  gamemove: 'Arcade',
  game: 'Arcade',
  relay: 'Relay',
  email: 'Email',
  archive: 'Archive',
  post: 'RedSquare',
  like: 'RedSquare',
  repost: 'RedSquare'
};

function detectTransactionModule(tx) {
  const txType = tx?.type ?? tx?.transaction_type;
  const typeName = formatTransactionTypeName(txType);

  if (typeName === 'Fee') return 'Fee';
  if (typeName === 'GoldenTicket') return 'GoldenTicket';
  if (typeName === 'ATR') return 'ATR';
  if (typeName === 'Issuance') return 'Issuance';
  if (typeName === 'BlockStake') return 'BlockStake';

  const msg = tx?.msg;
  if (msg && typeof msg === 'object') {
    if (msg.module && typeof msg.module === 'string') {
      return capitalizeFirst(msg.module);
    }

    if (msg.request && typeof msg.request === 'string') {
      const lower = msg.request.toLowerCase();
      if (REQUEST_TO_MODULE[lower]) {
        return REQUEST_TO_MODULE[lower];
      }
    }
  }

  if (typeName !== 'Normal' && typeName !== 'Unknown') {
    return typeName;
  }

  return 'Unknown';
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Consensus-level transaction categories. These are produced by the protocol
// itself (block fee distribution, golden tickets, ATR rebroadcasts, issuance,
// block staking) rather than an application module, so they are excluded from
// the "Most Popular Modules" ranking.
const NON_MODULE_CATEGORIES = new Set(['Fee', 'GoldenTicket', 'ATR', 'Issuance', 'BlockStake']);

// Canonical Saito Wiki pages for application modules. Entries left as null are
// rendered as plain text until a URL is supplied, so links can be filled in
// later without any UI changes. Do not invent URLs here.
const MODULE_WIKI_URLS = {
  RedSquare: null,
  Twilight: null,
  Arcade: null,
  Registry: null,
  Store: null,
  Chat: null,
  Wallet: null,
  Email: null,
  Relay: null,
  Archive: null,
  Explorer: null
};

function moduleWikiUrl(moduleName) {
  if (!moduleName) {
    return null;
  }
  const url = MODULE_WIKI_URLS[moduleName];
  return typeof url === 'string' && url ? url : null;
}

// Rank application modules by how many of the supplied recent transactions they
// account for. Consensus-level categories are excluded so the ranking reflects
// genuine application activity. Percentages are relative to the module-attributed
// transactions in the sample (a rolling window of recently loaded blocks), so
// they are estimates over that window rather than the whole chain.
function summarizeModulePopularity(transactions = [], options = {}) {
  const limit = options.limit ?? 6;
  const counts = new Map();
  let total = 0;

  for (let i = 0; i < transactions.length; i++) {
    const name = detectTransactionModule(transactions[i]) || 'Unknown';
    if (NON_MODULE_CATEGORIES.has(name)) {
      continue;
    }
    counts.set(name, (counts.get(name) || 0) + 1);
    total++;
  }

  const rows = Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      wikiUrl: moduleWikiUrl(name)
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    total,
    rows: limit ? rows.slice(0, limit) : rows
  };
}

module.exports = {
  detectTransactionModule,
  summarizeModulePopularity,
  moduleWikiUrl,
  MODULE_WIKI_URLS,
  NON_MODULE_CATEGORIES
};
