module.exports = (f, img="") => {
	if (img != "") {
	return`
    <div class="welcome welcome-${f}" style="background-image: url(${img})">
      <div class="welcome-title"></div>
      <div class="welcome-text"></div>
    </div>
  `;
	} else {
	return`
    <div class="welcome welcome-${f}">
      <div class="welcome-title"></div>
      <div class="welcome-text"></div>
    </div>
  `;
	}
	return html;
};
