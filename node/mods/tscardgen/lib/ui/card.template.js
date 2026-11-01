module.exports = (view = {}) => {
  const download_name = view.download_name || 'card.png';

  return `
    <section class="ts-card" aria-label="Twilight Struggle card preview">
      <div class="ts-card-stage">
        <canvas class="ts-card-canvas" width="375" height="525" role="img" aria-label="Generated card"></canvas>
      </div>
      <div class="ts-card-actions">
        <a class="ts-card-download saito-button-secondary small" download="${download_name}" href="#">Download PNG</a>
      </div>
    </section>
  `;
};
