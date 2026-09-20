/* Local hotseat preview. Saito multiplayer uses the same UI with its own controller. */
(function () {
  'use strict';
  const element=document.getElementById('conquest-root');
  let state=ConquestEngine.createGame({players:3,setup:'quick',seed:1961}),ui;
  const names=['The Vermilion Guard','The Blue Squadron','The Golden Company','The Olive Brigade','The Violet League','The Amber Fleet'];
  const controller={getState:()=>state,getPlayer:()=>0,getPlayerName:id=>names[id-1]||'Neutral forces',dispatch:async action=>{
    const previous=state.currentPlayer;
    state=ConquestEngine.applyAction(state,action);
    if(previous!==state.currentPlayer&&state.phase!=='gameover'&&!['claim','setup'].includes(state.phase)) setTimeout(passHand,0);
  }};
  ui=new ConquestUI(element,controller);
  function passHand(){
    ui.modal('A new chapter begins.',`<div class="conquest-pass-screen"><span class="conquest-player-seal" style="--player:var(--conquest-player-${state.currentPlayer})">${['▲','●','◆','■','✦','⬟'][state.currentPlayer-1]}</span><p>Pass the screen to <strong>${names[state.currentPlayer-1]}</strong>.</p><p class="conquest-small-note">Your hand is private. Continue when the next commander is ready.</p><button class="conquest-button primary" id="conquest-pass-ready">I am ready →</button></div>`);
    element.querySelector('.conquest-modal-close').hidden=true;
    element.querySelector('#conquest-pass-ready').onclick=()=>ui.closeModal();
  }
  ui.modal('Your campaign starts here.',`<span class="conquest-start-art" aria-hidden="true">CONQUEST.</span><p>A world of possibility. An army at your command.<br>Gather your rivals for a classic campaign of world conquest.</p><div class="conquest-demo-controls"><label>COMMANDERS<select id="conquest-player-count"><option value="2">2 players + neutral army</option><option value="3" selected>3 players</option><option value="4">4 players</option><option value="5">5 players</option><option value="6">6 players</option></select></label><label>DEPLOYMENT<select id="conquest-setup-mode"><option value="classic" selected>Classic · choose & deploy</option><option value="quick">Fast start · auto deploy</option></select></label></div><button class="conquest-button primary" id="conquest-start">Begin the campaign →</button><p class="conquest-small-note">Local hotseat edition · 2–6 players on this device.<br>Play through Saito Arcade for online multiplayer.</p>`);
  element.querySelector('.conquest-modal-close').hidden=true;
  element.querySelector('#conquest-start').onclick=()=>{
    state=ConquestEngine.createGame({players:Number(element.querySelector('#conquest-player-count').value),setup:element.querySelector('#conquest-setup-mode').value,seed:Date.now()>>>0});
    ui.selected=null;ui.target=null;ui.closeModal();ui.render();
  };
  window.conquestDemo={ui,controller,getState:()=>state};
})();
