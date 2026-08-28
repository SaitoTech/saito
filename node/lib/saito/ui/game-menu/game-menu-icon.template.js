module.exports = (options) => {
  const classname = options.class != undefined ? options.class : '';
  const mobileText = options.mobile_text
    ? `<span class="game-menu-icon-label">${options.mobile_text}</span>`
    : '';

  return `<li id="${options.id}" class="game-menu-icon ${classname}">${options.text}${mobileText}</li>`;
};
