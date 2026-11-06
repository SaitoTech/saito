module.exports = (audioOn, videoOn) => `
  <div id="videocall-controls">
    <div class="videocall-timer" aria-live="polite">00:00</div>
    <div class="videocall-control audio-control icon_click_area${audioOn ? '' : ' disabled'}" title="Microphone">
      <i class="fa ${audioOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>
    </div>
    <div class="videocall-control video-control icon_click_area${videoOn ? '' : ' disabled'}" title="Camera">
      <i class="fas ${videoOn ? 'fa-video' : 'fa-video-slash'}"></i>
    </div>
    <div class="videocall-control present-control icon_click_area" title="Present your screen">
      <i class="fa-solid fa-display"></i>
    </div>
    <div class="videocall-control settings-control icon_click_area" title="Settings">
      <i class="fa-solid fa-cog"></i>
    </div>
    <div class="videocall-control invite-control icon_click_area" title="Invite users">
      <i class="fa fa-plus"></i>
    </div>
    <div class="videocall-control disconnect-control icon_click_area" title="End">
      <i class="fas fa-phone"></i>
    </div>
  </div>`;
