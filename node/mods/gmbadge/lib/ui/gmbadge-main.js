'use strict';

const BadgeSVG = require('../badge-svg');
const Streaks = require('../streaks');

//
// The badge screen: your badge, your numbers, say gm / mint, leaderboard.
// Renders into a container selector so it works both as the /gmbadge page
// (node mode) and inside an overlay (installed-app mode).
//
class GMBadgeMain {
  constructor(app, mod, container = '.gmbadge-page') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.sending = false;
    this.minting = false;
    this.notice = '';
    this.badge = null; // own gm NFT entry, if any
  }

  targetKey() {
    const param = this.app.browser.returnURLParameter?.('key');
    return param && param.length > 20 ? param : this.mod.publicKey;
  }

  async render() {
    let el = document.querySelector(this.container);
    if (!el && this.container === '.gmbadge-page') {
      this.app.browser.addElementToDom('<div class="gmbadge-page"></div>');
      el = document.querySelector(this.container);
    }
    if (!el) {
      return;
    }
    if (this.badge === null) {
      this.badge = (await this.mod.ownBadge()) || false;
    }
    el.innerHTML = this.template();
    this.attachEvents();
  }

  template() {
    const key = this.targetKey();
    const mine = key === this.mod.publicKey;
    const state = this.mod.states[key] || null;
    const v = this.mod.viewFor(key) || Streaks.view(null, this.mod.today);
    const name = this.app.keychain.returnUsername(key) || key;
    const esc = (s) => this.app.browser.escapeHTML(String(s == null ? '' : s));
    const p2p = this.mod.mode === 'p2p';
    const loading = p2p && !state;

    const big = BadgeSVG.render({
      tier: v.tier,
      streak: v.streak,
      serial: v.serial,
      issuer: this.mod.issuer || (mine && this.badge ? this.mod.publicKey : ''),
      sig: state?.badge_sig || (mine && this.badge ? this.badge.tx_sig : '') || '',
      cracked: v.cracked,
      dormant: v.dormant,
      size: 180
    });

    let status = '';
    if (loading) {
      status = 'Reading gm history from the chain…';
    } else if (v.cracked) {
      status = `Streak broken. You had ${v.lost_streak}. Say gm today to start again.`;
    } else if (v.dormant) {
      status = 'Dormant. Say gm to wake your badge.';
    } else if (v.posted_today) {
      status = `gm'd today. ${v.next_milestone ? `${v.days_to_next} day${v.days_to_next === 1 ? '' : 's'} to ${Streaks.tierFor(v.next_milestone).label}.` : 'Max tier.'}`;
    } else if (v.at_risk) {
      status = 'You have not said gm yet today. Say it before midnight UTC or the streak cracks.';
    } else if (p2p) {
      status = 'No gm yet. Say gm once in Red Square, then mint your badge right here.';
    } else {
      status = 'No badge yet. Say gm once in Red Square and your badge is minted to your wallet.';
    }

    let verify = '';
    if (state && state.source === 'index' && state.serial != null) {
      verify = `<div class="gmbadge-verify"><span class="gmbadge-verify-ok">&#10003; verified on-chain</span> issued by <code>${esc((this.mod.issuer || '').slice(0, 12))}&hellip;</code>${state.badge_sig ? ` &middot; mint tx <code>${esc(String(state.badge_sig).slice(0, 12))}&hellip;</code>` : ' &middot; mint pending'} &middot; serial <code>#${esc(state.serial)}</code></div>`;
    } else if (state && state.lifetime > 0) {
      verify = `<div class="gmbadge-verify"><span class="gmbadge-verify-ok">&#10003; verified from ${esc(state.lifetime)} on-chain gm post${state.lifetime === 1 ? '' : 's'}</span>${mine && this.badge ? ` &middot; badge in wallet <code>${esc(String(this.badge.id || '').slice(0, 12))}&hellip;</code>` : mine ? ' &middot; no badge minted yet' : ''}<span class="gmbadge-mode">p2p · no server</span></div>`;
    }

    let buttons = '';
    if (mine) {
      buttons += v.posted_today
        ? `<button class="saito-button-primary gmbadge-say" disabled>gm'd today</button>`
        : `<button class="saito-button-primary gmbadge-say"${this.sending ? ' disabled' : ''}>${this.sending ? 'sending gm…' : 'say gm'}</button>`;
      if (p2p && state && state.lifetime > 0 && !this.badge) {
        buttons += `<button class="saito-button-secondary gmbadge-mint"${this.minting ? ' disabled' : ''}>${this.minting ? 'minting…' : 'mint my badge'}</button>`;
      }
    }

    const rows = this.mod
      .leaderboard(100)
      .map((row, i) => {
        const rv = Streaks.view(row, this.mod.today);
        const small = BadgeSVG.render({
          tier: rv.tier,
          streak: rv.streak,
          serial: rv.serial,
          cracked: rv.cracked,
          dormant: rv.dormant,
          size: 28,
          label: false
        });
        const rname = this.app.keychain.returnUsername(row.publickey) || row.publickey;
        return (
          `<li class="gmbadge-row${row.publickey === this.mod.publicKey ? ' gmbadge-row-self' : ''}" data-id="${esc(row.publickey)}">` +
          `<span class="gmbadge-rank">${i + 1}</span>` +
          `<span class="gmbadge-row-badge">${small}</span>` +
          `<span class="gmbadge-row-name" title="${esc(row.publickey)}">${esc(rname)}</span>` +
          `<span class="gmbadge-row-streak">${rv.streak}</span>` +
          `<span class="gmbadge-row-lifetime">${rv.lifetime}</span>` +
          `<span class="gmbadge-row-serial">${row.serial != null ? '#' + esc(row.serial) : '—'}</span>` +
          `</li>`
        );
      })
      .join('');

    return `
      <section class="gmbadge-hero">
        <div class="gmbadge-hero-badge">${big}</div>
        <div class="gmbadge-hero-body">
          <div class="gmbadge-hero-kicker">gm streak badge</div>
          <h1 class="gmbadge-hero-name" title="${esc(key)}">${esc(name)}</h1>
          <div class="gmbadge-hero-tier">${esc(v.cracked ? 'Cracked' : v.tier.label)}${v.serial != null ? ` · badge #${esc(v.serial)}` : ''}</div>
          <div class="gmbadge-stats">
            <div class="gmbadge-stat"><span class="gmbadge-stat-n">${v.streak}</span><span class="gmbadge-stat-l">current</span></div>
            <div class="gmbadge-stat"><span class="gmbadge-stat-n">${v.longest}</span><span class="gmbadge-stat-l">longest</span></div>
            <div class="gmbadge-stat"><span class="gmbadge-stat-n">${v.lifetime}</span><span class="gmbadge-stat-l">lifetime gms</span></div>
            <div class="gmbadge-stat"><span class="gmbadge-stat-n">${v.first_date ? esc(v.first_date) : '—'}</span><span class="gmbadge-stat-l">first gm</span></div>
          </div>
          <p class="gmbadge-status">${esc(status)}</p>
          ${verify}
          ${this.notice ? `<p class="gmbadge-notice">${esc(this.notice)}</p>` : ''}
          <div class="gmbadge-actions">${buttons}<a class="gmbadge-link" href="/redsquare">open Red Square</a></div>
        </div>
      </section>

      <section class="gmbadge-rules">
        <h2>How it works</h2>
        <ul>
          <li>Post <b>gm</b> in Red Square once per UTC day. ${p2p ? 'Your first gm lets you mint your badge from your own wallet.' : 'Your first gm mints a badge NFT to your wallet with a serial number. Earlier is lower.'}</li>
          <li>Tiers: Sprout (day 1), <b>Green Check</b> (day 7), Gold Ring (day 30), Diamond (day 100), Flame (day 365).</li>
          <li>Miss a day and the badge cracks for 24 hours, then restarts at day 1. Lifetime gms never reset.</li>
          <li>Every gm is an on-chain Red Square post, so anyone can recompute your streak. The badge cannot be bought.</li>
          <li><b>Security.</b> ${p2p ? 'Your wallet reads gm history straight from the chain and draws the tier from that, never from the NFT image. A badge whose holder has no gm history, or that was not minted by its holder, renders as counterfeit.' : 'A real badge is minted only by the issuer key and carries your serial. Wallets check the creator key on the NFT itself and flag anything else as counterfeit.'} The art carries a Saito-cube micro matrix, micro text, and a micro-printed serial line like the classic green check.</li>
        </ul>
      </section>

      <section class="gmbadge-board">
        <h2>Leaderboard${p2p ? ' <span class="gmbadge-mode">people seen in this session</span>' : ''}</h2>
        <div class="gmbadge-board-head"><span>#</span><span></span><span>who</span><span>streak</span><span>lifetime</span><span>badge</span></div>
        <ol class="gmbadge-list">${rows || '<li class="gmbadge-empty">No gms yet. Be the first.</li>'}</ol>
      </section>
    `;
  }

  attachEvents() {
    const el = document.querySelector(this.container);
    if (!el) {
      return;
    }
    const say = el.querySelector('.gmbadge-say');
    if (say && !say.disabled) {
      say.onclick = async () => {
        await this.sayGm();
      };
    }
    const mint = el.querySelector('.gmbadge-mint');
    if (mint && !mint.disabled) {
      mint.onclick = async () => {
        this.minting = true;
        this.notice = '';
        await this.render();
        const res = await this.mod.mintMyBadge();
        this.minting = false;
        this.notice = res.reason;
        if (res.ok) {
          this.badge = null; // re-check after confirmation
          setTimeout(() => this.render(), 60000);
        }
        await this.render();
      };
    }
    el.querySelectorAll('.gmbadge-row').forEach((row) => {
      row.onclick = () => {
        const key = row.getAttribute('data-id');
        window.location.href = `/gmbadge?key=${encodeURIComponent(key)}`;
      };
    });
  }

  async sayGm() {
    const redsquare = this.app.modules.returnModule('RedSquare');
    if (!redsquare || typeof redsquare.createTweetTransaction !== 'function') {
      this.notice = 'Red Square is not loaded in this wallet. Open /redsquare and post gm there.';
      await this.render();
      return;
    }
    try {
      this.sending = true;
      this.notice = '';
      await this.render();
      const tx = await redsquare.createTweetTransaction({ text: 'gm' });
      await tx.sign();
      await this.app.network.propagateTransaction(tx);
      this.notice = 'gm sent. It counts once the block confirms (about a minute).';
      setTimeout(() => this.mod.refreshStates(), 45000);
      setTimeout(() => this.mod.refreshStates(), 120000);
    } catch (err) {
      console.error('GMBadge: say gm failed', err);
      this.notice = 'Could not send gm. Check that your wallet has a little SAITO for the fee.';
    } finally {
      this.sending = false;
      await this.render();
    }
  }
}

module.exports = GMBadgeMain;
