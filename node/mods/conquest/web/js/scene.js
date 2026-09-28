/* A self-contained, themeable Three.js dice vignette. No gameplay randomness. */
(function (root) {
  'use strict';
  class ConquestScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.disposed = false;
      this.frame = null;
      this.reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const theme = root.getComputedStyle(canvas.closest('.conquest-app') || canvas);
      this.attackColor = theme.getPropertyValue('--conquest-accent').trim() || '#bf543d';
      this.defenseColor = theme.getPropertyValue('--conquest-paper-deep').trim() || '#e9ddc1';
      this.inkColor = theme.getPropertyValue('--conquest-ink').trim() || '#353b37';
      const T = root.THREE;
      if (!T) { canvas.hidden = true; return; }
      try {
        this.renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: true});
        this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
        this.scene = new T.Scene();
        this.camera = new T.PerspectiveCamera(34, 2.8, 0.1, 100);
        this.camera.position.set(0, 4, 10);
        this.camera.lookAt(0, 0, 0);
        this.scene.add(new T.AmbientLight(0xffffff, 1.7));
        const sun = new T.DirectionalLight(0xffffff, 2.2);
        sun.position.set(-3, 8, 5);
        this.scene.add(sun);
        this.dice = [];
        this.textures = [];
        for (let i = 0; i < 5; i++) {
          const mats = [1, 6, 2, 5, 3, 4].map(n => {
            const texture = this.makeFace(n, i < 3 ? this.attackColor : this.defenseColor);
            this.textures.push(texture);
            return new T.MeshStandardMaterial({map: texture, roughness: 0.85});
          });
          const die = new T.Mesh(new T.BoxGeometry(1, 1, 1), mats);
          die.position.set((i - 2) * 1.3, i % 2 ? 0.05 : -0.05, 0);
          die.rotation.set(0.3 + i * 0.18, 0.35 + i * 0.4, -0.1);
          this.scene.add(die);
          this.dice.push(die);
        }
        this.resize = () => {
          if (this.disposed) return;
          const w = canvas.clientWidth || 280, h = canvas.clientHeight || 100;
          this.renderer.setSize(w, h, false);
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.render(this.scene, this.camera);
        };
        this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
        if (this.observer) this.observer.observe(canvas);
        this.resize();
      } catch (e) { canvas.hidden = true; this.renderer?.dispose(); this.renderer = null; }
    }
    makeFace(n, color) {
      const T = root.THREE, c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(40,32,24,.18)'; x.lineWidth = 5; x.strokeRect(3,3,122,122);
      x.fillStyle = color === this.attackColor ? '#fff4dd' : this.inkColor;
      const points = {1:[[64,64]],2:[[34,34],[94,94]],3:[[34,34],[64,64],[94,94]],4:[[34,34],[94,34],[34,94],[94,94]],5:[[34,34],[94,34],[64,64],[34,94],[94,94]],6:[[34,30],[34,64],[34,98],[94,30],[94,64],[94,98]]};
      points[n].forEach(p=>{x.beginPath();x.arc(p[0],p[1],9,0,Math.PI*2);x.fill();});
      return new T.CanvasTexture(c);
    }
    roll(battle) {
      if (!this.renderer || this.disposed) return;
      if (this.frame) root.cancelAnimationFrame(this.frame);
      const values = (battle.attackerDice || []).concat(battle.defenderDice || []);
      const attackCount = (battle.attackerDice || []).length;
      // Material order +x,-x,+y,-y,+z,-z. Rotate the rolled face toward the viewer.
      const faceRotation = {1:[0,-Math.PI/2,0],6:[0,Math.PI/2,0],2:[Math.PI/2,0,0],5:[-Math.PI/2,0,0],3:[0,0,0],4:[0,Math.PI,0]};
      this.dice.forEach((die,i)=>{
        die.visible = i < values.length;
        die.position.x = (i - (values.length-1)/2) * 1.3;
        if (i < values.length) {
          die.material.forEach((mat,j)=> {
            const old = mat.map;
            mat.map = this.makeFace([1,6,2,5,3,4][j],i < attackCount ? this.attackColor : this.defenseColor);
            old.dispose();
          });
        }
      });
      const started = performance.now(), duration = this.reducedMotion ? 0 : 820;
      const tick = now => {
        if (this.disposed) return;
        const t = duration ? Math.min(1,(now-started)/duration) : 1;
        this.dice.forEach((die,i)=>{
          const end = faceRotation[values[i]] || [0,0,0];
          const spin = Math.pow(1-t,2)*Math.PI*4;
          die.rotation.set(end[0]+spin, end[1]+spin*0.8, end[2]+spin*0.3);
          die.position.y = Math.sin(t*Math.PI)*0.65;
        });
        this.renderer.render(this.scene,this.camera);
        if (t<1) this.frame = root.requestAnimationFrame(tick);
      };
      this.frame = root.requestAnimationFrame(tick);
    }
    destroy() {
      this.disposed = true;
      if (this.frame) root.cancelAnimationFrame(this.frame);
      if (this.observer) this.observer.disconnect();
      if (this.dice) this.dice.forEach(d=> {d.geometry.dispose(); d.material.forEach(m=>{m.map.dispose();m.dispose();});});
      if (this.renderer) this.renderer.dispose();
    }
  }
  root.ConquestScene = ConquestScene;
})(typeof window !== 'undefined' ? window : globalThis);
