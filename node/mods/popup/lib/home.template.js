module.exports = (mod) => {
  const count = mod.catalog && mod.catalog.getAll ? mod.catalog.getAll().length : 0;

  return `
    <div class="popup-home-page">
      <div class="popup-home-wrap">
        <section class="popup-home-hero">
          <div class="popup-home-copy">
            <h1>Popup Chinese</h1>
            <p>Learn Mandarin through real conversations, interesting stories, Chinese culture and authentic language.</p>
            <button type="button" class="popup-home-cta">Explore the Lessons →</button>
          </div>
          <figure class="popup-home-photo">
            <img src="/popup/img/home/beijing-hutong.jpg" alt="A Beijing hutong courtyard with a grey brick wall, a bicycle, and a red wooden door">
          </figure>
        </section>
        <section class="popup-home-features" aria-label="What Popup Chinese includes">
          <div class="popup-home-feature">
            <i class="fa-solid fa-headphones" aria-hidden="true"></i>
            <span><span class="popup-home-lesson-count">${count > 0 ? count : ''}</span> Lessons</span>
          </div>
          <span class="popup-home-feature-divider" aria-hidden="true"></span>
          <div class="popup-home-feature">
            <i class="fa-solid fa-book-open" aria-hidden="true"></i>
            <span>Transcripts &amp; Audio</span>
          </div>
          <span class="popup-home-feature-divider" aria-hidden="true"></span>
          <div class="popup-home-feature">
            <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
            <span>Interactive Vocabulary</span>
          </div>
        </section>
      </div>
    </div>
  `;
};
