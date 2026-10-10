'use strict';

const BadgeSVG = require('../badge-svg');
const Streaks = require('../streaks');

//
// The /gmbadge page: your badge, your numbers, a "say gm" button,
// and the leaderboard.
//
class GMBadgeMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.leaderboard = [];
    this.sending = false;
    this.notice = '';
  }

  targetKey() {
    const param = this.app.browser.returnURLParameter('key');
    return param && param.length > 20 ? param : this.mod.publicKey;
  }

  async render() {
    if (!document.querySelector('.gmbadge-page')) {
      this.app.browser.addElementToDom('<div class="gmbadge-page"></div>');
    }
    const page = document.querySelector('.gmbadge-page');
    page.innerHTML = this.template();
    this.attachEvents();
  }

  template() {
    const key = this.targetKey();
    const mine = key === this.mod.publicKey;
    const v = this.mod.viewFor(key) || Streaks.view(null, this.mod.today);
    const name = this.app.keychain.returnUsername(key) || key;
    const esc = (s) => this.app.browser.escapeHTML(String(s == null ? '' : s));

    const state = this.mod.states[key] || null;
    const big = BadgeSVG.render({
      tier: v.tier,
      streak: v.streak,
      serial: v.serial,
      issuer: this.mod.issuer,
      sig: state?.badge_sig || '',
      cracked: v.cracked,
      dormant: v.dormant,
      size: 180
    });
    const verify = state
      ? `<div class="gmbadge-verify"><span class="gmbadge-verify-ok">&#10003; verified on-chain</span> issued by <code>${esc((this.mod.issuer || '').slice(0, 12))}&hellip;</code>${state.badge_sig ? ` &middot; mint tx <code>${esc(String(state.badge_sig).slice(0, 12))}&hellip;</code>` : ' &middot; mint pending'} &middot; serial <code>#${esc(state.serial)}</code></div>`
      : '';

    let status = '';
    if (v.cracked) {
      status = `Streak broken. You had ${v.lost_streak}. Say gm today to start again.`;
    } else if (v.dormant) {
      status = 'Dormant. Say gm to wake your badge.';
    } else if (v.posted_today) {
      status = `gm'd today. ${v.next_milestone ? `${v.days_to_next} day${v.days_to_next === 1 ? '' : 's'} to ${Streaks.tierFor(v.next_milestone).label}.` : 'Max tier.'}`;
    } else if (v.at_risk) {
      status = 'You have not said gm yet today. Say it before midnight UTC or the streak cracks.';
    } else {
      status = 'No badge yet. Say gm once in Red Square and your badge is minted to your wallet.';
    }

    const button = !mine
      ? ''
      : v.posted_today
        ? `<button class="saito-button-primary gmbadge-say" disabled>gm'd today</button>`
        : `<button class="saito-button-primary gmbadge-say"${this.sending ? ' disabled' : ''}>${this.sending ? 'sending gm…' : 'say gm'}</button>`;

    const rows = this.leaderboard
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
          `<span class="gmbadge-row-serial">#${row.serial != null ? esc(row.serial) : '—'}</span>` +
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
          <div class="gmbadge-actions">${button}<a class="gmbadge-link" href="/redsquare">open Red Square</a></div>
        </div>
      </section>

      <section class="gmbadge-rules">
        <h2>How it works</h2>
        <ul>
          <li>Post <b>gm</b> in Red Square once per UTC day. Your first gm mints a badge NFT to your wallet with a serial number. Earlier is lower.</li>
          <li>Tiers: Sprout (day 1), <b>Green Check</b> (day 7), Gold Ring (day 30), Diamond (day 100), Flame (day 365).</li>
          <li>Miss a day and the badge cracks for 24 hours, then restarts at day 1. Lifetime gms never reset.</li>
          <li>Every gm is an on-chain Red Square post, so anyone can recompute your streak. The badge cannot be bought.</li>
          <li><b>Security.</b> A real badge is minted only by the issuer key and carries your serial. Wallets check the creator key on the NFT itself and flag anything else as counterfeit. Badges next to names are drawn from the chain index, never from an NFT image, so a fake can never show up in the feed. The art also carries a micro matrix, micro text, and a micro-printed serial line (<code>gm-serial-issuer-txsig</code>) like the classic green check.</li>
        </ul>
      </section>

      <section class="gmbadge-board">
        <h2>Leaderboard</h2>
        <div class="gmbadge-board-head"><span>#</span><span></span><span>who</span><span>streak</span><span>lifetime</span><span>badge</span></div>
        <ol class="gmbadge-list">${rows || '<li class="gmbadge-empty">No gms indexed yet. Be the first.</li>'}</ol>
      </section>
    `;
  }

  attachEvents() {
    const btn = document.querySelector('.gmbadge-say');
    if (btn && !btn.disabled) {
      btn.onclick = async () => {
        await this.sayGm();
      };
    }
    document.querySelectorAll('.gmbadge-row').forEach((row) => {
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
