/* Pure, serializable classic rules. Network callers inject Saito's rollDice(sides).
 * externalCards delegates private custody to the GameTemplate encrypted deck.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./map'));
  else root.ConquestEngine = factory(root.ConquestMap);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Map) {
  'use strict';
  const ids = Object.keys(Map.territories);
  const cards = {};
  ids.forEach(id => { cards[id] = {id,territory:id,symbol:Map.territories[id].symbol,name:Map.territories[id].name}; });
  ['wild_1','wild_2'].forEach(id => { cards[id] = {id,territory:null,symbol:'wild',name:'Wild card'}; });
  function assert(ok, message) { if (!ok) throw new Error(message); }
  function integer(n, min, max) { return Number.isSafeInteger(n) && n>=min && n<=max; }
  function random(s, sides, roll) {
    let result;
    if (roll) result = roll(sides);
    else { s.seed = (Math.imul(s.seed,1664525)+1013904223)>>>0; result = 1+Math.floor(s.seed/4294967296*sides); }
    assert(integer(result,1,sides),'Random source returned an invalid die');
    return result;
  }
  function shuffle(s, values, roll) {
    const a = values.slice();
    for (let i=a.length-1;i>0;i--) { const j=random(s,i+1,roll)-1; [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  function player(s,p) { return s.players.find(x=>x.id===p); }
  function ownedTerritories(s,p) { return ids.filter(id=>s.territories[id].owner===p); }
  function reinforcementFor(s,p) {
    const owned=ownedTerritories(s,p);
    if (!owned.length) return 0;
    return Math.max(3,Math.floor(owned.length/3)) + Object.values(Map.continents).filter(c=>c.territories.every(t=>s.territories[t].owner===p)).reduce((sum,c)=>sum+c.bonus,0);
  }
  function isValidSet(set) {
    if (!Array.isArray(set)||set.length!==3||new Set(set).size!==3||set.some(id=>!cards[id])) return false;
    const symbols=set.map(id=>cards[id].symbol);
    return symbols.includes('wild') || new Set(symbols).size===1 || new Set(symbols).size===3;
  }
  function validTrades(s,p) {
    const hand=player(s,p)?.cards||[]; const result=[];
    for(let i=0;i<hand.length;i++) for(let j=i+1;j<hand.length;j++) for(let k=j+1;k<hand.length;k++) {
      const set=[hand[i],hand[j],hand[k]]; if(isValidSet(set)) result.push(set);
    }
    return result;
  }
  function tradeValue(n) { return n<5 ? 4+n*2 : 15+(n-5)*5; }
  function canAttack(s,from,to) {
    return !!(Map.territories[from]&&Map.territories[to]&&s.territories[from].owner===s.currentPlayer&&s.territories[to].owner!==s.currentPlayer&&s.territories[to].owner!==null&&s.territories[from].armies>1&&Map.territories[from].neighbors.includes(to));
  }
  function canFortify(s,from,to) {
    return !!(Map.territories[from]&&Map.territories[to]&&s.territories[from].owner===s.currentPlayer&&s.territories[to].owner===s.currentPlayer&&s.territories[from].armies>1&&Map.territories[from].neighbors.includes(to));
  }
  function log(s,message) { s.log.push(message); if(s.log.length>60) s.log.shift(); }
  function beginTurn(s,p) {
    s.currentPlayer=p; s.phase='reinforce'; s.reinforcements=reinforcementFor(s,p);
    s.capturedThisTurn=false; s.cardBonusUsed=false; s.eliminationTrade=false; s.mustTrade=player(s,p).cardCount>=5;
    s.turn++; s.lastBattle=null;
    log(s,`Player ${p} receives ${s.reinforcements} reinforcements.`);
  }
  function nextPlayer(s) {
    for(let i=1;i<=s.players.length;i++) { const p=(s.currentPlayer-1+i)%s.players.length+1; if(!player(s,p).eliminated) return p; }
    return s.currentPlayer;
  }
  function finishTurn(s) { beginTurn(s,nextPlayer(s)); }
  function finishSetupStep(s) {
    if(Object.values(s.setupRemaining).every(n=>n===0)) { beginTurn(s,s.firstPlayer); return; }
    do { s.currentPlayer=s.currentPlayer%s.players.length+1; } while(s.setupRemaining[s.currentPlayer]===0);
    s.setupPlacementsLeft=s.players.length===2 ? Math.min(2,s.setupRemaining[s.currentPlayer]) : 1;
    s.setupNeutral=false;
  }
  function createGame(options, roll) {
    options=options||{};
    const n=typeof options.players==='number'?options.players:(options.players||[]).length;
    assert(integer(n,2,6),'Classic Conquest supports 2 to 6 players');
    const s={version:1,seed:(Number(options.seed)||1)>>>0,players:[],territories:{},currentPlayer:1,firstPlayer:1,
      phase:'claim',turn:0,reinforcements:0,setupRemaining:{},setupPlacementsLeft:1,setupNeutral:false,
      tradedSets:0,cardBonusUsed:false,mustTrade:false,eliminationTrade:false,capturedThisTurn:false,
      externalCards:!!options.externalCards,deck:[],discard:[],cardDraw:null,cardTransfer:null,occupation:null,lastBattle:null,winner:null,log:[]};
    const initial={2:40,3:35,4:30,5:25,6:20}[n];
    for(let p=1;p<=n;p++) { s.players.push({id:p,cards:[],cardCount:0,eliminated:false}); s.setupRemaining[p]=initial; }
    ids.forEach(id=>s.territories[id]={owner:null,armies:0});
    // A common synchronized draw selects the starting player, resolving the board-game roll-off in one draw.
    s.firstPlayer=s.currentPlayer=random(s,n,roll);
    if(n===2||options.setup==='quick') {
      const order=shuffle(s,ids,roll); const owners=n===2?[s.firstPlayer,s.firstPlayer%2+1,0]:Array.from({length:n},(_,i)=>(s.firstPlayer-1+i)%n+1);
      if(n===2) s.setupRemaining[0]=40;
      order.forEach((id,i)=> { const owner=owners[i%owners.length]; s.territories[id]={owner,armies:1}; s.setupRemaining[owner]--; });
      s.phase='setup'; s.setupPlacementsLeft=n===2?2:1;
      if(options.setup==='quick') {
        // Convenience setup: distribute the full initial army allotment before the first turn.
        for(const key of Object.keys(s.setupRemaining)) {
          const p=Number(key); const own=ownedTerritories(s,p);
          while(s.setupRemaining[p]>0) { const id=own[random(s,own.length,roll)-1]; s.territories[id].armies++; s.setupRemaining[p]--; }
        }
        beginTurn(s,s.firstPlayer);
      }
    }
    if(!s.externalCards) s.deck=shuffle(s,Object.keys(cards),roll);
    log(s,options.setup==='quick'?'Armies automatically deployed.':'The campaign begins.');
    return s;
  }
  function drawCard(s,roll) {
    const p=player(s,s.currentPlayer);
    if(s.externalCards) { p.cardCount++; s.cardDraw={player:p.id,count:1}; return; }
    if(!s.deck.length) { s.deck=shuffle(s,s.discard,roll); s.discard=[]; }
    if(s.deck.length) { p.cards.push(s.deck.pop()); p.cardCount=p.cards.length; }
  }
  function endAttack(s,roll) {
    if(s.capturedThisTurn) drawCard(s,roll);
    s.phase='fortify'; log(s,`Player ${s.currentPlayer} finishes attacking.`);
  }
  function occupy(s,count) {
    const o=s.occupation;
    assert(o&&integer(count,o.min,o.max),'Move at least the final attack dice count and leave one army behind');
    s.territories[o.from].armies-=count; s.territories[o.to].armies=count;
    s.occupation=null; s.phase='attack';
    if(s.players.filter(p=>!p.eliminated).length===1) { s.winner=s.currentPlayer; s.phase='gameover'; log(s,`Player ${s.currentPlayer} wins the campaign.`); return; }
    if(player(s,s.currentPlayer).cardCount>=6 && o.eliminated) { s.phase='reinforce'; s.eliminationTrade=true; s.mustTrade=true; s.reinforcements=0; }
  }
  function battle(s,a,roll) {
    assert(canAttack(s,a.from,a.to),'Attack an adjacent enemy from a territory with at least two armies');
    const from=s.territories[a.from],to=s.territories[a.to];
    const dice=a.dice===undefined?Math.min(3,from.armies-1):a.dice;
    assert(integer(dice,1,Math.min(3,from.armies-1)),'Invalid number of attack dice');
    const defenderDice=Array.from({length:Math.min(2,to.armies)},()=>random(s,6,roll)).sort((a,b)=>b-a);
    const attackerDice=Array.from({length:dice},()=>random(s,6,roll)).sort((a,b)=>b-a);
    let attackerLosses=0,defenderLosses=0;
    for(let i=0;i<Math.min(attackerDice.length,defenderDice.length);i++) {
      if(attackerDice[i]>defenderDice[i]) defenderLosses++; else attackerLosses++;
    }
    from.armies-=attackerLosses; to.armies-=defenderLosses;
    s.lastBattle={from:a.from,to:a.to,attackerDice,defenderDice,attackerLosses,defenderLosses,conquered:to.armies===0};
    if(to.armies===0) {
      const previousOwner=to.owner; to.owner=s.currentPlayer; s.capturedThisTurn=true;
      let eliminated=false;
      if(previousOwner>0&&!ownedTerritories(s,previousOwner).length) {
        eliminated=true;
        const loser=player(s,previousOwner),winner=player(s,s.currentPlayer); loser.eliminated=true;
        if(s.externalCards) { s.cardTransfer={from:previousOwner,to:s.currentPlayer,count:loser.cardCount}; winner.cardCount+=loser.cardCount; loser.cardCount=0; }
        else { winner.cards.push(...loser.cards); loser.cards=[]; winner.cardCount=winner.cards.length; loser.cardCount=0; }
        log(s,`Player ${previousOwner} is eliminated.`);
      }
      s.occupation={from:a.from,to:a.to,min:dice,max:from.armies-1,eliminated}; s.phase='occupy';
      log(s,`Player ${s.currentPlayer} captures ${Map.territories[a.to].name}.`);
    }
  }
  function applyAction(state,action,roll) {
    assert(action&&typeof action==='object','An action is required');
    assert(action.player===state.currentPlayer,'It is not your turn');
    assert(state.phase!=='gameover','The campaign is over');
    const s=JSON.parse(JSON.stringify(state)); const a=action; const p=player(s,s.currentPlayer);
    // One-action events are consumed by the network adapter before its next dispatch.
    s.cardDraw=null; s.cardTransfer=null;
    if(a.type==='claim') {
      assert(s.phase==='claim','Territory claiming has finished');
      assert(Map.territories[a.territory]&&s.territories[a.territory].owner===null,'Choose an unclaimed territory');
      s.territories[a.territory]={owner:p.id,armies:1}; s.setupRemaining[p.id]--;
      s.currentPlayer=p.id%s.players.length+1;
      if(ids.every(id=>s.territories[id].owner!==null)) { s.phase='setup'; s.setupPlacementsLeft=1; }
    } else if(a.type==='place') {
      const t=s.territories[a.territory]; const count=a.count===undefined?1:a.count;
      assert(t,'Unknown territory');
      if(s.phase==='setup') {
        const owner=s.setupNeutral?0:p.id;
        assert(t.owner===owner,'Place armies on the indicated army’s territory');
        assert(integer(count,1,Math.min(s.setupPlacementsLeft,s.setupRemaining[owner])),'Invalid initial deployment count');
        t.armies+=count; s.setupRemaining[owner]-=count; s.setupPlacementsLeft-=count;
        if(s.setupPlacementsLeft===0) {
          if(s.players.length===2&&!s.setupNeutral&&s.setupRemaining[0]>0) { s.setupNeutral=true; s.setupPlacementsLeft=1; }
          else finishSetupStep(s);
        }
      } else {
        assert(s.phase==='reinforce','You cannot deploy armies in this phase');
        assert(!s.mustTrade,'Trade cards before deploying'); assert(t.owner===p.id,'Reinforce your own territory');
        assert(integer(count,1,s.reinforcements),'Invalid reinforcement count');
        t.armies+=count; s.reinforcements-=count;
        if(s.reinforcements===0) { s.phase='attack'; s.eliminationTrade=false; }
      }
    } else if(a.type==='trade') {
      assert(s.phase==='reinforce','Trade cards during reinforcement');
      assert(!s.eliminationTrade||s.mustTrade,'The mandatory elimination trades are complete');
      assert(isValidSet(a.cards),'Select three matching symbols, three different symbols, or a wild set');
      assert(s.externalCards?p.cardCount>=3:a.cards.every(id=>p.cards.includes(id)),'You do not hold these cards');
      const eligible=a.cards.map(id=>cards[id].territory).filter(id=>id&&s.territories[id].owner===p.id);
      const bonus=a.territory||eligible[0];
      if(a.territory) assert(eligible.includes(a.territory),'The territory bonus must match an owned traded card');
      if(!s.cardBonusUsed&&bonus) { s.territories[bonus].armies+=2; s.cardBonusUsed=true; }
      const value=tradeValue(s.tradedSets++); s.reinforcements+=value;
      p.cards=p.cards.filter(id=>!a.cards.includes(id)); p.cardCount-=3;
      if(!s.externalCards) s.discard.push(...a.cards);
      s.mustTrade=p.cardCount>=5;
      log(s,`Player ${p.id} trades a set for ${value} armies.`);
    } else if(a.type==='attack') {
      assert(s.phase==='attack','Finish reinforcement before attacking');
      battle(s,a,roll);
      if(a.blitz) {
        let rounds=1;
        while(s.phase==='attack'&&s.territories[a.from].armies>1&&rounds<10000) {
          battle(s,{from:a.from,to:a.to,dice:Math.min(a.dice||3,s.territories[a.from].armies-1)},roll); rounds++;
        }
        s.lastBattle.rounds=rounds;
      }
    } else if(a.type==='occupy') { assert(s.phase==='occupy','There is no pending occupation'); occupy(s,a.count); }
    else if(a.type==='end_attack') { assert(s.phase==='attack','You cannot finish attacking yet'); endAttack(s,roll); }
    else if(a.type==='fortify') {
      assert(s.phase==='fortify','Fortify after finishing attacks');
      assert(canFortify(s,a.from,a.to),'Fortify between two adjacent owned territories');
      assert(integer(a.count,1,s.territories[a.from].armies-1),'Leave at least one army behind');
      s.territories[a.from].armies-=a.count; s.territories[a.to].armies+=a.count;
      log(s,`Player ${p.id} fortifies ${Map.territories[a.to].name}.`); finishTurn(s);
    } else if(a.type==='end_turn') {
      assert(s.phase==='attack'||s.phase==='fortify','Complete the current phase first');
      if(s.phase==='attack') endAttack(s,roll);
      finishTurn(s);
    } else { throw new Error('Unknown action'); }
    return s;
  }
  return {createGame,applyAction,ownedTerritories,reinforcementFor,isValidSet,validTrades,tradeValue,canAttack,canFortify,cards};
});
