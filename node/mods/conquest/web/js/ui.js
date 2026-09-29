(function (root) {
  'use strict';
  const phases = {claim:'Claim your ground',setup:'Build your forces',reinforce:'Raise your armies',attack:'Make your move',occupy:'Advance your armies',fortify:'Secure your borders',gameover:'The world is yours'};
  const icons = ['▲','●','◆','■','✦','⬟'];
  const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class ConquestUI {
    constructor(element, controller) {
      this.element = element; this.controller = controller; this.selected = null; this.target = null; this.message = ''; this.busy = false; this.lastBattle = null; this.showNames = true;
      this.build(); this.render();
    }
    build() {
      this.element.classList.add('conquest-app');
      this.element.innerHTML = `<header class="conquest-header"><a class="conquest-brand" href="/arcade/" aria-label="Saito Arcade"><span class="conquest-brand-word">CONQUEST<span class="conquest-brand-dot">.</span></span></a><div class="conquest-turn-owner"></div><div class="conquest-header-right"><div class="conquest-round"><span>CAMPAIGN</span><b data-round>01</b></div><button class="conquest-text-button" data-do="rules" aria-label="The field guide"><span class="conquest-guide-label">The field guide</span> <span>↗</span></button></div></header>
      <main class="conquest-main"><section class="conquest-board-column"><div class="conquest-map-wrap"><div class="conquest-map-viewport"><svg class="conquest-map" viewBox="0 0 1200 700" aria-label="World map. Choose a territory to play." role="group"></svg></div><div class="conquest-map-footer"><div class="conquest-map-tools"><button class="conquest-text-button" data-do="zoom" aria-pressed="false">Enlarge map +</button><button class="conquest-text-button" data-do="names" aria-pressed="true">Hide labels</button></div></div><div class="conquest-tooltip" hidden></div></div></section>
      <aside class="conquest-command"><div class="conquest-turn-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="conquest-phase-track"></div><div class="conquest-command-content"></div><div class="conquest-dice-stage"><canvas aria-label="Animated battle dice"></canvas><div class="conquest-dice-caption">A LITTLE STRATEGY. A LITTLE LUCK.</div></div><div class="conquest-battle-result" aria-live="polite"></div><div class="conquest-notice" role="status" aria-live="polite"></div><div class="conquest-command-actions"></div><button class="conquest-cards-button" data-do="cards">Your cards <span>0 ↗</span></button><div class="conquest-journal"><div class="conquest-eyebrow">DISPATCHES FROM THE FRONT</div><ol></ol></div></aside><div class="conquest-roster" aria-label="Players"></div></main>
      <div class="conquest-modal-layer" hidden></div>`;
      this.scene = root.ConquestScene ? new root.ConquestScene(this.element.querySelector('canvas')) : null;
      this.element.addEventListener('click', this.clickHandler = e => this.click(e));
      this.element.addEventListener('keydown', this.keyHandler = e => {
        if ((e.key==='Enter'||e.key===' ') && e.target.closest('[data-territory]')) {e.preventDefault();this.select(e.target.closest('[data-territory]').dataset.territory);}
        if(e.key==='Escape') this.closeModal();
        if(e.key==='Tab'){const layer=this.element.querySelector('.conquest-modal-layer');if(!layer.hidden){const items=[...layer.querySelectorAll('button:not(:disabled),select,input,a[href]')].filter(el=>!el.hidden);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
      });
      this.fitViewport = () => {
        const top = Math.max(0, this.element.getBoundingClientRect().top);
        this.element.style.setProperty('--conquest-top-offset', `${top}px`);
      };
      root.addEventListener('resize', this.fitViewport);
      this.fitViewport();
      this.renderMap();
      this.enableMapPanning();
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
    get state() {return this.controller.getState();}
    name(id) {return id === 0 ? 'Neutral forces' : this.controller.getPlayerName ? this.controller.getPlayerName(id) : `Player ${id}`;}
    territoryName(id) {return root.ConquestMap.territories[id]?.name || id || 'Choose a territory';}
    interactive() {const p=this.controller.getPlayer();return !this.busy && !this.state.networkBusy && this.state.phase!=='gameover' && (p===0||p===this.state.currentPlayer);}
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
      const s=this.state;if(!s)return;
      const p=s.currentPlayer, turn=this.interactive();
      const localPlayer=this.controller.getPlayer(), self=localPlayer===0?p:localPlayer;
      const ownPlayer=s.players.find(player=>player.id===self), observer=!ownPlayer;
      const finished=s.phase==='gameover', pending=this.busy||s.networkBusy;
      const activity={claim:'choosing a territory',setup:s.setupNeutral?'placing a neutral army':'placing armies',reinforce:'deploying reinforcements',attack:'choosing attacks',occupy:'moving armies into a conquered territory',fortify:'fortifying or ending their turn'}[s.phase]||'taking their turn';
      if(this.renderedPlayer!==undefined&&this.renderedPlayer!==p){this.selected=null;this.target=null;this.message='';}this.renderedPlayer=p;
      this.element.style.setProperty('--conquest-active',`var(--conquest-player-${p})`);
      this.element.querySelector('[data-round]').textContent=String(s.round||s.turn||1).padStart(2,'0');
      this.element.querySelector('.conquest-turn-owner').innerHTML=`<span class="conquest-player-seal" style="--player:${observer?'var(--conquest-muted)':`var(--conquest-player-${self})`}" aria-hidden="true">${observer?'◎':icons[self-1]||'▲'}</span><div><span class="conquest-eyebrow">${observer?'SPECTATING':localPlayer===0?'HOTSEAT · YOU ARE':'YOU ARE · PLAYER '+self}</span><strong title="${escape(observer?'Spectator':this.name(self))}">${escape(observer?'Spectator':this.name(self))}</strong></div>`;
      const status=this.element.querySelector('.conquest-turn-status');
      status.dataset.state=finished?'finished':pending?'pending':turn?'ready':'waiting';
      status.style.setProperty('--player',`var(--conquest-player-${p})`);
      status.textContent=finished?'Campaign complete':pending?'Move in progress…':turn?'Your turn — action required':observer?`Watching ${this.name(p)}`:ownPlayer.eliminated?`Eliminated — watching ${this.name(p)}`:`Waiting for ${this.name(p)}`;
      if(this.renderedStatus!==status.textContent){this.element.querySelector('.conquest-command').scrollTop=0;this.renderedStatus=status.textContent;}
      const phasesOrder=['reinforce','attack','fortify'];
      this.element.querySelector('.conquest-phase-track').innerHTML=phasesOrder.map((v,i)=>`<span class="${s.phase===v||s.phase==='occupy'&&v==='attack'?'active':''}"><b>0${i+1}</b>${v}</span>`).join('');
      this.element.querySelectorAll('[data-territory]').forEach(el=>{
        const id=el.dataset.territory,t=s.territories[id];if(!t)return;
        el.style.setProperty('--territory-color',t.owner===0?'url(#conquest-neutral)':t.owner?`var(--conquest-player-${t.owner})`:'var(--conquest-unclaimed)');
        el.classList.toggle('selected',id===this.selected);el.classList.toggle('targeted',id===this.target);
        el.classList.toggle('attackable',!!(this.selected&&s.phase==='attack'&&root.ConquestEngine.canAttack(s,this.selected,id)));
        el.querySelector('.conquest-army-count').textContent=t.armies||'–';
        el.setAttribute('aria-label',`${this.territoryName(id)}, ${t.owner===null?'unclaimed':this.name(t.owner)}, ${t.armies} armies`);
        el.setAttribute('aria-pressed',String(id===this.selected||id===this.target));
      });
      const content=this.element.querySelector('.conquest-command-content');
      let hint='',body='',actions='';
      if(s.phase==='claim'){hint='Every campaign starts somewhere. Choose an unclaimed territory.';body=this.reserve('1','TERRITORY TO CLAIM');}
      else if(s.phase==='setup'){hint=s.setupNeutral?'Place a neutral army on a grey territory.':'Choose one of your territories to place an army.';body=this.reserve(s.setupRemaining?.[s.setupNeutral?0:p]||0,s.setupNeutral?'NEUTRAL ARMIES TO DEPLOY':'ARMIES TO DEPLOY')+this.selection();}
      else if(s.phase==='reinforce'){hint='Strengthen your position. Select a territory and deploy your fresh armies.';body=this.reserve(s.reinforcements,'ARMIES TO DEPLOY')+this.selection();if(this.selected&&s.territories[this.selected]?.owner===p) {body+=this.range('Armies to deploy',s.reinforcements);actions=this.button('place','Deploy armies','primary');}}
      else if(s.phase==='attack'){
        hint='Choose your territory, then a neighbouring rival. Leave at least one army behind.';body=this.selection(true);
        if(this.selected&&this.target&&root.ConquestEngine.canAttack(s,this.selected,this.target)) {const max=Math.min(3,s.territories[this.selected].armies-1);body+=`<div class="conquest-battle-comparison"><span><b>${s.territories[this.selected].armies}</b> YOUR ARMIES</span><i>vs</i><span><b>${s.territories[this.target].armies}</b> DEFENDING</span></div><label class="conquest-dice-choice">Attack dice <select data-attack-dice aria-label="Number of attack dice">${Array.from({length:max},(_,i)=>`<option value="${i+1}" ${i+1===max?'selected':''}>${i+1}</option>`).join('')}</select></label><label class="conquest-check"><input type="checkbox" data-blitz> Blitz until victory or retreat</label><div class="conquest-small-note">Roll up to ${max} attack dice. Defender rolls up to 2.</div>`;actions=this.button('attack','Launch attack ↗','primary');}
        actions+=this.button('end_attack','Finish attacking →','secondary');
      }
      else if(s.phase==='occupy'){const o=s.occupation;hint=`${this.territoryName(o.to)} is yours. Move armies in to hold it.`;body=this.reserve('⚑','TERRITORY CONQUERED')+this.range('Armies advancing',o.max,o.min);actions=this.button('occupy','Advance & continue →','primary');}
      else if(s.phase==='fortify'){hint='One final move: transfer armies between two adjacent territories you control.';body=this.selection(true);if(this.selected&&this.target&&root.ConquestEngine.canFortify(s,this.selected,this.target)){body+=this.range('Armies to move',s.territories[this.selected].armies-1);actions=this.button('fortify','Move armies & end turn','primary');}actions+=this.button('end_turn','End your turn →','secondary');}
      else if(s.phase==='gameover'){hint=`${this.name(s.winner||p)} controls the world. A campaign for the history books.`;body=this.reserve('✦','WORLD CONQUEROR');}
      let heading=phases[s.phase]||s.phase;
      if(!finished&&!turn){
        heading={claim:'Territory selection',setup:'Army placement',reinforce:'Reinforcements',attack:'Attack',occupy:'Occupation',fortify:'Fortification'}[s.phase]||s.phase;
        hint=pending?(this.controller.getStatus?.()||'Please wait while the move is confirmed.'):`${this.name(p)} is ${activity}. ${observer||ownPlayer.eliminated?'You are watching this game.':'No action needed from you.'}`;
        body='';
      }else if(turn&&s.mustTrade){hint='Trade a set from Your cards before continuing your turn.';}
      content.innerHTML=`<div class="conquest-eyebrow conquest-phase-label">${s.phase==='setup'||s.phase==='claim'?'PREPARE FOR CONQUEST':'THE NEXT CHAPTER'}</div><h2>${escape(heading)}</h2><p class="conquest-instructions">${escape(hint)}</p>${body}`;
      this.element.querySelector('.conquest-command-actions').innerHTML=actions;
      this.element.querySelectorAll('.conquest-command-actions button').forEach(b=>b.disabled=!turn);
      this.element.querySelector('.conquest-notice').textContent=this.message||this.controller.getStatus?.()||'';
      const handPlayer=this.controller.getPlayer()||p,player=s.players.find(v=>v.id===handPlayer),cards=player?.cards||[];
      this.element.querySelector('.conquest-cards-button').disabled=handPlayer<0;
      this.element.querySelector('.conquest-cards-button span').textContent=`${player?.cardCount ?? cards.length} ↗`;
      this.element.querySelector('.conquest-roster').innerHTML=s.players.map(pl=>{const owned=Object.values(s.territories).filter(t=>t.owner===pl.id);return `<div class="conquest-player-card ${pl.id===p?'active':''} ${pl.id===self?'conquest-player-self':''} ${pl.eliminated?'eliminated':''}" style="--player:var(--conquest-player-${pl.id})"><div class="conquest-player-card-heading"><span>${icons[pl.id-1]}</span><b title="${escape(this.name(pl.id))}">${escape(this.name(pl.id))}</b></div><div class="conquest-player-card-labels">${pl.id===self?'<span class="conquest-you-badge">YOU</span>':''}${pl.eliminated?'<span>ELIMINATED</span>':pl.id===p&&!finished?'<span>TURN</span>':''}</div><div class="conquest-player-card-stats"><span><strong>${owned.length}</strong> territories</span><span><strong>${owned.reduce((a,t)=>a+t.armies,0)}</strong> armies</span></div></div>`;}).join('');
      const logs=(s.log||[]).slice(-4).reverse();
      this.element.querySelector('.conquest-journal ol').innerHTML=logs.length?logs.map(l=>`<li>${escape(typeof l==='string'?l:l.text||l.message||'Campaign in progress.')}</li>`).join(''):'<li>The map is open. Your story begins here.</li>';
      const battle=s.lastBattle;
      if(!battle){this.lastBattle=null;this.element.querySelector('.conquest-battle-result').textContent='';}
      if(battle&&JSON.stringify(battle)!==this.lastBattle){this.lastBattle=JSON.stringify(battle);if(this.scene)this.scene.roll(battle);this.element.querySelector('.conquest-battle-result').innerHTML=`<span>ATTACK ${escape((battle.attackerDice||[]).join(' · '))}</span><span>DEFEND ${escape((battle.defenderDice||[]).join(' · '))}</span><small>Lost ${battle.attackerLosses||0} attacking / ${battle.defenderLosses||0} defending${battle.conquered?' · Territory conquered!':''}</small>`;}
      this.element.querySelector('[data-range]')?.addEventListener('input',e=>{this.element.querySelector('[data-range-value]').textContent=e.target.value;});
    }
    reserve(n,label){return `<div class="conquest-reserve"><strong>${n}</strong><span>${label}</span><svg viewBox="0 0 90 80" aria-hidden="true"><path d="M7 65L35 21L55 61L72 35L84 65Z"/><path d="M35 21V7H64L53 15L64 22H35"/></svg></div>`;}
    selection(target=false){return `<div class="conquest-selection"><span>${target?'FROM':'SELECTED TERRITORY'}</span><strong>${escape(this.territoryName(this.selected))}</strong>${target?`<span class="conquest-selection-arrow">↓</span><span>TO</span><strong>${escape(this.target?this.territoryName(this.target):'Choose your destination')}</strong>`:''}</div>`;}
    range(label,max,min=1){const value=Math.max(min,max);return `<label class="conquest-range-label">${escape(label)}<b data-range-value>${value}</b><input type="range" data-range min="${min}" max="${Math.max(min,max)}" value="${value}" aria-label="${escape(label)}"></label>`;}
    button(action,text,style){return `<button class="conquest-button ${style}" data-do="${action}">${text}</button>`;}
    async dispatch(action) {
      if(!this.interactive())return;
      this.busy=true;this.message='';this.render();
      try {await this.controller.dispatch({...action,player:this.state.currentPlayer}); if(!['attack','place'].includes(action.type)){this.selected=null;this.target=null;}if(action.type==='attack'&&this.state.phase==='occupy'){this.selected=null;this.target=null;}}
      catch(e){this.message=e.message||'That move is not available.';}
      finally{this.busy=false;this.render();}
    }
    select(id) {
      if(!this.interactive())return;
      const s=this.state,t=s.territories[id];this.message='';
      if(s.phase==='claim'){this.dispatch({type:'claim',territory:id});return;}
      if(s.phase==='setup'){this.selected=id;this.dispatch({type:'place',territory:id,count:1});return;}
      if(s.phase==='reinforce'){if(t.owner!==s.currentPlayer){this.message='Choose a territory you control.';}else{this.selected=id;this.target=null;}this.render();return;}
      if(s.phase==='attack'){if(t.owner===s.currentPlayer){this.selected=id;this.target=null;}else if(this.selected&&root.ConquestEngine.canAttack(s,this.selected,id)){this.target=id;}else{this.message=this.selected?'Choose an adjacent enemy territory.':'First choose one of your territories with two or more armies.';}}
      if(s.phase==='fortify'){if(this.selected&&id!==this.selected&&root.ConquestEngine.canFortify(s,this.selected,id)){this.target=id;}else if(t.owner===s.currentPlayer){this.selected=id;this.target=null;}else{this.message='Choose two adjacent territories you control.';}}
      this.render();
    }
    click(e) {
      const territory=e.target.closest('[data-territory]');if(territory){this.select(territory.dataset.territory);return;}
      const el=e.target.closest('[data-do]');if(!el||el.disabled)return;
      const action=el.dataset.do,count=Number(this.element.querySelector('[data-range]')?.value||1);
      if(action==='rules'){this.rules();return;}if(action==='cards'){this.cards();return;}if(action==='close'){this.closeModal();return;}
      if(action==='zoom'){const viewport=this.element.querySelector('.conquest-map-viewport'),zoomed=viewport.classList.toggle('zoomed');el.textContent=zoomed?'Fit map −':'Enlarge map +';el.setAttribute('aria-pressed',String(zoomed));return;}
      if(action==='names'){this.showNames=!this.showNames;this.element.classList.toggle('conquest-hide-labels',!this.showNames);el.textContent=this.showNames?'Hide labels':'Show labels';el.setAttribute('aria-pressed',String(this.showNames));return;}
      if(action==='place')this.dispatch({type:'place',territory:this.selected,count});
      if(action==='attack')this.dispatch({type:'attack',from:this.selected,to:this.target,dice:Number(this.element.querySelector('[data-attack-dice]')?.value||Math.min(3,this.state.territories[this.selected].armies-1)),blitz:!!this.element.querySelector('[data-blitz]')?.checked});
      if(action==='occupy')this.dispatch({type:'occupy',count});
      if(action==='fortify')this.dispatch({type:'fortify',from:this.selected,to:this.target,count});
      if(action==='end_attack'||action==='end_turn')this.dispatch({type:action});
      if(action==='trade'){const cards=JSON.parse(el.dataset.cards);this.closeModal();this.dispatch({type:'trade',cards});}
    }
    modal(title,body){const layer=this.element.querySelector('.conquest-modal-layer');this.modalFocus=document.activeElement;layer.hidden=false;layer.innerHTML=`<section class="conquest-modal" role="dialog" aria-modal="true" aria-label="${escape(title)}"><button class="conquest-modal-close" data-do="close" aria-label="Close dialog">×</button><div class="conquest-eyebrow">THE FIELD GUIDE</div><h2>${escape(title)}</h2>${body}</section>`;layer.querySelector('button').focus();}
    closeModal(){this.element.querySelector('.conquest-modal-layer').hidden=true;this.modalFocus?.focus();}
    continentBonuses(){
      return Object.values(root.ConquestMap.continents).map(c=>{
        const owner=this.state.territories[c.territories[0]].owner;
        const controlled=owner>0&&c.territories.every(id=>this.state.territories[id].owner===owner);
        const held=c.territories.filter(id=>this.state.territories[id].owner===this.state.currentPlayer).length;
        return `<div class="conquest-continent-bonus ${controlled?'controlled':''}" style="--continent:var(--conquest-continent-${c.id},${escape(c.color)})" title="Control all ${c.territories.length} territories for ${c.bonus} extra armies each turn"><div><strong>${escape(c.name)}</strong><small>${controlled?escape(this.name(owner)): `${held}/${c.territories.length} held`}</small></div><b>+${c.bonus}<small>armies / turn</small></b></div>`;
      }).join('');
    }
    rules(){this.modal('A campaign in three acts.',`<p>Conquer all 42 territories to win with 3–6 players. In a two-player game, defeat your opponent; you do not need to conquer the neutral army.</p><div class="conquest-rule"><b>01 / REINFORCE</b><p>Receive one army per three territories (minimum three), plus continent bonuses. Trade three matching card symbols, one of each, or a valid set with a wild card. Set values rise: 4, 6, 8, 10, 12, 15, then +5. At five cards, trade before attacking. An owned territory in your set grants two extra armies on one such territory.</p><p>Control every territory in a continent to receive its bonus at the start of your turn. Progress below is for the current player.</p><div class="conquest-guide-continents">${this.continentBonuses()}</div></div><div class="conquest-rule"><b>02 / ATTACK</b><p>Attack an adjacent rival from a territory with at least two armies. Roll up to three dice; the defender rolls up to two. Compare highest dice, then second highest. Each comparison costs the loser one army; ties favour the defender. Leave one army behind. After victory, move at least as many armies as the dice you rolled. Blitz repeats combat automatically.</p></div><div class="conquest-rule"><b>03 / FORTIFY</b><p>Make one transfer to an adjacent territory you control, leaving one army at the origin, or skip it. Conquer at least one territory to earn one card at the end of your turn. Eliminating a player gives you their cards; trade immediately when required.</p></div><p class="conquest-small-note">Fast setup assigns territories and initial armies automatically. Classic setup lets players choose and reinforce their positions. In two-player setup, place two of your armies, then one neutral army. Neutral defenders always use the maximum legal dice. This edition uses classic adjacent-territory fortification and automatic maximum defence.</p>`);}
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
      return `<article class="conquest-card" style="--continent:${continent?`var(--conquest-continent-${continent.id},${escape(continent.color)})`:'var(--conquest-accent)'}">${shape}<b>${escape(c.name)}</b><div class="conquest-card-unit">${(c.symbol==='wild'?['infantry','cavalry','artillery']:[c.symbol]).map(type=>this.unitIcon(type)).join('')}</div><small>${escape(c.symbol==='wild'?'Wild · any unit':c.symbol)}</small></article>`;
    }
    cards(){const s=this.state,p=this.controller.getPlayer()||s.currentPlayer,player=s.players.find(x=>x.id===p),cards=player?.cards||[],trades=p>0?(root.ConquestEngine.validTrades(s,p)||[]):[];const label=id=>{const c=(root.ConquestMap.cards||{})[id]||(root.ConquestEngine.cards||{})[id];return c?`${c.name||this.territoryName(c.territory)||id} · ${c.type||c.symbol||''}`:String(id).replace(/_/g,' ');};this.modal('A hand worth playing.',`<p>Earn one card each turn in which you conquer a territory. Trade sets for extra armies.</p><div class="conquest-card-hand">${cards.map(id=>this.card(id)).join('')||'<p>No cards yet. Your first conquest awaits.</p>'}</div>${trades.length?`<div class="conquest-eyebrow">AVAILABLE SETS</div>${s.phase!=='reinforce'?'<p class="conquest-small-note">Trade sets during your reinforcement phase.</p>':''}${trades.slice(0,12).map(set=>{const ids=Array.isArray(set)?set:set.cards;return `<button class="conquest-button secondary" data-do="trade" data-cards="${escape(JSON.stringify(ids))}" ${!this.interactive()||p!==s.currentPlayer||s.phase!=='reinforce'||s.eliminationTrade&&!s.mustTrade?'disabled':''}>Trade ${ids.map(label).map(escape).join(' + ')}</button>`;}).join('')}`:'<p class="conquest-small-note">Three matching symbols, one of each, or a valid set with a wild card.</p>'}`);}
    destroy(){root.removeEventListener('resize',this.fitViewport);if(this.scene)this.scene.destroy();this.element.removeEventListener('click',this.clickHandler);this.element.removeEventListener('keydown',this.keyHandler);this.element.innerHTML='';}
  }
  root.ConquestUI=ConquestUI;
})(typeof window!=='undefined'?window:globalThis);
