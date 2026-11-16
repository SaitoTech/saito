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
        ${item('hsk-beginner', 'HSK Beginner')}
        ${item('hsk-intermediate', 'HSK Intermediate')}
        ${item('hsk-advanced', 'HSK Advanced')}
        ${item('new-hsk-level-1', 'New HSK 1')}
        ${item('new-hsk-level-2', 'New HSK 2')}
        ${item('new-hsk-level-3', 'New HSK 3')}
        ${item('new-hsk-level-4', 'New HSK 4')}
        ${item('new-hsk-level-5', 'New HSK 5')}
        ${item('new-hsk-level-6', 'New HSK 6')}
      </ul>
    </nav>
  `;
};
