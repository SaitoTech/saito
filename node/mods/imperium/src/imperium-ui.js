



/////////////////
/// HUD MENUS ///
/////////////////
ensureHudChrome() {
  this.hud.render();
  return null;
}

hudMenuOptionFromEvent(x) {
  if (!x) {
    return null;
  }
  if (x.id) {
    return { id: String(x.id), label: x.label };
  }
  if (x.html) {
    let m = String(x.html).match(/id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/i);
    if (m) {
      return { id: m[1], label: m[2].replace(/<[^>]+>/g, '').trim() };
    }
  }
  if (x.event) {
    return { id: x.event, label: x.event };
  }
  return null;
}

hideOverlays() {
  document.querySelectorAll('.overlay').forEach(el => {
    el.classList.add('hidden');
  });
}

handleMovementMenuItem() {
  this.movement_overlay.render();
}
handleCombatMenuItem() {
  this.combat_overlay.render();
}
handleFactionMenuItem() {
  this.factions_overlay.render();
}
handleHowToPlayMenuItem() {
  this.rules_overlay.render();
}
handleTechMenuItem() {
  this.tech_tree_overlay.render();
}

handleAgendasMenuItem() {

  let cards = [];
  let laws = this.returnAgendaCards();
      
  for (let i = 0; i < this.game.state.agendas.length; i++) {
    cards.push(laws[this.game.state.agendas[i]]);
  }   
      
  if (cards.length == 0) {
    alert("No Upcoming Agendas");
    return;
  }

  this.agenda_overlay.render(cards);
      
}
      
handleLawsMenuItem() {

  let laws = this.returnAgendaCards();
  let cards = [];

  for (let i = 0; i < this.game.state.laws.length; i++) {
    cards.push(laws[this.game.state.laws[i].agenda]);
  }   
   
  if (cards.length == 0) {
    alert("No Laws in Force");
    return;
  }

  this.agenda_overlay.render(cards);
      
}     
        
handleUnitsMenuItem() {
  this.overlay.show(this.returnUnitsOverlay());
  let imperium_self = this;
  $('#close-units-btn').on('click', function() {
    imperium_self.overlay.hide();
  });
}

handleInfoMenuItem() {
  const board = this.getBoardElement();
  if (!board) {
    return;
  }
  if (board.classList.contains('bi')) {
    for (let i in this.game.sectors) {
      this.removeSectorHighlight(i);
      board.classList.remove('bi');
    }
  } else {
    for (let i in this.game.sectors) {
      this.addSectorHighlight(i);
      board.classList.add('bi');
    }
  }
}
handleSystemsMenuItem() {

  let imperium_self = this;
  let factions = this.returnFactions();

  this.activated_systems_player++;

  if (this.activated_systems_player > this.game.state.players_info.length) { this.activated_systems_player = 1; }

  salert(`Showing Systems Activated by ${factions[this.game.state.players_info[this.activated_systems_player - 1].faction].name}`);

  $('.hex_activated').css('background-color', 'transparent');
  $('.hex_activated').css('opacity', '0.3');

  for (var i in this.game.board) {
    if (this.game.sectors[this.game.board[i].tile].activated[this.activated_systems_player - 1] == 1) {
      let divpid = "#hex_activated_" + i;
      $(divpid).css('background-color', 'var(--p' + this.activated_systems_player + ')');
      $(divpid).css('opacity', '0.3');
    }
  }
}




