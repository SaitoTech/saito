(function (root) {
  'use strict';
  const phases = {claim:'Claim your ground',setup:'Build your forces',reinforce:'Raise your armies',attack:'Make your move',occupy:'Advance your armies',fortify:'Secure your borders',gameover:'The world is yours'};
  const icons = ['▲','●','◆','■','✦','⬟'];
  const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class ConquestUI {
    constructor(element, controller) {
      this.element = element; this.controller = controller; this.selected = null; this.target = null; this.message = ''; this.busy = false; this.showNames = true;
      this.selectedCards = new Set(); this.blitz = {}; this.steamroll = {}; this.deployCount = null; this.namesPreference = null;
      this.build(); this.render();
    }
    build() {
      this.element.classList.add('conquest-app');
      this.element.innerHTML = `<header class="conquest-header"><details class="conquest-local-menu" ${this.controller.hasGameMenu?'hidden':''}><summary>Game</summary><nav><button class="conquest-text-button" data-do="stats">Stats</button><button class="conquest-text-button" data-do="rules">Field guide</button><button class="conquest-text-button" data-do="dispatches">Dispatches</button></nav></details><div class="conquest-round"><span>CAMPAIGN</span><b data-round>01</b></div></header>
      <main class="conquest-main"><section class="conquest-board-column"><div class="conquest-map-wrap"><div class="conquest-map-viewport"><svg class="conquest-map" viewBox="0 0 1200 700" aria-label="World map. Choose a territory to play." role="group"></svg></div><div class="conquest-map-footer"><div class="conquest-map-tools"><button class="conquest-text-button" data-do="zoom" aria-pressed="false">Enlarge map +</button><button class="conquest-text-button" data-do="dispatches" aria-label="Dispatches from the front">Dispatches</button><button class="conquest-text-button" data-do="names" aria-pressed="true">Hide labels</button></div></div><div class="conquest-battle-overlays"><div class="conquest-battle-dice" data-side="attacker" role="group" hidden><canvas aria-label="Attacking dice"></canvas><span></span></div><div class="conquest-battle-dice" data-side="defender" role="group" hidden><canvas aria-label="Defending dice"></canvas><span></span></div></div><button class="conquest-target-go conquest-button primary" data-do="target-go" hidden>Go ↗</button><svg class="conquest-overlay-lines" aria-hidden="true"></svg><div class="conquest-tooltip" hidden></div></div></section>
      <aside class="conquest-command"><div class="conquest-command-scroll" tabindex="0" role="region" aria-label="Turn details"><div class="conquest-turn-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="conquest-command-content"></div><div class="conquest-battle-result" aria-live="polite"></div></div><div class="conquest-notice" role="status" aria-live="polite"></div><div class="conquest-command-actions"></div><button class="conquest-cards-button" data-do="cards">Your cards <span>0 ↗</span></button></aside><footer class="conquest-player-row"><div class="conquest-roster" aria-label="Players"></div><a class="conquest-brand" href="/arcade/" aria-label="Saito Arcade"><span class="conquest-brand-word">CONQUEST<span class="conquest-brand-dot">.</span></span></a></footer></main>
      <aside class="conquest-dispatches" aria-label="Dispatches from the front" hidden><button class="conquest-text-button" data-do="close-dispatches" aria-label="Close dispatches">Close ×</button><div class="conquest-journal"><div class="conquest-eyebrow">DISPATCHES FROM THE FRONT</div><ol></ol></div></aside><div class="conquest-modal-layer" hidden></div>`;
      this.scenes = {};
      for(const side of ['attacker','defender'])this.scenes[side]=root.ConquestScene?new root.ConquestScene(this.element.querySelector(`[data-side="${side}"] canvas`)):null;
      this.element.addEventListener('click', this.clickHandler = e => this.click(e));
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
            this.showNames=this.namesPreference??(scale>=.65);
            this.updateMapLabels();this.positionBoardControls();
          }
        });
        this.mapResizeObserver.observe(map);
      }
      this.enableMapPanning();
      this.element.querySelector('.conquest-map-viewport').addEventListener('scroll',()=>this.positionBoardControls());
    }
    enableMapPanning() {
      const viewport=this.element.querySelector('.conquest-map-viewport');
      let drag=null, suppressClick=false;
      viewport.addEventListener('pointerdown', e=>{
        if(!viewport.classList.contains('zoomed')||!e.isPrimary||e.button!==0)return;
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
    name(id) {return id === 0 ? 'Neutral forces' : this.controller.getPlayerName ? this.controller.getPlayerName(id) : `Player ${id}`;}
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
      svg.innerHTML = `<defs><filter id="conquest-paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".11"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply" result="textured"/><feComposite in="textured" in2="SourceGraphic" operator="in"/></filter><pattern id="conquest-neutral" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="#bbb8a8"/><path d="M0 0V8" stroke="#8c907e" stroke-width="2"/></pattern><pattern id="conquest-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="currentColor" stroke-opacity=".065"/></pattern></defs><rect x="0" y="0" width="1200" height="700" fill="url(#conquest-grid)"/><g class="conquest-ocean-labels" aria-hidden="true"><text x="96" y="420" transform="rotate(-90 96 420)">PACIFIC OCEAN</text><text x="480" y="440" transform="rotate(-75 480 440)">ATLANTIC OCEAN</text><text x="795" y="570">INDIAN OCEAN</text><text x="590" y="60">ARCTIC OCEAN</text></g><g class="conquest-connections" aria-hidden="true">${(map.seaLinks||[]).map(([a,b])=>{const f=map.territories[a],t=map.territories[b];return a==='alaska'?'<path d="M100 136L0 136M1112 147L1200 147"/>':`<path d="M${f.x} ${f.y}L${t.x} ${t.y}"/>`;}).join('')}</g><g class="conquest-continent-outlines" aria-hidden="true">${Object.values(map.continents).map(c=>`<path class="conquest-continent-outline" style="--continent:var(--conquest-continent-${c.id},${escape(c.color)})" d="${escape(c.outline||c.territories.map(id=>map.territories[id].path).join(' '))}"/>`).join('')}</g><g class="conquest-land">${Object.values(map.territories).map(t=>`<g class="conquest-territory" data-territory="${escape(t.id)}" tabindex="0" role="button"><title>${escape(t.name)}</title><path class="conquest-country" d="${escape(t.path)}"/><g class="conquest-army" transform="translate(${t.x},${t.y})"><circle r="17"/><text class="conquest-army-count" dy="5">0</text><path class="conquest-army-selected" d="M-25 -14L-25 -25L-14 -25M14 -25L25 -25L25 -14M25 14L25 25L14 25M-14 25L-25 25L-25 14"/></g><text class="conquest-country-label" x="${t.x}" y="${t.y+34}">${escape(t.name)}</text></g>`).join('')}</g><g class="conquest-compass" transform="translate(155 550)" aria-hidden="true"><circle r="43"/><path d="M0 -37L8 0L0 37L-8 0Z"/><path d="M-37 0L0 -8L37 0L0 8Z"/><text y="-54">N</text><text y="68">S</text><text x="-57" y="5">W</text><text x="57" y="5">E</text></g>`;
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
      const ownPlayer=s.players.find(player=>player.id===self), observer=!ownPlayer;
      const finished=s.phase==='gameover', pending=this.busy||s.networkBusy;
      const activity={claim:'choosing a territory',setup:s.setupNeutral?'placing a neutral army':'placing armies',reinforce:'deploying reinforcements',attack:'choosing attacks',occupy:'moving armies into a conquered territory',fortify:'fortifying or ending their turn'}[s.phase]||'taking their turn';
      const context=`${p}:${s.turn}:${s.phase}`;
      if(this.renderedContext!==context){this.selected=null;this.target=null;this.message='';this.deployCount=null;this.selectedCards.clear();}
      this.renderedContext=context;
      if(s.phase==='reinforce')this.deployCount=Math.max(1,Math.min(this.deployCount??s.reinforcements,s.reinforcements));
      const legalMove=s.phase==='attack'?root.ConquestEngine.canAttack:s.phase==='fortify'?root.ConquestEngine.canFortify:null;
      const origins=new Set(turn&&legalMove?Object.keys(s.territories).filter(id=>root.ConquestMap.territories[id].neighbors.some(to=>legalMove(s,id,to))):[]);
      if(legalMove&&this.selected&&!root.ConquestMap.territories[this.selected].neighbors.some(to=>legalMove(s,this.selected,to))){this.selected=null;this.target=null;}
      if(legalMove&&this.target&&!legalMove(s,this.selected,this.target))this.target=null;
      this.element.style.setProperty('--conquest-active',`var(--conquest-player-${p})`);
      this.element.style.setProperty('--conquest-accent',`var(--conquest-player-${p})`);
      this.element.querySelector('[data-round]').textContent=String(root.ConquestEngine.campaignNumber(s)).padStart(2,'0');
      const status=this.element.querySelector('.conquest-turn-status');
      status.dataset.state=finished?'finished':pending?'pending':turn?'ready':'waiting';
      status.style.setProperty('--player',`var(--conquest-player-${p})`);
      status.textContent=finished?'Campaign complete':this.playbackState?'Battle in progress…':this.phaseSkip?'No legal move — advancing shortly…':pending?'Move in progress…':turn?'Your turn — action required':observer?`Watching ${this.name(p)}`:ownPlayer.eliminated?`Eliminated — watching ${this.name(p)}`:`Waiting for ${this.name(p)}`;
      this.element.querySelectorAll('[data-territory]').forEach(el=>{
        const id=el.dataset.territory,t=s.territories[id];if(!t)return;
        el.style.setProperty('--territory-color',t.owner===0?'url(#conquest-neutral)':t.owner?`var(--conquest-player-${t.owner})`:'var(--conquest-unclaimed)');
        el.classList.toggle('selected',id===this.selected);el.classList.toggle('targeted',id===this.target);
        const destination=!!(turn&&this.selected&&legalMove&&legalMove(s,this.selected,id));
        el.classList.toggle('available-origin',origins.has(id));
        el.classList.toggle('attackable',destination&&s.phase==='attack');
        el.classList.toggle('movable',destination&&s.phase==='fortify');
        el.querySelector('.conquest-army-count').textContent=t.owner===null?'–':t.armies;
        el.setAttribute('aria-label',`${this.territoryName(id)}, ${t.owner===null?'unclaimed':this.name(t.owner)}, ${t.armies} armies${destination?', available destination':origins.has(id)?s.phase==='attack'?', can attack from here':', can move from here':''}`);
        el.setAttribute('aria-pressed',String(id===this.selected||id===this.target));
      });
      const content=this.element.querySelector('.conquest-command-content');
      let hint='',body='',actions='';
      if(s.phase==='claim'){hint='Every campaign starts somewhere. Choose an unclaimed territory.';body=this.reserve('1','TERRITORY TO CLAIM');}
      else if(s.phase==='setup'){hint=s.setupNeutral?'Place a neutral army on a grey territory.':'Choose one of your territories to place an army.';body=this.reserve(s.setupRemaining?.[s.setupNeutral?0:p]||0,s.setupNeutral?'NEUTRAL ARMIES TO DEPLOY':'ARMIES TO DEPLOY')+this.selection();}
      else if(s.phase==='reinforce'){hint='Choose how many armies to deploy, then click a territory you control to place them.';body=this.reserve(s.reinforcements,'ARMIES TO DEPLOY');if(!s.mustTrade)body+=this.range('Armies to deploy',s.reinforcements,1,this.deployCount);}
      else if(s.phase==='attack'){
        hint=this.selected?'Highlighted rivals can be attacked from your selected territory. Choose a target.':'Highlighted territories can launch an attack. Choose an origin, then a neighbouring rival.';
        if(this.selected&&this.target&&root.ConquestEngine.canAttack(s,this.selected,this.target)) {const max=Math.min(3,s.territories[this.selected].armies-1);body+=`<div class="conquest-battle-comparison"><span><b>${s.territories[this.selected].armies}</b> YOUR ARMIES</span><i>vs</i><span><b>${s.territories[this.target].armies}</b> DEFENDING</span></div><label class="conquest-dice-choice">Attack dice <select data-attack-dice aria-label="Number of attack dice">${Array.from({length:max},(_,i)=>`<option value="${i+1}" ${i+1===max?'selected':''}>${i+1}</option>`).join('')}</select></label><label class="conquest-check"><input type="checkbox" data-blitz> Blitz until victory or retreat</label><label class="conquest-check"><input type="checkbox" data-steamroll> Steamroll: advance all but one army</label><div class="conquest-small-note">Roll up to ${max} attack dice. Defender rolls up to 2.</div>`;actions=this.button('attack','Launch attack ↗','primary');}
        actions+=this.button('end_attack','Finish attacking →','secondary');
      }
      else if(s.phase==='occupy'){const o=s.occupation;hint=`${this.territoryName(o.to)} is yours. Move armies in to hold it.`;body=this.reserve('⚑','TERRITORY CONQUERED')+this.range('Armies advancing',o.max,o.min);actions=this.button('occupy','Advance & continue →','primary');}
      else if(s.phase==='fortify'){hint=this.selected?'Highlighted friendly territories can receive armies from your selected territory.':'Highlighted territories can move armies. Choose an origin, then an adjacent territory you control.';if(this.selected&&this.target&&root.ConquestEngine.canFortify(s,this.selected,this.target)){body+=this.range('Armies to move',s.territories[this.selected].armies-1);actions=this.button('fortify','Move armies →','primary');}actions+=this.button('skip_movement','Skip movement →','secondary');}
      else if(s.phase==='gameover'){hint=`${this.name(s.winner||p)} controls the world. A campaign for the history books.`;body=this.reserve('✦','WORLD CONQUEROR');}
      let heading=phases[s.phase]||s.phase;
      if(!finished&&!turn){
        heading={claim:'Territory selection',setup:'Army placement',reinforce:'Reinforcements',attack:'Attack',occupy:'Occupation',fortify:'Fortification'}[s.phase]||s.phase;
        hint=pending?(this.controller.getStatus?.()||'Please wait while the move is confirmed.'):`${this.name(p)} is ${activity}. ${observer||ownPlayer.eliminated?'You are watching this game.':'No action needed from you.'}`;
        if(!pending||(localPlayer!==0&&localPlayer!==p))body='';
      }else if(turn&&s.mustTrade){hint='Trade a set from Your cards before continuing your turn.';}
      if(this.playbackState){hint='Watch each roll and the army losses on the map.';body='';}
      if(this.phaseSkip){heading=s.phase==='attack'?'No attacks available':'No movement available';hint=this.phaseSkip.message;body='';actions='';}
      content.innerHTML=`${s.phase==='setup'||s.phase==='claim'?'<div class="conquest-eyebrow conquest-phase-label">PREPARE FOR CONQUEST</div>':''}<h2>${escape(heading)}</h2><p class="conquest-instructions">${escape(hint)}</p>${body}`;
      content.querySelectorAll('input,select').forEach(control=>control.disabled=!turn);
      this.element.querySelector('.conquest-command-actions').innerHTML=actions;
      this.element.querySelectorAll('.conquest-command-actions button').forEach(b=>b.disabled=!turn);
      this.element.querySelector('.conquest-notice').textContent=this.phaseSkip
        ?`${this.name(p)} cannot ${s.phase==='attack'?'attack. Moving on…':'move armies. Ending turn…'}`
        :this.message||this.controller.getStatus?.()||'';
      const handPlayer=this.controller.getPlayer()||p,player=s.players.find(v=>v.id===handPlayer),cards=player?.cards||[];
      this.element.querySelector('.conquest-cards-button').disabled=handPlayer<0;
      this.element.querySelector('.conquest-cards-button span').textContent=`${player?.cardCount ?? cards.length} ↗`;
      this.element.querySelector('.conquest-roster').innerHTML=s.players.map(pl=>{const owned=Object.values(s.territories).filter(t=>t.owner===pl.id);return `<div class="conquest-player-card ${pl.id===p?'active':''} ${pl.id===self?'conquest-player-self':''} ${pl.eliminated?'eliminated':''}" style="--player:var(--conquest-player-${pl.id})"><div class="conquest-player-card-heading">${this.identicon(pl.id)}<b title="${escape(this.name(pl.id))}">${escape(this.name(pl.id))}</b></div><div class="conquest-player-card-labels">${pl.id===self?'<span class="conquest-you-badge">YOU</span>':''}${pl.eliminated?'<span>ELIMINATED</span>':pl.id===p&&!finished?'<span>TURN</span>':''}</div><div class="conquest-player-card-stats"><span><strong>${owned.length}</strong> territories</span><span><strong>${owned.reduce((a,t)=>a+t.armies,0)}</strong> armies</span><span><strong>${pl.cardCount??pl.cards?.length??0}</strong> cards</span><span class="conquest-player-earn" title="Armies earned at the start of the next turn, excluding card trades"><strong>+${root.ConquestEngine.reinforcementFor(s,pl.id)}</strong> earn</span></div></div>`;}).join('');
      const logs=[...(s.log||[])].reverse();
      this.element.querySelector('.conquest-journal ol').innerHTML=logs.length?logs.map(l=>`<li>${escape(typeof l==='string'?l:l.text||l.message||'Campaign in progress.')}</li>`).join(''):'<li>The map is open. Your story begins here.</li>';
      if(!s.lastBattle&&!this.playbackState)this.element.querySelector('.conquest-battle-result').textContent='';
      this.element.querySelector('[data-range]')?.addEventListener('input',e=>{this.element.querySelector('[data-range-value]').textContent=e.target.value;if(s.phase==='reinforce')this.deployCount=Number(e.target.value);});
      for(const mode of ['blitz','steamroll']){
        const control=this.element.querySelector(`[data-${mode}]`);
        if(control){control.checked=!!this[mode][p];control.addEventListener('change',()=>{this[mode][p]=control.checked;});}
      }
      this.updateCardSelection();
      this.updateStatistics();
      this.positionBoardControls();
      if(!this.playbackState)this.renderedState=JSON.parse(JSON.stringify(s));
    }
    identicon(id){
      const src=this.controller.getPlayerIdenticon?.(id);
      return src?`<img class="conquest-identicon" src="${escape(src)}" alt="${escape(this.name(id))} identicon">`:`<span aria-hidden="true">${icons[id-1]}</span>`;
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
      const go=this.element.querySelector('.conquest-target-go');
      if(!go)return;
      const destination=this.state.phase==='occupy'?this.state.occupation?.to:this.target;
      const canGo=destination&&this.interactive()&&(this.state.phase==='occupy'||this.selected&&
        (this.state.phase==='attack'?root.ConquestEngine.canAttack(this.state,this.selected,destination):
          this.state.phase==='fortify'&&root.ConquestEngine.canFortify(this.state,this.selected,destination)));
      go.hidden=!canGo;
      go.disabled=!canGo;
      if(canGo)go.setAttribute('aria-label',`Go: ${this.state.phase==='attack'?'attack':'move to'} ${this.territoryName(destination)}`);
      const lines=this.element.querySelector('.conquest-overlay-lines');
      lines.innerHTML='';
      if(!this.activeRoll&&!canGo)return;
      const svg=this.element.querySelector('.conquest-map'),matrix=svg.getScreenCTM?.();
      if(!matrix)return;
      const bounds=this.element.querySelector('.conquest-map-wrap').getBoundingClientRect();
      const viewport=this.element.querySelector('.conquest-map-viewport').getBoundingClientRect();
      if(!viewport.width||!viewport.height)return;
      // Protect every visible sector name and count, not only the combatants.
      const blocked=[...svg.querySelectorAll('.conquest-country-label,.conquest-army-count,.conquest-army circle')]
        .map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
      const panels=this.activeRoll?['attacker','defender'].map(side=>({
        el:this.element.querySelector(`[data-side="${side}"]`),id:this.activeRoll[side==='attacker'?'from':'to']
      })):[{el:go,id:destination}];
      const overlays=this.element.querySelector('.conquest-battle-overlays');
      if(this.activeRoll&&overlays.classList.contains('docked'))return;
      const placed=[];
      for(const {el,id} of panels){
        if(el.hidden)continue;
        const t=root.ConquestMap.territories[id],point=svg.createSVGPoint();
        point.x=t.x;point.y=t.y;
        const anchor=point.matrixTransform(matrix);
        if(!this.activeRoll&&(anchor.x<viewport.left||anchor.x>viewport.right||anchor.y<viewport.top||anchor.y>viewport.bottom)){
          go.hidden=true;continue;
        }
        el.title=`${this.activeRoll?(id===this.activeRoll.from?'Attacking: ':'Defending: '):''}${this.territoryName(id)}`;
        const rect=this.findBoardSpace(viewport,el.offsetWidth,el.offsetHeight,anchor,[...blocked,...placed]);
        if(!rect){
          if(this.activeRoll){overlays.classList.add('docked');lines.innerHTML='';}
          else go.hidden=true;
          return;
        }
        el.style.left=`${rect.left-bounds.left}px`;el.style.top=`${rect.top-bounds.top}px`;
        placed.push(rect);
        // A short leader associates displaced dice / Go with their country.
        const x=Math.max(rect.left,Math.min(anchor.x,rect.right)),y=Math.max(rect.top,Math.min(anchor.y,rect.bottom));
        const dx=x-anchor.x,dy=y-anchor.y,distance=Math.hypot(dx,dy),gap=Math.min(22,distance);
        if(distance>gap)lines.innerHTML+=`<path d="M${x-bounds.left} ${y-bounds.top}L${anchor.x+dx/distance*gap-bounds.left} ${anchor.y+dy/distance*gap-bounds.top}"/>`;
      }
    }
    findBoardSpace(viewport,width,height,anchor,blocked){
      const padding=6;
      let best=null,score=Infinity;
      const xs=[anchor.x-width/2,viewport.right-width-padding],ys=[anchor.y-height-24,anchor.y+24,viewport.bottom-height-padding];
      for(let x=viewport.left+padding;x+width<=viewport.right-padding;x+=12)xs.push(x);
      for(let y=viewport.top+padding;y+height<=viewport.bottom-padding;y+=12)ys.push(y);
      for(const left of xs)for(const top of ys){
        const right=left+width,bottom=top+height;
        if(left<viewport.left+padding||right>viewport.right-padding||top<viewport.top+padding||bottom>viewport.bottom-padding)continue;
        const cost=(left+width/2-anchor.x)**2+(top+height/2-anchor.y)**2;
        if(cost>=score||blocked.some(r=>left<r.right+padding&&right>r.left-padding&&top<r.bottom+padding&&bottom>r.top-padding))continue;
        best={left,top,right,bottom};score=cost;
      }
      return best;
    }
    battlePause(ms){
      return new Promise(resolve=>{
        const timer=root.setTimeout(()=>{this.cancelBattlePause=null;resolve();},ms);
        this.cancelBattlePause=()=>{root.clearTimeout(timer);resolve();};
      });
    }
    async playBattle(next){
      // Visual snapshots never modify the authoritative, already-resolved state.
      const viewport=this.element.querySelector('.conquest-map-viewport');
      if(viewport.classList.contains('zoomed')){
        viewport.classList.remove('zoomed');
        const zoom=this.element.querySelector('[data-do="zoom"]');
        zoom.textContent='Enlarge map +';zoom.setAttribute('aria-pressed','false');
      }
      this.playbackState=JSON.parse(JSON.stringify(this.renderedState||next));
      this.playbackState.networkBusy=true;
      this.playbackState.phase='attack';
      this.playbackState.currentPlayer=next.battleRolls[0].before.attackerOwner;
      try{
        for(const roll of next.battleRolls){
          if(this.destroyed)return;
          this.activeRoll=roll;
          const territories=this.playbackState.territories;
          territories[roll.from]={owner:roll.before.attackerOwner,armies:roll.before.attacker};
          territories[roll.to]={owner:roll.before.defenderOwner,armies:roll.before.defender};
          this.render();
          this.element.querySelector('.conquest-battle-result').textContent=`${this.territoryName(roll.from)} attacks ${this.territoryName(roll.to)}…`;
          for(const side of ['attacker','defender']){
            const el=this.element.querySelector(`[data-side="${side}"]`);
            el.title=`${side==='attacker'?'Attacking: ':'Defending: '}${this.territoryName(roll[side==='attacker'?'from':'to'])}`;
            el.setAttribute('aria-label',el.title);
            el.hidden=false;el.querySelector('span').textContent=`${side==='attacker'?'ATTACK':'DEFEND'} · ${roll.before[side]}`;
            el.querySelector('canvas').setAttribute('aria-label',`${side==='attacker'?'Attacking':'Defending'} dice: ${roll[side+'Dice'].join(', ')}`);
          }
          this.positionBoardControls();
          await Promise.all(['attacker','defender'].map(side=>{
            const battle=side==='attacker'?{attackerDice:roll.attackerDice}:{defenderDice:roll.defenderDice};
            return this.scenes[side]?.roll(battle)||Promise.resolve();
          }));
          if(this.destroyed)return;
          territories[roll.from].armies-=roll.attackerLosses;
          territories[roll.to].armies-=roll.defenderLosses;
          this.render();
          for(const side of ['attacker','defender']){
            this.element.querySelector(`[data-side="${side}"] span`).textContent=`−${roll[side+'Losses']} · ${roll.before[side]-roll[side+'Losses']} armies`;
          }
          this.positionBoardControls();
          this.element.querySelector('.conquest-battle-result').textContent=`Attack ${roll.attackerDice.join(' · ')} / Defend ${roll.defenderDice.join(' · ')} — Lost ${roll.attackerLosses} attacking / ${roll.defenderLosses} defending${roll.conquered?' · Territory conquered!':''}`;
          await this.battlePause(500);
        }
      }finally{
        this.playbackState=null;this.activeRoll=null;
        this.element.querySelector('.conquest-battle-overlays')?.classList.remove('docked');
        if(!this.destroyed){
          this.element.querySelectorAll('.conquest-battle-dice').forEach(el=>el.hidden=true);
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
      this.busy=true;this.message='';this.render();
      try {await this.controller.dispatch({...action,player:this.state.currentPlayer});this.render();await this.battlePlayback; if(!['attack','place'].includes(action.type)){this.selected=null;this.target=null;}if(action.type==='attack'&&this.state.phase==='occupy'){this.selected=null;this.target=null;}}
      catch(e){this.message=e.message||'That move is not available.';if(automatic)this.failedAutoPhase=phaseKey;}
      finally{this.busy=false;this.render();}
    }
    select(id) {
      if(!this.interactive())return;
      const s=this.state,t=s.territories[id];this.message='';
      if(s.phase==='claim'){this.dispatch({type:'claim',territory:id});return;}
      if(s.phase==='setup'){this.selected=id;this.dispatch({type:'place',territory:id,count:1});return;}
      if(s.phase==='reinforce'){
        if(s.mustTrade)this.message='Trade a set from Your cards before deploying.';
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
      if(action==='zoom'){const viewport=this.element.querySelector('.conquest-map-viewport'),zoomed=viewport.classList.toggle('zoomed');el.textContent=zoomed?'Fit map −':'Enlarge map +';el.setAttribute('aria-pressed',String(zoomed));return;}
      if(action==='names'){this.showNames=!this.showNames;this.namesPreference=this.showNames;this.updateMapLabels();this.positionBoardControls();return;}
      if(action==='attack')this.dispatch({type:'attack',from:this.selected,to:this.target,dice:Number(this.element.querySelector('[data-attack-dice]')?.value||Math.min(3,this.state.territories[this.selected].armies-1)),blitz:!!this.element.querySelector('[data-blitz]')?.checked,steamroll:!!this.element.querySelector('[data-steamroll]')?.checked});
      if(action==='occupy')this.dispatch({type:'occupy',count});
      if(action==='fortify')this.dispatch({type:'fortify',from:this.selected,to:this.target,count});
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
    destroy(){document.removeEventListener('click',this.clickAwayHandler,true);root.removeEventListener('resize',this.fitViewport);this.mapResizeObserver?.disconnect();this.destroyed=true;root.clearTimeout(this.phaseSkipTimer);this.cancelBattlePause?.();for(const scene of Object.values(this.scenes))scene?.destroy();this.element.removeEventListener('click',this.clickHandler);this.element.removeEventListener('keydown',this.keyHandler);this.element.innerHTML='';}
  }
  root.ConquestUI=ConquestUI;
})(typeof window!=='undefined'?window:globalThis);
