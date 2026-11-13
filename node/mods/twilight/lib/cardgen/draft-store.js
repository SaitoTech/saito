/**
 * Local draft persistence for the current card being edited.
 * Mirrors the NFT Studio localStorage draft pattern: one key, one working card.
 */

const DRAFT_KEY = 'saito:tscardgen:draft:v1';
const DRAFT_VERSION = 1;

function loadDraft(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }

  let raw;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch (_) {
    return null;
  }
  if (!raw) {
    return null;
  }

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch (_) {
    return null;
  }

  if (!draft || draft.version !== DRAFT_VERSION || !draft.card || typeof draft.card !== 'object') {
    return null;
  }

  return draft;
}

function saveDraft(storage, card_data) {
  if (!storage || typeof storage.setItem !== 'function') {
    throw new Error('Local storage is unavailable');
  }

  const saved = {
    version: DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    card: card_data && typeof card_data === 'object' ? card_data : {}
  };
  const serialized = JSON.stringify(saved);
  storage.setItem(DRAFT_KEY, serialized);
  return { draft: saved, serialized };
}

function clearDraft(storage) {
  if (!storage || typeof storage.removeItem !== 'function') {
    return;
  }
  try {
    storage.removeItem(DRAFT_KEY);
  } catch (_) {
    // Ignore clear failures; a later save will overwrite.
  }
}

module.exports = {
  DRAFT_KEY,
  DRAFT_VERSION,
  loadDraft,
  saveDraft,
  clearDraft
};
