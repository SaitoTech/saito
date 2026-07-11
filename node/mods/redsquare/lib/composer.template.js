module.exports = (composer) => {
  return `
    <section class="composer">
      <img class="composer-avatar" src="${composer.avatar}" alt="Your avatar" />
      <div class="composer-body">
        <textarea class="composer-input" placeholder="${composer.placeholder}" rows="2"></textarea>
        <div class="composer-actions">
          <div class="composer-tools">
            <button class="composer-tool" type="button" title="Image"><i class="fa-regular fa-image"></i></button>
            <button class="composer-tool" type="button" title="GIF"><i class="fa-regular fa-face-smile"></i></button>
            <button class="composer-tool" type="button" title="Poll"><i class="fa-solid fa-chart-simple"></i></button>
            <button class="composer-tool" type="button" title="Schedule"><i class="fa-regular fa-calendar"></i></button>
          </div>
          <button class="composer-submit" type="button">Post</button>
        </div>
      </div>
    </section>
  `;
};
