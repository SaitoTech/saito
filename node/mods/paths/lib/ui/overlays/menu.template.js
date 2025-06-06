module.exports = (menu_items=0, html="") => {
  return `<div class="menu m${menu_items} hide-scrollbar">${html}</div>`;
};
