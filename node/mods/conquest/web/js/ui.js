(function (root) {
  'use strict';
  const icons = ['▲','●','◆','■','✦','⬟'];
  // Open Pacific water on the 1200×700 map: below Alaska and west of Chile.
  const battlePocket = {x:20, y:438, width:284, height:246};
  const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class ConquestUI {
    constructor(element, controller) {
      this.element = element; this.controller = controller; this.selected = null; this.target = null; this.message = ''; this.busy = false; this.showNames = false;
      this.selectedCards = new Set(); this.blitz = {}; this.steamroll = {}; this.deployCount = null; this.namesPreference = null; this.mapZoom = 100;
      this.build(); this.render();
    }
    build() {
      this.element.classList.add('conquest-app');
      this.element.innerHTML = `<header class="conquest-header"><details class="conquest-local-menu" ${this.controller.hasGameMenu?'hidden':''}><summary aria-label="Game menu" title="Game menu">☰</summary><nav><button class="conquest-text-button" data-do="stats">Stats</button><button class="conquest-text-button" data-do="rules">Field guide</button><button class="conquest-text-button" data-do="dispatches">Dispatches</button></nav></details><div class="conquest-round"><span class="conquest-brand-word">CONQUEST<span class="conquest-brand-dot">.</span></span></div></header>
      <main class="conquest-main"><section class="conquest-board-column"><div class="conquest-map-wrap"><div class="conquest-map-viewport"><svg class="conquest-map" viewBox="0 0 1200 700" aria-label="World map. Choose a territory to play." role="group"></svg><div class="conquest-battle-overlays" hidden><div class="conquest-battle-dice" data-side="attacker" role="group" hidden><canvas aria-label="Attacking dice"></canvas></div><div class="conquest-battle-dice" data-side="defender" role="group" hidden><canvas aria-label="Defending dice"></canvas></div><p class="conquest-battle-summary" data-battle-summary></p></div><div class="conquest-occupation" hidden><div class="conquest-distribution"><span><small data-occupy-from-name></small><b data-occupy-from-count></b></span><input type="range" data-occupy-range step="1" aria-label="Army distribution"><span><small data-occupy-to-name></small><b data-occupy-to-count></b></span></div><button type="button" class="conquest-button primary" data-do="occupy">Advance ↗</button></div><div class="conquest-fortify" hidden><div class="conquest-distribution"><span><small data-fortify-from-name></small><b data-fortify-from-count></b></span><input type="range" data-fortify-range min="0" step="1" value="0" aria-label="Army distribution"><span><small data-fortify-to-name></small><b data-fortify-to-count></b></span></div><div class="conquest-fortify-actions"><button type="button" class="conquest-button secondary" data-do="cancel-fortify">Cancel</button><button type="button" class="conquest-button primary" data-do="fortify">Fortify</button></div></div><div class="conquest-attack-menu" hidden><button type="button" class="conquest-button primary" data-do="attack" data-attack-mode="once">Attack ↗</button><button type="button" class="conquest-button primary" data-do="attack" data-attack-mode="blitz">Blitz ↗</button></div></div><div class="conquest-map-footer"><div class="conquest-map-tools"><button class="conquest-text-button" data-do="dispatches" aria-label="Dispatches from the front">Dispatches</button><button class="conquest-text-button" data-do="names" aria-pressed="false">Show labels</button></div></div><svg class="conquest-overlay-lines" aria-hidden="true"></svg><div class="conquest-tooltip" hidden></div></div></section>
      <aside class="conquest-command"><div class="conquest-command-scroll" tabindex="0" role="region" aria-label="Turn details"><div class="conquest-turn-status"><span role="status" aria-live="polite" aria-atomic="true" data-turn-status></span><button type="button" class="conquest-stats-button" data-do="stats" aria-label="Show statistics" title="Statistics"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 16v-4m5 4V6m5 10V9"/></svg></button></div><div class="conquest-command-content"></div><div class="conquest-battle-result" aria-live="polite"></div></div><div class="conquest-notice" role="status" aria-live="polite"></div><div class="conquest-command-actions"></div></aside><footer class="conquest-player-row"><div class="conquest-roster" aria-label="Players"></div></footer></main>
      <aside class="conquest-dispatches" aria-label="Dispatches from the front" hidden><button class="conquest-text-button" data-do="close-dispatches" aria-label="Close dispatches">Close ×</button><div class="conquest-journal"><div class="conquest-eyebrow">DISPATCHES FROM THE FRONT</div><ol></ol></div></aside><div class="conquest-modal-layer" hidden></div>`;
      this.scenes = {};
      for(const side of ['attacker','defender'])this.scenes[side]=root.ConquestScene?new root.ConquestScene(this.element.querySelector(`[data-side="${side}"] canvas`)):null;
      this.element.addEventListener('click', this.clickHandler = e => this.click(e));
      this.element.addEventListener('input', e => {
        if (e.target.matches('[data-occupy-range]')) this.onOccupyInput(e.target.value);
        if (e.target.matches('[data-fortify-range]')) this.onFortifyInput(e.target.value);
      });
      document.addEventListener('click', this.clickAwayHandler = e => {
        if(e.target.closest('#log-wrapper,.conquest-dispatches,[data-do="dispatches"],#conquest-dispatches'))return;
        this.closeDispatches(false);
      }, true);
      this.element.addEventListener('keydown', this.keyHandler = e => {
        if ((e.key==='Enter'||e.key===' ') && e.target.closest('[data-territory]')) {e.preventDefault();this.select(e.target.closest('[data-territory]').dataset.territory);}
        if(e.key==='Escape'){this.closeModal();this.closeDispatches();}
        if(e.key==='Tab'){const layer=this.element.querySelector('.conquest-modal-layer');if(!layer.hidden){const items=[...layer.querySelectorAll('button:not(:disabled),select,input,a[href]')].filter(el=>!el.hidden);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
      });
      this.fitViewport = () => {
        const top = Math.max(0, this.element.getBoundingClientRect().top);
        this.element.style.setProperty('--conquest-top-offset', `${top}px`);
        this.positionBoardControls();
      };
      root.addEventListener('resize', this.fitViewport);
      this.fitViewport();
      this.renderMap();
      const map=this.element.querySelector('.conquest-map');
      if(root.ResizeObserver){
        this.mapResizeObserver=new root.ResizeObserver(()=>{
          const matrix=map.getScreenCTM(),scale=matrix&&Math.hypot(matrix.a,matrix.b);
          if(scale>0){
            map.style.setProperty('--conquest-map-min-font',`${Math.max(12,12/scale)}px`);
            map.classList.toggle('compact',scale<.65);
            if(this.namesPreference!=null)this.showNames=this.namesPreference;
            this.updateMapLabels();this.positionBoardControls();
          }
        });
        this.mapResizeObserver.observe(map);
      }
      this.updateMapLabels();
      this.setupBoardSizer();
      this.enableMapPanning();
      this.element.querySelector('.conquest-map-viewport').addEventListener('scroll',()=>this.positionBoardControls());
    }
    setupBoardSizer() {
      this.boardSizer=this.controller.boardSizer;
      if(!this.boardSizer){
        // The standalone preview has no GameTemplate header or sizer instance.
        this.element.querySelector('.conquest-local-menu').insertAdjacentHTML('beforebegin',`<div id="game_board_sizer" class="game_board_sizer"><button type="button" class="game-board-sizer-center" aria-label="Center board"></button><div class="game-board-sizer-control"><button type="button" class="game-board-sizer-step" data-board-zoom="-1" aria-label="Shrink board">−</button><input type="range" class="saito-range" aria-label="Board zoom"><button type="button" class="game-board-sizer-step" data-board-zoom="1" aria-label="Magnify board">+</button></div></div>`);
        this.boardSizer=this.element.querySelector('#game_board_sizer');
      }
      this.boardSizer.classList.add('conquest-board-sizer');
      const input=this.boardSizer.querySelector('input');
      input.min='100';input.max='300';input.step='5';input.value=String(this.mapZoom);
      input.oninput=()=>this.setMapZoom(Number(input.value));
      const center=this.boardSizer.querySelector('.game-board-sizer-center');
      center.title='Fit and center board';
      center.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8"/></svg>';
      center.onclick=()=>this.setMapZoom(100);
      this.boardSizer.querySelectorAll('[data-board-zoom]').forEach(button=>{
        button.onclick=()=>this.setMapZoom(this.mapZoom+Number(button.dataset.boardZoom)*5);
      });
      this.setMapZoom(this.mapZoom);
    }
    setMapZoom(value) {
      const viewport=this.element.querySelector('.conquest-map-viewport');
      const zoom=Math.max(100,Math.min(300,Number(value)||100)),ratio=zoom/this.mapZoom;
      const x=(viewport.scrollLeft+viewport.clientWidth/2)*ratio-viewport.clientWidth/2;
      const y=(viewport.scrollTop+viewport.clientHeight/2)*ratio-viewport.clientHeight/2;
      this.mapZoom=zoom;
      viewport.style.setProperty('--conquest-map-scale',zoom/100);
      viewport.classList.toggle('zoomed',zoom>100);
      viewport.scrollLeft=zoom===100?0:x;viewport.scrollTop=zoom===100?0:y;
      const input=this.boardSizer.querySelector('input');
      input.value=String(zoom);input.setAttribute('aria-valuetext',`${zoom}%`);
      input.style.setProperty('--board-scale-progress',`${(zoom-100)/2}%`);
      this.boardSizer.querySelector('[data-board-zoom="-1"]').disabled=zoom===100;
      this.boardSizer.querySelector('[data-board-zoom="1"]').disabled=zoom===300;
      this.positionBoardControls();
    }
    enableMapPanning() {
      const viewport=this.element.querySelector('.conquest-map-viewport');
      let drag=null, suppressClick=false;
      viewport.addEventListener('pointerdown', e=>{
        if((viewport.scrollWidth<=viewport.clientWidth&&viewport.scrollHeight<=viewport.clientHeight)||!e.isPrimary||e.button!==0||e.target.closest('.conquest-occupation,.conquest-fortify,.conquest-attack-menu'))return;
        suppressClick=false;
        drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
      });
      viewport.addEventListener('pointermove', e=>{
        if(!drag||e.pointerId!==drag.id)return;
        const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
        if(!drag.moved&&Math.hypot(dx,dy)<6)return;
        if(!drag.moved){
          drag.moved=true;
          suppressClick=true;
          viewport.setPointerCapture(e.pointerId);
          viewport.classList.add('panning');
        }
        e.preventDefault();
        viewport.scrollLeft=drag.left-dx;
        viewport.scrollTop=drag.top-dy;
      });
      const endDrag=e=>{
        if(!drag||e.pointerId!==drag.id)return;
        const tapped=e.type==='pointerup'&&e.pointerType==='touch'&&!drag.moved
          ? e.target.closest('[data-territory]') : null;
        drag=null;
        viewport.classList.remove('panning');
        if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
        // Touch browsers may omit the compatibility click immediately after scrolling.
        if(tapped){suppressClick=true;this.select(tapped.dataset.territory);}
      };
      viewport.addEventListener('pointerup',endDrag);
      viewport.addEventListener('pointercancel',endDrag);
      viewport.addEventListener('lostpointercapture',e=>{if(e.target===viewport)endDrag(e);});
      viewport.addEventListener('pointerleave',e=>{if(drag&&!drag.moved)endDrag(e);});
      // A drag must never claim, select or attack a territory on release.
      viewport.addEventListener('click',e=>{
        if(suppressClick&&e.detail!==0){e.preventDefault();e.stopPropagation();suppressClick=false;}
      },true);
    }
    get state() {return this.playbackState||this.controller.getState();}
    updateMapLabels(){
      this.element.classList.toggle('conquest-hide-labels',!this.showNames);
      const button=this.element.querySelector('[data-do="names"]');
      button.textContent=this.showNames?'Hide labels':'Show labels';button.setAttribute('aria-pressed',String(this.showNames));
    }
    name(id) {return id === 0 ? 'neutral' : this.controller.getPlayerName ? this.controller.getPlayerName(id) : `Player ${id}`;}
    territoryName(id) {return root.ConquestMap.territories[id]?.name || id || 'Choose a territory';}
    canAct() {const p=this.controller.getPlayer();return !this.busy && !this.playbackState && !this.state.networkBusy && !this.state.cardDraw && !this.state.cardTransfer && this.state.phase!=='gameover' && (p===0||p===this.state.currentPlayer);}
    interactive() {return !this.phaseSkip&&this.canAct();}
    phaseSkipKey(s) {return `${s.currentPlayer}:${s.turn}:${s.phase}:${s.battleSequence||0}`;}
    updatePhaseSkip(s) {
      const key=this.phaseSkipKey(s);
      const next=!this.busy&&!this.playbackState&&!s.networkBusy&&this.failedAutoPhase!==key
        ?root.ConquestEngine.automaticPhaseEnd(s):null;
      if(!next||this.phaseSkip?.key!==key){
        root.clearTimeout(this.phaseSkipTimer);this.phaseSkipTimer=null;
        this.phaseSkip=next?{...next,key}:null;
      }
      if(!this.phaseSkip)return;
      // Everyone sees the notice; only the active player sends a signed move.
      if(!this.canAct()){root.clearTimeout(this.phaseSkipTimer);this.phaseSkipTimer=null;return;}
      if(this.phaseSkipTimer!=null)return;
      this.phaseSkipTimer=root.setTimeout(()=>{
        this.phaseSkipTimer=null;
        if(this.destroyed)return;
        const current=this.controller.getState();
        if(this.phaseSkipKey(current)!==key||!this.canAct()||
          root.ConquestEngine.automaticPhaseEnd(current)?.type!==next.type){this.render();return;}
        return this.dispatch({type:next.type},true);
      },2000);
    }
    renderMap() {
      const map=root.ConquestMap, svg=this.element.querySelector('.conquest-map');
      svg.setAttribute('viewBox',`0 0 ${map.width||1200} ${map.height||700}`);
      svg.innerHTML = `<defs><filter id="conquest-paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".11"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply" result="textured"/><feComposite in="textured" in2="SourceGraphic" operator="in"/></filter><pattern id="conquest-neutral" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="#bbb8a8"/><path d="M0 0V8" stroke="#8c907e" stroke-width="2"/></pattern><pattern id="conquest-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="currentColor" stroke-opacity=".065"/></pattern></defs><rect x="0" y="0" width="1200" height="700" fill="url(#conquest-grid)"/><g class="conquest-ocean-labels" aria-hidden="true"><text class="conquest-pacific-label" x="96" y="420" transform="rotate(-90 96 420)">PACIFIC OCEAN</text><text x="480" y="440" transform="rotate(-75 480 440)">ATLANTIC OCEAN</text><text x="795" y="570">INDIAN OCEAN</text><text x="590" y="60">ARCTIC OCEAN</text></g><g class="conquest-connections" aria-hidden="true">${(map.seaLinks||[]).map(([a,b])=>{const f=map.territories[a],t=map.territories[b];return a==='alaska'?'<path d="M100 136L0 136M1112 147L1200 147"/>':`<path d="M${f.x} ${f.y}L${t.x} ${t.y}"/>`;}).join('')}</g><g class="conquest-continent-outlines" aria-hidden="true">${Object.values(map.continents).map(c=>`<path class="conquest-continent-outline" style="--continent:var(--conquest-continent-${c.id},${escape(c.color)})" d="${escape(c.outline||c.territories.map(id=>map.territories[id].path).join(' '))}"/>`).join('')}</g><g class="conquest-land">${Object.values(map.territories).map(t=>`<g class="conquest-territory" data-territory="${escape(t.id)}" tabindex="0" role="button"><title>${escape(t.name)}</title><path class="conquest-country" d="${escape(t.path)}"/><g class="conquest-army" transform="translate(${t.x},${t.y})"><circle r="17"/><text class="conquest-army-count" dy="5">0</text><path class="conquest-army-selected" d="M-25 -14L-25 -25L-14 -25M14 -25L25 -25L25 -14M25 14L25 25L14 25M-14 25L-25 25L-25 14"/></g><text class="conquest-country-label" x="${t.x}" y="${t.y+34}">${escape(t.name)}</text></g>`).join('')}</g><g class="conquest-compass" transform="translate(155 550)" aria-hidden="true"><circle r="43"/><path d="M0 -37L8 0L0 37L-8 0Z"/><path d="M-37 0L0 -8L37 0L0 8Z"/><text y="-54">N</text><text y="68">S</text><text x="-57" y="5">W</text><text x="57" y="5">E</text></g>`;
      const labels=document.createElementNS('http://www.w3.org/2000/svg','g');
      labels.setAttribute('class','conquest-map-labels');
      svg.querySelectorAll('.conquest-country-label').forEach(label=>labels.appendChild(label));
      svg.appendChild(labels);
      const continentLabels=document.createElementNS('http://www.w3.org/2000/svg','g');
      continentLabels.setAttribute('class','conquest-continent-map-labels');
      continentLabels.setAttribute('aria-hidden','true');
      continentLabels.innerHTML=Object.values(map.continents).filter(c=>c.label).map(c=>`<text class="conquest-continent-map-label" x="${c.label[0]}" y="${c.label[1]}" text-anchor="middle" style="--continent:var(--conquest-continent-${c.id},${escape(c.color)})">${escape(c.name.toUpperCase())} +${c.bonus}</text>`).join('');
      svg.appendChild(continentLabels);
    }
    render() {
      const live=this.controller.getState();if(!live||this.destroyed)return;
      if(!this.playbackState&&live.lastBattle&&live.battleRolls?.length&&live.battleSequence!==this.seenBattle){
        this.seenBattle=live.battleSequence;
        this.battlePlayback=this.playBattle(live);
        return;
      }
      const s=this.state;
      this.updatePhaseSkip(s);
      const p=s.currentPlayer, turn=this.interactive();
      const localPlayer=this.controller.getPlayer(), self=localPlayer===0?p:localPlayer;
      const observer=!s.players.some(player=>player.id===self);
      const finished=s.phase==='gameover', pending=this.busy||s.networkBusy;
      const nextBonus=root.ConquestEngine.tradeValue(s.tradedSets);
      const playableSet=!observer&&this.canTradeCards()&&root.ConquestEngine.validTrades(s,self).length>0;
      const yours=localPlayer===0||localPlayer===p;
      const context=`${p}:${s.turn}:${s.phase}`;
      if(this.renderedContext!==context){this.selected=null;this.target=null;this.message='';this.deployCount=null;this.selectedCards.clear();}
      this.renderedContext=context;
      if(s.phase==='reinforce')this.deployCount=Math.max(1,Math.min(this.deployCount??s.reinforcements,s.reinforcements));
      const legalMove=s.phase==='attack'?root.ConquestEngine.canAttack:s.phase==='fortify'?root.ConquestEngine.canFortify:null;
      const origins=new Set(turn&&legalMove?Object.keys(s.territories).filter(id=>root.ConquestMap.territories[id].neighbors.some(to=>legalMove(s,id,to))):[]);
      if(legalMove&&this.selected&&!root.ConquestMap.territories[this.selected].neighbors.some(to=>legalMove(s,this.selected,to))){this.selected=null;this.target=null;}
      if(legalMove&&this.target&&!legalMove(s,this.selected,this.target))this.target=null;
      this.element.style.setProperty('--conquest-active',`var(--conquest-player-${p})`);
      this.boardSizer.style.setProperty('--conquest-active',`var(--conquest-player-${p})`);
      this.element.style.setProperty('--conquest-accent',`var(--conquest-player-${p})`);
      const status=this.element.querySelector('.conquest-turn-status');
      status.dataset.state=finished?'finished':pending?'pending':yours?'ready':'waiting';
      status.style.setProperty('--player',`var(--conquest-player-${p})`);
      status.querySelector('[data-turn-status]').textContent=this.turnStatus(s,yours,finished);
      this.prepareOccupation();
      this.prepareFortify();
      this.element.querySelectorAll('[data-territory]').forEach(el=>{
        const id=el.dataset.territory,t=s.territories[id];if(!t)return;
        el.style.setProperty('--territory-color',t.owner===0?'url(#conquest-neutral)':t.owner?`var(--conquest-player-${t.owner})`:'var(--conquest-unclaimed)');
        el.classList.toggle('selected',id===this.selected);el.classList.toggle('targeted',id===this.target);
        const destination=!!(turn&&this.selected&&legalMove&&legalMove(s,this.selected,id));
        el.classList.toggle('available-origin',origins.has(id));
        el.classList.toggle('attackable',destination&&s.phase==='attack');
        el.classList.toggle('movable',destination&&s.phase==='fortify');
        const armies=this.occupationArmies(s,id)??this.fortifyArmies(s,id)??t.armies;
        el.querySelector('.conquest-army-count').textContent=t.owner===null?'–':armies;
        el.setAttribute('aria-label',`${this.territoryName(id)}, ${t.owner===null?'unclaimed':this.name(t.owner)}, ${armies} armies${destination?', available destination':origins.has(id)?s.phase==='attack'?', can attack from here':', can move from here':''}`);
        el.setAttribute('aria-pressed',String(id===this.selected||id===this.target));
      });
      const content=this.element.querySelector('.conquest-command-content');
      let body='',actions='',attackLead='';
      if(s.phase==='claim'){body=this.reserve('1','TERRITORY TO CLAIM');}
      else if(s.phase==='setup'){body=this.reserve(s.setupRemaining?.[s.setupNeutral?0:p]||0,s.setupNeutral?'NEUTRAL ARMIES TO DEPLOY':'ARMIES TO DEPLOY')+this.selection();}
      else if(s.phase==='reinforce'){body=this.reserve(s.reinforcements,'ARMIES TO DEPLOY');if(!s.mustTrade)body+=this.range('Armies to deploy',s.reinforcements,1,this.deployCount);}
      else if(s.phase==='attack'){
        if(this.selected&&this.target&&root.ConquestEngine.canAttack(s,this.selected,this.target)) {
          const fromArmies=s.territories[this.selected].armies,toArmies=s.territories[this.target].armies,max=Math.min(3,fromArmies-1);
          attackLead=`<p class="conquest-attack-summary">Attacking from ${escape(this.territoryName(this.selected))} to ${escape(this.territoryName(this.target))}</p><hr class="conquest-attack-divider"><p class="conquest-attack-balance"><b>${fromArmies}</b> ${fromArmies===1?'army':'armies'} vs. <b>${toArmies}</b> defending</p>`;
          body+=`<label class="conquest-dice-choice">Attack dice <select data-attack-dice aria-label="Number of attack dice">${Array.from({length:max},(_,i)=>`<option value="${i+1}" ${i+1===max?'selected':''}>${i+1}</option>`).join('')}</select></label><label class="conquest-check"><input type="checkbox" data-blitz> Blitz until victory or retreat</label><label class="conquest-check"><input type="checkbox" data-steamroll> Steamroll: advance all but one army</label><div class="conquest-small-note">Roll up to ${max} attack dice. Defender rolls up to 2.</div>`;
        }
        actions+=this.button('end_attack','Finish attacking →','secondary');
      }
      else if(s.phase==='fortify'){actions=this.button('skip_movement','Skip movement →','secondary');}
      else if(s.phase==='gameover'){body=this.reserve('✦','WORLD CONQUEROR');}
      if(!finished&&!turn&&(!pending||(localPlayer!==0&&localPlayer!==p)))body='';
      if(this.playbackState)body='';
      if(this.phaseSkip){body='';actions='';}
      content.innerHTML=`${attackLead}${playableSet?`<p class="conquest-card-prompt" role="status">You have a playable card set. <button class="conquest-text-button" data-do="cards">Trade for +${nextBonus} armies →</button></p>`:''}${body}`;
      content.querySelectorAll('input,select').forEach(control=>control.disabled=!turn);
      this.element.querySelector('.conquest-command-actions').innerHTML=actions;
      this.element.querySelectorAll('.conquest-command-actions button').forEach(b=>b.disabled=!turn);
      this.element.querySelector('.conquest-notice').textContent=this.phaseSkip
        ?`${this.name(p)} cannot ${s.phase==='attack'?'attack. Moving on…':'move armies. Ending turn…'}`
        :this.message||this.controller.getStatus?.()||'';
      const roster=s.players;
      const rosterEl=this.element.querySelector('.conquest-roster');
      rosterEl.dataset.count=String(roster.length);
      rosterEl.innerHTML=roster.map(pl=>this.playerPanel(s,pl,p,self,finished)).join('');
      const logs=[...(s.log||[])].reverse();
      this.element.querySelector('.conquest-journal ol').innerHTML=logs.length?logs.map(l=>`<li>${escape(typeof l==='string'?l:l.text||l.message||'Campaign in progress.')}</li>`).join(''):'<li>The map is open. Your story begins here.</li>';
      this.element.querySelector('[data-range]')?.addEventListener('input',e=>{this.element.querySelector('[data-range-value]').textContent=e.target.value;if(s.phase==='reinforce')this.deployCount=Number(e.target.value);});
      for(const mode of ['blitz','steamroll']){
        const control=this.element.querySelector(`[data-${mode}]`);
        if(control){control.checked=!!this[mode][p];control.addEventListener('change',()=>{this[mode][p]=control.checked;});}
      }
      this.updateCardSelection();
      this.updateStatistics();
      this.positionBoardControls();
      this.updateOccupation();
      this.updateFortify();
      this.maybeAutoOccupy();
      if(!this.playbackState)this.renderedState=JSON.parse(JSON.stringify(s));
    }
    playerStatIcon(name){
      const paths={
        territories:'<path d="M4 8 9 4l5 3 6-2.5V17l-6 3-5-3-4 2.5Z"/>',
        armies:'<path d="M12 3.5 19 7v5.2c0 4.2-2.8 7-7 8.8-4.2-1.8-7-4.6-7-8.8V7Z"/>',
        income:'<path d="M12 5v14M5 12h14"/>',
        cards:'<rect x="3.5" y="3" width="12" height="16" rx="1.4" transform="rotate(-12 9.5 11)"/><rect x="8" y="5" width="12" height="16" rx="1.4"/>'
      };
      return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
    }
    playerStat(label,value,icon){
      return `<span class="conquest-player-stat" title="${escape(label)}" aria-label="${escape(label)}: ${escape(value)}">${this.playerStatIcon(icon)}<b>${escape(value)}</b></span>`;
    }
    playerPanel(s,pl,current,self,finished){
      const owned=Object.values(s.territories).filter(t=>t.owner===pl.id);
      const armies=owned.reduce((sum,t)=>sum+t.armies,0);
      const cards=pl.cardCount??pl.cards?.length??0;
      const income=pl.id===0?0:root.ConquestEngine.reinforcementFor(s,pl.id);
      const active=pl.id===current&&!finished;
      const name=this.name(pl.id);
      const cardStat=pl.id===self&&pl.id!==0
        ?`<button type="button" class="conquest-player-stat" data-do="cards" title="Cards held" aria-label="Cards held: ${cards}. Open your card hand" aria-haspopup="dialog">${this.playerStatIcon('cards')}<b>${cards}</b></button>`
        :this.playerStat('Cards held',cards,'cards');
      return `<div class="conquest-player-card ${pl.id===0?'conquest-player-neutral':''} ${active?'active':''} ${pl.eliminated?'eliminated':''}" style="--player:var(--conquest-player-${pl.id});--on-player:var(--conquest-on-player-${pl.id})" role="group" aria-label="${escape(name)}${active?', current turn':''}${pl.eliminated?', eliminated':''}"><div class="conquest-player-identity">${this.identicon(pl.id)}<b title="${escape(name)}">${escape(name)}</b></div><div class="conquest-player-stats">${this.playerStat('Territories controlled',owned.length,'territories')}${this.playerStat('Armies',armies,'armies')}${this.playerStat('Armies earned at the start of the next turn, excluding card trades',income,'income')}${cardStat}</div></div>`;
    }
    identicon(id){
      if(id===0)return '<span class="conquest-identicon conquest-neutral-identicon" aria-hidden="true"></span>';
      const src=this.controller.getPlayerIdenticon?.(id);
      return src?`<img class="conquest-identicon" src="${escape(src)}" alt="${escape(this.name(id))} identicon">`:`<span class="conquest-identicon" aria-hidden="true">${icons[id-1]}</span>`;
    }
    openDispatches(){
      if(this.controller.showDispatches){this.controller.showDispatches();return;}
      this.dispatchesFocus=document.activeElement;
      this.element.querySelector('.conquest-dispatches').hidden=false;
      this.element.querySelector('[data-do="close-dispatches"]').focus();
    }
    closeDispatches(restoreFocus=true){
      document.querySelector('#log-wrapper')?.classList.remove('log-lock');
      this.element.querySelector('.conquest-dispatches').hidden=true;
      if(restoreFocus)this.dispatchesFocus?.focus();
    }
    positionBoardControls(){
      this.positionBattleStage();
      this.positionOccupation();
      this.positionFortify();
      const menu=this.element.querySelector('.conquest-attack-menu');
      if(!menu||!this.state)return;
      const destination=this.target;
      const canAttack=destination&&this.interactive()&&this.selected&&this.state.phase==='attack'&&root.ConquestEngine.canAttack(this.state,this.selected,destination);
      menu.hidden=!canAttack;
      menu.querySelectorAll('button').forEach(button=>{
        button.disabled=!canAttack;
        if(canAttack)button.setAttribute('aria-label',`${button.dataset.attackMode==='blitz'?'Blitz':'Attack'} ${this.territoryName(destination)}`);
      });
      const lines=this.element.querySelector('.conquest-overlay-lines');
      lines.innerHTML='';
      if(!canAttack)return;
      this.placeNearTerritories(menu,[destination],{anchor:destination,overflow:true});
      if(menu.hidden)return;
      const svg=this.element.querySelector('.conquest-map'),matrix=svg.getScreenCTM?.();
      const wrap=this.element.querySelector('.conquest-map-wrap')?.getBoundingClientRect();
      if(!matrix||!wrap)return;
      const t=root.ConquestMap.territories[destination],point=svg.createSVGPoint();
      point.x=t.x;point.y=t.y;
      const anchor=point.matrixTransform(matrix);
      const box=menu.getBoundingClientRect();
      const x=Math.max(box.left,Math.min(anchor.x,box.right)),y=Math.max(box.top,Math.min(anchor.y,box.bottom));
      const dx=x-anchor.x,dy=y-anchor.y,distance=Math.hypot(dx,dy),gap=Math.min(22,distance);
      if(distance>gap)lines.innerHTML=`<path d="M${x-wrap.left} ${y-wrap.top}L${anchor.x+dx/distance*gap-wrap.left} ${anchor.y+dy/distance*gap-wrap.top}"/>`;
    }
    occupationKey(s){
      const o=s?.occupation;
      return o?`${s.currentPlayer}:${s.turn}:${s.battleSequence||0}:${o.from}:${o.to}:${o.min}:${o.max}`:'';
    }
    prepareOccupation(){
      const panel=this.element.querySelector('.conquest-occupation');
      const live=this.playbackState?null:this.controller.getState();
      const occupation=live?.phase==='occupy'?live.occupation:null;
      const player=this.controller.getPlayer();
      const yours=!!occupation&&(player===0||player===live.currentPlayer);
      if(!occupation||!yours){
        this.occupationView=null;
        if(panel&&!this.playbackState)panel.hidden=true;
        if(!this.playbackState){this.occupyKey=null;this.occupyChoice=null;this.occupyPreview=false;this.autoOccupyKey=null;this.failedAutoOccupy=null;}
        return;
      }
      const key=this.occupationKey(live);
      if(this.occupyKey!==key){
        this.occupyKey=key;
        this.occupyChoice=occupation.max;
        this.occupyPreview=true;
        this.autoOccupyKey=null;
        this.failedAutoOccupy=null;
      }
      this.occupyChoice=Math.max(occupation.min,Math.min(Number(this.occupyChoice),occupation.max));
      this.occupationView={state:live,occupation,key};
    }
    occupationArmies(s,id){
      const view=this.occupationView;
      if(!this.occupyPreview||!view||s.phase!=='occupy')return null;
      const o=view.occupation;
      if(id===o.from)return s.territories[o.from].armies-this.occupyChoice;
      if(id===o.to)return this.occupyChoice;
      return null;
    }
    onOccupyInput(value){
      const view=this.occupationView;
      if(!view)return;
      const o=view.occupation;
      this.occupyPreview=true;
      this.occupyChoice=Math.max(o.min,Math.min(Number(value),o.max));
      this.paintOccupationCounts();
    }
    paintOccupationCounts(){
      const view=this.occupationView;
      if(!view)return;
      const o=view.occupation,s=view.state;
      const from=s.territories[o.from].armies-this.occupyChoice,to=this.occupyChoice;
      const panel=this.element.querySelector('.conquest-occupation');
      panel.querySelector('[data-occupy-from-name]').textContent=this.territoryName(o.from);
      panel.querySelector('[data-occupy-to-name]').textContent=this.territoryName(o.to);
      panel.querySelector('[data-occupy-from-count]').textContent=String(from);
      panel.querySelector('[data-occupy-to-count]').textContent=String(to);
      for(const [id,n] of [[o.from,from],[o.to,to]]){
        const el=this.element.querySelector(`[data-territory="${id}"] .conquest-army-count`);
        if(el)el.textContent=String(n);
      }
    }
    updateOccupation(){
      const panel=this.element.querySelector('.conquest-occupation');
      const view=this.occupationView;
      if(!panel)return;
      if(!view){panel.hidden=true;return;}
      const o=view.occupation;
      const choosing=o.min!==o.max;
      const show=choosing||this.failedAutoOccupy===view.key;
      panel.hidden=!show;
      if(!show)return;
      const input=panel.querySelector('[data-occupy-range]');
      input.hidden=!choosing;
      if(choosing&&document.activeElement!==input){
        input.min=String(o.min);
        input.max=String(o.max);
        input.step='1';
        input.value=String(this.occupyChoice);
      }
      this.paintOccupationCounts();
      const from=view.state.territories[o.from].armies-this.occupyChoice;
      input.setAttribute('aria-valuetext',`${from} remaining in ${this.territoryName(o.from)}, ${this.occupyChoice} in ${this.territoryName(o.to)}`);
      panel.querySelector('[data-do="occupy"]').disabled=!this.canAct();
      this.positionOccupation();
    }
    maybeAutoOccupy(){
      if(this.playbackState||this.busy)return;
      const view=this.occupationView;
      const o=view?.occupation;
      if(!o||o.min!==o.max||!this.canAct())return;
      if(this.autoOccupyKey===view.key||this.failedAutoOccupy===view.key)return;
      this.autoOccupyKey=view.key;
      this.dispatch({type:'occupy',count:o.min});
    }
    positionOccupation(){
      const panel=this.element.querySelector('.conquest-occupation');
      const o=this.occupationView?.occupation;
      if(!panel||!o)return;
      this.placeNearTerritories(panel,[o.from,o.to]);
    }
    prepareFortify(){
      const panel=this.element.querySelector('.conquest-fortify');
      const live=this.playbackState?null:this.controller.getState();
      const player=this.controller.getPlayer();
      const yours=!!live&&(player===0||player===live.currentPlayer);
      const from=this.selected,to=this.target;
      const legal=!!(yours&&live.phase==='fortify'&&from&&to&&root.ConquestEngine.canFortify(live,from,to));
      if(!legal){
        this.fortifyView=null;
        if(panel&&!this.playbackState)panel.hidden=true;
        if(!this.playbackState){this.fortifyKey=null;this.fortifyMove=0;}
        return;
      }
      const max=live.territories[from].armies-1;
      const key=`${live.currentPlayer}:${live.turn}:${from}:${to}:${max}`;
      if(this.fortifyKey!==key){this.fortifyKey=key;this.fortifyMove=0;}
      this.fortifyMove=Math.max(0,Math.min(Number(this.fortifyMove)||0,max));
      this.fortifyView={state:live,from,to,max};
    }
    fortifyArmies(s,id){
      const view=this.fortifyView;
      if(!view||s.phase!=='fortify'||!this.fortifyMove)return null;
      if(id===view.from)return s.territories[view.from].armies-this.fortifyMove;
      if(id===view.to)return s.territories[view.to].armies+this.fortifyMove;
      return null;
    }
    fortifyDistribution(){
      const view=this.fortifyView;
      if(!view)return null;
      const s=view.state;
      return {
        from:s.territories[view.from].armies-this.fortifyMove,
        to:s.territories[view.to].armies+this.fortifyMove
      };
    }
    paintFortifyCounts(){
      const view=this.fortifyView,counts=this.fortifyDistribution();
      if(!view||!counts)return;
      const panel=this.element.querySelector('.conquest-fortify');
      panel.querySelector('[data-fortify-from-name]').textContent=this.territoryName(view.from);
      panel.querySelector('[data-fortify-to-name]').textContent=this.territoryName(view.to);
      panel.querySelector('[data-fortify-from-count]').textContent=String(counts.from);
      panel.querySelector('[data-fortify-to-count]').textContent=String(counts.to);
      for(const [id,n] of [[view.from,counts.from],[view.to,counts.to]]){
        const el=this.element.querySelector(`[data-territory="${id}"] .conquest-army-count`);
        if(el)el.textContent=String(n);
      }
    }
    onFortifyInput(value){
      const view=this.fortifyView;
      if(!view)return;
      this.fortifyMove=Math.max(0,Math.min(Number(value),view.max));
      this.paintFortifyCounts();
      const button=this.element.querySelector('.conquest-fortify [data-do="fortify"]');
      if(button)button.disabled=this.fortifyMove<1||!this.canAct();
    }
    updateFortify(){
      const panel=this.element.querySelector('.conquest-fortify');
      const view=this.fortifyView;
      if(!panel)return;
      if(!view){panel.hidden=true;return;}
      panel.hidden=false;
      const input=panel.querySelector('[data-fortify-range]');
      if(document.activeElement!==input){
        input.min='0';
        input.max=String(view.max);
        input.step='1';
        input.value=String(this.fortifyMove);
      }
      this.paintFortifyCounts();
      const counts=this.fortifyDistribution();
      input.setAttribute('aria-valuetext',`${counts.from} remaining in ${this.territoryName(view.from)}, ${counts.to} in ${this.territoryName(view.to)}`);
      panel.querySelector('[data-do="fortify"]').disabled=this.fortifyMove<1||!this.canAct();
      panel.querySelector('[data-do="cancel-fortify"]').disabled=!this.canAct();
      this.positionFortify();
    }
    positionFortify(){
      const panel=this.element.querySelector('.conquest-fortify');
      const view=this.fortifyView;
      if(!panel||!view)return;
      this.placeNearTerritories(panel,[view.from,view.to]);
    }
    placeNearTerritories(panel,ids,options={}){
      if(!panel||panel.hidden)return;
      const svg=this.element.querySelector('.conquest-map');
      const matrix=svg?.getScreenCTM?.();
      const viewportEl=panel.closest('.conquest-map-viewport')||this.element.querySelector('.conquest-map-viewport');
      if(!matrix||!viewportEl)return;
      const bounds=viewportEl.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const point=svg.createSVGPoint();
      const locate=id=>{
        const territory=root.ConquestMap.territories[id];
        if(!territory)return null;
        point.x=territory.x;point.y=territory.y;
        return point.matrixTransform(matrix);
      };
      const spots=ids.map(locate).filter(Boolean);
      const anchors=(options.anchor?[options.anchor]:ids).map(locate).filter(Boolean);
      if(!spots.length||!anchors.length)return;
      const anchor={x:anchors.reduce((sum,spot)=>sum+spot.x,0)/anchors.length,y:anchors.reduce((sum,spot)=>sum+spot.y,0)/anchors.length};
      if(!anchors.some(spot=>spot.x>=bounds.left&&spot.x<=bounds.right&&spot.y>=bounds.top&&spot.y<=bounds.bottom)){panel.hidden=true;return;}
      const reach=190;
      const blocked=[...svg.querySelectorAll('.conquest-army-count,.conquest-army circle,.conquest-country-label')]
        .map(el=>el.getBoundingClientRect())
        .filter(rect=>rect.width&&rect.height&&rect.right>anchor.x-reach&&rect.left<anchor.x+reach&&rect.bottom>anchor.y-reach&&rect.top<anchor.y+reach);
      const stage=this.element.querySelector('.conquest-battle-overlays');
      if(stage&&!stage.hidden)blocked.push(stage.getBoundingClientRect());
      const limits=options.overflow?{left:bounds.left,top:bounds.top,right:Math.max(bounds.right,Math.min(this.element.getBoundingClientRect().right,window.innerWidth)-8),bottom:bounds.bottom}:bounds;
      const rect=this.findBoardSpace(limits,panel.offsetWidth,panel.offsetHeight,anchor,blocked);
      const width=panel.offsetWidth,height=panel.offsetHeight;
      const left=rect?rect.left:Math.max(limits.left+8,Math.min(anchor.x+16,limits.right-width-8));
      const top=rect?rect.top:Math.max(limits.top+8,Math.min(anchor.y+16,limits.bottom-height-8));
      if(options.overflow){panel.style.position='fixed';panel.style.left=`${left}px`;panel.style.top=`${top}px`;}
      else{panel.style.position='';panel.style.left=`${left-bounds.left}px`;panel.style.top=`${top-bounds.top}px`;}
    }
    positionBattleStage(){
      const stage=this.element.querySelector('.conquest-battle-overlays');
      if(!stage)return;
      const visible=[...stage.querySelectorAll('.conquest-battle-dice')].some(el=>!el.hidden);
      stage.hidden=!visible;
      const svg=this.element.querySelector('.conquest-map');
      svg?.classList.toggle('conquest-battle-active', visible);
      if(!visible)return;
      const matrix=svg.getScreenCTM?.();
      const viewport=stage.parentElement;
      if(!matrix||!viewport)return;
      const bounds=viewport.getBoundingClientRect();
      const corner=(x,y)=>{const point=svg.createSVGPoint();point.x=x;point.y=y;return point.matrixTransform(matrix);};
      const origin=corner(battlePocket.x,battlePocket.y),far=corner(battlePocket.x+battlePocket.width,battlePocket.y+battlePocket.height);
      const width=Math.max(0,far.x-origin.x),height=Math.max(0,far.y-origin.y);
      stage.style.left=`${origin.x-bounds.left}px`;
      stage.style.top=`${origin.y-bounds.top}px`;
      stage.style.width=`${width}px`;
      stage.style.height=`${height}px`;
      // Two groups, their labels and the casualty line share the pocket. Cap each canvas near its previous size.
      const canvasHeight=Math.max(28,Math.min(116,(height-48)/2));
      stage.querySelectorAll('canvas').forEach(canvas=>{canvas.style.height=`${canvasHeight}px`;});
      for(const side of ['attacker','defender'])this.scenes[side]?.resize?.();
    }
    turnStatus(s,yours,finished){
      if(finished)return 'Campaign complete';
      const action={
        claim:['Claim a territory','claiming'],
        setup:s.setupNeutral?['Place neutral armies','placing neutral armies']:['Place armies','placing armies'],
        reinforce:['Place reinforcements','reinforcing'],
        attack:['Attack','attacking'],
        occupy:['Occupy','occupying'],
        fortify:['Fortify','fortifying']
      }[s.phase]||['In progress','playing'];
      return yours?`Your turn · ${action[0]}`:`Waiting · Opponent ${action[1]}`;
    }
    showBattleSummary(text){
      const summary=this.element.querySelector('[data-battle-summary]');
      if(!summary)return;
      summary.replaceChildren();
      if(text)summary.textContent=text;
    }
    showBattleLosses(attacker,defender,conquered){
      const stage=this.element.querySelector('.conquest-battle-overlays');
      if(stage)stage.setAttribute('aria-label',`Attacker lost ${attacker}. Defender lost ${defender}.${conquered?' Territory conquered.':''}`);
      this.showBattleSummary('');
    }
    findBoardSpace(viewport,width,height,anchor,blocked){
      const padding=8;
      let best=null,score=Infinity;
      const consider=(left,top)=>{
        const right=left+width,bottom=top+height;
        if(left<viewport.left+padding||right>viewport.right-padding||top<viewport.top+padding||bottom>viewport.bottom-padding)return;
        if(blocked.some(rect=>left<rect.right+padding&&right>rect.left-padding&&top<rect.bottom+padding&&bottom>rect.top-padding))return;
        const cost=(left+width/2-anchor.x)**2+(top+height/2-anchor.y)**2;
        if(cost<score){best={left,top,right,bottom};score=cost;}
      };
      for(const limit of [150,280,480]){
        const x0=Math.max(viewport.left+padding,anchor.x-limit);
        const x1=Math.min(viewport.right-padding-width,anchor.x+limit);
        const y0=Math.max(viewport.top+padding,anchor.y-limit);
        const y1=Math.min(viewport.bottom-padding-height,anchor.y+limit);
        for(let x=x0;x<=x1;x+=16)for(let y=y0;y<=y1;y+=16)consider(x,y);
        consider(anchor.x-width/2,anchor.y-height-18);
        consider(anchor.x-width/2,anchor.y+22);
        consider(anchor.x+24,anchor.y-height/2);
        consider(anchor.x-width-24,anchor.y-height/2);
        if(best)return best;
      }
      return best;
    }
    battlePause(ms){
      return new Promise(resolve=>{
        const timer=root.setTimeout(()=>{this.cancelBattlePause=null;resolve();},ms);
        this.cancelBattlePause=()=>{root.clearTimeout(timer);resolve();};
      });
    }
    clearBattleResult(){
      this.completedBattle=null;
      this.element.querySelectorAll('.conquest-battle-dice').forEach(el=>el.hidden=true);
      this.showBattleSummary('');
      const stage=this.element.querySelector('.conquest-battle-overlays');
      if(stage)stage.hidden=true;
    }
    async playBattle(next){
      // Visual snapshots never modify the authoritative, already-resolved state.
      this.clearBattleResult();
      this.playbackState=JSON.parse(JSON.stringify(this.renderedState||next));
      this.playbackState.networkBusy=true;
      this.playbackState.phase='attack';
      this.playbackState.currentPlayer=next.battleRolls[0].before.attackerOwner;
      const losses={attacker:0,defender:0};
      const finalRoll=next.battleRolls[next.battleRolls.length-1];
      try{
        for(const roll of next.battleRolls){
          if(this.destroyed)return;
          this.activeRoll=roll;
          const territories=this.playbackState.territories;
          territories[roll.from]={owner:roll.before.attackerOwner,armies:roll.before.attacker};
          territories[roll.to]={owner:roll.before.defenderOwner,armies:roll.before.defender};
          this.render();
          this.showBattleSummary('');
          for(const side of ['attacker','defender']){
            const el=this.element.querySelector(`[data-side="${side}"]`);
            el.hidden=false;
            el.querySelector('canvas').setAttribute('aria-label',`${side==='attacker'?'Attacking':'Defending'} dice: ${roll[side+'Dice'].join(', ')}`);
          }
          this.positionBoardControls();
          const preparations=['attacker','defender'].filter(side=>this.scenes[side]?.prepare).map(side=>
            this.scenes[side].prepare({[side+'Dice']:roll[side+'Dice'],[side+'Owner']:roll.before[side+'Owner']}));
          if(preparations.length)await Promise.all(preparations);
          if(this.destroyed)return;
          await Promise.all(['attacker','defender'].map(side=>{
            const battle=side==='attacker'?{attackerDice:roll.attackerDice}:{defenderDice:roll.defenderDice};
            return this.scenes[side]?.roll(battle)||Promise.resolve();
          }));
          if(this.destroyed)return;
          territories[roll.from].armies-=roll.attackerLosses;
          territories[roll.to].armies-=roll.defenderLosses;
          this.render();
          for(const side of ['attacker','defender'])losses[side]+=roll[side+'Losses'];
          this.positionBoardControls();
          this.showBattleLosses(losses.attacker,losses.defender,roll.conquered&&roll===finalRoll);
          await this.battlePause(800);
        }
        this.completedBattle=finalRoll;
      }finally{
        this.playbackState=null;this.activeRoll=null;
        if(!this.destroyed){
          if(!this.completedBattle)this.clearBattleResult();
          this.render();
        }
      }
    }
    reserve(n,label){return `<div class="conquest-reserve"><strong>${n}</strong><span>${label}</span><svg viewBox="0 0 90 80" aria-hidden="true"><path d="M7 65L35 21L55 61L72 35L84 65Z"/><path d="M35 21V7H64L53 15L64 22H35"/></svg></div>`;}
    selection(){return `<div class="conquest-selection"><span>SELECTED TERRITORY</span><strong>${escape(this.territoryName(this.selected))}</strong></div>`;}
    range(label,max,min=1,value=max){value=Math.max(min,Math.min(value,max));return `<label class="conquest-range-label">${escape(label)}<b data-range-value>${value}</b><input type="range" data-range min="${min}" max="${Math.max(min,max)}" value="${value}" aria-label="${escape(label)}"></label>`;}
    button(action,text,style){return `<button class="conquest-button ${style}" data-do="${action}">${text}</button>`;}
    async dispatch(action,automatic=false) {
      if(automatic?(!this.phaseSkip||!this.canAct()||root.ConquestEngine.automaticPhaseEnd(this.state)?.type!==action.type):!this.interactive())return;
      const phaseKey=this.phaseSkipKey(this.state);
      if(!automatic)this.failedAutoPhase=null;
      if(action.type==='attack')this.clearBattleResult();
      this.busy=true;this.message='';this.render();
      try {
        if(action.type==='attack'){
          const ready=Object.values(this.scenes).map(scene=>scene?.ready).filter(Boolean);
          if(ready.length)await Promise.all(ready);
          if(this.destroyed)return;
        }
        await this.controller.dispatch({...action,player:this.state.currentPlayer});this.render();await this.battlePlayback; if(!['attack','place'].includes(action.type)){this.selected=null;this.target=null;}if(action.type==='attack'&&this.state.phase==='occupy'){this.selected=null;this.target=null;}}
      catch(e){this.message=e.message||'That move is not available.';if(automatic)this.failedAutoPhase=phaseKey;if(action.type==='occupy'&&this.controller.getState()?.phase==='occupy'){this.failedAutoOccupy=this.occupationKey(this.controller.getState());this.occupyPreview=false;}if(action.type==='fortify'&&this.controller.getState()?.phase==='fortify')this.fortifyMove=0;}
      finally{this.busy=false;this.render();}
    }
    select(id) {
      if(!this.interactive())return;
      const s=this.state,t=s.territories[id];this.message='';
      if(s.phase==='claim'){this.dispatch({type:'claim',territory:id});return;}
      if(s.phase==='setup'){this.selected=id;this.dispatch({type:'place',territory:id,count:1});return;}
      if(s.phase==='reinforce'){
        if(s.mustTrade)this.message='Trade a set using the cards icon on your player box before deploying.';
        else if(t.owner!==s.currentPlayer)this.message='Choose a territory you control.';
        else{const count=Number(this.element.querySelector('[data-range]')?.value||this.deployCount||s.reinforcements);this.dispatch({type:'place',territory:id,count});return;}
        this.render();return;
      }
      if(s.phase==='attack'){if(t.owner===s.currentPlayer){this.selected=id;this.target=null;}else if(this.selected&&root.ConquestEngine.canAttack(s,this.selected,id)){this.target=id;}else{this.message=this.selected?'Choose an adjacent enemy territory.':'First choose one of your territories with two or more armies.';}}
      if(s.phase==='fortify'){if(this.selected&&id!==this.selected&&root.ConquestEngine.canFortify(s,this.selected,id)){this.target=id;}else if(t.owner===s.currentPlayer){this.selected=id;this.target=null;}else{this.message='Choose two adjacent territories you control.';}}
      this.render();
    }
    click(e) {
      const territory=e.target.closest('[data-territory]');if(territory){this.select(territory.dataset.territory);return;}
      const el=e.target.closest('[data-do]');if(!el||el.disabled)return;
      const action=el.dataset.do==='target-go'?this.state.phase:el.dataset.do,count=Number(this.element.querySelector('[data-range]')?.value||1);
      if(action==='dispatches'){this.openDispatches();return;}if(action==='close-dispatches'){this.closeDispatches();return;}
      if(action==='stats'){this.element.querySelector('.conquest-local-menu').open=false;this.statistics();return;}
      if(action==='rules'){this.element.querySelector('.conquest-local-menu').open=false;this.rules();return;}if(action==='cards'){this.cards();return;}if(action==='close'){this.closeModal();return;}
      if(action==='names'){this.showNames=!this.showNames;this.namesPreference=this.showNames;this.updateMapLabels();this.positionBoardControls();return;}
      if(action==='attack')this.dispatch({type:'attack',from:this.selected,to:this.target,dice:Number(this.element.querySelector('[data-attack-dice]')?.value||Math.min(3,this.state.territories[this.selected].armies-1)),blitz:el.dataset.attackMode==='blitz',steamroll:!!this.element.querySelector('[data-steamroll]')?.checked});
      if(action==='occupy'){
        const input=this.element.querySelector('[data-occupy-range]');
        const count=Number(input&&!input.hidden?input.value:this.occupyChoice);
        this.occupyPreview=true;
        this.dispatch({type:'occupy',count});
      }
      if(action==='cancel-fortify'){this.selected=null;this.target=null;this.fortifyMove=0;this.message='';this.render();return;}
      if(action==='fortify'){
        const count=Number(this.element.querySelector('[data-fortify-range]')?.value??this.fortifyMove);
        if(count>=1)this.dispatch({type:'fortify',from:this.selected,to:this.target,count});
      }
      if(action==='end_attack')this.dispatch({type:action});
      if(action==='skip_movement')this.dispatch({type:'end_turn'});
      if(action==='select-card')this.selectCard(el.dataset.card);
    }
    modal(title,body,eyebrow='THE FIELD GUIDE'){this.modalType=null;const layer=this.element.querySelector('.conquest-modal-layer');this.modalFocus=document.activeElement;layer.hidden=false;layer.innerHTML=`<section class="conquest-modal" role="dialog" aria-modal="true" aria-label="${escape(title)}"><button class="conquest-modal-close" data-do="close" aria-label="Close dialog">×</button><div class="conquest-eyebrow">${escape(eyebrow)}</div><h2>${escape(title)}</h2>${body}</section>`;layer.querySelector('button').focus();}
    closeModal(){this.modalType=null;this.element.querySelector('.conquest-modal-layer').hidden=true;this.modalFocus?.focus();}
    statistics(){
      this.statisticsScope='total';
      this.modal('Battle statistics.', '<div class="conquest-statistics"></div>', 'THE CAMPAIGN RECORD');
      this.modalType='statistics';this.updateStatistics();
    }
    updateStatistics(){
      const panel=this.element.querySelector('.conquest-statistics');
      if(!panel||this.modalType!=='statistics')return;
      panel.innerHTML=root.ConquestStatisticsTemplate(this.state,id=>this.name(id),this.statisticsScope);
      panel.querySelector('[data-stats-campaign]').onchange=e=>{this.statisticsScope=e.target.value;this.updateStatistics();panel.querySelector('select').focus();};
    }
    continentBonuses(){
      return Object.values(root.ConquestMap.continents).map(c=>{
        const owner=this.state.territories[c.territories[0]].owner;
        const controlled=owner>0&&c.territories.every(id=>this.state.territories[id].owner===owner);
        const held=c.territories.filter(id=>this.state.territories[id].owner===this.state.currentPlayer).length;
        return `<div class="conquest-continent-bonus ${controlled?'controlled':''}" style="--continent:var(--conquest-continent-${c.id},${escape(c.color)})" title="Control all ${c.territories.length} territories for ${c.bonus} extra armies each turn"><div><strong>${escape(c.name)}</strong><small>${controlled?escape(this.name(owner)): `${held}/${c.territories.length} held`}</small></div><b>+${c.bonus}<small>armies / turn</small></b></div>`;
      }).join('');
    }
    rules(){this.modal('A campaign in three acts.',`<p>Conquer all 42 territories to win with 3–6 players. In a two-player game, defeat your opponent; you do not need to conquer the neutral army.</p><div class="conquest-rule"><b>01 / REINFORCE</b><p>Receive one army per three territories (minimum three), plus continent bonuses. Trade three matching card symbols, one of each, or a valid set with a wild card. Set values rise: 4, 6, 8, 10, 12, 15, then +5. At five cards, trade before attacking. An owned territory in your set grants two extra armies on one such territory.</p><p>Control every territory in a continent to receive its bonus at the start of your turn. Progress below is for the current player.</p><div class="conquest-guide-continents">${this.continentBonuses()}</div></div><div class="conquest-rule"><b>02 / ATTACK</b><p>Attack an adjacent rival from a territory with at least two armies. Roll up to three dice; the defender rolls up to two. Compare highest dice, then second highest. Each comparison costs the loser one army; ties favour the defender. Leave one army behind. After victory, move at least as many armies as the dice you rolled. Blitz repeats combat automatically. Steamroll automatically advances all surviving armies from the attacking territory except the one that must stay behind. These options can be used together or separately.</p></div><div class="conquest-rule"><b>03 / FORTIFY</b><p>Make one transfer to an adjacent territory you control, leaving one army at the origin, or skip it. Conquer at least one territory to earn one card at the end of your turn. Eliminating a player gives you their cards; trade immediately when required.</p></div><p class="conquest-small-note">Fast setup assigns territories and initial armies automatically. Classic setup lets players choose and reinforce their positions. In two-player setup, place two of your armies, then one neutral army. Neutral defenders always use the maximum legal dice. This edition uses classic adjacent-territory fortification and automatic maximum defence.</p>`);}
    unitIcon(type) {
      const drawings={
        infantry:'<circle cx="24" cy="9" r="5"/><path d="M18 17H29L32 33H26L29 51H23L21 36L17 51H11L16 31Z"/><path d="M30 13L40 43M28 26L37 28" fill="none" stroke="currentColor" stroke-width="4"/>',
        cavalry:'<path d="M8 29L17 24H30L35 10L40 6L41 16L48 23L44 29L37 25L34 37L38 49H32L27 38H19L14 49H8L13 35L7 33Z"/><path d="M8 28L4 39" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="23" cy="12" r="4"/><path d="M20 18H27L30 29H19Z"/>',
        artillery:'<path d="M9 24L43 13L47 23L13 33Z"/><path d="M26 35L47 47H38L21 40Z"/><circle cx="18" cy="40" r="10" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 30V50M8 40H28M11 33L25 47M11 47L25 33" fill="none" stroke="currentColor" stroke-width="2"/>'
      };
      return `<svg class="conquest-unit-icon" viewBox="0 0 56 56" aria-hidden="true">${drawings[type]||drawings.infantry}</svg>`;
    }
    card(id) {
      const c=root.ConquestEngine.cards[id];if(!c)return '';
      const t=root.ConquestMap.territories[c.territory],continent=t&&root.ConquestMap.continents[t.continent];
      let shape='';
      if(t){
        const points=t.points.split(' ').map(p=>p.split(',').map(Number));
        const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
        const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
        const pad=Math.max(w,h)*.12;
        shape=`<svg class="conquest-card-shape" viewBox="${x-pad} ${y-pad} ${w+pad*2} ${h+pad*2}" role="img" aria-label="${escape(t.name)} territory outline"><path d="${escape(t.path)}"/></svg>`;
      }else shape='<div class="conquest-card-wild" aria-hidden="true">★</div>';
      return `<button type="button" class="conquest-card" data-do="select-card" data-card="${escape(id)}" aria-pressed="false" aria-label="${escape(c.name)}, ${escape(c.symbol)}" style="--continent:${continent?`var(--conquest-continent-${continent.id},${escape(continent.color)})`:'var(--conquest-accent)'}">${shape}<b>${escape(c.name)}</b><div class="conquest-card-unit">${(c.symbol==='wild'?['infantry','cavalry','artillery']:[c.symbol]).map(type=>this.unitIcon(type)).join('')}</div><small>${escape(c.symbol==='wild'?'Wild · any unit':c.symbol)}</small></button>`;
    }
    canTradeCards(){
      const s=this.state,p=this.controller.getPlayer()||s.currentPlayer;
      return this.interactive()&&p===s.currentPlayer&&s.phase==='reinforce'&&(!s.eliminationTrade||s.mustTrade);
    }
    updateCardSelection(){
      const s=this.state,p=this.controller.getPlayer()||s.currentPlayer;
      const hand=s.players.find(player=>player.id===p)?.cards||[];
      for(const id of this.selectedCards)if(!hand.includes(id))this.selectedCards.delete(id);
      this.element.querySelectorAll('[data-card]').forEach(card=>{
        card.disabled=!this.canTradeCards()||!hand.includes(card.dataset.card);
        card.classList.toggle('selected',this.selectedCards.has(card.dataset.card));
        card.setAttribute('aria-pressed',String(this.selectedCards.has(card.dataset.card)));
      });
      const status=this.element.querySelector('[data-card-selection-status]');
      if(status)status.textContent=!this.canTradeCards()?'Trade sets during your reinforcement phase, when it is your turn.':this.selectedCards.size===3?'These cards do not form a set. Click a selected card to deselect it.':`${this.selectedCards.size} of 3 selected. Select three matching symbols, one of each, or a set with a wild card. Valid sets play automatically.`;
    }
    selectCard(id){
      if(!this.canTradeCards())return;
      const hand=this.state.players.find(p=>p.id===this.state.currentPlayer)?.cards||[];
      if(!hand.includes(id))return;
      if(this.selectedCards.has(id))this.selectedCards.delete(id);
      else if(this.selectedCards.size<3)this.selectedCards.add(id);
      this.updateCardSelection();
      const cards=[...this.selectedCards];
      if(root.ConquestEngine.isValidSet(cards)){
        this.selectedCards.clear();this.closeModal();this.dispatch({type:'trade',cards});
      }
    }
    cards(){
      const s=this.state,p=this.controller.getPlayer()||s.currentPlayer,hand=s.players.find(x=>x.id===p)?.cards||[];
      this.selectedCards.clear();
      this.modal('Your cards.',`<p>Choose three cards to trade a set.</p><div class="conquest-card-hand">${hand.map(id=>this.card(id)).join('')||'<p>No cards yet. Your first conquest awaits.</p>'}</div><p class="conquest-small-note" data-card-selection-status role="status" aria-live="polite"></p>`,'YOUR HAND');
      this.updateCardSelection();
    }
    destroy(){document.removeEventListener('click',this.clickAwayHandler,true);root.removeEventListener('resize',this.fitViewport);this.mapResizeObserver?.disconnect();this.boardSizer?.remove();this.destroyed=true;root.clearTimeout(this.phaseSkipTimer);this.cancelBattlePause?.();for(const scene of Object.values(this.scenes))scene?.destroy();this.element.removeEventListener('click',this.clickHandler);this.element.removeEventListener('keydown',this.keyHandler);this.element.innerHTML='';}
  }
  root.ConquestUI=ConquestUI;
})(typeof window!=='undefined'?window:globalThis);
