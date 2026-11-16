module.exports = () => {
  const item = (name, label, href) =>
    `<a data-popup-nav="${name}" href="${href}">${label}</a>`;

  return `
    <nav class="popup-header-nav" aria-label="Popup Chinese">
      ${item('home', 'Home', '/popup')}
      ${item('lessons', 'Lessons', '/popup/lessons')}
      ${item('vocabulary', 'Vocabulary', '/popup/review')}
      ${item('testimonials', 'Testimonials', '/popup/testimonials')}
    </nav>
    <button type="button" class="popup-header-pages" aria-expanded="false" aria-label="Open Popup Chinese pages">Pages</button>
  `;
};
