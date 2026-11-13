/**
 * Twilight Struggle card data and canvas painter.
 * Ports the drawing logic from the original TS Card Generator.
 */

const {
  normalizeEvents,
  serializeCode,
  hasExecutableCode,
  addEvent,
  renameEvent,
  removeEvent,
  sanitizeCode
} = require('./code-events');

const CARD_WIDTH = 375;
const CARD_HEIGHT = 525;

const LAYOUT = {
  xHeaderAdjustment: 2,
  yCardId: 47,
  yHeader: 32,
  xOps: 66,
  yOps: 80,
  yImage: 90,
  yRemoved: 488,
  titlePadding: 40,
  eventPadding: 4,
  titleLineHeight: 30,
  eventLineHeight: 24,
  maxImageHeight: 150,
  maxImageWidth: 298,
  maxTextWidth: 305,
  cornerRadius: 54,
  background: '#E3F5FF',
  ink: '#211D1E',
  accent: '#DE1C37',
  opsUssr: '#FFFFFF'
};

const DECK_KEYS = ['ew', 'mw', 'lw'];
const DECK_NAMES = ['early', 'mid', 'late'];
const PLAYER_KEYS = ['ussr', 'us', 'both'];
const ASSOCIATION_KEYS = ['USSR', 'USA', 'Neutral'];

const FONT_STACK = {
  regular: 'ts-caslon-regular, "Libre Caslon Text", "Palatino Linotype", Palatino, serif',
  bold: 'ts-caslon-bold, "Libre Caslon Text", "Palatino Linotype", Palatino, serif',
  italic: 'ts-caslon-italic, "Libre Caslon Text", "Palatino Linotype", Palatino, serif'
};

class Card {
  constructor(app, mod, data = {}) {
    this.app = app;
    this.mod = mod;
    this.reset(data);
  }

  reset(data = {}) {
    this.card_id = data.card_id ?? '100';
    this.deck = Number(data.deck ?? 0);
    this.player = this.normalizePlayer(data.player ?? data.association);
    this.ops = data.ops ?? '4';
    this.title = data.title ?? 'Wargames';
    this.font_size = Number(data.font_size ?? 20);
    this.event = data.event ?? '';
    this.event2 = data.event2 ?? '';
    this.event3 = data.event3 ?? '';
    this.pre_text = data.pre_text ?? '';
    this.post_text = data.post_text ?? '';
    this.scoring = Boolean(data.scoring);
    this.removed = Boolean(data.removed);
    this.permanent = Boolean(data.permanent);
    this.non_card = Boolean(data.non_card);
    // Defer default event creation until the Code workspace opens so the
    // first tab can use the current title. Existing payloads still load here.
    this.events = hasCodePayload(data) ? normalizeEvents(data) : [];
    const active_index = Number(data.active_event_index);
    this.active_event_index =
      Number.isInteger(active_index) && active_index >= 0 ? active_index : 0;
    if (this.events.length && this.active_event_index >= this.events.length) {
      this.active_event_index = 0;
    }
    this.img = typeof data.img === 'string' ? data.img : '';
    this.image_style = data.image_style === 'logo' ? 'logo' : 'photo';
    this.image = data.image || null;
    this.image_url = data.image_url || '';
  }

  /**
   * True when the card differs from the default initialization, ignoring
   * empty code tabs created just by opening the editor.
   */
  hasMeaningfulEdits() {
    const current = this.toDraftData();
    current.events = (current.events || []).filter((event) => String(event?.code || '').trim());
    current.active_event_index = 0;

    const fresh = new Card(this.app, this.mod).toDraftData();
    fresh.events = [];
    fresh.active_event_index = 0;

    return Boolean(this.image) || JSON.stringify(current) !== JSON.stringify(fresh);
  }

