async function encodeMp3(blob) {
  // lamejs 1.2.1 references these sibling modules as globals.
  globalThis.MPEGMode ??= require('lamejs/src/js/MPEGMode');
  globalThis.Lame ??= require('lamejs/src/js/Lame');
  globalThis.BitStream ??= require('lamejs/src/js/BitStream');
  const { Mp3Encoder } = require('lamejs');
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context({ sampleRate: 48000 });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const encoder = new Mp3Encoder(1, buffer.sampleRate, 128);
    const parts = [];
    for (let i = 0; i < samples.length; i += 1152) {
      const pcm = Int16Array.from(
        samples.subarray(i, i + 1152),
        (v) => Math.max(-1, Math.min(1, v)) * 32767
      );
      parts.push(new Int8Array(encoder.encodeBuffer(pcm)));
    }
    parts.push(new Int8Array(encoder.flush()));
    return new Blob(parts, { type: 'audio/mpeg' });
  } finally {
    await context.close();
  }
}

module.exports = async function downloadRecording(blob, video) {
  if (!video) {
    try {
      blob = await encodeMp3(blob);
    } catch (error) {
      console.error('Could not convert call audio to MP3', error);
      siteMessage('Saving audio in the original recording format', 2500);
    }
  }
  const ext = blob.type.includes('mpeg')
    ? 'mp3'
    : blob.type.includes('mp4')
      ? 'mp4'
      : blob.type.includes('ogg')
        ? 'ogg'
        : 'webm';
  const base = video ? 'saito_video' : 'saito_audio';
  const name = (await sprompt('Please enter a recording name', base)) || base;
  const link = document.createElement('a');
  link.download = name.toLowerCase().endsWith('.' + ext) ? name : name + '.' + ext;
  link.href = URL.createObjectURL(blob);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
