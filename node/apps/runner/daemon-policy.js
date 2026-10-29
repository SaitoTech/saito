const { createHash } = require('node:crypto');
const INVITE_LIFETIME = 2000000; // Arcade's open-invite lifetime.

function compatible(record, games, publicKey, now = Date.now()) {
  const tx = record?.tx, m = tx?.returnMessage?.() || tx?.msg, o = m?.options || {};
  if (!tx?.signature || !m || !games.includes(m.game) || m.module !== 'Arcade') return false;
  if (record.is_sender_reachable === false) return false;
  if (!['open', 'private'].includes(m.request) || !['open', 'private', 'mine'].includes(record.status)) return false;
  if (!Array.isArray(m.players) || m.players.length !== 1 || Number(m.players_needed) !== 2) return false;
  const host = m.originator || m.players[0];
  if (host === publicKey || host !== m.players[0] || tx.from?.[0]?.publicKey !== host) return false;
  const timestamp = Number(m.timestamp || tx.timestamp);
  if (!Number.isFinite(timestamp) || timestamp > now + 30000 || now - timestamp >= INVITE_LIFETIME) return false;
  if (o.desired_opponent_publickey && o.desired_opponent_publickey !== publicKey) return false;
  if (m.request === 'private' && o.desired_opponent_publickey !== publicKey && !tx.isTo?.(publicKey)) return false;
  if ((o.stake && Number(o.stake) !== 0) || o.async_dealing || o['open-table'] || Number(o.turn_limit || 0) !== 0) return false;
  if (m.game === 'Twilight' && o.deck && o.deck !== 'original') return false;
  if (m.game === 'Settlers') {
    const length = Number(o.game_length ?? 10);
    if (!Number.isInteger(length) || length < 5 || length > 20) return false;
  }
  return true;
}

function reply(text, code) {
  // Browser Chat sends HTML. Keep parsing deliberately narrow; prose, quotations
  // and quoted messages must not accidentally approve a game.
  const plain = text.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim().toLowerCase();
  const match = /^(yes|no)(?:\s+([a-f0-9]{12}))?[.!]?$/.exec(plain);
  // Continue accepting coded replies to questions sent by an older runner.
  if (!match || (match[2] && match[2] !== code)) return null;
  return match[1] === 'yes';
}

class DaemonPolicy {
  constructor(runtime, config, report = () => {}) {
    this.runtime = runtime; this.config = config.daemon; this.report = report;
    const { app } = runtime;
    this.state = app.options.runnerDaemon ||= { invites: {} };
    this.state.invites ||= {};
  }
  save() { this.runtime.app.storage.saveOptions(); }

  async tick(now = Date.now()) {
    const { app, arcade, chat } = this.runtime, cfg = this.config;
    const key = app.options.wallet.publicKey;
    const available = Object.values(arcade.invites).filter(r => compatible(r, cfg.games, key, now));
    for (const record of available) {
      const tx = record.tx, m = tx.returnMessage();
      if (!this.state.invites[tx.signature]) {
        this.state.invites[tx.signature] = { id: tx.signature, game: m.game, host: m.players[0],
          createdAt: Number(m.timestamp || tx.timestamp), firstSeen: now, status: 'waiting',
          code: createHash('sha256').update(tx.signature).digest('hex').slice(0, 12) };
        this.report({ event: 'invite-seen', id: tx.signature, game: m.game });
        this.save();
      }
    }
    const ids = new Set(available.map(r => r.tx.signature));
    for (const [id, entry] of Object.entries(this.state.invites)) {
      if (!ids.has(id) && ['waiting', 'asked', 'approved'].includes(entry.status)) {
        entry.status = 'unavailable'; this.save();
      }
      if (now - entry.createdAt > INVITE_LIFETIME * 2 && id !== this.state.active?.id) {
        delete this.state.invites[id]; this.save();
      }
    }
    // Only one invitation is being discussed at a time.
    const entries = Object.values(this.state.invites).filter(e => ids.has(e.id))
      .sort((a, b) => a.firstSeen - b.firstSeen || a.id.localeCompare(b.id));
    const entry = entries.find(e => e.status === 'asked' || e.status === 'approved') ||
      entries.find(e => e.status === 'waiting');
    if (!entry) return null;
    if (cfg.mode === 'delay') {
      if (now < entry.firstSeen + cfg.joinDelayMs) return null;
    } else {
      if (entry.status === 'waiting') {
        entry.status = 'asked'; entry.askedAt = now;
        // Persist before sending: a crash must not repeat a question to a person.
        this.save();
        await chat.send(entry.host, 'direct', this.question(entry));
        this.report({ event: 'consent-requested', id: entry.id, channel: 'direct', code: entry.code });
      }
      if (now >= entry.askedAt + cfg.consentTimeoutMs) {
        entry.status = 'expired'; this.save();
        this.report({ event: 'consent-expired', id: entry.id }); return null;
      }
      if (cfg.community && !entry.communityAsked && chat.presentSince(entry.host, entry.createdAt)) {
        entry.communityAsked = now; this.save();
        await chat.send(entry.host, 'community', this.question(entry));
        this.report({ event: 'consent-requested', id: entry.id, channel: 'community', code: entry.code });
      }
      for (const message of chat.messages) {
        const askedAt = message.channel === 'community' ? entry.communityAsked : entry.askedAt;
        if (entry.status !== 'asked' || message.sender !== entry.host || message.timestamp < askedAt ||
          message.timestamp > now + 30000 || (message.channel === 'community' && (!cfg.community || !entry.communityAsked))) continue;
        const answer = reply(message.text, entry.code);
        if (answer === null) continue;
        entry.status = answer ? 'approved' : 'declined'; this.save();
        await chat.send(entry.host, message.channel, answer ?
          `Thanks! I'll try to join your ${entry.game} invite now.` :
          `Understood. I'll leave your ${entry.game} invite for someone else.`);
        this.report({ event: answer ? 'consent-approved' : 'consent-declined', id: entry.id, channel: message.channel });
      }
      if (entry.status !== 'approved') return null;
    }
    // The session process performs a fresh availability check before signing a join.
    entry.status = 'selected';
    this.state.active = { id: entry.id, game: entry.game, joined: false };
    this.save();
    return this.state.active;
  }

  question(entry) {
    return `I am a bot. Should I take your ${entry.game} invite? Reply yes or no.`;
  }
}
module.exports = { DaemonPolicy, compatible, reply, INVITE_LIFETIME };
