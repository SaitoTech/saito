module.exports = () => {
  return `<div class="gameboard">
    <div class="table">
      <div class="tableau"></div>
      <div class="piles">
        <div class="stock" role="button" tabindex="0">
          <div class="pile"></div>
          <div class="count"></div>
        </div>
        <div class="waste">
          <div class="pile"></div>
          <div class="label">Waste</div>
        </div>
        <div class="meter">
          <div class="combo"></div>
          <div class="peaks"></div>
          <div class="remain"></div>
        </div>
      </div>
    </div>
    <div class="bar">
      <div class="undo saito-button-secondary" role="button">Undo</div>
      <div class="restart saito-button-secondary" role="button">Restart</div>
      <div class="fresh saito-button-primary" role="button">New Deal</div>
    </div>
  </div>`;
};
