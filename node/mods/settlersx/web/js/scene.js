/* Settlers X — a navigable, ink-outlined island diorama. No game rules live here. */
(function (root) {
  'use strict';
  const INK = '#243a3b';
  const PALETTE = ['#d5553f','#3474a1','#dfae39','#478d70'];
  const TERRAIN = {wood:'#74a879',wheat:'#ddbb61',wool:'#a8c486',brick:'#ce8763',ore:'#a6b3b1',desert:'#e6cb91'};
  const RESOURCE_NAMES = {wood:'FOREST',wheat:'HARVEST',wool:'PASTURE',brick:'CLAY PIT',ore:'QUARRY',desert:'THE WASTELANDS'};
  const TAU = Math.PI*2;
  const ease = t => 1-Math.pow(1-t,3);
  function random(seed) { let n=seed+73; return () => { n=(n*1664525+1013904223)>>>0; return n/4294967296; }; }
  function resource(name) { return ({sheep:'wool',grain:'wheat',clay:'brick',stone:'ore',forest:'wood'})[name] || name || 'desert'; }
  function safe(text) { return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  class SettlersXScene {
    constructor(container, options={}) {
      this.container=container; this.options={assetBase:'/settlersx/img/',...options}; this.G=root.SettlersXGeometry;
      this.colors=PALETTE; this.targets=[]; this.animations=[]; this.pieces=new Map(); this.tiles=new Map();
      this.materials=new Map(); this.geometries=new Map(); this.edgeGeometries=new Map(); this.textures=[];
      this.pointers=new Map(); this.listeners=[]; this.dead=false; this.reducedMotion=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      this._state={hexes:{},cities:[],roads:[],ports:{}};
      this.fallback=false;
      try {
        if (!root.THREE || !this.G) throw new Error('3D dependencies unavailable');
        this.T=root.THREE;
        this.renderer=new this.T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
        this.renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,1.65));
        this.renderer.setClearColor(0x000000,0);
        this.renderer.outputColorSpace=this.T.SRGBColorSpace;
        this.renderer.domElement.setAttribute('aria-label','Three-dimensional island. Drag or use arrow keys to rotate; Q and E roll; pinch, scroll, plus or minus to zoom; Home resets the view. Select a highlighted space to build.');
        this.renderer.domElement.setAttribute('role','img');
        this.renderer.domElement.tabIndex=0;
        this.renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline:none;';
        container.appendChild(this.renderer.domElement);
        this.setup(); this.bind(); this.resize(); this.frame(0);
      } catch (error) {
        console.warn('Settlers X: using illustrated board fallback.',error.message);
        this.renderer?.dispose(); this.renderer?.domElement.remove(); this.fallback=true;
        this.renderFallback();
      }
      this.resizeObserver=typeof ResizeObserver!=='undefined' ? new ResizeObserver(()=>this.resize()) : null;
      this.resizeObserver?.observe(container);
    }
    setup() {
      const T=this.T;
      this.scene=new T.Scene();
      this.camera=new T.PerspectiveCamera(35,1,0.1,150); this.camera.position.set(0,11.8,13.8); this.camera.lookAt(0,0,0);
      this.world=new T.Group(); this.world.rotation.y=-0.18; this.scene.add(this.world);
      this.land=new T.Group(); this.ocean=new T.Group(); this.structures=new T.Group(); this.legal=new T.Group(); this.effects=new T.Group(); this.ports=new T.Group();
      this.world.add(this.ocean,this.land,this.structures,this.ports,this.legal,this.effects);
      this.scene.add(new T.HemisphereLight('#fff9df','#55817c',2.4));
      const sun=new T.DirectionalLight('#fff3d5',2.7); sun.position.set(-5,12,8); this.scene.add(sun);
      this.scene.add(new T.AmbientLight('#ffffff',0.25));
      this.raycaster=new T.Raycaster(); this.pointer=new T.Vector2();
      this.buildOcean();
      this.robber=this.makeRobber(); this.robber.visible=false; this.structures.add(this.robber);
      this.defaultQuaternion=this.world.quaternion.clone();
    }
    material(color,extra={}) {
      const key=color+JSON.stringify(extra);
      if (!this.materials.has(key)) this.materials.set(key,new this.T.MeshToonMaterial({color,...extra}));
      return this.materials.get(key);
    }
    geometry(type,args) {
      const key=type+args.join(',');
      if (!this.geometries.has(key)) this.geometries.set(key,new this.T[type+'Geometry'](...args));
      return this.geometries.get(key);
    }
    mesh(parent,type,args,color,x=0,y=0,z=0,outlined=true) {
      const geometry=this.geometry(type,args), mesh=new this.T.Mesh(geometry,this.material(color));
      mesh.position.set(x,y,z); parent.add(mesh);
      if (outlined) {
        if (!this.edgeGeometries.has(geometry)) this.edgeGeometries.set(geometry,new this.T.EdgesGeometry(geometry,24));
        if (!this.lineMaterial) this.lineMaterial=new this.T.LineBasicMaterial({color:INK,transparent:true,opacity:0.85});
        mesh.add(new this.T.LineSegments(this.edgeGeometries.get(geometry),this.lineMaterial));
      }
      return mesh;
    }
    group(parent,x=0,y=0,z=0) { const g=new this.T.Group(); g.position.set(x,y,z); parent.add(g); return g; }
    cylinder(parent,rt,rb,h,color,x=0,y=0,z=0,n=6,outlined=true) { return this.mesh(parent,'Cylinder',[rt,rb,h,n],color,x,y,z,outlined); }
    box(parent,w,h,d,color,x=0,y=0,z=0,outlined=true) { return this.mesh(parent,'Box',[w,h,d],color,x,y,z,outlined); }
    line(parent,points,color='#e7f1d6',opacity=0.65) {
      const geo=new this.T.BufferGeometry().setFromPoints(points.map(p=>new this.T.Vector3(...p)));
      const mat=new this.T.LineBasicMaterial({color,transparent:true,opacity});
      const line=new this.T.Line(geo,mat); line.userData.owned=true; parent.add(line); return line;
    }
    sprite(parent,text,options={}) {
      const c=document.createElement('canvas'); c.width=256; c.height=options.square?256:128;
      const ctx=c.getContext('2d');
      if (options.token) {
        ctx.beginPath(); ctx.arc(128,128,108,0,TAU); ctx.fillStyle='#fff4ce';ctx.fill(); ctx.strokeStyle=INK;ctx.lineWidth=8;ctx.stroke();
        ctx.fillStyle=Number(text)===6||Number(text)===8?'#bd4d37':INK;
        ctx.font='bold 112px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,117);
        const count=6-Math.abs(7-Number(text));
        for(let i=0;i<count;i++) {ctx.beginPath();ctx.arc(128+(i-(count-1)/2)*20,188,5,0,TAU);ctx.fill();}
      } else {
        if(options.background!==false) {ctx.fillStyle=options.color||'#fff0ca';ctx.fillRect(5,22,246,84);ctx.strokeStyle=INK;ctx.lineWidth=4;ctx.strokeRect(5,22,246,84);}
        ctx.fillStyle=INK;ctx.font=`bold ${options.fontSize||34}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,66,234);
      }
      const tex=new this.T.CanvasTexture(c);tex.colorSpace=this.T.SRGBColorSpace; this.textures.push(tex);
      const mat=new this.T.SpriteMaterial({map:tex,depthTest:!options.token,transparent:true});
      const sprite=new this.T.Sprite(mat);sprite.scale.set(options.width||0.62,options.height||0.62,1);sprite.userData.ownedMaterial=true;
      parent.add(sprite); return sprite;
    }
    buildOcean() {
      const water=this.cylinder(this.ocean,7.25,7.25,0.12,'#5aaaae',0,-0.31,0,96,false);
      this.cylinder(this.ocean,7.30,7.30,0.07,'#2e767f',0,-0.41,0,96,false);
      const rng=random(42);
      for(let i=0;i<100;i++) {
        const angle=rng()*TAU,r=4.8+rng()*2.1,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
        this.line(this.ocean,[[x-0.13,-0.24,z],[x,-0.22,z+0.025],[x+0.17,-0.24,z]],i%3?'#c1dfd2':'#347e89',0.55);
      }
      for(let i=0;i<3;i++) {
        const pts=[]; for(let j=0;j<=128;j++){const a=j/128*TAU;pts.push([Math.cos(a)*(6.82+i*0.16),-0.225,Math.sin(a)*(6.82+i*0.16)]);}
        this.line(this.ocean,pts,'#c1e1d5',0.6-i*0.12);
      }
      // Small compass rose engraved on the sea.
      const compass=this.group(this.ocean,-4.8,-0.19,3.6);
      const ring=this.mesh(compass,'Torus',[0.43,0.015,4,40],'#d5e8d4',0,0,0,false);ring.rotation.x=Math.PI/2;
      for(let i=0;i<4;i++) {const arm=this.box(compass,0.035,0.025,0.98,'#d5e8d4',0,0,0,false);arm.rotation.y=i*Math.PI/4;}
      const north=this.sprite(compass,'N',{background:false,width:0.36,height:0.18,fontSize:70});north.position.set(0,0.02,-0.68);
      this.makeLighthouse(this.ocean,4.8,-0.08,2.8);
      this.decorBoat=this.makeBoat(this.ocean,-4.9,-0.16,-2.5,'#f1cf70'); this.decorBoat.rotation.y=0.4;
    }
    makeLighthouse(parent,x,y,z) {
      const g=this.group(parent,x,y,z);
      this.cylinder(g,0.35,0.50,0.15,'#9ba9a0',0,0,0,7);
      this.cylinder(g,0.12,0.20,0.88,'#fff3d1',0,0.48,0,8);
      this.cylinder(g,0.147,0.169,0.2,'#cf5345',0,0.46,0,8);
      this.cylinder(g,0.20,0.20,0.08,INK,0,0.96,0,8);
      this.cylinder(g,0.12,0.12,0.23,'#f4cf62',0,1.10,0,8);
      this.cylinder(g,0,0.24,0.20,'#cd5747',0,1.29,0,8);
      this.box(g,0.07,0.15,0.025,INK,0,0.65,0.139,false);
    }
    makeBoat(parent,x,y,z,color='#cf5a42') {
      const g=this.group(parent,x,y,z);
      const hull=this.mesh(g,'Sphere',[0.26,6,4],color,0,0.02,0);hull.scale.set(0.7,0.45,1.8);
      this.box(g,0.22,0.04,0.51,'#dfb571',0,0.10,0);
      this.cylinder(g,0.017,0.017,0.80,INK,0,0.46,0,5,false);
      const geo=new this.T.BufferGeometry();geo.setAttribute('position',new this.T.Float32BufferAttribute([0,0.8,0.02,0,0.23,0.02,0.30,0.25,0.02],3));geo.computeVertexNormals();
      const sail=new this.T.Mesh(geo,this.material('#fff0c7',{side:this.T.DoubleSide}));sail.userData.ownedGeometry=true;g.add(sail);
      this.line(g,[[0,0.8,0.02],[0,0.23,0.02],[0.3,0.25,0.02],[0,0.8,0.02]],INK,0.95);
      return g;
    }
    buildTile(id,data,index) {
      const type=resource(data.resource), p=this.G.center(id), g=this.group(this.land,p.x,0,p.z), rng=random(index*501+9);
      const shore=this.cylinder(g,1.025,1.01,0.18,'#dfc58f',0,-0.025,0,6);
      const earth=this.cylinder(g,0.982,1.005,0.16,'#bc9b6c',0,0.08,0,6);
      const top=this.cylinder(g,0.972,0.982,0.11,TERRAIN[type]||TERRAIN.desert,0,0.215,0,6);
      top.userData.pick={id,kind:'hex'};
      const detail=this.group(g,0,0.275,0);
      const spots=[[-0.46,-0.38],[-0.02,-0.52],[0.45,-0.34],[-0.52,0.14],[0.46,0.20],[-0.24,0.56],[0.18,0.59]];
      if(type==='wood') {
        spots.forEach(([x,z],i)=>{
          const h=0.36+rng()*0.25,t=this.group(detail,x,0,z);
          this.cylinder(t,0.038,0.047,h*0.5,'#8d6847',0,h*0.25,0,5,false);
          if(i%3===0) {
            const crown=this.mesh(t,'Icosahedron',[h*0.47,0],i%2?'#426f52':'#3c805c',0,h*0.80,0);crown.scale.y=1.28;
          } else {
            this.cylinder(t,0,h*0.35,h*0.78,i%2?'#3c7458':'#518a5d',0,h*0.62,0,6);
            this.cylinder(t,0,h*0.27,h*0.65,'#6da166',0,h*0.91,0,6);
          }
        });
        const logs=this.group(detail,-0.43,0.045,0.52);
        for(let j=0;j<3;j++){const l=this.cylinder(logs,0.046,0.046,0.29,'#d4a56e',j*0.075,0,0,6);l.rotation.z=Math.PI/2;}
      } else if(type==='wheat') {
        for(let patch=0;patch<3;patch++) {
          const field=this.group(detail,[-0.42,0.39,0][patch],0,[-0.35,-0.22,0.52][patch]);field.rotation.y=patch*0.22;
          this.box(field,0.55,0.017,0.40,'#bb8e48',0,0,0,false);
          for(let row=0;row<3;row++) {
            this.box(field,0.48,0.028,0.033,'#edcf79',0,0.025,-0.14+row*0.13,false);
            for(let col=0;col<5;col++) {
              const x=-0.2+col*0.10,z=-0.14+row*0.13;
              this.cylinder(field,0.006,0.009,0.15,'#8b703d',x,0.09,z,3,false);
              const head=this.mesh(field,'Octahedron',[0.034,0],'#f8df8b',x,0.175,z,false);head.scale.y=1.8;
            }
          }
        }
        this.box(detail,0.08,0.30,0.06,'#775c3c',0.48,0.15,0.36);
        this.box(detail,0.27,0.07,0.05,'#f1e0b0',0.48,0.24,0.36);
      } else if(type==='wool') {
        [[-0.44,-0.36],[0.41,-0.22],[-0.20,0.53],[0.47,0.42]].forEach(([x,z],i)=>{
          const sheep=this.group(detail,x,0,z);sheep.rotation.y=i*1.7;
          const body=this.mesh(sheep,'Icosahedron',[0.14,1],'#fff8dd',0,0.15,0);body.scale.set(1,0.85,1.5);
          this.mesh(sheep,'Icosahedron',[0.074,0],INK,0,0.18,0.19);
          for(const dx of [-0.07,0.07])for(const dz of [-0.10,0.10])this.box(sheep,0.035,0.11,0.035,INK,dx,0.055,dz,false);
        });
        for(let i=0;i<6;i++) {
          const a=i/6*TAU;this.mesh(detail,'Dodecahedron',[0.045,0],i%2?'#f7e8a2':'#e1eee0',Math.cos(a)*0.70,0.04,Math.sin(a)*0.66,false);
        }
        const fence=this.group(detail,-0.32,0,0.10);fence.rotation.y=0.4;
        for(let i=0;i<3;i++)this.box(fence,0.032,0.19,0.035,'#eee4c0',i*0.12,0.09,0);
        this.box(fence,0.31,0.035,0.025,'#eee4c0',0.12,0.135,0);
      } else if(type==='ore') {
        [[-0.36,-0.31,0.60],[0.27,-0.36,0.74],[0.44,0.24,0.42],[-0.30,0.49,0.28]].forEach(([x,z,h],i)=>{
          const m=this.cylinder(detail,0,0.26+h*0.1,h,i%2?'#879b9f':'#71878b',x,h/2,z,5);m.rotation.y=i*0.7;
          if(h>0.5) {const cap=this.cylinder(detail,0,0.095,h*0.25,'#edf0de',x,h*0.89,z,5);cap.rotation.y=i*0.7;}
        });
        [[-0.53,0.13],[0.15,0.58],[0.02,-0.62]].forEach(([x,z])=>this.mesh(detail,'Dodecahedron',[0.105,0],'#bcc4b6',x,0.09,z));
        this.box(detail,0.17,0.12,0.15,'#594b42',-0.28,0.10,-0.06);
      } else if(type==='brick') {
        [[-0.38,-0.3,0.31],[0.31,-0.31,0.43],[0.43,0.32,0.25]].forEach(([x,z,h],i)=>{
          for(let j=0;j<3;j++)this.cylinder(detail,0.25-j*0.035,0.28-j*0.035,h/3,['#ad664e','#bc7457','#d58b62'][j],x,h/6+j*h/3,z,6);
        });
        const pile=this.group(detail,-0.32,0,0.42);pile.rotation.y=0.18;
        for(let row=0;row<3;row++)for(let col=0;col<3-row;col++)this.box(pile,0.12,0.065,0.095,'#b95741',col*0.135+row*0.065,row*0.07+0.035,0);
        this.box(detail,0.25,0.018,0.25,'#ebc598',-0.32,0.014,0.09,false);
      } else {
        [[-0.4,-0.34,0.36],[0.32,-0.4,0.28],[-0.20,0.47,0.20]].forEach(([x,z,r])=>{
          const dune=this.mesh(detail,'Sphere',[r,8,4],'#edcf95',x,0,z);dune.scale.set(1,0.35,0.65);
        });
        this.box(detail,0.09,0.20,0.09,'#84946b',0.5,0.1,0.28);
        this.box(detail,0.18,0.05,0.06,'#84946b',0.55,0.13,0.28);
      }
      this.batchStatic(g);
      if(data.value) {const token=this.sprite(g,String(data.value),{token:true,square:true,width:0.48,height:0.48});token.position.set(0,0.49,0.07);token.renderOrder=10;token.userData.pick={id,kind:'hex'};}
      this.tiles.set(id,{group:g,resource:data.resource,value:data.value});
    }
    // Decorations share materials, so combine them into a few draw calls per
    // hex. Game pieces and pick targets remain independent animated objects.
    batchStatic(group) {
      group.updateWorldMatrix(true,true);
      const inverse=group.matrixWorld.clone().invert(),batches=new Map();
      group.traverse(object=>{
        if(!object.isMesh&&!object.isLineSegments)return;
        const key=(object.isLineSegments?'line:':'mesh:')+object.material.uuid;
        if(!batches.has(key))batches.set(key,{line:object.isLineSegments,material:object.material,position:[],normal:[]});
        const batch=batches.get(key),source=object.geometry;
        const geometry=source.index?source.toNonIndexed():source.clone();
        geometry.applyMatrix4(new this.T.Matrix4().multiplyMatrices(inverse,object.matrixWorld));
        const positions=geometry.getAttribute('position').array;
        for(let i=0;i<positions.length;i++)batch.position.push(positions[i]);
        const normals=geometry.getAttribute('normal')?.array;
        if(normals)for(let i=0;i<normals.length;i++)batch.normal.push(normals[i]);
        geometry.dispose();
      });
      group.clear();
      batches.forEach(batch=>{
        const geometry=new this.T.BufferGeometry();geometry.setAttribute('position',new this.T.Float32BufferAttribute(batch.position,3));
        if(batch.normal.length)geometry.setAttribute('normal',new this.T.Float32BufferAttribute(batch.normal,3));
        const mesh=batch.line?new this.T.LineSegments(geometry,batch.material):new this.T.Mesh(geometry,batch.material);
        mesh.userData.ownedGeometry=true;group.add(mesh);
      });
    }
    makeHouse(parent,color,level=1) {
      const g=this.group(parent);
      const house=(x,z,scale=1)=>{
        const h=this.group(g,x,0,z);h.scale.setScalar(scale);
        this.box(h,0.24,0.24,0.25,'#fff0ce',0,0.12,0);
        const roof=this.cylinder(h,0.21,0.21,0.30,color,0,0.30,0,3);roof.rotation.z=Math.PI/2;roof.rotation.y=Math.PI/2;
        this.box(h,0.065,0.13,0.01,color,0,0.065,0.132);
        this.box(h,0.050,0.065,0.015,'#2e5960',-0.070,0.16,0.13,false);
        this.box(h,0.055,0.065,0.015,'#2e5960',0.070,0.16,0.13,false);
        this.box(h,0.05,0.17,0.06,'#e1c8a4',0.07,0.34,-0.03);
      };
      this.cylinder(g,0.22,0.24,0.04,color,0,0.015,0,12);
      if(level>1) {
        house(-0.12,0.04,0.90);house(0.14,0.09,0.76);
        this.box(g,0.16,0.43,0.16,'#fff0ce',0.04,0.215,-0.10);
        this.cylinder(g,0,0.15,0.18,color,0.04,0.52,-0.10,4);
        this.box(g,0.065,0.10,0.01,'#386c72',0.04,0.33,-0.013);
        this.cylinder(g,0.007,0.007,0.18,INK,0.04,0.67,-0.10,4,false);
        this.box(g,0.11,0.07,0.01,color,0.095,0.71,-0.10,false);
      } else house(0,0);
      return g;
    }
    makeRoad(parent,id,color) {
      const p=this.G.edge(id),g=this.group(parent,p.x,p.y,p.z);
      g.rotation.y=Math.atan2(p.b.x-p.a.x,p.b.z-p.a.z);
      this.box(g,0.16,0.038,0.88,'#ddc89c',0,0.013,0);
      for(let i=0;i<5;i++)this.box(g,0.11,0.06,0.14,color,0,0.050,(i-2)*0.168);
      return g;
    }
    makeRobber() {
      const g=new this.T.Group();
      this.cylinder(g,0.12,0.20,0.07,INK,0,0.035,0,10);
      this.cylinder(g,0.085,0.15,0.29,'#3d494a',0,0.20,0,8);
      this.mesh(g,'Sphere',[0.105,10,8],'#e2b78a',0,0.42,0);
      this.box(g,0.18,0.048,0.04,INK,0,0.44,0.09,false);
      this.box(g,0.024,0.018,0.012,'#fff4d2',-0.045,0.44,0.115,false);
      this.box(g,0.024,0.018,0.012,'#fff4d2',0.045,0.44,0.115,false);
      this.cylinder(g,0.19,0.19,0.034,INK,0,0.51,0,12);
      this.cylinder(g,0.08,0.115,0.12,INK,0,0.59,0,8);
      this.mesh(g,'Icosahedron',[0.14,1],'#af8860',0.15,0.17,0.01);
      this.box(g,0.25,0.05,0.05,'#c35443',0,0.335,0.015);
      return g;
    }
    color(player) { return this.colors[(Number(player)||1)-1]||PALETTE[0]; }
    setState(state,colors=[1,2,3,4]) {
      if(!state) return;
      this.colors=colors.map(c=>typeof c==='string' && !/^\d+$/.test(c) ? c : PALETTE[(Number(c)-1)%4]||PALETTE[0]);
      const previous=this._state;this._state=state;
      if(this.fallback) {this.renderFallback();return;}
      const initiallyEmpty=this.tiles.size===0;
      this.G.hexes.forEach((id,i)=>{
        const data=state.hexes?.[id];if(!data)return;
        const old=this.tiles.get(id);
        if(!old||old.resource!==data.resource||old.value!==data.value) {
          if(old){this.disposeOwned(old.group);this.land.remove(old.group);}
          this.buildTile(id,data,i);
        }
      });
      const active=new Set();
      for(const road of state.roads||[]) {
        const key=road.slot;active.add(key);
        if(!this.pieces.has(key)) {const g=this.makeRoad(this.structures,key,this.color(road.player));this.pieces.set(key,{group:g,level:0});if(!initiallyEmpty)this.grow(g,'road');}
      }
      for(const city of state.cities||[]) {
        const key=city.slot,level=Number(city.level)||1;active.add(key);
        const old=this.pieces.get(key);
        if(!old||old.level!==level) {
          if(old)this.structures.remove(old.group);
          const p=this.G.vertex(key),g=this.makeHouse(this.structures,this.color(city.player),level);g.position.set(p.x,p.y,p.z);
          this.pieces.set(key,{group:g,level});if(!initiallyEmpty)this.grow(g,'city');
        }
      }
      for(const [key,piece] of this.pieces)if(!active.has(key)){this.structures.remove(piece.group);this.pieces.delete(key);}
      const robberHex=Object.keys(state.hexes||{}).find(id=>state.hexes[id].robber);
      if(robberHex) {
        const p=this.G.center(robberHex),to=new this.T.Vector3(p.x+0.18,0.29,p.z+0.20);this.robber.visible=true;
        if(this.robberHex && this.robberHex!==robberHex)this.travel(this.robber,this.robber.position.clone(),to,950);
        else if(!this.robberHex)this.robber.position.copy(to);
        this.robberHex=robberHex;
      } else this.robber.visible=false;
      const portKey=JSON.stringify(state.ports||{});
      if(portKey!==this.portKey) {this.portKey=portKey;this.buildPorts(state.ports||{});}
    }
    buildPorts(ports) {
      this.disposeOwned(this.ports);this.ports.clear();this.portBoats=[];
      for(const [id,res] of Object.entries(ports)) {
        const p=this.G.edge(id),parts=id.split('_'),c=this.G.center(parts.slice(1).join('_'));
        const dx=p.x-c.x,dz=p.z-c.z,length=Math.hypot(dx,dz),nx=dx/length,nz=dz/length;
        const g=this.group(this.ports,p.x,0,p.z);g.rotation.y=Math.atan2(nx,nz);
        const dock=this.group(g);
        for(let i=0;i<7;i++)this.box(dock,0.32,0.045,0.09,'#b38b5d',0,0.04,0.08+i*0.105);
        for(const x of [-0.16,0.16])for(const z of [0.15,0.65])this.cylinder(dock,0.025,0.025,0.23,'#715f45',x,-0.01,z,5,false);
        this.batchStatic(dock);
        const boat=this.makeBoat(g,0.34,-0.12,0.87,res==='any'?'#e7ba53':TERRAIN[resource(res)]||'#d46d4b');boat.rotation.y=-0.25;this.portBoats.push(boat);
        const label=this.sprite(g,`${res==='any'?'3:1': '2:1'} ${res==='any'?'PORT':String(res).toUpperCase()}`,{width:0.83,height:0.32,fontSize:32});label.position.set(-0.03,0.17,1.12);
      }
    }
    setTargets(targets=[]) {
      const key=JSON.stringify(targets);
      if(key===this.targetKey)return;
      this.targetKey=key;
      this.targets=targets;
      if(this.fallback){this.renderFallback();return;}
      this.disposeOwned(this.legal);this.legal.clear();
      for(const target of targets) {
        let p; try {p=target.kind==='edge'?this.G.edge(target.id):target.kind==='vertex'?this.G.vertex(target.id):this.G.center(target.id);}catch(_){continue;}
        if(!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;
        const g=this.group(this.legal,p.x,0.33,p.z);g.userData.pick={id:target.id,kind:target.kind};
        if(target.kind==='edge') {
          g.rotation.y=Math.atan2(p.b.x-p.a.x,p.b.z-p.a.z);
          const hit=this.box(g,0.25,0.08,0.86,'#fff5ac',0,0.02,0);hit.userData.pick=g.userData.pick;
          for(let i=-1;i<=1;i++)this.box(g,0.11,0.09,0.12,'#e9a13d',0,0.04,i*0.21,false);
        } else {
          const radius=target.kind==='hex'?0.66:0.20;
          const hit=this.cylinder(g,radius,radius,0.06,'#ffdf77',0,0.015,0,target.kind==='hex'?6:20);
          hit.userData.pick=g.userData.pick;
          const hole=this.cylinder(g,radius*0.78,radius*0.78,0.07,'#fff2bc',0,0.04,0,target.kind==='hex'?6:20,false);hole.userData.pick=g.userData.pick;
          if(target.kind==='vertex'){this.box(g,0.19,0.015,0.04,INK,0,0.085,0,false);this.box(g,0.04,0.015,0.19,INK,0,0.085,0,false);}
        }
      }
      this.renderer.domElement.style.cursor=targets.length?'crosshair':'grab';
    }
    grow(g,kind) {
      if(this.reducedMotion)return;
      g.scale.set(kind==='road'?1:0.05,0.03,0.03);
      this.animations.push({start:performance.now(),duration:650,update:t=> {const e=ease(t);g.scale.set(kind==='road'?1:e,e,e);},done:()=>g.scale.set(1,1,1)});
      for(let i=0;i<5;i++){const dust=this.mesh(this.effects,'Icosahedron',[0.075,0],'#ead9af',g.position.x,g.position.y+0.1,g.position.z,false);const angle=i/5*TAU;this.animations.push({start:performance.now(),duration:600,update:t=>{dust.position.set(g.position.x+Math.cos(angle)*t*0.40,g.position.y+Math.sin(t*Math.PI)*0.24,g.position.z+Math.sin(angle)*t*0.40);dust.scale.setScalar(1-t);},done:()=>this.effects.remove(dust)});}
    }
    travel(object,from,to,duration=1000,done) {
      if(this.reducedMotion){object.position.copy(to);done?.();return;}
      this.animations.push({start:performance.now(),duration,update:t=>{object.position.lerpVectors(from,to,ease(t));object.position.y+=Math.sin(t*Math.PI)*0.6;},done});
    }
    animate(type,payload={}) {
      if(this.fallback||this.dead)return;
      if(type==='robber' && (payload.hex||payload.tile||payload.to)) {const p=this.G.center(payload.hex||payload.tile||payload.to);if(Number.isFinite(p.x))this.travel(this.robber,this.robber.position.clone(),new this.T.Vector3(p.x+0.18,0.29,p.z+0.20));return;}
      if(type==='roll'||type==='dice') {
        if(this.reducedMotion)return;
        const value=Number(payload.value||payload.total||payload.roll);
        for(const [id,tile] of this.tiles) {
          if(Number(tile.value)!==value)continue;
          const token=tile.group.children.find(child=>child.isSprite&&child.userData.pick?.kind==='hex');
          if(!token)continue;
          const initial=token.scale.clone();
          this.animations.push({start:performance.now(),duration:950,update:t=>token.scale.copy(initial).multiplyScalar(1+Math.sin(t*Math.PI)*0.30),done:()=>token.scale.copy(initial)});
        }
        return;
      }
      if(type==='production'||type==='harvest') {
        const value=Number(payload.value||payload.total||payload.roll);
        const selected=payload.hexes||(payload.hex||payload.tile?[payload.hex||payload.tile]:Object.keys(this._state.hexes||{}).filter(id=>this._state.hexes[id].value===value&&!this._state.hexes[id].robber));
        for(const id of selected) {
          const p=this.G.center(id),target=(this._state.cities||[]).find(c=>(!payload.player||Number(c.player)===Number(payload.player))&&this.G.hexesFromVertex(c.slot).includes(id));
          if(!Number.isFinite(p.x))continue;
          if(!target||this._state.hexes[id]?.robber)continue;
          this.goods(p,this.G.vertex(target.slot),resource(payload.resource||this._state.hexes[id]?.resource),Math.max(1,Number(payload.count)||Number(target.level)||1));
        }
      } else if(type==='trade'||type==='goods'||type==='resource'||type==='rob') {
        const locate=(value,fallback)=>{
          if(value && typeof value==='object'&&Number.isFinite(value.x))return value;
          if(typeof value==='string'&&value.includes('_'))return value.startsWith('city_')?this.G.vertex(value):this.G.center(value);
          const city=(this._state.cities||[]).find(c=>Number(c.player)===Number(value));return city?this.G.vertex(city.slot):fallback;
        };
        this.goods(locate(payload.from||(type==='rob'?payload.command?.[2]:null),{x:-4,y:0.4,z:0}),locate(payload.to||payload.player,{x:4,y:0.4,z:0}),resource(payload.resource||'wheat'),Math.min(8,Math.max(1,Number(payload.count)||4)));
      } else if(['build','road','village','city'].includes(type)) {const p=this.pieces.get(payload.slot||payload.id);if(p)this.grow(p.group,p.level?'city':'road');}
    }
    goods(from,to,type,count) {
      if(this.reducedMotion)return;
      for(let i=0;i<count;i++) {
        const g=this.group(this.effects,from.x,0.6,from.z);
        this.box(g,0.13,0.13,0.13,TERRAIN[type]||'#e7c36f');
        this.box(g,0.145,0.027,0.14,'#f9e3a5',0,0,0,false);
        const start=new this.T.Vector3(from.x,Math.max(from.y||0,0.5),from.z),end=new this.T.Vector3(to.x,Math.max(to.y||0,0.5),to.z);
        g.visible=false;
        this.animations.push({start:performance.now()+i*120,duration:1100,update:t=>{g.visible=true;g.position.lerpVectors(start,end,ease(t));g.position.y+=Math.sin(t*Math.PI)*1.3;g.rotation.y=t*TAU;g.scale.setScalar(Math.min(1,t*8,(1-t)*8));},done:()=>this.effects.remove(g)});
      }
    }
    listen(el,event,fn,opts) {el.addEventListener(event,fn,opts);this.listeners.push(()=>el.removeEventListener(event,fn,opts));}
    bind() {
      const canvas=this.renderer.domElement;
      this.listen(canvas,'pointerdown',e=>{
        if(e.button>0)return;canvas.setPointerCapture?.(e.pointerId);
        this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        this.drag={x:e.clientX,y:e.clientY,moved:false};canvas.style.cursor='grabbing';
        if(this.pointers.size===2)this.pinch=this.pinchMeasure();
      });
      this.listen(canvas,'pointermove',e=>{
        if(!this.pointers.has(e.pointerId))return;
        const previous=this.pointers.get(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.pointers.size===2) {
          const next=this.pinchMeasure();if(this.pinch){this.zoom(this.pinch.distance/next.distance);const roll=next.angle-this.pinch.angle;this.world.quaternion.premultiply(new this.T.Quaternion().setFromAxisAngle(new this.T.Vector3(0,0,1).applyQuaternion(this.camera.quaternion),roll));}
          this.pinch=next;this.drag.moved=true;return;
        }
        if(Math.hypot(e.clientX-this.drag.x,e.clientY-this.drag.y)>4)this.drag.moved=true;
        if(this.drag.moved) {
          const rect=canvas.getBoundingClientRect(),a=this.trackball(previous.x,previous.y,rect),b=this.trackball(e.clientX,e.clientY,rect);
          const q=new this.T.Quaternion().setFromUnitVectors(a,b),cameraQ=this.camera.quaternion;
          q.premultiply(cameraQ).multiply(cameraQ.clone().invert());this.world.quaternion.premultiply(q);
        }
      });
      const up=e=>{
        const was=this.pointers.has(e.pointerId);this.pointers.delete(e.pointerId);
        if(was&&!this.drag?.moved&&e.type!=='pointercancel')this.pick(e.clientX,e.clientY);
        if(!this.pointers.size)this.drag=null;this.pinch=null;canvas.style.cursor=this.targets.length?'crosshair':'grab';
      };
      this.listen(canvas,'pointerup',up);this.listen(canvas,'pointercancel',up);
      this.listen(canvas,'wheel',e=>{e.preventDefault();this.zoom(Math.exp(e.deltaY*0.001));},{passive:false});
      this.listen(canvas,'keydown',e=>{
        const rotations={ArrowLeft:[0,1,0,-0.13],ArrowRight:[0,1,0,0.13],ArrowUp:[1,0,0,-0.13],ArrowDown:[1,0,0,0.13],q:[0,0,1,0.13],e:[0,0,1,-0.13]};
        const rotation=rotations[e.key];
        if(rotation){e.preventDefault();const axis=new this.T.Vector3(...rotation.slice(0,3)).applyQuaternion(this.camera.quaternion);this.world.quaternion.premultiply(new this.T.Quaternion().setFromAxisAngle(axis,rotation[3]));}
        else if(e.key==='+'||e.key==='='){e.preventDefault();this.zoom(0.9);}
        else if(e.key==='-'){e.preventDefault();this.zoom(1.1);}
        else if(e.key==='Home'){e.preventDefault();this.resetView();}
      });
      this.listen(canvas,'contextmenu',e=>e.preventDefault());
      this.listen(canvas,'webglcontextlost',e=>{e.preventDefault();this.contextLost=true;});
      this.listen(canvas,'webglcontextrestored',()=>{this.contextLost=false;});
    }
    pinchMeasure() {const [a,b]=[...this.pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};}
    trackball(x,y,rect) {
      const radius=Math.min(rect.width,rect.height)*0.48,px=(x-rect.left-rect.width/2)/radius,py=-(y-rect.top-rect.height/2)/radius,d=px*px+py*py;
      return new this.T.Vector3(px,py,d<=0.5?Math.sqrt(1-d):0.5/Math.sqrt(d)).normalize();
    }
    pick(x,y) {
      if(!this.targets.length)return;
      const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hits=this.raycaster.intersectObjects(this.legal.children,true);
      for(const hit of hits){let o=hit.object;while(o&&!o.userData.pick)o=o.parent;if(o?.userData.pick){const p=o.userData.pick;this.options.onPick?.(p.id,p.kind);return;}}
    }
    zoom(factor) {if(this.fallback)return;const length=this.camera.position.length(),next=Math.max(9,Math.min(Math.max(35,18*(this.fitFactor||1)*2),length*factor));this.camera.position.multiplyScalar(next/length);}
    resetView() {this.setView('perspective');}
    setView(view) {
      if(this.fallback)return;
      this.world.quaternion.copy(this.defaultQuaternion);
      this.camera.position.set(0,view==='top'?18:11.8,view==='top'?0.01:13.8);this.fitFactor=1;this.camera.lookAt(0,0,0);this.resize();
    }
    resize() {
      if(this.fallback||this.dead||!this.camera)return;
      const width=Math.max(1,this.container.clientWidth),height=Math.max(1,this.container.clientHeight);
      this.renderer.setSize(width,height,false);this.camera.aspect=width/height;
      // Keep room for whole harbour labels at phone widths, not only their
      // anchor points. A fixed field of view also avoids a jump at breakpoints.
      const fit=Math.max(1,1.08/this.camera.aspect);
      this.camera.position.multiplyScalar(fit/(this.fitFactor||1));this.fitFactor=fit;
      this.camera.fov=35;this.camera.updateProjectionMatrix();
    }
    frame(now) {
      if(this.dead||this.fallback)return;
      this.raf=requestAnimationFrame(t=>this.frame(t));
      if(document.hidden||this.contextLost)return;
      for(let i=this.animations.length-1;i>=0;i--){const a=this.animations[i],elapsed=now-a.start;if(elapsed<0)continue;const t=Math.min(1,elapsed/a.duration);a.update(t);if(t===1){a.done?.();this.animations.splice(i,1);}}
      if(!this.reducedMotion) {
        for(let i=0;i<(this.portBoats||[]).length;i++){const b=this.portBoats[i];b.position.y=-0.12+Math.sin(now*0.0017+i)*0.025;b.rotation.z=Math.sin(now*0.0012+i)*0.035;}
        if(this.decorBoat){this.decorBoat.position.y=-0.16+Math.sin(now*0.001)*0.03;this.decorBoat.rotation.z=Math.sin(now*0.0008)*0.04;}
        this.legal.children.forEach((g,i)=>{g.position.y=0.33+Math.sin(now*0.004+i*0.2)*0.025;});
      }
      this.renderer.render(this.scene,this.camera);
    }
    renderFallback() {
      if(!this.G)return;
      const scale=60,point=p=>`${(p.x*scale).toFixed(2)},${(p.z*scale).toFixed(2)}`;
      let html='<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustrated Settlers island" viewBox="-420 -365 840 730" style="display:block;width:100%;height:100%;touch-action:manipulation"><circle r="360" fill="#6aafb1" stroke="#2d6872" stroke-width="2"/>';
      for(const id of this.G.hexes) {
        const data=this._state.hexes?.[id]||{},p=this.G.center(id),type=resource(data.resource);
        const poly=[1,2,3,4,5,6].map(v=>point(this.G.vertex(`${v}_${id}`))).join(' ');
        html+=`<polygon points="${poly}" fill="${TERRAIN[type]||TERRAIN.desert}" stroke="#ead5a2" stroke-width="5"/><polygon points="${poly}" fill="none" stroke="${INK}" stroke-width="1"/>`;
        if(this.options.assetBase) html+=`<image href="${safe(this.options.assetBase)}resources/${safe(type)}.svg" x="${p.x*scale-20}" y="${p.z*scale-38}" width="40" height="40"/>`;
        if(data.value)html+=`<circle cx="${p.x*scale}" cy="${p.z*scale+12}" r="15" fill="#fff0c5" stroke="${INK}" stroke-width="2"/><text x="${p.x*scale}" y="${p.z*scale+18}" text-anchor="middle" fill="${[6,8].includes(Number(data.value))?'#b74130':INK}" font-family="Georgia,serif" font-size="19" font-weight="bold">${safe(data.value)}</text>`;
        if(data.robber)html+=`<text x="${p.x*scale+24}" y="${p.z*scale+2}" font-size="30" text-anchor="middle">♟</text>`;
      }
      for(const [id,res] of Object.entries(this._state.ports||{})) {
        const p=this.G.edge(id),c=this.G.center(id.split('_').slice(1).join('_')),length=Math.hypot(p.x-c.x,p.z-c.z);
        const x=(p.x+(p.x-c.x)/length)*scale,y=(p.z+(p.z-c.z)/length)*scale,label=res==='any'?'3:1 PORT':`2:1 ${String(res).toUpperCase()}`;
        html+=`<g data-port="${safe(id)}" aria-label="${safe(label)}"><line x1="${p.x*scale}" y1="${p.z*scale}" x2="${x}" y2="${y}" stroke="${INK}" stroke-width="6"/><line x1="${p.x*scale}" y1="${p.z*scale}" x2="${x}" y2="${y}" stroke="#c59c68" stroke-width="3"/><rect x="${x-32}" y="${y-8}" width="64" height="16" rx="5" fill="#fff0c5" stroke="${INK}"/><text x="${x}" y="${y+3}" text-anchor="middle" fill="${INK}" font-family="sans-serif" font-size="9" font-weight="bold">${safe(label)}</text></g>`;
      }
      for(const road of this._state.roads||[]){const p=this.G.edge(road.slot);html+=`<line x1="${p.a.x*scale}" y1="${p.a.z*scale}" x2="${p.b.x*scale}" y2="${p.b.z*scale}" stroke="${INK}" stroke-width="9"/><line x1="${p.a.x*scale}" y1="${p.a.z*scale}" x2="${p.b.x*scale}" y2="${p.b.z*scale}" stroke="${safe(this.color(road.player))}" stroke-width="6"/>`;}
      for(const city of this._state.cities||[]){const p=this.G.vertex(city.slot),x=p.x*scale,y=p.z*scale,s=city.level>1?12:9;html+=`<path d="M${x-s},${y+s} V${y-2} L${x},${y-s} L${x+s},${y-2} V${y+s}Z" fill="${safe(this.color(city.player))}" stroke="${INK}" stroke-width="2"/>`;}
      for(const target of this.targets){const p=target.kind==='edge'?this.G.edge(target.id):target.kind==='vertex'?this.G.vertex(target.id):this.G.center(target.id);html+=`<g data-id="${safe(target.id)}" data-kind="${safe(target.kind)}" role="button" tabindex="0" aria-label="Select ${safe(target.kind)} ${safe(target.id)}" style="cursor:pointer"><circle cx="${p.x*scale}" cy="${p.z*scale}" r="${target.kind==='hex'?27:12}" fill="#ffe293" fill-opacity="0.9" stroke="${INK}" stroke-width="2"/><text x="${p.x*scale}" y="${p.z*scale+6}" text-anchor="middle" font-size="21" fill="${INK}">+</text></g>`;}
      html+='<text x="0" y="341" text-anchor="middle" fill="#25464a" font-family="sans-serif" font-size="10" letter-spacing="2">ILLUSTRATED CHART · WEBGL UNAVAILABLE</text></svg>';
      this.container.innerHTML=html;
      this.container.querySelectorAll('[data-id]').forEach(el=>{el.onclick=()=>this.options.onPick?.(el.dataset.id,el.dataset.kind);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};});
    }
    disposeOwned(group) {
      group?.traverse(o=>{if(o.userData.owned){o.geometry?.dispose();o.material?.dispose();}if(o.userData.ownedGeometry)o.geometry?.dispose();if(o.userData.ownedMaterial){o.material?.map?.dispose();o.material?.dispose();}});
    }
    destroy() {
      this.dead=true;cancelAnimationFrame(this.raf);this.resizeObserver?.disconnect();this.listeners.forEach(fn=>fn());this.animations=[];
      this.disposeOwned(this.scene);this.materials.forEach(m=>m.dispose());this.geometries.forEach(g=>g.dispose());this.edgeGeometries.forEach(g=>g.dispose());this.textures.forEach(t=>t.dispose());this.lineMaterial?.dispose();
      this.renderer?.dispose();this.renderer?.domElement.remove();if(this.fallback)this.container.innerHTML='';
    }
  }
  root.SettlersXScene=SettlersXScene;
})(typeof window!=='undefined'?window:globalThis);
