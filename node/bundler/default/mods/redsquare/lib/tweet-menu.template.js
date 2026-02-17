module.exports = (menu, tweet, is_tweet_mine = false) => {
  let shortName = menu.app.keychain.returnUsername(menu.tweeter);
  let my_options = '';

  if (is_tweet_mine) {
    my_options = `
          <div id="delete_tweet" class="tweet-menu-list-item">
      <i class="fas fa-trash"></i>
            <div>delete tweet</div>
          </div>
          <div id="edit_tweet" class="tweet-menu-list-item">
      <i class="fas fa-edit"></i>
            <div>edit tweet</div>
          </div>
    `;
  } else {
    my_options = `
           <div id="hide_tweet" class="tweet-menu-list-item">
            <i class="fa-solid fa-eye-slash"></i>
            <div>hide this tweet</div>
          </div>
          <div id="block_contact" class="tweet-menu-list-item">
            <i class="fa-solid fa-ban"></i>
            <div>block ${shortName}</div>
          </div>
          <div id="report_tweet" class="tweet-menu-list-item">
            <i class="fa fa-flag"></i>
            <div>report tweet</div>
          </div>
    `;
  }

  return `
      <div class="tweet-menu saito-menu-select-subtle" style="top=${50}px; left=${50}px;">
          ${my_options}
          <div id="show_tweet_info" class="tweet-menu-list-item">
            <i class="fa fa-circle-info"></i>
            <div>show info</div>
          </div>
      </div>
  `;
};
