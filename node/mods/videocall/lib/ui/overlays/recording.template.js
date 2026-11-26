module.exports = () => `
  <section class="saito-overlay-panel retain-surface videocall-recording-options"
           role="dialog" aria-labelledby="videocall-recording-title" aria-describedby="videocall-recording-note">
    <h2 id="videocall-recording-title">Record this call</h2>
    <button type="button" data-mode="audio">
      <i class="mode-icon fa-solid fa-microphone-lines" aria-hidden="true"></i>
      <span><strong>Audio only</strong><small>Save the conversation as an MP3</small></span>
      <i class="mode-arrow fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
    <button type="button" data-mode="video">
      <i class="mode-icon fa-solid fa-video" aria-hidden="true"></i>
      <span><strong>Video and audio</strong><small>Include cameras and shared screens</small></span>
      <i class="mode-arrow fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
    <p id="videocall-recording-note"><i class="fa-solid fa-stopwatch" aria-hidden="true"></i>Everyone sees a 5-second count-in.</p>
  </section>`;