  toDraftData() {
    return {
      card_id: this.card_id,
      deck: this.deck,
      player: this.player,
      ops: this.ops,
      title: this.title,
      font_size: this.font_size,
      event: this.event,
      event2: this.event2,
      event3: this.event3,
      pre_text: this.pre_text,
      post_text: this.post_text,
      scoring: this.scoring,
      removed: this.removed,
      permanent: this.permanent,
      non_card: this.non_card,
      events: (this.events || []).map((event) => ({
        id: event.id,
        label: event.label,
        code: event.code
      })),
      active_event_index: this.active_event_index || 0,
      img: typeof this.img === 'string' ? this.img : '',
      image_style: this.image_style,
      image_url: this.image_url || ''
    };
  }

  ensureCodeEvents() {
    if (!Array.isArray(this.events) || !this.events.length) {
      this.events = normalizeEvents({ title: this.title, code: '' });
      this.active_event_index = 0;
    }
    if (this.active_event_index < 0 || this.active_event_index >= this.events.length) {
      this.active_event_index = 0;
    }
    return this.events;
  }

  activeEvent() {
    this.ensureCodeEvents();
    return this.events[this.active_event_index];
  }

  getActiveCode() {
    return this.activeEvent()?.code || '';
  }

  setActiveCode(code) {
    const event = this.activeEvent();
    if (!event) {
      return;
    }
    event.code = sanitizeCode(code);
  }

  addCodeEvent() {
    const result = addEvent(this.events, this.title);
    this.events = result.events;
    this.active_event_index = result.index;
    return result.event;
  }

  renameCodeEvent(index, label) {
    const result = renameEvent(this.events, index, label);
    this.events = result.events;
    return result.event;
  }

  removeCodeEvent(index) {
    const result = removeEvent(this.events, index);
    this.events = result.events;
    this.active_event_index = result.index;
    return result.removed;
  }

  serializedCode() {
    return serializeCode(this.events);
  }

  hasExecutableCode() {
    return hasExecutableCode(this.events);
  }

  normalizePlayer(value) {
    if (value === 'ussr' || value === 'us' || value === 'both') {
      return value;
    }
    const index = Number(value);
    if (index === 0) {
      return 'ussr';
    }
    if (index === 1) {
      return 'us';
    }
    return 'both';
  }

  associationIndex() {
    const index = PLAYER_KEYS.indexOf(this.player);
    return index >= 0 ? index : 2;
  }

  deckName() {
    return DECK_NAMES[this.deck] || 'early';
  }

  assembledText() {
    return [this.pre_text, this.event, this.event2, this.event3, this.post_text]
      .map((part) => String(part || '').trim())
      .filter((part) => part.length > 0)
      .join('\n\n');
  }

  headerTemplateUrl() {
    const deck = DECK_KEYS[this.deck];
    const association = ASSOCIATION_KEYS[this.associationIndex()];
    if (!deck || !association) {
      return '/twilight/img/cardgen/error.png';
    }
    return `/twilight/img/cardgen/${deck}${association}.png`;
  }

  titleSlug() {
    const title = String(this.title || 'card')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return title || 'card';
  }

  generatedId() {
    const number = String(this.card_id || '').trim();
    return number ? `${this.titleSlug()}-${number}` : this.titleSlug();
  }

  downloadName() {
    return `${this.titleSlug()}.png`;
  }

