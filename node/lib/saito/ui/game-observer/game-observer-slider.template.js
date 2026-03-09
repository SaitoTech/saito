module.exports = (min = 0, max = 0, value = 0) => {
  return `
    <div id="game-observer-slider" class="game-observer-slider">
      <input 
        type="range"
        id="observer-slider-input"
        min="${min}"
        max="${max}"
        value="${value}"
        step="1"
      />
      <div class="observer-slider-label">
        <span id="observer-slider-current">${value}</span>
        /
        <span id="observer-slider-max">${max}</span>
      </div>
    </div>
  `;
};
