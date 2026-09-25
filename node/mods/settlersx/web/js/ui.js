(function (root) {
  'use strict';
  const RES = ['brick', 'wood', 'wheat', 'wool', 'ore'];
  const COLORS = ['#d5553f', '#3474a1', '#dfae39', '#478d70'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, cls = '') => `<img class="${cls}" src="/settlersx/img/icons/${name}.svg" alt="">`;
  class UI {
    constructor({ container, mod, mode = 'game' }) {
      this.mod = mod; this.mode = mode; this.entries = []; this.lastHand = ''; this.lastPlayers = '';
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) this.container = document.body;
      this.container.insertAdjacentHTML('beforeend', this.template());
      this.el = this.container.querySelector('#settlersx');
      this.scene = new root.SettlersXScene(this.el.querySelector('#sx-board'), { assetBase: '/settlersx/img/', onPick: (id, kind) => this.mod.sxPick?.({ id, kind }) });
      this.bind(); this.refresh();
    }
    template() {
      return `<div id="settlersx" class="sx-app">
        <header class="sx-header"><a class="sx-brand" href="#" aria-label="SettlersX home"><span class="sx-brand-mark">S<span>×</span></span><span><small>THE ADVENTURES OF SAITOA</small><strong>SETTLERS<span class="sx-brand-x">X</span></strong></span></a>
          <div class="sx-edition"><span class="sx-red-dot"></span> A NEW WORLD AWAITS <span class="sx-edition-line"></span> VOL. 01</div>
          <nav class="sx-header-nav"><button data-sx-action="rules" aria-label="Field guide"><span>?</span> Field guide</button><button data-sx-action="journal" aria-label="Captain’s log">Logbook</button><button data-sx-action="settings" aria-label="Settings">⚙</button></nav>
        </header>
        <main class="sx-layout"><section class="sx-island-column" aria-label="Island and explorers">
          <div class="sx-map-frame"><div id="sx-board" aria-label="Three-dimensional island map"></div>
            <div class="sx-map-caption"><span class="sx-eyebrow">CHART No. 019 / THE SAITOA ARCHIPELAGO</span><h1>Land of<br>possibilities.</h1><p>One island. A thousand adventures.</p></div>
            <div class="sx-map-badge"><span class="sx-live-dot"></span><span id="sx-mode-label">ISLAND EXPEDITION</span></div>
            <img class="sx-compass" src="/settlersx/img/compass.svg" alt="Compass rose">
            <div class="sx-camera"><button data-sx-action="reset" title="Reset camera" aria-label="Reset camera">⌖</button><button data-sx-action="top" title="View from above" aria-label="View from above">▱</button><button data-sx-action="zoom-in" title="Zoom in" aria-label="Zoom in">+</button><button data-sx-action="zoom-out" title="Zoom out" aria-label="Zoom out">−</button><span>DRAG TO ORBIT · SCROLL TO EXPLORE</span></div>
            <div class="sx-map-coordinates">27° 12′ N<br>SAITOA / UNCHARTED WATERS</div>
          </div>
          <div class="sx-roster-heading"><span>THE EXPEDITION</span><span id="sx-goal">FIRST TO 10 VICTORY POINTS</span></div><div id="sx-players" class="sx-players"></div>
        </section>
        <aside class="sx-sidebar" aria-label="Your turn and supplies">
          <div class="sx-turn-heading"><span class="sx-eyebrow">THE NEXT CHAPTER</span><span id="sx-turn-number">01</span></div>
          <div class="sx-turn-title"><h2 id="sx-turn-title">Your adventure<br>starts here.</h2><div id="sx-dice" class="sx-dice" aria-label="Last dice roll"></div></div>
          <div class="sx-status-card"><span class="sx-status-pin"></span><div id="sx-status" class="status" aria-live="polite">Welcome to Saitoa. Your island awaits.</div></div>
          <div id="sx-actions" class="controls sx-actions"><ul>
            <li id="rolldice" class="option enabled sx-primary" role="button" tabindex="0" aria-label="Next action"><span>Roll the dice</span><b>↗</b></li>
            <li id="spend" class="option" role="button" tabindex="0" aria-label="Build or buy">${icon('village')}<span>Build</span></li>
            <li id="trade" class="option enabled" role="button" tabindex="0" aria-label="Trade with explorers">${icon('any-port')}<span>Trade</span></li>
            <li id="bank" class="option" role="button" tabindex="0" aria-label="Trade with bank">${icon('city')}<span>Harbour</span></li>
            <li id="playcard" class="option" role="button" tabindex="0" aria-label="Development cards">${icon('knight')}<span>Cards</span></li>
            <li id="score" class="option enabled" role="button" tabindex="0" aria-label="Game statistics"><span>↗</span><span>Statistics</span></li>
          </ul></div>
          <section class="sx-supplies"><div class="sx-section-heading"><h3>Your supplies</h3><span id="sx-hand-total">0 CARDS</span></div><div id="sx-resources" class="sx-resources"></div><div id="sx-private-cards" class="sx-private-cards"></div></section>
          <section class="sx-blueprint"><div class="sx-section-heading"><h3>A little ambition</h3><span>BUILDING COSTS</span></div><div class="sx-costs">${[['road','Road',['wood','brick']],['village','Village',['wood','brick','wheat','wool']],['city','City',['ore','ore','ore','wheat','wheat']],['knight','Development',['ore','wool','wheat']]].map(([i,n,c])=>`<div class="sx-cost-row">${icon(i)}<span>${n}</span><div>${c.map(r=>`<img src="/settlersx/img/resources/${r}.svg" alt="${r}" title="${r}">`).join('')}</div></div>`).join('')}</div></section>
          <div class="sx-sidebar-foot"><img src="/settlersx/img/ship.svg" alt=""><span>FORTUNE FAVOURS<br><b>THE CURIOUS.</b></span><span class="sx-stamp">SAITOA<br>EXPLORERS<br>CLUB</span></div>
        </aside></main>
        <section id="sx-journal-panel" class="sx-journal-panel" hidden><div class="sx-section-heading"><h2>The captain’s log</h2><button data-sx-action="journal" aria-label="Close logbook">×</button></div><ol id="sx-journal"></ol></section>
        <div id="sx-toast" role="status" hidden></div>
      </div>`;
    }
    bind() {
      this.onClick = e => {
        const btn = e.target.closest('[data-sx-action]'); if (!btn) return;
        switch (btn.dataset.sxAction) {
          case 'rules': this.mod.rules_overlay?.render(); break;
          case 'settings': this.mod.loadSettings?.(); break;
          case 'journal': { const p=this.el.querySelector('#sx-journal-panel'); p.hidden=!p.hidden; break; }
          case 'reset': this.scene.resetView(); break;
          case 'top': this.top = !this.top; this.scene.setView(this.top?'top':'perspective'); break;
          case 'zoom-in': this.zoom(0.85); break;
          case 'zoom-out': this.zoom(1.18); break;
        }
      };
      this.el.addEventListener('click', this.onClick);
      this.el.querySelector('.sx-brand').addEventListener('click', e => {e.preventDefault();this.scene.resetView();});
      this.el.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.option.enabled, .textchoice')) {e.preventDefault();e.target.click();}
        if (e.key === 'Escape') this.el.querySelector('#sx-journal-panel').hidden = true;
      });
      this.el.querySelector('#sx-players').addEventListener('click', e => {
        const offer=e.target.closest('[data-offer]'); if(offer) this.mod.showTradeOverlay?.(+offer.dataset.offer,this.mod.game.state.ads[+offer.dataset.offer-1].ask,this.mod.game.state.ads[+offer.dataset.offer-1].offer);
      });
      this.el.querySelector('#sx-private-cards').addEventListener('click',()=>{if(this.mod.game.player>0)this.mod.dev_card?.render();});
      this.onOverlayKey = e => {
        if (!['Enter', ' '].includes(e.key) || !e.target.closest('.saito-overlay')) return;
        const control = e.target.closest('[role="button"], [tabindex="0"]');
        if (!control || control.matches('button,input,select,textarea,a') || control.matches('.settlers-row-disabled,.settlers-card-disabled,.noselect,[aria-disabled="true"]')) return;
        const tradeArea = control.closest('.trade_area')?.id;
        const tradeDirection = control.classList.contains('trade_count_up') ? '.trade_count_up' : '.trade_count_down';
        e.preventDefault(); control.click();
        if (tradeArea && control.classList.contains('trade_count_arrow')) document.getElementById(tradeArea)?.querySelector(tradeDirection)?.focus();
      };
      document.addEventListener('keydown', this.onOverlayKey);
    }
    zoom(factor) { if(this.scene.zoom) this.scene.zoom(factor); else {const canvas=this.el.querySelector('#sx-board canvas');canvas?.dispatchEvent(new WheelEvent('wheel',{deltaY:factor<1?-160:160,bubbles:true,cancelable:true}));} }
    setStatus(html) { const el=this.el.querySelector('#sx-status');if(el.innerHTML!==html) el.innerHTML=html; el.querySelectorAll('.textchoice').forEach(choice=>{choice.setAttribute('role','button');choice.tabIndex=0;}); }
    refresh() {
      const g=this.mod.game;if(!g?.state)return;const s=g.state, me=s.players[g.player-1], goal=g.options?.game_length||10;
      this.el.querySelector('#sx-goal').textContent=`FIRST TO ${goal} VICTORY POINTS`;
      this.el.querySelector('#sx-mode-label').textContent=this.mode!=='game'?'LOCAL EXPEDITION':'ISLAND EXPEDITION';
      const current=s.playerTurn||g.player||1,name=g.playerNames?.[current-1]||`Explorer ${current}`;
      this.el.querySelector('#sx-turn-title').textContent=g.over?'Adventure complete.':s.placedCity?'Make your mark.':current===g.player?'Adventure awaits.':`${name}’s turn.`;
      this.el.querySelector('#sx-turn-number').textContent=String(current).padStart(2,'0');
      this.el.querySelector('#sx-dice').innerHTML=(s.lastroll||[]).filter(x=>x>0).map(n=>`<span class="sx-die" aria-label="Die ${n}">${'⚀⚁⚂⚃⚄⚅'[n-1]}</span>`).join('');
      const players=s.players.map((p,i)=>{const color=COLORS[(g.colors?.[i]||i+1)-1]||COLORS[i%4],ad=s.ads?.[i],dev=p.devcards.length+(i+1===g.player?(g.deck?.[0]?.hand?.length||0):0);return `<article class="sx-player ${current===i+1?'is-active':''}" style="--player:${color}"><div class="sx-player-portrait"><img src="/settlersx/img/portraits/${i+1}.svg" alt="Explorer ${i+1}"><span>${String(i+1).padStart(2,'0')}</span></div><div class="sx-player-info"><h3>${esc(g.playerNames?.[i]||`Explorer ${i+1}`)} ${i+1===g.player?'<small>YOU</small>':''}</h3><div class="sx-player-facts"><span title="Resource cards">▤ ${p.resources.length}</span><span title="Development cards">▣ ${dev}</span><span title="Soldiers played">⚑ ${p.knights}</span><span title="Longest continuous road">⌁ ${p.road}</span>${p.vpc?`<span title="Revealed victory point cards">★ ${p.vpc}</span>`:''}</div>${g.player===0?`<div class="sx-observer-hand">${RES.map(r=>`<span title="${esc(r)}"><img src="/settlersx/img/resources/${r}.svg" alt="${esc(r)}">${p.resources.filter(v=>v===r).length}</span>`).join('')}</div>`:''}<div class="sx-player-awards">${s.longestRoad.player===i+1?'LONGEST ROAD ':''}${s.largestArmy.player===i+1?'LARGEST ARMY ':''}${s.robinhood===i+1?'ROBIN HOOD ':''}${ad&&(ad.ask||ad.offer)?`<button data-offer="${i+1}">Trade offer ↗</button>`:''}</div></div><div class="sx-player-score"><strong>${p.vp}</strong><small>/${goal} VP</small></div></article>`;}).join('');
      if(players!==this.lastPlayers){this.el.querySelector('#sx-players').innerHTML=players;this.lastPlayers=players;}
      this.el.querySelector('.sx-supplies').hidden=!me;
      const resources=me?.resources||[],hand=RES.map(r=>[r,resources.filter(v=>v===r).length]);
      const handkey=JSON.stringify(hand);if(handkey!==this.lastHand){this.el.querySelector('#sx-resources').innerHTML=hand.map(([r,n])=>`<div class="sx-resource ${n?'':'is-empty'}" title="${n} ${r}"><img src="/settlersx/img/resources/${r}.svg" alt="${r}"><b>${n}</b><span>${r}</span></div>`).join('');this.lastHand=handkey;}
      this.el.querySelector('#sx-hand-total').textContent=`${resources.length} CARDS`;
      const dev=me?.devcards?.length||0,newdev=g.deck?.[0]?.hand?.length||0;
      this.el.querySelector('#sx-private-cards').innerHTML=`<button class="sx-dev-summary">▣ &nbsp; ${dev+newdev} development card${dev+newdev===1?'':'s'} <span>View hand →</span></button><div class="sx-inventory">${me?`${me.towns} villages · ${me.cities} cities remaining${me.ports.length?' · Ports: '+me.ports.map(esc).join(', '):''}`:''}</div>`;
    }
    log(html) {
      this.entries.unshift(html);this.entries=this.entries.slice(0,100);
      this.el.querySelector('#sx-journal').innerHTML=this.entries.map((x,i)=>`<li><span>${String(this.entries.length-i).padStart(2,'0')}</span><div>${x}</div></li>`).join('');
    }
    toast(message) {const el=this.el.querySelector('#sx-toast');el.textContent=message;el.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{el.hidden=true;},3500);}
    destroy() {document.removeEventListener('keydown',this.onOverlayKey);clearTimeout(this.toastTimer);this.scene.destroy();this.el.remove();}
  }
  root.SettlersXUI={mount: options=>new UI(options),escape:esc};
})(window);
