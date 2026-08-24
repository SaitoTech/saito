const DRAFT_KEY = 'saito:nftstudio:draft:v1';

function loadDraft(storage) {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) {
    return null;
  }

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    draft?.version !== 1 ||
    !['js', 'css'].includes(draft.type) ||
    typeof draft.source !== 'string' ||
    typeof draft.title !== 'string'
  ) {
    return null;
  }
  return draft;
}

function saveDraft(storage, draft) {
  const saved = {
    version: 1,
    title: String(draft.title || ''),
    type: draft.type === 'css' ? 'css' : 'js',
    source: String(draft.source || ''),
    savedAt: new Date().toISOString()
  };
  storage.setItem(DRAFT_KEY, JSON.stringify(saved));
  return saved;
}

module.exports = { DRAFT_KEY, loadDraft, saveDraft };
