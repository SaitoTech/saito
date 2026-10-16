module.exports = () => {
  return `
    <div class="paths-track-overlay russia-overlay">
      <div class="paths-track-bg"></div>
      <div class="paths-track-shade"></div>
      <div class="paths-track-body">
        <header class="paths-track-header">
          <h1 class="paths-track-title">Russian Capitulation</h1>
          <p class="paths-track-subtitle">When this track is complete, Russia is forced to exit the war.</p>
          <div class="paths-track-rule"></div>
        </header>
        <section class="paths-track-board">
          <div class="paths-track-grid"></div>
        </section>
        <section class="paths-track-explain">
          <h2 class="paths-track-focus"></h2>
          <div class="paths-track-panels">
            <article class="paths-track-panel">
              <h3>To Advance</h3>
              <p class="paths-track-next"></p>
            </article>
            <article class="paths-track-panel">
              <h3>To Block</h3>
              <p class="paths-track-stop"></p>
            </article>
          </div>
          <p class="paths-track-footnote">A captured Baku counts toward the Tsar Fell comparison. It does not count toward all seven VP spaces in Russia.</p>
        </section>
      </div>
    </div>
  `;
};
