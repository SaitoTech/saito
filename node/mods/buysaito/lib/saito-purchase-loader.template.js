module.exports = (msg) => {
  return `
    <div class="purchase-container" id="purchase-container">
      <div>${msg}</div> 
      <img class="spinner" src="/saito/img/spinner.svg">
    </div>
  `;
};
