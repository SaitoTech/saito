// Borrow call tracks. Only the mix and canvas tracks belong to the recorder.
class RecordingCapture {
  constructor(mod) {
    this.mod = mod;
    this.sources = new Map();
    this.syncAudio = this.syncAudio.bind(this);
  }

  start(video) {
    const Context = window.AudioContext || window.webkitAudioContext;
    this.context = new Context();
    this.destination = this.context.createMediaStreamDestination();
    this.output = new MediaStream(this.destination.stream.getAudioTracks());
    this.syncAudio();
    for (const change of ['added', 'updated', 'removed']) {
      this.mod.app.connection.on('videocall-stream-' + change, this.syncAudio);
    }
    if (video) this.addVideo();
    return this.output;
  }

  syncAudio() {
    const tracks = new Set();
    for (const entry of this.mod.streams.list({ session: 'call' })) {
      if (entry.kind !== 'camera' && entry.kind !== 'display') continue;
      for (const track of entry.mediaStream?.getAudioTracks() || []) {
        if (track.readyState !== 'ended') tracks.add(track);
      }
    }
    for (const [track, node] of this.sources) {
      if (tracks.has(track)) continue;
      node.disconnect();
      this.sources.delete(track);
    }
    for (const track of tracks) {
      if (this.sources.has(track)) continue;
      const node = this.context.createMediaStreamSource(new MediaStream([track]));
      node.connect(this.destination);
      this.sources.set(track, node);
    }
  }

  addVideo() {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const logo = new Image();
    logo.src = '/saito/img/logo.svg';
    const draw = () => {
      const meeting = document.querySelector('.videocall-full .video-container-large');
      const root = meeting || this.mod.CallInterface?.container;
      const videos = Array.from(
        root?.querySelectorAll(meeting ? '.videobox video' : '.videocall-panel video') || []
      );
      const boxes = videos.map((video) => video.getBoundingClientRect());
      let bounds = meeting?.getBoundingClientRect();
      if (!meeting && boxes.length) {
        const left = Math.min(...boxes.map((box) => box.left));
        const top = Math.min(...boxes.map((box) => box.top));
        bounds = {
          left,
          top,
          width: Math.max(...boxes.map((box) => box.right)) - left,
          height: Math.max(...boxes.map((box) => box.bottom)) - top
        };
      }
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (bounds?.width && bounds.height) {
        const scale = Math.min(canvas.width / bounds.width, canvas.height / bounds.height);
        for (const [index, video] of videos.entries()) {
          if (!video.videoWidth || video.readyState < 2) continue;
          const rect = boxes[index];
          if (!rect.width || !rect.height) continue;
          const x = (rect.left - bounds.left) * scale + (canvas.width - bounds.width * scale) / 2;
          const y = (rect.top - bounds.top) * scale + (canvas.height - bounds.height * scale) / 2;
          const width = rect.width * scale;
          const height = rect.height * scale;
          const fit = getComputedStyle(video).objectFit === 'cover' ? Math.max : Math.min;
          const zoom = fit(width / video.videoWidth, height / video.videoHeight);
          const w = video.videoWidth * zoom;
          const h = video.videoHeight * zoom;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, width, height);
          ctx.clip();
          ctx.drawImage(video, x + (width - w) / 2, y + (height - h) / 2, w, h);
          ctx.restore();
        }
      }
      if (logo.naturalWidth)
        ctx.drawImage(
          logo,
          canvas.width - 110,
          canvas.height - 46,
          96,
          (96 * logo.naturalHeight) / logo.naturalWidth
        );
    };
    const track = canvas.captureStream(25).getVideoTracks()[0];
    this.output.addTrack(track);
    draw();
    this.frames = setInterval(draw, 40);
  }

  stop() {
    clearInterval(this.frames);
    for (const change of ['added', 'updated', 'removed']) {
      this.mod.app.connection.removeListener('videocall-stream-' + change, this.syncAudio);
    }
    for (const node of this.sources.values()) node.disconnect();
    this.sources.clear();
    this.output?.getTracks().forEach((track) => track.stop());
    this.context?.close();
  }
}

module.exports = RecordingCapture;
