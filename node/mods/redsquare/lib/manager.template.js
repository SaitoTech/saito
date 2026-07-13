module.exports = (manager) => {
  return `
    <section class="manager">
      <header class="manager-header">
        <h2>${manager.title}</h2>
      </header>
      <div class="manager-body">
        <div class="manager-list"></div>
      </div>
    </section>
  `;
};
