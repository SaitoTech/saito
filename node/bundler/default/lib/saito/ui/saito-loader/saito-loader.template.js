module.exports = (blocker, msg) => {
  let loader_class = blocker == true ? 'blocker' : 'non-blocker';

  let html = `<div id="saito-loader-container" class="saito-loader-container ${loader_class}"`;
  if (msg) {
    html += ` title="${msg}"`;
  }
  html += `> 
    <div class="saito-loader">
    </div>
 </div>`;
  return html;
};
