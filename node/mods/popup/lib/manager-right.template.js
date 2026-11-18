module.exports = () => {
  const item = (slug, label) =>
    `<li class="manager-menu ${slug}"><button type="button">${label}</button></li>`;

  return `
    <nav class="popup-lesson-nav" aria-label="Lesson categories">
      <div class="popup-lesson-nav-label">Difficulty</div>
      <ul>
        ${item('absolute-beginners', 'Absolute Beginners')}
        ${item('elementary', 'Elementary')}
        ${item('intermediate', 'Intermediate')}
        ${item('advanced', 'Advanced')}
      </ul>
      <div class="popup-lesson-nav-label">Collections</div>
      <ul>
        ${item('film-friday', 'Film Friday')}
        ${item('short-stories', 'Short Stories')}
        ${item('ktv-wednesday', 'KTV Wednesday')}
        ${item('hsk-test', 'HSK Test')}
      </ul>
    </nav>
  `;
};
