module.exports = (nav) => {
  return `
    <nav class="menu">
      <ul class="list saito-menu-select-subtle">
        <li class="item active" data-nav="home">
          <span class="icon">
            <i class="fa-solid fa-house"></i>
          </span>
          <span class="label">Home</span>
        </li>
        <li class="item" data-nav="settings">
          <span class="icon">
            <i class="fa-solid fa-gear"></i>
          </span>
          <span class="label">Settings</span>
        </li>
      </ul>
    </nav>
  `;
};
