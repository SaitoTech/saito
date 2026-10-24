/* A self-contained, themeable Three.js dice vignette. No gameplay randomness. */
(function (root) {
  'use strict';
  class ConquestScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.disposed = false;
      this.frame = null;
      this.paintWaits = new Map();
      this.ready = Promise.resolve();
      this.reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const theme = root.getComputedStyle(canvas.closest('.conquest-app') || canvas);
      const T = root.THREE;
      this.playerStyles = Array.from({length:7}, (_, owner) => {
        let color = theme.getPropertyValue(`--conquest-player-${owner}`).trim() || '#8c907e';
        let pips = '#17211c';
        if (T) {
          // Use the same pigment as the player's territories and player box.
          const pigment = new T.Color(color);
          color = pigment.getStyle();
          if (.2126*pigment.r + .7152*pigment.g + .0722*pigment.b < .179) pips = '#ffffff';
        }
        return {color, pips};
      });
      if (!T) { canvas.hidden = true; return; }
      try {
        this.renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: true});
        this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
        this.scene = new T.Scene();
        this.camera = new T.PerspectiveCamera(34, 2.8, 0.1, 100);
        // Zoom 4 renders each cube at about twice the previous screen size.
        this.camera.zoom = 4;
        this.camera.position.set(0, 4, 10);
        this.camera.lookAt(0, 0, 0);
        this.scene.add(new T.AmbientLight(0xffffff, 1.2));
        const sun = new T.DirectionalLight(0xffffff, 2);
        sun.position.set(-3, 8, 5);
        this.scene.add(sun);
        this.dice = [];
        // Reuse uploaded faces instead of recreating textures during every roll.
        this.materials = this.playerStyles.map(({color, pips}) =>
          [1, 6, 2, 5, 3, 4].map(n => new T.MeshStandardMaterial({
            map: this.makeFace(n, color, pips), roughness: 0.3
          }))
        );
        for (let i = 0; i < 5; i++) {
          const die = new T.Mesh(new T.BoxGeometry(1, 1, 1), this.materials[i < 3 ? 1 : 0]);
          die.position.set((i - 2) * 2, i % 2 ? 0.05 : -0.05, 0);
          die.rotation.set(0.3 + i * 0.18, 0.35 + i * 0.4, -0.1);
          this.scene.add(die);
          this.dice.push(die);
        }
        this.resize = () => {
          if (this.disposed) return;
          const w = canvas.clientWidth || 300, h = canvas.clientHeight || 116;
          this.renderer.setSize(w, h, false);
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.render(this.scene, this.camera);
        };
        this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
        if (this.observer) this.observer.observe(canvas);
        this.resize();
        this.ready = this.waitForPaint();
      } catch (e) { canvas.hidden = true; this.renderer?.dispose(); this.renderer = null; }
    }
    makeFace(n, color, pips) {
      const T = root.THREE, c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(40,32,24,.18)'; x.lineWidth = 5; x.strokeRect(3,3,122,122);
      x.fillStyle = pips;
      const points = {1:[[64,64]],2:[[34,34],[94,94]],3:[[34,34],[64,64],[94,94]],4:[[34,34],[94,34],[34,94],[94,94]],5:[[34,34],[94,34],[64,64],[34,94],[94,94]],6:[[34,30],[34,64],[34,98],[94,30],[94,64],[94,98]]};
      points[n].forEach(p=>{x.beginPath();x.arc(p[0],p[1],9,0,Math.PI*2);x.fill();});
      const texture = new T.CanvasTexture(c);
      texture.colorSpace = T.SRGBColorSpace;
      return texture;
    }
    waitForPaint() {
      if (this.disposed) return Promise.resolve();
      return new Promise(resolve => {
        // The second frame gives the browser a paint opportunity after the draw.
        const first = root.requestAnimationFrame(() => {
          this.paintWaits.delete(first);
          const second = root.requestAnimationFrame(() => {
            this.paintWaits.delete(second);
            resolve();
          });
          this.paintWaits.set(second, resolve);
        });
        this.paintWaits.set(first, resolve);
      });
    }
    async prepare(battle) {
      await this.ready;
      if (this.disposed) return;
      const values = (battle.attackerDice || []).concat(battle.defenderDice || []);
      const attackCount = (battle.attackerDice || []).length;
      const owners = values.map((_, i) => i < attackCount ? (battle.attackerOwner ?? 1) : (battle.defenderOwner ?? 0));
      if (!this.renderer) {
        const stage = this.canvas.parentElement;
        let fallback = stage.querySelector('.conquest-flat-dice');
        if (!fallback) {
          fallback = document.createElement('div');
          fallback.className = 'conquest-flat-dice';
          stage.prepend(fallback);
        }
        fallback.innerHTML = values.map(value => `<b>${value}</b>`).join('');
        [...fallback.children].forEach((die, i) => {
          const style = this.playerStyles[owners[i]] || this.playerStyles[0];
          die.style.backgroundColor = style.color;
          die.style.color = style.pips;
        });
      } else {
        const spacing = 1.45;
        this.dice.forEach((die, i) => {
          die.visible = i < values.length;
          die.position.set((i - (values.length - 1) / 2) * spacing, 0, 0);
          die.rotation.set(0.3, 0.35, -0.1);
          die.material = this.materials[owners[i]] || this.materials[0];
        });
        this.resize();
      }
      await this.waitForPaint();
    }
    roll(battle, durationMs) {
      if (this.disposed) return Promise.resolve();
      root.clearTimeout(this.fallbackTimer);
      this.finishRoll?.();
      const finished = new Promise(resolve => { this.finishRoll = resolve; });
      const values = (battle.attackerDice || []).concat(battle.defenderDice || []);
      const spin = this.reducedMotion ? 0 : (durationMs ?? 820);
      if (!this.renderer) {
        const fallback = this.canvas.parentElement.querySelector('.conquest-flat-dice');
        fallback.classList.toggle('rolling', !this.reducedMotion);
        this.fallbackTimer = root.setTimeout(() => {
          fallback.classList.remove('rolling');
          this.finishRoll?.(); this.finishRoll = null;
        }, spin);
        return finished;
      }
      if (this.frame) root.cancelAnimationFrame(this.frame);
      // Material order +x,-x,+y,-y,+z,-z. Rotate the rolled face toward the viewer.
      const faceRotation = {1:[0,-Math.PI/2,0],6:[0,Math.PI/2,0],2:[Math.PI/2,0,0],5:[-Math.PI/2,0,0],3:[0,0,0],4:[0,Math.PI,0]};
      let started;
      const duration = spin;
      const tick = now => {
        if (this.disposed) return;
        if (started === undefined) started = now;
        const t = duration ? Math.min(1,(now-started)/duration) : 1;
        this.dice.forEach((die,i)=>{
          const end = faceRotation[values[i]] || [0,0,0];
          const spin = Math.pow(1-t,2)*Math.PI*4;
          die.rotation.set(end[0]+spin, end[1]+spin*0.8, end[2]+spin*0.3);
          die.position.y = Math.sin(t*Math.PI)*0.35;
        });
        this.renderer.render(this.scene,this.camera);
        if (t<1) this.frame = root.requestAnimationFrame(tick);
        else {this.finishRoll?.();this.finishRoll=null;}
      };
      this.frame = root.requestAnimationFrame(tick);
      return finished;
    }
    destroy() {
      this.disposed = true;
      for (const [frame, resolve] of this.paintWaits) {
        root.cancelAnimationFrame(frame); resolve();
      }
      this.paintWaits.clear();
      root.clearTimeout(this.fallbackTimer);this.finishRoll?.();this.finishRoll=null;
      if (this.frame) root.cancelAnimationFrame(this.frame);
      if (this.observer) this.observer.disconnect();
      if (this.dice) this.dice.forEach(d => d.geometry.dispose());
      if (this.materials) this.materials.flat().forEach(m => { m.map.dispose(); m.dispose(); });
      if (this.renderer) this.renderer.dispose();
    }
  }
  root.ConquestScene = ConquestScene;
})(typeof window !== 'undefined' ? window : globalThis);
