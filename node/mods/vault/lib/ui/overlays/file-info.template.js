module.exports = (app, mod, file_info={}) => {

  //let msg = `
  //	Your NFT should arrive in your wallet shortly.
  //	<p></p>
  //    <b>Stealth Key?</b> Use the following file identifier for download access:
  //`;

  let msg = `
    Your NFT should arrive in your wallet shortly.
    <p></p>
    Once it arrives, you can access your file <a href="/vault">on this page</a> anytime.
  `;

  let html = `
    <div class="vault-file-info">
      <h2>Success!</h2>
      ${msg}
    </div>
  `;
//      <div class="vault-sig-grid" data-id="${file_info.sig}">
//        <div>${file_info.sig}</div>
//        <i class="fas fa-copy" id="vault-copy-sig"></i>
//      </div>
//</div>

  return html;

};
