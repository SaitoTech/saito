module.exports = () => {
	return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="all">All Listings</li>
      <li class="item" role="button" tabindex="0" data-view="themes">Themes</li>
      <li class="item" role="button" tabindex="0" data-view="tokens">Tokens &amp; NFTs</li>
      <li class="item" role="button" tabindex="0" data-view="apps">Apps &amp; Games</li>
      <li class="item" role="button" tabindex="0" data-view="merchandise">Merchandise</li>
      <li class="divider" role="separator"></li>
      <li class="item" role="button" tabindex="0" data-view="my-listings">My Listings</li>
    </ul>
  `;
};
