module.exports = (app, mod, league) => {
  let html = `
      <div class="league-component-existing-league-box" id="lg${league.id}">
        <div class="league-component-existing-league-details">
          <h2>${league.name}</h2>
          <div>Type: ${league.status}</div>
          <div>Algo: ${league.ranking_algorithm}</div>
          <div>Players: ${league.players.length}</div>
          <div>Admin: ${league.admin ? app.browser.returnAddressHTML(league.admin) : 'SAITO'}</div>
        </div>
        <div class="league-component-existing-league-controls">`;

  if (league.rank < 0 && league.admin) {
    html += `<button class="league-button league-join-button saito-button-primary">Join</button>`;
  }

  html += `<button class="league-button league-view-button saito-button-primary">View</button>`;

  if (!league.admin) {
    html += `<button class="league-button league-edit-button saito-button-primary">Edit</button>`;
    html += `<button class="league-button league-sudo-button saito-button-primary">Admin</button>`;
  }

  if (mod.publicKey == league.admin) {
    html += `<button class="league-button league-edit-button saito-button-primary">Edit</button>`;
    html += `<button class="league-button league-invite-button saito-button-primary">Invite</button>`;
    html += `<button class="league-button league-delete-button saito-button-primary">Delete</button>`;
  }

  html += `</div></div>`;

  return html;
};
