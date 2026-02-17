module.exports = (mod) => {
  let html = `
    <div id="saito-container" class="saito-container">
      
      <div class="saito-sidebar left">
      </div>
      
      <div class="saito-main">
         <div class="redsquare-load-new-tweets-container"></div>
         <div class="tweet-container ${mod.curated ? 'active-curation' : ''}">
          <div id="saito-loader-container" class="saito-loader-container"> 
            <div class="saito-loader"></div>
          </div>
         </div>
         <div class="redsquare-intersection" id="redsquare-intersection">
           <div id="intersection-observer-trigger" class="intersection-observer-trigger deactivated"></div>
         </div>
         <div class="tweet-thread-holder" id="tweet-thread-holder"></div>
      </div>
     
      <div class="saito-sidebar redsquare-sidebar right">
      </div>
      
    </div>
  `;

  return html;
};
