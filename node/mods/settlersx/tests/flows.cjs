/* Interactive purchase, development and robber checks against the actual copied engine. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const tooling=path.resolve(__dirname,'../../../tests/mods/conquest/.tools');
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&fs.existsSync(path.join(tooling,'browsers')))process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(tooling,'browsers');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(tooling,'node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto(process.env.SETTLERSX_URL||'http://127.0.0.1:4174/settlersx/preview.html');
  await page.click('#sx-workshop');await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='play\t1');
  await page.evaluate(()=>{sxGame.rollDice=()=>2;});await page.click('#rolldice');
  await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='player_actions\t1'&&sxGame.game.state.hasRolled);
  // Buy an upgrade using the existing menu and exact legal map vertex.
  await page.click('#spend');await page.click('.item-city');
  await page.waitForFunction(()=>sxGame.sxTargets.some(t=>t.kind==='vertex'));
  await page.evaluate(()=>sxGame.sxPick(sxGame.sxTargets.find(t=>t.kind==='vertex')));await page.click('#confirm');
  await page.waitForFunction(()=>sxGame.game.state.cities.some(c=>c.player===1&&c.level===2));
  console.log('City upgrade and score passed.');
  // Seed only the cost, then use the normal encrypted-deal command via local transport.
  await page.evaluate(()=>{sxGame.game.state.players[0].resources.push('ore','wool','wheat');const deck=sxGame.game.deck[0],i=deck.crypt.findIndex(id=>deck.cards[id].action===2);deck.crypt.unshift(...deck.crypt.splice(i,1));sxGame.updateControls();sxGame.sxRefresh();});
  await page.click('#spend');await page.click('.item-development-card');
  await page.waitForFunction(()=>sxGame.game.deck[0].hand.length===1);
  await page.click('.sx-dev-summary');await page.waitForSelector('.dev-card-overlay .settlers-dev-card');
  assert.equal(await page.locator('.dev-card-overlay .settlers-dev-card.settlers-card-disabled').count(),1,'Bought card is unavailable until later turn');
  await page.evaluate(()=>sxGame.dev_card.overlay.close());
  await page.click('#rolldice');await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='play\t2');
  assert.equal(await page.evaluate(()=>sxGame.game.state.players[0].devcards.length),1);
  console.log('Development purchase, hidden hand and end-turn maturation passed.');
  // Return to the buyer through real turns. Card permissions belong to each
  // local explorer just as they belong to each client in a network game.
  for(let player=2;player<=4;player++){
   await page.click('#rolldice');await page.waitForFunction(p=>sxGame.game.queue.at(-1)===`player_actions\t${p}`,player);
   await page.click('#rolldice');await page.waitForFunction(p=>sxGame.game.queue.at(-1)===`play\t${p%4+1}`,player);
  }
  await page.click('#rolldice');await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='player_actions\t1');
  await page.click('#playcard');await page.click('.settlers-dev-card:not(.settlers-card-disabled)');
  await page.waitForSelector('.settlers-select-options');
  await page.evaluate(()=>sxGame.year_of_plenty.overlay.close());
  assert.equal(await page.evaluate(()=>sxGame.game.state.players[0].devcards.length),1,'Cancel returns development card');
  assert.equal(await page.evaluate(()=>sxGame.game.state.canPlayCard),true,'Cancel restores card permission');
  const resourcesBefore=await page.evaluate(()=>sxGame.game.state.players[0].resources.length);
  await page.click('#playcard');await page.click('.settlers-dev-card:not(.settlers-card-disabled)');
  await page.focus('.settlers-select-options #wood');await page.keyboard.press('Enter');await page.click('.settlers-select-options #ore');
  await page.waitForFunction(n=>sxGame.game.state.players[0].resources.length===n+2,resourcesBefore);
  assert.equal(await page.evaluate(()=>sxGame.game.state.players[0].devcards.length),0);
  assert.equal(await page.evaluate(()=>sxGame.game.state.canPlayCard),false);
  console.log('Mature development card, cancel/reopen, bounty selection and one-card-per-turn passed.');
  await page.click('#rolldice');await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='play\t2');
  // A seven invokes mandatory discards for all hands with >7, then map selection.
  await page.evaluate(()=>{sxGame.game.state.players.forEach(p=>p.resources=['wood','wood','wood','wood','brick','brick','brick','brick']);const dice=[3,4];sxGame.rollDice=(s=6)=>dice.shift()||1;});
  await page.click('#rolldice');
  for(let i=0;i<4;i++){
   await page.waitForSelector('.discard-cards-overlay');
   const count=await page.evaluate(()=>sxGame.discard.targetCt);assert.equal(count,4);
   for(let j=0;j<count;j++)await page.locator('.discard-cards-overlay img:not(.selected)').first().click();
   if(i<3)await page.waitForFunction(p=>sxGame.game.player!==p,i+1);
  }
  await page.waitForFunction(()=>sxGame.sxTargets.some(t=>t.kind==='hex'));
  const target=await page.evaluate(()=>{const owner=2;return sxGame.sxTargets.find(t=>sxGame.game.state.cities.some(c=>c.player!==owner&&sxGame.hexgrid.hexesFromVertex(c.slot.replace('city_','')).includes(t.id.replace('sector_value_',''))))||sxGame.sxTargets[0];});
  await page.evaluate(t=>sxGame.sxPick(t),target);
  const choice=page.locator('.steal-player-choice');
  await page.waitForFunction(()=>document.querySelector('.steal-player-choice')||sxGame.game.queue.at(-1)==='player_actions\t2');
  if(await choice.count())await choice.first().click();
  await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='player_actions\t2'&&sxGame.sxTargets.length===0);
  assert.equal(await page.evaluate(()=>sxGame.game.state.players.reduce((n,p)=>n+p.resources.length,0)),16,'Discard halves all hands; theft conserves resources');
  assert.equal(await page.evaluate(()=>Object.keys(sxGame.game.state.hexes).find(h=>sxGame.game.state.hexes[h].robber)),target.id.replace('sector_value_',''));
  console.log('Seven, all mandatory discards, legal robber move and theft passed.');
  assert.equal(await page.evaluate(()=>window.sxPreviewError),null);
  assert.deepEqual(errors,[]);
 }catch(error){console.error(await page.evaluate(()=>({error:window.sxPreviewError,queue:window.sxGame?.game.queue.slice(-5),status:document.querySelector('#sx-status')?.innerText})));throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
