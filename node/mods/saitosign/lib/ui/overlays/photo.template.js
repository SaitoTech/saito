function photoTemplate() {
  return `
    <section class="saitosign-photo">
      <p class="photo-note" data-photo-status></p>
      <div class="frame">
        <video data-photo-video autoplay muted playsinline hidden></video>
        <img data-photo-still alt="Captured photograph" hidden>
        <p class="count" data-photo-count hidden></p>
      </div>
      <div class="actions" data-photo-actions></div>
    </section>
  `;
}

module.exports = photoTemplate;