  async ensureFonts() {
    if (typeof document === 'undefined' || !document.fonts?.load) {
      return;
    }

    await Promise.all([
      document.fonts.load('28px ts-caslon-bold'),
      document.fonts.load('20px ts-caslon-regular'),
      document.fonts.load('19px ts-caslon-italic'),
      document.fonts.load('18px ts-caslon-italic')
    ]);
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        resolve(null);
        return;
      }

      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
      image.src = src;
    });
  }

  async paint(canvas) {
    if (!canvas) {
      return;
    }

    await this.ensureFonts();

    const ctx = canvas.getContext('2d');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;

    this.paintBackground(ctx);
    ctx.fillStyle = LAYOUT.ink;
    ctx.textAlign = 'center';

    let imageHeight = 0;
    try {
      const art = this.image || (this.image_url ? await this.loadImage(this.image_url) : null);
      if (art) {
        imageHeight = this.paintArt(ctx, art);
      }
    } catch (err) {
      imageHeight = 0;
    }

    try {
      await this.paintHeader(ctx);
    } catch (err) {
      // Header templates missing should not block text.
    }

    this.paintText(ctx, imageHeight);
  }

  paintBackground(ctx) {
    const radius = LAYOUT.cornerRadius;
    ctx.fillStyle = LAYOUT.background;
    ctx.strokeStyle = LAYOUT.background;
    ctx.lineJoin = 'round';
    ctx.lineWidth = radius;
    ctx.strokeRect(radius / 2, radius / 2, CARD_WIDTH - radius, CARD_HEIGHT - radius);
    ctx.fillRect(radius / 2, radius / 2, CARD_WIDTH - radius, CARD_HEIGHT - radius);
  }

  paintArt(ctx, image) {
    const sized = this.fitImage(image.width, image.height);
    const x = (CARD_WIDTH - sized.width) / 2;

    if (this.image_style === 'photo') {
      ctx.beginPath();
      ctx.rect(x, LAYOUT.yImage, sized.width, sized.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'black';
      ctx.stroke();
    }

    ctx.drawImage(image, x, LAYOUT.yImage, sized.width, sized.height);
    return sized.height;
  }

  fitImage(width, height) {
    const maxW = LAYOUT.maxImageWidth;
    const maxH = LAYOUT.maxImageHeight;
    const scale = Math.min(1, maxW / width, maxH / height);
    return {
      width: width * scale,
      height: height * scale
    };
  }

  async paintHeader(ctx) {
    const header = await this.loadImage(this.headerTemplateUrl());
    if (!header) {
      return;
    }

    const x = (CARD_WIDTH - header.width) / 2;
    ctx.drawImage(header, x - LAYOUT.xHeaderAdjustment, LAYOUT.yHeader);

    ctx.fillStyle = this.player === 'ussr' ? LAYOUT.opsUssr : LAYOUT.ink;
    ctx.font = `bold 32px sans-serif`;
    ctx.fillText(String(this.ops ?? ''), LAYOUT.xOps, LAYOUT.yOps);
  }

  paintText(ctx, userImageHeight) {
    const x = CARD_WIDTH / 2;
    let y = LAYOUT.yImage + userImageHeight + LAYOUT.titlePadding;
    let previousLines = 0;
    let previousLineHeight = LAYOUT.titleLineHeight;

    const permanent = this.permanent;
    let title = String(this.title || '').toUpperCase();
    if (this.removed || permanent) {
      title = `${title}*`;
    }

    ctx.font = `28px ${FONT_STACK.bold}`;
    ctx.fillStyle = LAYOUT.ink;
    previousLines = this.wrapText(ctx, title, x, y, LAYOUT.maxTextWidth, LAYOUT.titleLineHeight, permanent);

    if (this.removed || permanent) {
      ctx.fillStyle = LAYOUT.accent;
      ctx.font = `19px ${FONT_STACK.italic}`;
      ctx.fillText('Remove from play if used as an event.', x, LAYOUT.yRemoved);
    }

    let lineHeight = LAYOUT.titleLineHeight;
    previousLineHeight = LAYOUT.titleLineHeight;

    if (this.pre_text) {
      lineHeight = this.lineSize(1);
      previousLineHeight = this.lineSize(1);
      y += previousLines * LAYOUT.titleLineHeight + LAYOUT.eventPadding;
      ctx.fillStyle = LAYOUT.ink;
      ctx.font = this.fontString(FONT_STACK.italic, 1);
      previousLines = this.wrapText(ctx, this.pre_text, x, y, LAYOUT.maxTextWidth, lineHeight, false);
    }

    lineHeight = this.lineSize(0);
    y += previousLines * previousLineHeight + LAYOUT.eventPadding;
    ctx.font = this.fontString(FONT_STACK.regular, 0);
    ctx.fillStyle = LAYOUT.ink;
    previousLines = this.wrapText(ctx, this.event || '', x, y, LAYOUT.maxTextWidth, lineHeight, false);

    if (this.event2) {
      y += previousLines * lineHeight + LAYOUT.eventPadding;
      previousLines = this.wrapText(ctx, this.event2, x, y, LAYOUT.maxTextWidth, lineHeight, false);
    }

    if (this.event3) {
      y += previousLines * lineHeight + LAYOUT.eventPadding;
      previousLines = this.wrapText(ctx, this.event3, x, y, LAYOUT.maxTextWidth, lineHeight, false);
    }

    // All TS-CARD-GEN cards are optional; always mark artwork.
    let cardId = `${String(this.card_id || '')} - OPTIONAL`;
    ctx.font = `14px ${FONT_STACK.regular}`;
    ctx.fillStyle = LAYOUT.ink;
    ctx.fillText(cardId, x, LAYOUT.yCardId);

    if (this.post_text) {
      y += previousLines * lineHeight + LAYOUT.eventPadding;
      ctx.fillStyle = LAYOUT.ink;
      ctx.font = this.fontString(FONT_STACK.italic, 1);
      this.wrapText(ctx, this.post_text, x, y, LAYOUT.maxTextWidth, LAYOUT.eventLineHeight, false);
    }
  }

  fontString(family, offset) {
    return `${this.font_size - offset}px ${family}`;
  }

  lineSize(offset) {
    return this.font_size + 4 - offset;
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight, underline) {
    const words = String(text || '').split(' ');
    let line = '';
    let lines = 1;
    let cursorY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = `${line}${words[n]} `;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && n > 0) {
        line = line.trim();
        this.drawUnderline(ctx, line, x, cursorY, underline);
        ctx.fillText(line, x, cursorY);
        line = `${words[n]} `;
        cursorY += lineHeight;
        lines += 1;
      } else {
        line = testLine;
      }
    }

    line = line.trim();
    this.drawUnderline(ctx, line, x, cursorY, underline);
    ctx.fillText(line, x, cursorY);
    return lines;
  }

  drawUnderline(ctx, line, x, y, underline) {
    if (!underline || !line) {
      return;
    }

    const width = ctx.measureText(line).width;
    const start = x - width / 2;
    ctx.beginPath();
    ctx.moveTo(start + 1, y + 4);
    ctx.lineTo(start + width - 9, y + 4);
    ctx.strokeStyle = LAYOUT.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  toDataURL(canvas) {
    if (!canvas) {
      return '';
    }
    return canvas.toDataURL('image/png');
  }

  /**
   * Immutable plain object for Create NFT create_data / createData.
   * Does not retain Image / live form references.
   */
  buildSnapshot(image_data_url = '') {
    return {
      name: String(this.title || '').trim(),
      scoring: this.scoring ? 1 : 0,
      player: this.normalizePlayer(this.player),
      ops: Number(this.ops) || 0,
      recurring: this.removed ? 0 : 1,
      permanent: this.permanent ? 1 : 0,
      non_card: this.non_card ? 1 : 0,
      deck: this.deckName(),
      text: this.assembledText(),
      // Tabs break game-move queue parsing (\t-delimited); keep code tab-free.
      // One event → string (legacy). Multiple → [{ name, code }, ...].
      code: this.serializedCode(),
      img: typeof this.img === 'string' ? this.img : '',
      image: image_data_url || this.image_url || ''
    };
  }
}

function hasCodePayload(data = {}) {
  if (Array.isArray(data.events) && data.events.length) {
    return true;
  }
  if (typeof data.code === 'string') {
    return data.code.length > 0;
  }
  return Array.isArray(data.code) && data.code.length > 0;
}

Card.WIDTH = CARD_WIDTH;
Card.HEIGHT = CARD_HEIGHT;
Card.NFT_TYPE = 'twilight-nft';

module.exports = Card;
