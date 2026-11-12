module.exports = (view = {}) => {
  return `
    <section class="ts-card" aria-label="Twilight Struggle card preview">
      <div class="ts-card-stage">
        <canvas class="ts-card-canvas" width="375" height="525" role="img" aria-label="Generated card"></canvas>
      </div>
    </section>
  `;
};
