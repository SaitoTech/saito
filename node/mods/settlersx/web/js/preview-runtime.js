/* Standalone local transport for exercising the actual SettlersX rule modules.
 * Never loaded by Saito. No network, wallet, consensus, or cryptographic claims. */
(function () {
  'use strict';
  let overlayId = 0;
  class Overlay {
    constructor(app, mod, closebox = true) { this.app=app;this.mod=mod;this.closebox=closebox;this.id=++overlayId;this.zIndex=2000+this.id; }
    show(html, callback) {
      this.remove();this.callback=callback;
      this.node=document.createElement('div');this.node.className='sx-preview-overlay';
      this.node.innerHTML=`<div class="saito-overlay-backdrop"></div><div class="saito-overlay" role="dialog" aria-modal="true">${html}<button class="saito-overlay-closebox" aria-label="Close dialog">×</button></div>`;
      this.node.style.zIndex=this.zIndex;document.body.appendChild(this.node);
      this.node.querySelector('.saito-overlay-closebox').onclick=()=>this.close();
      this.node.querySelector('.saito-overlay-backdrop').onclick=()=>{if(!this.blocked)this.close();};
      this.node.querySelector('.saito-overlay-closebox').hidden=this.blocked;
    }
    hide(){this.remove();}
    remove(){this.node?.remove();this.node=null;}
    close(){this.remove();this.callback?.();}
    blockClose(){this.blocked=true;if(this.node)this.node.querySelector('button.saito-overlay-closebox').hidden=true;}
    unblockClose(){this.blocked=false;}
    setBackground(){}
  }
  const noop=()=>{};
  function component(){return new Proxy({players:[]},{get:(obj,key)=>key in obj?obj[key]:noop});}
  class GameTemplate {
    constructor(app) {
      this.app=app;this.recordOptions={};this.styles=[];this.moves=[];this.animationSequence=[];this.animation_queue=[];this.browser_active=1;this.publicKey='explorer-1';this.preferences={settlers_confirm_moves:1,settlers_overlays:0,settlers_play_mode:0};
      this.game={id:'settlersx-local',players:[],options:{},queue:[],deck:[],pool:[],log:[],confirms_needed:[]};
      for(const name of ['hud','racetrack','playerbox','cardfan','clock','game_help','menu','log'])this[name]=component();
      this.overlay=new Overlay(app,this);this.hexgrid=null;
    }
    static importFunctions(...classes) { for(const klass of classes) for(const key of Object.getOwnPropertyNames(klass.prototype)){if(key!=='constructor')Object.defineProperty(this.prototype,key,Object.getOwnPropertyDescriptor(klass.prototype,key));} }
    addMove(move){this.moves.push(move);}
    endTurn(){this.game.queue.push(...this.moves);this.moves=[];this.restartQueue();}
    restartQueue(){setTimeout(()=>this.previewPump?.(),0);}
    gameBrowserActive(){return true;}
    loadGamePreference(key){return this.preferences[key];}
    saveGamePreference(key,value){this.preferences[key]=value;}
    saveGame(){}
    updateLog(html){this.game.log.unshift(html);}
    updateStatusWithOptions(message='',options=''){this.updateStatus(message);this.updateControls(options);}
    returnDiceImage(roll){
      const pips=[[],[[50,50]],[[25,25],[75,75]],[[25,25],[50,50],[75,75]],[[25,25],[75,25],[25,75],[75,75]],[[25,25],[75,25],[50,50],[25,75],[75,75]],[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]];
      return `<span class="die"><svg viewBox="0 0 100 100" width="24" height="24" role="img" aria-label="Dice ${Number(roll)}"><rect x="3" y="3" width="94" height="94" rx="16" fill="#fff6d9" stroke="#183f43" stroke-width="6"/>${(pips[roll]||[]).map(([x,y])=>`<circle cx="${x}" cy="${y}" r="8" fill="#183f43"/>`).join('')}</svg></span>`;
    }
    rollDice(sides=6){return Math.floor(Math.random()*sides)+1;}
    clearShotClock(){}
    setShotClock(){}
    promptMove(){}
    lockInterface(){}
    unlockInterface(){}
    setPlayerActive(){}
    resetConfirmsNeeded(players){this.game.confirms_needed=this.game.players.map((_,i)=>players.includes(i+1)?1:0);}
    async runAnimationQueue(){while(this.animationSequence.length){const step=this.animationSequence.shift();step.callback.apply(this,step.params||[]);}}
    returnPlayerName(player){return this.game.playerNames[player-1];}
    returnNextPlayer(player){return player%this.game.players.length+1;}
    triggerGameOver(winner){this.game.over=1;this.updateStatus(`${winner} wins the expedition!`);this.sxRefresh();}
    initializeGameStake(){}
    sendGameMoveTransaction(){this.endTurn();}
  }
  window.SXPreview={GameTemplate,Overlay};
  window.salert=async msg=>window.alert(msg);
  window.sconfirm=async msg=>window.confirm(msg);
  window.siteMessage=msg=>window.sxGame?.sxUI?.toast?.(msg);
  $.fn.disableSelection=function(){return this;};
})();
