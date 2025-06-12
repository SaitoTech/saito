module.exports = (f, img="", title="", text="") => {
	if (img != "") {
	return`
    <div class="welcome welcome-${f}" style="background-image: url(${img})">
      <div class="welcome-title">${title}</div>
      <div class="welcome-text">${text}</div>
    </div>
  `;
	} else {
	return`
    <div class="welcome welcome-${f}">
      <div class="welcome-title">${title}</div>
      <div class="welcome-text">${text}</div>
    </div>
  `;
	}
};
