module.exports = LiteDreamControlsTemplate = (app, mod, options) => {

  let html = `
    <div class="dream-controls lite" id="dream-controls">
      <div class="control-panel">
        <div class="timer">
          <div class="counter"> 00:00 </div>
          <div class="stun-identicon-list"></div>
        </div>  
        <div class="control-list">`;


  html += `<div id="dreamspace-member-count" class="members-control icon_click_area">
            <i class="fa-solid fa-users"></i>
          </div>
          <div class="share-control icon_click_area">
            <i class="fa-solid fa-share-nodes"></i>
          </div>
          `;
  
  if (mod.publicKey == mod.dreamer && options.externalMediaType === "videocall"){
    html += `<div class="stream-control icon_click_area click-me onair">
            <i class="fas fa-play"> </i>
          </div>`;
  }


  if (mod.publicKey == mod.dreamer){
    html += `<div id="limbo-disconnect-control" class="limbo-disconnect-control icon_click_area">
             <i class="fa-solid fa-x"></i>
          </div>`;
  }

  html += `</div>
      </div>
    </div>`;


    return html;
};
