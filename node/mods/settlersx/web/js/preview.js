/* Local hotseat harness; all moves go through the shipped SettlersX module. */
(function () {
  'use strict';
  const names=['Amelia','Bastien','Celia','Dario'];
  const app={options:{gameprefs:{}},keychain:{returnUsername:key=>names[Number(key.split('-')[1])-1]||key},connection:{emit(){},on(){}},browser:{
    htmlToElement(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;},
    addElementToSelector(html,selector){document.querySelector(selector)?.insertAdjacentHTML('beforeend',html);},
    addElementToDom(html){document.body.insertAdjacentHTML('beforeend',html);},
    replaceElementById(html,id){const el=document.getElementById(id);if(el)el.outerHTML=html;},
    replaceElementBySelector(html,selector){const el=document.querySelector(selector);if(el)el.outerHTML=html;},
    isMobileBrowser(){return innerWidth<760;},isBrowser(){return true;}
  }};
  let pumping=false,pending=false,autoSetup=false,privacy=false;
  function shuffle(items){for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
  function switchPlayer(mod,player){
    if(!player||mod.game.player===player)return;
    mod.previewCardPermissions[mod.game.player-1]=mod.game.state.canPlayCard;
    mod.game.player=player;mod.publicKey=mod.game.players[player-1];mod.status=[];
    mod.game.state.canPlayCard=mod.previewCardPermissions[player-1];
    if(privacy&&!autoSetup)passScreen(mod);
    syncPlayerPicker(mod);
    mod.sxUI?.refresh();
  }
  function syncPlayerPicker(mod){
    const picker=document.getElementById('sx-view-player');
    if(picker){picker.value=String(mod.game.player);picker.disabled=!mod.game.queue.at(-1)?.startsWith('player_actions\t');}
  }
  function passScreen(mod){
    if(document.getElementById('sx-pass'))return;
    const curtain=document.createElement('div');curtain.id='sx-pass';curtain.className='sx-preview-curtain';
    curtain.innerHTML=`<div><img src="/settlersx/img/portraits/${mod.game.player}.svg" alt="" width="100"><span class="sx-eyebrow">PASS THE EXPEDITION JOURNAL</span><h1>${names[mod.game.player-1]}'s turn.</h1><p>Pass the screen before revealing your supplies and cards.</p><button class="sx-button sx-primary">I'm ready →</button></div>`;
    curtain.querySelector('button').onclick=()=>curtain.remove();document.body.appendChild(curtain);
  }
  async function pump(mod){
    if(mod!==window.sxGame)return;
    if(pumping){pending=true;return;}pumping=true;
    try{
      for(let guard=0;guard<250&&mod.game.queue.length;guard++){
        const command=mod.game.queue.at(-1),mv=command.split('\t');
        if(mv[0]==='DECKANDENCRYPT'){
          mod.game.queue.pop();const cards=JSON.parse(mv.slice(3).join('\t'));
          const deck={cards,crypt:shuffle(Object.keys(cards)),hand:[]};mod.game.deck[Number(mv[1])-1]=deck;
          if(mv[1]==='1')Object.defineProperty(deck,'hand',{get:()=>mod.previewHands[mod.game.player-1]||[]});
          continue;
        }
        if(mv[0]==='POOLDEAL'){
          mod.game.queue.pop();const deck=mod.game.deck[Number(mv[1])-1];mod.game.pool[Number(mv[3])-1]={hand:deck.crypt.splice(0,Number(mv[2]))};continue;
        }
        if(mv[0]==='SAFEDEAL'){
          mod.game.queue.pop();mod.previewHands[Number(mv[2])-1].push(...mod.game.deck[Number(mv[1])-1].crypt.splice(0,Number(mv[3])));continue;
        }
        if(['READY','NOTIFY','ACKNOWLEDGE','RESOLVE'].includes(mv[0])){
          mod.game.queue.pop();if(mv[0]==='NOTIFY'||mv[0]==='ACKNOWLEDGE')mod.updateLog(mv[1]);
          if(mv[0]==='RESOLVE'){const i=mod.game.players.indexOf(mv[1]);if(i>=0)mod.game.confirms_needed[i]=0;}continue;
        }
        if(['player_build_city','player_build_road','player_upgrade_city','play','player_actions'].includes(mv[0]))switchPlayer(mod,Number(mv[1]));
        if(mv[0]==='roll_bandit')switchPlayer(mod,mod.game.state.robinhood||Number(mv[1]));
        if(mv[0]==='discard'){const i=mod.game.confirms_needed.findIndex(Boolean);if(i>=0)switchPlayer(mod,i+1);}
        if(mv[0]==='init'&&autoSetup){
          autoSetup=false;mod.preferences.settlers_confirm_moves=1;
          mod.game.state.players.forEach(p=>p.resources=['brick','brick','wood','wood','wheat','wheat','wool','wool','ore','ore','ore']);
          mod.updateLog('Workshop sample: opening villages placed legally; starter supplies added for exploring the interface. Start a fresh game for normal setup.');
        }
        const proceed=await mod.handleGameLoop();
        if(mv[0]==='end_turn')mod.previewCardPermissions=mod.game.state.players.map(p=>p.devcards.length?true:null);
        mod.sxRefresh();
        syncPlayerPicker(mod);
        if(!proceed){
          if(autoSetup&&mod.sxTargets.length){
            const targets=mod.sxTargets;const index=(mod.game.state.cities.length*7+3)%targets.length;
            mod.sxPick(targets[index]);
          }
          break;
        }
      }
    }catch(error){console.error(error);mod.updateStatus(`Preview stopped: ${error.message}`);window.sxPreviewError=error.stack;}
    finally{pumping=false;if(pending){pending=false;setTimeout(()=>pump(mod),20);}}
  }
  async function start({players=4,workshop=false,privateHands=false}={}){
    const old=window.sxGame;old?.sxDestroy();document.querySelectorAll('.sx-preview-curtain,.sx-preview-bar,.sx-preview-overlay').forEach(el=>el.remove());
    autoSetup=workshop;privacy=privateHands;pumping=false;pending=false;window.sxPreviewError=null;
    const mod=new window.SettlersX(app);window.sxGame=mod;mod.sxMode='local hotseat';
    mod.game.players=Array.from({length:players},(_,i)=>`explorer-${i+1}`);mod.game.player=1;mod.game.options={game_length:10,turn_limit:0};mod.game.colors=[1,2,3,4].slice(0,players);
    mod.previewHands=Array.from({length:players},()=>[]);mod.previewCardPermissions=Array(players).fill(null);mod.hexgrid=new window.GameHexGrid(app,mod);mod.initializeGame(mod.game.id);
    // The normal network lifecycle creates decks before interactive rendering.
    mod.game.deck[0]={cards:{},crypt:[],hand:[]};
    mod.previewPump=()=>pump(mod);
    mod.sxMount(document.getElementById('preview-root'));
    if(workshop)mod.preferences.settlers_confirm_moves=0;
    const bar=document.createElement('div');bar.className='sx-preview-bar';
    bar.innerHTML=`<span>${workshop?'WORKSHOP SAMPLE':'LOCAL HOTSEAT'} · Shared screen</span><label>View / trade as <select id="sx-view-player" aria-label="Choose explorer to answer trade offers">${mod.game.players.map((_,i)=>`<option value="${i+1}">${names[i]}</option>`).join('')}</select></label><button id="sx-new-game">New expedition</button><button id="sx-pass-game">Pass screen</button>`;
    bar.querySelector('#sx-new-game').onclick=()=>launchMenu();bar.querySelector('#sx-pass-game').onclick=()=>passScreen(mod);document.body.appendChild(bar);
    bar.querySelector('#sx-view-player').onchange=event=>{
      if(!mod.game.queue.at(-1)?.startsWith('player_actions\t'))return;
      switchPlayer(mod,Number(event.target.value));mod.updateControls();
      if(mod.game.player===mod.game.state.playerTurn)pump(mod);
      else mod.updateStatus(`Viewing ${names[mod.game.player-1]}'s hand. Select another explorer's trade offer to respond.`);
      mod.sxRefresh();
    };
    await pump(mod);
  }
  function launchMenu(){
    document.getElementById('sx-launch')?.remove();
    const curtain=document.createElement('div');curtain.id='sx-launch';curtain.className='sx-preview-curtain';
    curtain.innerHTML=`<div class="sx-launch-card"><img class="sx-launch-cover" src="/settlersx/img/cover.svg" alt="An illustrated expedition to the island of Saitoa"><span class="sx-eyebrow">SETTLERSX · THE SAITOA EXPEDITION</span><h1>A new world awaits.</h1><p>Build villages. Chart roads. Trade your way across an illustrated island. The familiar game, seen from a different angle.</p><div class="sx-launch-options"><label>Explorers <select id="sx-player-count"><option>2</option><option>3</option><option selected>4</option></select></label><label><input id="sx-private" type="checkbox"> Pass-screen privacy</label></div><button id="sx-begin" class="sx-button sx-primary">Begin an expedition →</button><button id="sx-workshop" class="sx-button">Explore the workshop sample</button><small>Local hotseat preview · Original Settlers rules · Drag to orbit in 3D</small></div>`;
    for(const [id,workshop] of [['sx-begin',false],['sx-workshop',true]])curtain.querySelector('#'+id).onclick=()=>start({players:Number(curtain.querySelector('select').value),privateHands:curtain.querySelector('input').checked,workshop});
    document.body.appendChild(curtain);
  }
  window.SXPreview.start=start;window.SXPreview.pump=()=>pump(window.sxGame);
  launchMenu();
})();
