'use strict';

// Run with node mods/settlersx/tests/scene-browser.cjs. Browser dependencies are
// optional development tools: PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH
// can point to an external install; the Conquest test tooling is detected locally.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../../..');
const conquestTools = path.join(root, 'tests/mods/conquest/.tools');
const modulePath = process.env.PLAYWRIGHT_MODULE || path.join(conquestTools, 'node_modules/playwright');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(conquestTools, 'browsers'))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(conquestTools, 'browsers');
}
let chromium;
try { ({ chromium } = require(modulePath)); }
catch (_) {
  try { ({ chromium } = require('playwright')); }
  catch (_) { throw new Error('Install Playwright externally and set PLAYWRIGHT_MODULE; see tests/scene-browser.cjs.'); }
}
const scripts = path.join(root, 'mods/settlersx/web/js');

(async () => {
  const browser = await chromium.launch({headless:true, args:[
    '--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'
  ]});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:800}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<body style="margin:0;background:#b9d8d4"><div id="board" style="width:100vw;height:100vh"></div></body>');
    for(const file of ['vendor/three.min.js','geometry.js','scene.js']) await page.addScriptTag({path:path.join(scripts,file)});
    await page.evaluate(()=>{
      window.picks=[];
      window.board=new SettlersXScene(document.querySelector('#board'),{onPick:(id,kind)=>picks.push({id,kind})});
      const types=['wood','wheat','wool','brick','ore'];
      window.state={
        hexes:Object.fromEntries(SettlersXGeometry.hexes.map((id,i)=>[id,{resource:i===9?'desert':types[i%5],value:i===9?0:[5,2,6,3,8,10,9,11,4,12][i%10],robber:i===9}])),
        roads:[{slot:'road_1_2_2',player:1}],cities:[{slot:'city_1_2_2',player:1,level:1}],
        ports:{'6_1_1':'wood','3_3_5':'ore','3_5_4':'any','5_4_2':'wool','1_1_2':'brick','5_2_1':'any','4_5_3':'any','2_5_5':'wheat','1_2_4':'any'}
      };
      board.setState(state);
    });
    await page.waitForFunction(()=>window.board.renderer?.info.render.calls>0);
    const render=await page.evaluate(()=>({fallback:board.fallback,tiles:board.tiles.size,draws:board.renderer.info.render.calls,colors:board.colors}));
    assert.equal(render.fallback,false,'WebGL scene initializes');
    assert.equal(render.tiles,19);
    assert.ok(render.draws<700,`Static terrain stays batched (${render.draws} draw calls)`);
    assert.deepEqual(render.colors,['#d5553f','#3474a1','#dfae39','#478d70']);

    // Project a real 3D legal junction into screen space, then click through
    // the DOM and raycaster to verify the original game slot is preserved.
    const point=await page.evaluate(()=>{
      board.setTargets([{id:'city_6_3_3',kind:'vertex'}]);
      board.world.updateMatrixWorld(true);
      const v=board.legal.children[0].getWorldPosition(new THREE.Vector3()).project(board.camera);
      const r=board.renderer.domElement.getBoundingClientRect();
      return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
    });
    await page.mouse.click(point.x,point.y);
    assert.deepEqual(await page.evaluate(()=>picks),[{id:'city_6_3_3',kind:'vertex'}]);
    await page.mouse.move(800,350);await page.mouse.down();await page.mouse.move(890,490,{steps:6});await page.mouse.up();
    assert.ok(await page.evaluate(()=>board.world.quaternion.angleTo(board.defaultQuaternion)>0.1),'Trackball rotates board');
    await page.evaluate(()=>board.setView('top'));
    assert.ok(await page.evaluate(()=>board.camera.position.z<0.1),'Top view resets trackball');
    await page.evaluate(()=>board.resetView());
    const production=await page.evaluate(()=>{
      let transfers=0;
      const original=board.goods;
      board.goods=function(...args){transfers++;return original.apply(this,args);};
      board.animate('dice',{value:6});
      const diceTransfers=transfers;
      const hex=SettlersXGeometry.hexesFromVertex('city_1_2_2').find(id=>state.hexes[id]&&!state.hexes[id].robber);
      board.animate('harvest',{player:1,hex});
      board.goods=original;
      return{diceTransfers,harvestTransfers:transfers-diceTransfers};
    });
    assert.equal(production.diceTransfers,0,'Dice highlights do not invent resource transfers');
    assert.equal(production.harvestTransfers,1,'Actual occupied harvest animates goods');

    // Rules drive a new road, a settlement upgrade, and a robber move. The
    // renderer must reflect all three and animate the resulting changes.
    await page.evaluate(()=>{
      state.roads.push({slot:'road_6_2_2',player:1});state.cities[0].level=2;
      state.hexes['3_3'].robber=false;state.hexes['2_2'].robber=true;
      board.setState(state);board.animate('harvest',{player:1,resource:'wood',hex:'2_2'});
    });
    const moved=await page.evaluate(()=>({pieces:board.pieces.size,level:board.pieces.get('city_1_2_2').level,robber:board.robberHex,animations:board.animations.length}));
    assert.equal(moved.pieces,3);assert.equal(moved.level,2);assert.equal(moved.robber,'2_2');assert.ok(moved.animations>0);
    await page.waitForFunction(()=>board.animations.length===0,null,{timeout:15000});
    for (const viewport of [{width:390,height:760},{width:362,height:420}]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(v=>Math.abs(board.camera.aspect-v.width/v.height)<0.01,viewport);
      assert.ok(await page.evaluate(()=>{
        board.resetView();board.world.updateMatrixWorld(true);board.camera.updateMatrixWorld(true);
        const right=new THREE.Vector3().setFromMatrixColumn(board.camera.matrixWorld,0);
        const up=new THREE.Vector3().setFromMatrixColumn(board.camera.matrixWorld,1);
        return board.ports.children.every(port=>{
          const label=port.children.find(child=>child.isSprite);
          const center=label.getWorldPosition(new THREE.Vector3()),size=label.getWorldScale(new THREE.Vector3());
          return [-1,1].every(x=>[-1,1].every(y=>{
            const p=center.clone().addScaledVector(right,x*size.x/2).addScaledVector(up,y*size.y/2).project(board.camera);
            return Math.abs(p.x)<0.99&&Math.abs(p.y)<0.99;
          }));
        });
      }),'Entire harbour labels fit both tall and compact mobile maps');
    }
    await page.evaluate(()=>board.destroy());
    assert.equal(await page.locator('canvas').count(),0,'Destroy detaches renderer');
    assert.deepEqual(errors,[]);

    // Missing WebGL must retain selectable legal moves via the SVG chart.
    const fallback=await browser.newPage({viewport:{width:390,height:760}});
    await fallback.setContent('<div id="board" style="width:390px;height:700px"></div>');
    for(const file of ['geometry.js','scene.js'])await fallback.addScriptTag({path:path.join(scripts,file)});
    await fallback.evaluate(()=>{
      window.board=new SettlersXScene(document.querySelector('#board'),{assetBase:'',onPick:(id,kind)=>window.picked={id,kind}});
      board.setState({hexes:{'3_3':{resource:'wheat',value:6}},roads:[],cities:[],ports:{'6_1_1':'wood','3_5_4':'any'}});
      board.setTargets([{id:'sector_value_3_3',kind:'hex'}]);
    });
    assert.equal(await fallback.evaluate(()=>board.fallback),true);
    assert.equal(await fallback.locator('[data-port]').count(),2,'SVG chart retains every harbour');
    assert.match(await fallback.locator('svg').textContent(),/2:1 WOOD/);
    assert.match(await fallback.locator('svg').textContent(),/3:1 PORT/);
    await fallback.locator('[data-id="sector_value_3_3"]').click();
    assert.deepEqual(await fallback.evaluate(()=>picked),{id:'sector_value_3_3',kind:'hex'});
    await fallback.evaluate(()=>board.destroy());
    assert.equal(await fallback.locator('svg').count(),0);
    console.log(`Settlers X browser scene: WebGL, ${render.draws} draw calls, picking, trackball, construction, robber, harvest, resize, disposal, and SVG fallback passed.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
