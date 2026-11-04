/**
 * Named programmable-event helpers for TS Card Generator.
 * Internal editor state uses { id, label, code }. NFT serialization uses
 * a legacy string for one event, or [{ name, code }, ...] for multiple.
 */

function sanitizeCode(value) {
  return String(value ?? '').replace(/\t/g, ' ');
}

function slugify(value, fallback = 'event') {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

function uniqueId(base, existing_ids = [], reserved = null) {
  const used = new Set((existing_ids || []).map((id) => String(id)));
  if (reserved) {
    used.delete(String(reserved));
  }
  let candidate = base || 'event';
  if (!used.has(candidate)) {
    return candidate;
  }
  let n = 2;
  while (used.has(`${base}_${n}`)) {
    n += 1;
  }
  return `${base}_${n}`;
}

function displayLabelFromTitle(title, ordinal = 1) {
  const base = String(title ?? '').trim() || 'Event';
  return ordinal <= 1 ? base : `${base} ${ordinal}`;
}

function createEvent({ title = 'Event', label = null, id = null, code = '', existing_ids = [] } = {}) {
  const ordinal_hint = existing_ids.length + 1;
  const resolved_label = label != null ? String(label) : displayLabelFromTitle(title, ordinal_hint);
  const base = slugify(id || resolved_label || title, 'event');
  return {
    id: uniqueId(base, existing_ids),
    label: resolved_label,
    code: sanitizeCode(code)
  };
}

/**
 * Normalize editor events from card data / NFT payload.
 * Accepts legacy string code or multi-event [{ name, code }] arrays.
 */
function normalizeEvents(data = {}) {
  const title = data.title || data.name || 'Event';
  const raw = data.events != null ? data.events : data.code;

  if (Array.isArray(raw) && raw.length) {
    const events = [];
    raw.forEach((entry, index) => {
      if (typeof entry === 'string') {
        if (!entry.trim() && events.length) {
          return;
        }
        events.push(
          createEvent({
            title,
            label: displayLabelFromTitle(title, index + 1),
            code: entry,
            existing_ids: events.map((item) => item.id)
          })
        );
        return;
      }
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const code = sanitizeCode(entry.code);
      const label =
        entry.label != null
          ? String(entry.label)
          : entry.name != null
            ? String(entry.name).replace(/_/g, ' ')
            : displayLabelFromTitle(title, index + 1);
      events.push(
        createEvent({
          title,
          label,
          id: entry.id || entry.name || label,
          code,
          existing_ids: events.map((item) => item.id)
        })
      );
    });
    if (events.length) {
      return events;
    }
  }

  if (typeof raw === 'string') {
    return [
      createEvent({
        title,
        label: displayLabelFromTitle(title, 1),
        code: raw
      })
    ];
  }

  return [
    createEvent({
      title,
      label: displayLabelFromTitle(title, 1),
      code: ''
    })
  ];
}

/**
 * NFT / deck serialization.
 * - no non-empty scripts → ''
 * - one non-empty script → string (legacy)
 * - multiple → [{ name, code }, ...]
 */
function serializeCode(events = []) {
  const entries = (events || [])
    .map((event) => ({
      name: String(event.id || slugify(event.label || 'event')),
      code: sanitizeCode(event.code)
    }))
    .filter((entry) => entry.code.trim().length > 0);

  if (!entries.length) {
    return '';
  }
  if (entries.length === 1) {
    return entries[0].code;
  }
  return entries;
}

function hasExecutableCode(events = []) {
  return (events || []).some((event) => String(event?.code || '').trim().length > 0);
}

function addEvent(events = [], title = 'Event') {
  const list = Array.isArray(events) ? events.slice() : [];
  const next = createEvent({
    title,
    label: displayLabelFromTitle(title, list.length + 1),
    existing_ids: list.map((event) => event.id)
  });
  list.push(next);
  return { events: list, event: next, index: list.length - 1 };
}

function renameEvent(events = [], index = 0, next_label = '') {
  const list = (events || []).map((event) => ({ ...event }));
  if (!list[index]) {
    return { events: list, event: null };
  }
  const label = String(next_label ?? '').trim() || list[index].label || 'Event';
  const id = uniqueId(
    slugify(label, 'event'),
    list.map((event) => event.id),
    list[index].id
  );
  list[index] = {
    ...list[index],
    label,
    id
  };
  return { events: list, event: list[index] };
}

function removeEvent(events = [], index = 0) {
  const list = Array.isArray(events) ? events.slice() : [];
  if (!list.length || index < 0 || index >= list.length) {
    return { events: list, index: 0, removed: null };
  }
  if (list.length === 1) {
    return { events: list, index: 0, removed: null };
  }
  const removed = list.splice(index, 1)[0];
  const next_index = Math.min(index, list.length - 1);
  return { events: list, index: next_index, removed };
}

/**
 * Build the queue instruction that invokes a code entry on an options.nfts object.
 * Engine format: NFT_EVENT\t<id>\t<index>\t[arg0\t...]
 * index is zero-based into nft.data.code (string at 0, or array entry).
 */
function buildNftEventInstruction(card = {}, event_index = 0) {
  const events = Array.isArray(card.events) ? card.events : [];
  const event = events[event_index] || null;
  const card_slug = slugify(card.title || card.name || 'card', 'card');
  const card_number = String(card.card_id ?? '').trim();
  const code_index = Number.isInteger(event_index) ? event_index : 0;
  const code_label =
    event?.label ||
    (event ? String(event.id || slugify(event.label || 'event')) : `Code ${code_index}`);
  const instruction = ['NFT_EVENT', 'CARD_ID', String(code_index)].join('\t');

  return {
    instruction,
    card_id_token: 'CARD_ID',
    code_index,
    code_label,
    // Backward-compatible aliases used by the help overlay / callers.
    panel_index: code_index,
    panel_label: code_label,
    panel_name: code_label,
    card_slug,
    card_number
  };
}

/**
 * Resolve executable source from NFT/deck code field.
 * selector may be a numeric index or event name for multi-event arrays.
 */
function resolveExecutableCode(code, selector = null) {
  if (typeof code === 'string') {
    return code.trim() ? code : null;
  }
  if (!Array.isArray(code) || !code.length) {
    return null;
  }

  if (selector != null && String(selector) !== '') {
    const key = String(selector);
    const as_index = Number(key);
    if (Number.isInteger(as_index) && String(as_index) === key) {
      const entry = code[as_index];
      const value = typeof entry === 'string' ? entry : entry?.code;
      return typeof value === 'string' && value.trim() ? value : null;
    }
    const named = code.find(
      (entry) => entry && typeof entry === 'object' && String(entry.name) === key
    );
    if (named && typeof named.code === 'string' && named.code.trim()) {
      return named.code;
    }
    return null;
  }

  for (const entry of code) {
    const value = typeof entry === 'string' ? entry : entry?.code;
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

module.exports = {
  sanitizeCode,
  slugify,
  uniqueId,
  displayLabelFromTitle,
  createEvent,
  normalizeEvents,
  serializeCode,
  hasExecutableCode,
  addEvent,
  renameEvent,
  removeEvent,
  buildNftEventInstruction,
  resolveExecutableCode
};
