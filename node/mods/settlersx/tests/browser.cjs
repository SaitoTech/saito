/* Run against tools/serve.cjs. PLAYWRIGHT_MODULE may select any installed Playwright. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const localTools = path.resolve(__dirname, '../../../tests/mods/conquest/.tools');
if(!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(localTools,'browsers'))) process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(localTools,'browsers');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || path.join(localTools,'node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.setDefaultTimeout(20000);
  const screenshot=async options=>{if(process.env.SETTLERSX_SCREENSHOTS==='1')await page.screenshot({...options,timeout:20000});};
  try {
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(process.env.SETTLERSX_URL || 'http://127.0.0.1:4174/settlersx/preview.html');
  await page.click('#sx-workshop');
  await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='play\t1'&&sxGame.game.state.roads.length===8);
  assert.equal(await page.evaluate(()=>sxGame.game.state.cities.length),8);
  await page.evaluate(()=>{const values=[3,3];sxGame.rollDice=()=>values.shift()||2;});
  await page.click('#rolldice');
  await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='player_actions\t1'&&document.querySelector('#spend').classList.contains('enabled'));
  assert.equal(await page.evaluate(()=>sxGame.game.state.lastroll.join(',')),'3,3');
  // Legal road placement through the original purchase, legal selector and confirmation.
  await page.click('#spend');await page.click('.item-road');
  await page.waitForFunction(()=>sxGame.sxTargets.some(t=>t.kind==='edge'));
  await page.evaluate(()=>sxGame.sxPick(sxGame.sxTargets.find(t=>t.kind==='edge')));
  await page.click('#confirm');await page.waitForFunction(()=>sxGame.game.state.roads.length===9);
  assert.equal(await page.evaluate(()=>sxGame.game.state.canTrade),false);
  // Stats, handbook and settings remain available without altering the turn.
  await page.click('#score');await page.waitForSelector('.settlers-stats-overlay');
  await screenshot({path:'/tmp/settlersx-statistics.png'});
  await page.evaluate(()=>sxGame.stats_overlay.overlay.close());
  await page.click('[data-sx-action="rules"]');await page.waitForSelector('.saito-overlay');
  await page.evaluate(()=>sxGame.rules_overlay.overlay.close());
  await page.click('[data-sx-action="settings"]');await page.waitForSelector('.module-settings-overlay');
  await page.evaluate(()=>sxGame.overlay.close());
  // End turn changes the actual local player and private hand.
  await page.click('#rolldice');await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='play\t2');
  await page.click('#rolldice');await page.waitForFunction(()=>sxGame.game.queue.at(-1)==='player_actions\t2');
  await page.click('#trade');await page.waitForSelector('.trade-overlay');
  await page.focus('#want_wood .trade_count_up');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement?.matches('#want_wood .trade_count_up')),true,'Trade arrow retains keyboard focus after render');
  await page.click('#offer_ore .trade_count_up');
  await page.click('#trade_overlay_broadcast_button');
  await page.waitForFunction(()=>sxGame.game.state.ads[1]?.offer?.ore===1);
  const before=await page.evaluate(()=>sxGame.game.state.players.slice(0,2).map(p=>({wood:p.resources.filter(r=>r==='wood').length,ore:p.resources.filter(r=>r==='ore').length})));
  await page.selectOption('#sx-view-player','1');
  await page.click('[data-offer="2"]');await page.click('#trade_overlay_broadcast_button');
  await page.waitForFunction(()=>sxGame.game.player===2&&!sxGame.game.state.ads[1]?.offer);
  const after=await page.evaluate(()=>sxGame.game.state.players.slice(0,2).map(p=>({wood:p.resources.filter(r=>r==='wood').length,ore:p.resources.filter(r=>r==='ore').length})));
  assert.deepEqual(after,[{wood:before[0].wood-1,ore:before[0].ore+1},{wood:before[1].wood+1,ore:before[1].ore-1}]);
  // Ensure the sample hand has the exact harbour price, then use its UI.
  const bankBefore=await page.evaluate(()=>{const price=sxGame.analyzePorts().wood,p=sxGame.game.state.players[1];while(sxGame.countResource(2,'wood')<price)p.resources.push('wood');sxGame.playerPlayMove();sxGame.sxRefresh();return {price,wood:sxGame.countResource(2,'wood'),wool:sxGame.countResource(2,'wool')};});
  await page.click('#bank');await page.waitForSelector('.bank-overlay');
  await screenshot({path:'/tmp/settlersx-bank.png'});
  await page.click('.settlers-trade-resources#wood');await page.click('.settlers-desired-resources#wool, .settlers-desired-resources #wool');
  await page.waitForFunction(n=>sxGame.countResource(2,'wool')===n+1,bankBefore.wool);
  assert.equal(await page.evaluate(()=>sxGame.countResource(2,'wood')),bankBefore.wood-bankBefore.price);
  await screenshot({path:'/tmp/settlersx-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Mobile page should fit viewport');
  await screenshot({path:'/tmp/settlersx-mobile.png',fullPage:true});
  // Fresh two-player game follows special original setup rules and uses legal picks.
  await page.evaluate(()=>SXPreview.start({players:2}));
  await page.waitForFunction(()=>sxGame.sxTargets.some(t=>t.kind==='vertex'));
  assert.equal(await page.evaluate(()=>Object.values(sxGame.game.state.hexes).filter(h=>h.resource==='desert').length),3);
  assert.equal(await page.evaluate(()=>sxGame.longest.min),6);
  await page.evaluate(()=>sxGame.sxPick(sxGame.sxTargets.find(t=>t.kind==='vertex')));
  await page.click('#confirm');await page.waitForFunction(()=>sxGame.game.state.cities.length===1);
  assert.equal(await page.evaluate(()=>window.sxPreviewError),null);
  assert.deepEqual(errors,[]);console.log('Browser: setup, roll, harvest, legal road, confirmation, turn passing, accepted player trade, bank exchange, dialogs, responsive layout, and 2-player setup passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
