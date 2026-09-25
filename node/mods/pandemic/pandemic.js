const GameTemplate = require('../../lib/templates/gametemplate');
const PandemicOriginalSkin = require('./lib/pandemicOriginal.skin.js');
const PandemicRetroSkin = require('./lib/pandemicRetro.skin.js');
const PandemicNewSkin = require('./lib/pandemicNew.skin.js');
const PandemicGameRulesTemplate = require('./lib/pandemic-game-rules.template');
const PandemicGameOptionsTemplate = require('./lib/pandemic-game-options.template');
const htmlTemplate = require('./lib/game-html.template');

class Pandemic extends GameTemplate {
  //////////////////
  // CONSTRUCTOR  //
  //////////////////a
  constructor(app) {
    super(app);

    this.name = 'Epidemic';
    this.gamename = 'Epidemic';
    this.slug = 'epidemic';
    this.description = `Cooperative multiplayer board game in which players race to find vaccines to fend off a global <em>pandemic</em>.`;
    this.categories = 'Games Boardgame Strategy Cooperative';
    this.maxPlayers = 4;
    this.minPlayers = 2;
    this.status = 'prod';
    this.class = 'app';

    this.boardWidth = 2602;
    this.card_height_ratio = 1.41;

    this.outbreaks = [];
    this.maxHandSize = 7;
    this.can_bet = 0;

    this.interface = 1; // default to graphics (as opposed to text interface)

    this.defaultDeck = 1;
    this.quarantine = '';
    this.initialized = 0;

    this.skin = null;
    this.app = app;
    return this;
  }

  // Create an exp league by default
  respondTo(type) {
    if (type == 'default-league') {
      let obj = super.respondTo(type);
      obj.ranking_algorithm = 'EXP';
      obj.default_score = 0;
      return obj;
    }
    return super.respondTo(type);
  }

  returnPlayerCardHTML(player_num) {
    let html = '';
    let playerHand = this.game.players_info[player_num - 1].cards;

    for (let i = 0; i < playerHand.length; i++) {
      let card = this.returnCardImage(playerHand[i], 1).replace('img', `img id="${playerHand[i]}"`);
      html += card; //this.returnCardImage(playerHand[i], 1);
      //html += `<div class="card" id="${playerHand[i]}">${}</div>`;
    }
    return html.replace(/cardimg/g, 'card');
  }

  ////////////////
  // initialize //
  ////////////////
  initializeGame(game_id) {
    if (!this.skin) {
      switch (this.game.options.theme) {
        case 'classic':
          this.skin = new PandemicOriginalSkin(this.app, this);
          break;
        case 'retro':
          this.skin = new PandemicRetroSkin(this.app, this);
          break;
        case 'modern':
          this.skin = new PandemicNewSkin(this.app, this);
          break;
        default:
          this.skin = new PandemicRetroSkin(this.app, this);
      }
    }

    if (!this.game.state) {
      this.game.state = this.returnState();
      this.game.players_info = this.initializePlayers(this.game.players.length);

      //
      // start game once here
      //
      this.game.queue = [];
      this.game.queue.push('start');
      this.game.queue.push('READY');

      //Insert Epidemics into player deck
      this.game.queue.push('initialize_player_deck');

      // Deal Player Cards
      // 2 P => 4 cards each, 3 P => 3 cards each, 4 P => 2 cards each
      let cards_to_deal = 6 - this.game.players.length;

      for (let i = 1; i <= this.game.players.length; i++) {
        this.game.queue.push(`draw_player_card\t${i}\t${cards_to_deal}`);
      }

      this.game.queue.push('place_initial_infection');

      this.game.queue.push('SHUFFLE\t2');
      this.game.queue.push('DECK\t2\t' + JSON.stringify(this.skin.returnPlayerCards()));
      this.game.queue.push('SHUFFLE\t1');
      this.game.queue.push('DECK\t1\t' + JSON.stringify(this.skin.returnInfectionCards()));
    }

    this.refreshPlayers();

    //
    // if the browser is active, shift to the game that way
    //
    if (this.browser_active == 1) {
      this.definePlayersPawns();

      //If one of the player's is a quarantine specialist, save that info!
      for (let player of this.game.players_info) {
        if (player.type == 5) {
          this.quarantine = player.city;
        }
      }

      // Position city divs on the game board
      this.skin.displayCities();
    }
    this.grace_window = this.game.players.length * 4;
  }

  async render(app) {
    if (!this.browser_active || this.initialize_game_run) {
      return;
    }

    await this.injectGameHTML(htmlTemplate());

    await super.render(app);

    if (!this.skin) {
      switch (this.game.options.theme) {
        case 'classic':
          this.skin = new PandemicOriginalSkin(this.app, this);
          break;
        case 'retro':
          this.skin = new PandemicRetroSkin(this.app, this);
          break;
        case 'modern':
          this.skin = new PandemicNewSkin(this.app, this);
          break;
        default:
          this.skin = new PandemicRetroSkin(this.app, this);
      }
    }

    this.skin.render();

    this.boardWidth = this.skin.boardWidth;
    this.card_height_ratio = this.skin.card_height_ratio;

    if (!this.browser_active) {
      return;
    }
    if (this.initialized) {
      return;
    } else {
      this.initialized = 1;
    }

    //Dynamically add game-css because of all the fcking name changes
    if (!document.getElementById('game-css-link')) {
      var s = document.createElement('link');
      s.id = 'game-css-link';
      s.rel = 'stylesheet';
      s.type = 'text/css';
      s.href = `/${this.returnSlug()}/style.css`;
      document.querySelector('head').append(s);
    }

    //Since skin will resize gameboard and update boardWidth, need to recalculate so scaling works
    this.calculateBoardRatio();

    let pandemic_self = this;

    this.menu.addMenuOption('game-game', 'Game');
    this.menu.addMenuOption('game-info', 'Info');

    this.menu.addSubMenuOption('game-info', {
      text: 'Welcome',
      id: 'game-welcome',
      class: 'game-welcome',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.overlay.show(game_mod.returnWelcomeOverlay());
        document.querySelector('.close_welcome_overlay').onclick = (e) => {
          game_mod.overlay.hide();
        };
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Theme',
      id: 'game-theme',
      class: 'game-theme',
      callback: null
    });
    this.menu.addSubMenuOption('game-theme', {
      text: `Classic ${this.game.options.theme == 'classic' ? '✔' : ''}`,
      id: 'game-confirm-easy',
      class: 'game-confirm-easy',
      callback: function (app, game_mod) {
        game_mod.game.options.theme = 'classic';
        game_mod.saveGame(game_mod.game.id);
        reloadWindow(500);
      }
    });

    this.menu.addSubMenuOption('game-theme', {
      text: `Retro ${this.game.options.theme == 'retro' ? '✔' : ''}`,
      id: 'game-confirm-medium',
      class: 'game-confirm-medium',
      callback: function (app, game_mod) {
        game_mod.game.options.theme = 'retro';
        game_mod.saveGame(game_mod.game.id);
        reloadWindow(500);
      }
    });

    /*this.menu.addSubMenuOption("game-theme",{
      text: `Modern ${(this.game.options.theme=="modern")?"✔":""}`,
      id:"game-confirm-hard",
      class:"game-confirm-hard",
      callback: function(app,game_mod){
        game_mod.game.options.theme = "modern";
        game_mod.saveGame(game_mod.game.id);
       	reloadWindow(500); 
      
    });*/

    this.menu.addSubMenuOption('game-info', {
      text: 'Log',
      id: 'game-log',
      class: 'game-log',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.log.toggleLog();
      }
    });
    this.menu.addSubMenuOption('game-info', {
      text: 'Cards',
      id: 'game-cards',
      class: 'game-cards',
      callback: function (app, game_mod) {
        game_mod.menu.showSubMenu('game-cards');
      }
    });
    for (let i = 0; i < this.game.players.length; i++) {
      let menuName = i + 1 == this.game.player ? 'My cards' : 'Player ' + (i + 1);
      this.menu.addSubMenuOption('game-cards', {
        text: menuName,
        id: 'game-player-cards-' + (i + 1),
        class: 'game-player-cards-' + (i + 1),
        callback: function (app, game_mod) {
          game_mod.menu.hideSubMenus();
          let html = game_mod.returnPlayerCardHTML(i + 1);
          game_mod.overlay.show(`<div class=" bighand">${html}</div>`);
                    game_mod.cardbox.attachCardEvents(); //Don't do anything on click
        }
      });
    }

    this.menu.addChatMenu();
    this.menu.render();

    this.log.render();

    this.cardbox.render();

    this.cardbox.addCardType('showcard', '', null);
    this.cardbox.addCardType('card', 'select', null);
    this.cardbox.addCardType('handy-help', '', function () {});

    this.hud.render();
    this.ensureHudChrome();

    if (this.game.players_info && this.game.player > 0) {
      let tools = document.getElementById('pandemic-hud-tools');
      let role = this.game.players_info[this.game.player - 1].name;
      role = role.split(' ')[0].toLowerCase();
      if (tools) {
        tools.classList.add(role);
        if (!tools.querySelector('.handy-help')) {
          tools.innerHTML = `<i id="action_help" class="hud-controls handy-help fa fa-fw fa-question-circle" aria-hidden="true"></i><i id="player_role" class="hud-controls handy-help fa fa-fw fa-id-card" aria-hidden="true"></i><i id="my_hand" class="hud-controls fas fa-fw fa-hand-paper" aria-hidden="true"></i>`;
        }
      }
      document.getElementById('my_hand').onclick = function () {
        if (
          document.getElementById('cardfan') &&
          document.getElementById('cardfan').style.display == 'block'
        ) {
          pandemic_self.cardfan.hide();
        } else {
          pandemic_self.cardfan.render(
            pandemic_self.returnPlayerCardHTML(pandemic_self.game.player)
          );
          pandemic_self.cardfan.addClass('bighand');
                    pandemic_self.cardbox.bindCallback(pandemic_self.playFromCardFan);
          pandemic_self.cardbox.attachCardEvents();
        }
      };
    }

        this.cardbox.attachCardEvents(); //Add hover action to restored Log tags and set this.cardbox_callback to dummy function

    try {
      if (app.browser.isMobileBrowser(navigator.userAgent)) {
        this.cardbox.skip_card_prompt = 0;
        this.hammer.render();
      } else {
        this.cardbox.skip_card_prompt = 1; //no Confirming
        this.sizer.render();
        this.sizer.attachEvents('.gameboard');
      }
    } catch (err) {
      console.log('ERROR with Sizing: ' + err);
    }
  }

  ensureHudChrome() {
    this.hud.render();
    let hud = document.getElementById('game-hud2');
    if (!hud) {
      return null;
    }
    let chrome = document.getElementById('pandemic-hud-chrome');
    if (!chrome) {
      chrome = document.createElement('div');
      chrome.id = 'pandemic-hud-chrome';
      chrome.className = 'pandemic-hud-chrome';
      chrome.innerHTML =
        '<div id="pandemic-hud-tools" class="pandemic-hud-tools"></div><div id="pandemic-hud-actions" class="pandemic-hud-actions"></div>';
      hud.appendChild(chrome);
    }
    return chrome;
  }

  setHudActions(html) {
    this.ensureHudChrome();
    this.hud.updateMenu([]);
    let el = document.getElementById('pandemic-hud-actions');
    if (el) {
      el.innerHTML = html || '';
    }
  }

  clearHudActions() {
    let el = document.getElementById('pandemic-hud-actions');
    if (el) {
      el.innerHTML = '';
    }
  }

  playerDiscardCards() {
    let pandemic_self = this;

    if (
      pandemic_self.game.players_info[pandemic_self.game.player - 1].cards.length >
      pandemic_self.maxHandSize
    ) {
            this.game.status = 'Pick a card to discard: ';
      this.hud.updateStatus(this.game.status);
      this.hud.updateMenu([]);
      this.hud.updateCards(this.game.players_info[this.game.player - 1].cards);
      this.clearHudActions();
      this.cardfan.hide();
      this.cardbox.attachCardEvents();
      $('.card').off();
      $('.card').on('click', async function () {
        $('.card').off();
        let cid = $(this).attr('id');
        if (cid.indexOf('event') > -1) {
          let c = await sconfirm('Do you want to play this event card instead of discarding it?');
          if (c) {
            pandemic_self.playEvent(cid);
          } else {
            pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${cid}`);
            pandemic_self.endTurn();
          }
        } else {
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${cid}`);
          pandemic_self.endTurn();
        }
      });
    }
  }

  playFromCardFan(c) {
    if (c.includes('event')) {
      if (this.game.player === this.game.state.current_player) {
        this.playEvent(c);
      } else {
        this.addMove(`interrupt\t${this.game.player}\t${this.game.state.current_player}\t${c}`);
        this.endTurn();
      }
    }
  }

  removeEvents() {
    console.log('Disabling dom events');
    try {
      $('.card').off();
      $('.city').off();
      $('.research_station').css('z-index', '');
      $('.research_station').off();
    } catch (err) {
      console.log('ERROR: removing events', err);
    }
  }

  confirmMove(prompt, e, callback) {
    let html = `
        <div class="popup-confirm-menu">
          <div class="popup-prompt">${prompt}?</div>
          <div class="action" id="confirm">yes</div>
          <div class="action" id="cancel">cancel</div>
        </div>`;

    let left = e.clientX + 50;
    let top = e.clientY + 20;
    if (left + 150 > window.innerWidth) {
      left -= 200;
    }
    $('.popup-confirm-menu').remove();
    $('body').append(html);
    $('.popup-confirm-menu').css({
      position: 'absolute',
      top: top,
      left: left
    });

    $('.action').off();
    $('.action').on('click', function () {
      let confirmation = $(this).attr('id');
      $('.action').off();
      $('.popup-confirm-menu').remove();
      if (confirmation === 'confirm') {
        callback();
      }
    });
  }

  selectOptions(options, e, callbacks) {
    let html = `
            <div class="popup-confirm-menu">
              <div class="popup-prompt">How do you want to travel?</div>`;
    for (let i = 0; i < options.length; i++) {
      html += `<div class="action" id="${i}">${options[i]}</div>`;
    }
    html += `<div class="action" id="cancel">cancel</div>
            </div>`;

    let left = e.clientX + 50;
    let top = e.clientY + 20;
    if (left + 150 > window.innerWidth) {
      left -= 200;
    }
    $('.popup-confirm-menu').remove();
    $('body').append(html);
    $('.popup-confirm-menu').css({
      position: 'absolute',
      top: top,
      left: left
    });

    $('.action').off();
    $('.action').on('click', function () {
      let confirmation = $(this).attr('id');
      $('.action').off();
      $('.popup-confirm-menu').remove();
      if (confirmation !== 'cancel') {
        let op = parseInt(confirmation);
        let callback = callbacks[op];
        callback();
      }
    });
  }

  playerMakeMove() {
    if (this.browser_active == 0) {
      return;
    }

    let pandemic_self = this;
    let player = this.game.players_info[this.game.player - 1];
    let city = player.city;

    //Reset board effects
    this.removeEvents();

    if (player.type === 3) {
      //Medic
      let autoCure = false;
      //Medics automatically remove cured diseases
      //We want the medic with the cure to clear the city they land in even if they are out of moves
      for (let v in this.game.state.cities[city].virus) {
        if (this.game.state.cities[city].virus[v] > 0 && this.game.state.cures[v]) {
          let cubes_to_cure = Math.min(3, this.game.state.cities[city].virus[v]);
          this.addMove(`treatvirus\t${this.game.player}\t${city}\t${cubes_to_cure}\t${v}\t0`);
          autoCure = true;
        }
      }
      if (autoCure) {
        this.endTurn();
        return;
      }
    }

    if (!this.game.state.active_moves) {
      this.prependMove(`endturn\t${this.game.player}`);
      this.endTurn();
      return;
    }

    //Allow shortcut to just click on cities to move
    let xpos, ypos;
    $('.city').on('mousedown', function (e) {
      xpos = e.clientX;
      ypos = e.clientY;
    });
    //Create as menu on the game board to input word from a tile in horizontal or vertical direction
    $('.city').on('mouseup', function (e) {
      if (Math.abs(xpos - e.clientX) > 4 || Math.abs(ypos - e.clientY) > 4) {
        return;
      }
      let selection = $(this).attr('id');
      let hops = pandemic_self.returnHopsToCityFromCity(selection, city);
      console.log('Click on city: ' + selection + ', hops: ' + hops);
      let moveOptions = [],
        commands = [];
      console.log(pandemic_self.game.state.research_stations);

      if (hops <= pandemic_self.game.state.active_moves) {
        moveOptions.push(
          `Move to ${
            pandemic_self.skin.cities[selection].name
          } (${hops} move${hops > 1 ? 's' : ''})`
        );
        commands.push(() => {
          pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${selection}\t${hops}`);
          pandemic_self.endTurn();
        });
      }
      if (player.cards.includes(selection)) {
        moveOptions.push(
          `Discard ${pandemic_self.skin.cities[selection].name} card to fly there directly`
        );
        commands.push(() => {
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${selection}`);
          pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${selection}\t1`);
          pandemic_self.endTurn();
        });
      }
      if (player.cards.includes(city)) {
        moveOptions.push(
          `Discard ${pandemic_self.skin.cities[city].name} card to charter a flight to ${pandemic_self.skin.cities[selection].name}`
        );
        commands.push(() => {
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${city}`);
          pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${selection}\t1`);
          pandemic_self.endTurn();
        });
      }
      if (
        pandemic_self.game.state.research_stations.includes(city) &&
        pandemic_self.game.state.research_stations.includes(selection)
      ) {
        moveOptions.push(`Take a shuttle flight to ${pandemic_self.skin.cities[selection].name}`);
        commands.push(() => {
          pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${selection}\t1`);
          pandemic_self.endTurn();
        });
      }

      if (moveOptions.length > 1) {
        pandemic_self.selectOptions(moveOptions, e, commands);
      } else if (moveOptions.length == 1) {
        pandemic_self.confirmMove(moveOptions[0], e, commands[0]);
      }
    });

    //Turn off click events on my location
    //Will add Click on my city to remove cubes (below)
    $(`#${city}.city`).off();

    /* Determine which actions the player is allowed to do and update HUD controls */
    let move_opacity = 1; //Always possible because if 0 moves left, the turn has already ended
    let treat_opacity = 0.4;
    let build_opacity = 0.4;
    let discover_cure_opacity = 0.4;
    let cards_opacity = 0.4;

    let statMsg = `YOUR TURN: ${player.name} in ${this.skin.cities[city].name} [${this.game.state.active_moves}]:`;
    let can_play_event_card = 0;
    let can_share_knowledge = 0;

    if (this.isCityInfected(city) == 1) {
      treat_opacity = 1;
      $(`#${city}.city`).on('click', function () {
        $(`#${city}.city`).off();
        pandemic_self.cureDisease(1);
      });
    }
    if (this.canPlayerBuildResearchStation(city) == 1) {
      build_opacity = 1;
    }
    if (this.canPlayerDiscoverCure() == 1) {
      discover_cure_opacity = 1;
    }

    if (this.canPlayerShareKnowledge() == 1) {
      can_share_knowledge = 1;
      cards_opacity = 1;
    }

    let can_charter_flight = player.cards.includes(city);

    if (
      player.type === 4 &&
      this.game.state.research_stations.includes(city) &&
      player.cards.length > 0
    ) {
      can_charter_flight = true;
    }

    if (
      player.cards.includes('event1') ||
      player.cards.includes('event2') ||
      player.cards.includes('event3') ||
      player.cards.includes('event4') ||
      player.cards.includes('event5')
    ) {
      cards_opacity = 1;
      can_play_event_card = 1;
    }

    let html = `
       <div class="status-icon-menu">
       <div class="menu_icon tip" id="move"><img class="menu_icon_icon" src="/${this.name.toLowerCase()}/img/icons/MOVE.png" /><div class="menu-text">Move</div><div class="tiptext">Move to new city</div></div>
       <div class="menu_icon tip" id="treat" style="opacity:${treat_opacity}" ><img class="menu_icon_icon" src="/${this.name.toLowerCase()}/img/icons/TREAT.png" /><div class="menu-text">Treat</div><div class="tiptext">Treat disease in this city (remove cubes)</div></div>
       <div class="menu_icon tip" id="build" style="opacity:${build_opacity}" ><img class="menu_icon_icon" src="/${this.name.toLowerCase()}/img/icons/BUILD.png" /><div class="menu-text">Build</div><div class="tiptext">Build an operations center in this city</div></div>
       <div class="menu_icon tip" id="discover_cure" style="opacity:${discover_cure_opacity}" ><img class="menu_icon_icon" src="/${this.name.toLowerCase()}/img/icons/CURE.png" /><div class="menu-text">Discover</div><div class="tiptext">Discover cure to a disease</div></div>
       <div class="menu_icon tip" id="cards" style="opacity:${cards_opacity}"><img class="menu_icon_icon" src="/${this.name.toLowerCase()}/img/icons/CARDS.png" /><div class="menu-text">Cards</div><div class="tiptext">Play event card or share knowledge (give another player a card)</div></div>
       </div>`;

    $('.menu_icon').off();
        this.game.status = `<div class="status-message">${statMsg}</div>`;
    this.hud.updateStatus(this.game.status);
    this.hud.updateMenu([]);
    this.hud.updateCards([]);
    this.setHudActions(html);
    $('.menu_icon').on('click', function () {
      let action = $(this).attr('id');
      let flight1 = player.cards.length > 0 ? 1 : 0.4;
      let flight2 = can_charter_flight ? 1 : 0.4;
      let flight3 =
        pandemic_self.game.state.research_stations.length > 1 &&
        pandemic_self.game.state.research_stations.includes(city)
          ? 1
          : 0.4;
      switch (action) {
        case 'move':
          html = `
            <div class="status-icon-menu">
            <div class="menu_icon tip" id="goback" ><i class="menu_icon_icon fas fa-arrow-alt-circle-left fa-fw fa-border "></i><div class="menu-text">Go back</div><div class="tiptext">return to previous menu</div></div>
            <div class="menu_icon tip" id="move" ><i class="menu_icon_icon fas fa-car-side fa-fw fa-border "></i><div class="menu-text">Drive/Ferry</div><div class="tiptext">ground transportation to an adjacent city</div></div>
            <div class="menu_icon tip" id="direct" style="opacity:${flight1}" ><i class="menu_icon_icon fas fa-plane-arrival fa-fw fa-border "></i><div class="menu-text">Direct flight</div><div class="tiptext">play a card from your hand to go to that city</div></div>
            <div class="menu_icon tip" id="charter" style="opacity:${flight2}" ><i class="menu_icon_icon fas fa-plane-departure fa-fw fa-border"></i><div class="menu-text">Charter flight</div><div class="tiptext">play the ${city} card to go anywhere in the world</div></div>
            <div class="menu_icon tip" id="shuttle" style="opacity:${flight3}" ><i class="menu_icon_icon fas fa-plane fa-fw fa-border"></i><div class="menu-text">Shuttle flight</div><div class="tiptext">move between research stations</div></div>
            </div>`;

          $('.menu_icon').off();
                    pandemic_self.game.status = `<div class="status-message">${statMsg}</div>`;
          pandemic_self.hud.updateStatus(pandemic_self.game.status);
          pandemic_self.hud.updateMenu([]);
          pandemic_self.hud.updateCards([]);
          pandemic_self.setHudActions(html);
          $('.menu_icon').on('click', function () {
            let action = $(this).attr('id');
            if (action == 'goback') {
              pandemic_self.playerMakeMove();
            }
            if (action === 'move') {
              pandemic_self.movePlayer();
            }
            if (action === 'direct' && player.cards.length > 0) {
              pandemic_self.directFlight();
            }
            if (action === 'charter' && can_charter_flight) {
              pandemic_self.charterFlight(city);
            }
            if (action === 'shuttle' && flight3 === 1) {
              pandemic_self.shuttleFlight();
            }
          });
          break;
        case 'treat':
          if (treat_opacity != 1) {
            salert('You may not treat disease');
            return;
          }
          pandemic_self.cureDisease();
          break;
        case 'discover_cure':
          if (discover_cure_opacity != 1) {
            salert('You may not discover a cure now');
            return;
          }
          pandemic_self.discoverCure();
          break;
        case 'build':
          if (build_opacity != 1) {
            salert('You cannot build a research station here');
            return;
          }
          pandemic_self.buildResearchStation();

          break;

        case 'cards':
          if (cards_opacity != 1) {
            salert('You do not have event cards and cannot share cards with anyone now');
            return;
          }
          if (can_play_event_card && !can_share_knowledge) {
            pandemic_self.playEventCard();
            return 0;
          }
          if (!can_play_event_card && can_share_knowledge) {
            pandemic_self.shareKnowledge();
            return 0;
          }
          let menu = [];
          if (can_play_event_card == 1) {
            menu.push({ id: 'eventcard', label: 'play event card' });
          }
          if (can_share_knowledge == 1) {
            menu.push({ id: 'shareknowledge', label: 'share knowledge' });
          }

                    pandemic_self.game.status = statMsg;
          pandemic_self.hud.updateStatus(pandemic_self.game.status);
          pandemic_self.hud.updateCards([]);
          pandemic_self.clearHudActions();
          pandemic_self.hud.updateMenu(menu, function (action) {
            if (action === 'eventcard') {
              pandemic_self.playEventCard();
              return 0;
            }
            if (action === 'shareknowledge') {
              pandemic_self.shareKnowledge();
              return 0;
            }
          });
          break;

        default:
          // "pass"?
          pandemic_self.playerMakeMove();
      }
    });
  }

  findCardOwner(city) {
    //Who has the card matching the city
    for (let i = 0; i < this.game.players_info.length; i++) {
      let player = this.game.players_info[i];
      for (let j = 0; j < player.cards.length; j++) {
        if (player.cards[j] === city) {
          return i + 1; //Player Number of actual owner
        }
      }
    }
    return 0;
  }

  findResearcher(city) {
    //Who has the card matching the city
    for (let i = 0; i < this.game.players_info.length; i++) {
      if (this.game.players_info[i].city === city && this.game.players_info[i].type === 6) {
        return i + 1;
      }
    }
    return 0;
  }

  shareKnowledge() {
    let pandemic_self = this;
    let player = this.game.player;
    let city = this.game.players_info[player - 1].city; //Where am I

    //Assume I have the card
    let cardOwner = this.findCardOwner(city);
    let researcher = this.findResearcher(city);
    if (cardOwner == 0 && researcher == 0) {
      console.error('We cannot share knowledge!');
      return;
    }

    let offerCard = function (card) {
      //Pick who to offer the card to, even if only one person
      let numChoices = 0;
      let choice = -1;
      let menu = [];
      for (let i = 0; i < pandemic_self.game.players_info.length; i++) {
        if (pandemic_self.game.players_info[i].city == city && i != pandemic_self.game.player - 1) {
          menu.push({
            id: `${i + 1}`,
            label: `Player ${i + 1} (${pandemic_self.game.players_info[i].name})`
          });
          numChoices++;
          choice = i + 1;
        }
      }

      if (numChoices > 1) {
                pandemic_self.game.status = `Give card to whom?`;
        pandemic_self.hud.updateStatus(pandemic_self.game.status);
        pandemic_self.hud.updateCards([]);
        pandemic_self.clearHudActions();
        pandemic_self.hud.updateMenu(menu, function (id) {
          pandemic_self.addMove(`givecard\t${pandemic_self.game.player}\t${id}\t${card}`);
          pandemic_self.endTurn();
        });
      } else {
        pandemic_self.addMove(`givecard\t${pandemic_self.game.player}\t${choice}\t${card}`);
        pandemic_self.endTurn();
      }
    };

    //No research and I have city card
    //no researcher and friend has city card
    if (researcher == 0) {
      //Give Me the Card
      if (cardOwner != player) {
        //CardOwner needs to approve this...!!!!
        pandemic_self.addMove(`takecard\t${player}\t${cardOwner}\t${city}`); //Remove from their hand
        pandemic_self.endTurn();
      } else {
        //I give the card
        offerCard(city);
      }
    } else {
      let researcherCards = pandemic_self.game.players_info[researcher - 1].cards.filter(
        (c) => !c.includes('event')
      );
      if (player === researcher) {
        //I am a researcher and someone else has city card
        if (cardOwner > 0 && cardOwner != player) {
          //Step 1, give or take
          let menu = [
            { id: 'take', label: `Take ${city} card` },
            { id: 'give', label: 'Pick a card to give' }
          ];
                    pandemic_self.game.status = `How do you want to share knowledge?`;
          pandemic_self.hud.updateStatus(pandemic_self.game.status);
          pandemic_self.hud.updateCards([]);
          pandemic_self.clearHudActions();
          pandemic_self.hud.updateMenu(menu, function (choice) {
            if (choice === 'take') {
              pandemic_self.addMove(
                `takecard\t${pandemic_self.game.player}\t${cardOwner}\t${city}`
              ); //Remove from their hand
              pandemic_self.endTurn();
            } else {
              //Pick a card to share
                            pandemic_self.game.status = 'Share knowledge of which city:';
              pandemic_self.hud.updateStatus(pandemic_self.game.status);
              pandemic_self.hud.updateMenu([]);
              pandemic_self.hud.updateCards(researcherCards);
              pandemic_self.cardbox.attachCardEvents();
                            pandemic_self.cardbox.bindCallback(function (c) {
                offerCard(c);
              });
              pandemic_self.cardbox.attachCardEvents();
            }
          });
        } else {
          //I am a researcher and I have city card
          //I am a researcher and no one has city card
          //Pick a card to share
                    pandemic_self.game.status = 'Share knowledge of which city:';
          pandemic_self.hud.updateStatus(pandemic_self.game.status);
          pandemic_self.hud.updateMenu([]);
          pandemic_self.hud.updateCards(researcherCards);
          pandemic_self.cardbox.attachCardEvents();
                    pandemic_self.cardbox.bindCallback(function (c) {
            offerCard(c);
          });
          pandemic_self.cardbox.attachCardEvents();
        }
      } else {
        //Friend is researcher and I have city card
        if (cardOwner == player) {
          //Step 1, give or take
          let menu = [
            { id: 'give', label: `Give ${city} card` },
            { id: 'take', label: 'Ask Researcher for a card' }
          ];
                    pandemic_self.game.status = `How do you want to share knowledge?`;
          pandemic_self.hud.updateStatus(pandemic_self.game.status);
          pandemic_self.hud.updateCards([]);
          pandemic_self.clearHudActions();
          pandemic_self.hud.updateMenu(menu, function (choice) {
            if (choice === 'take') {
              pandemic_self.addMove(
                `begcard\t${pandemic_self.game.player}\t${researcher}\t${city}`
              ); //Remove from their hand
              pandemic_self.endTurn();
            } else {
              offerCard(city);
            }
          });
        } else {
          //Friend is researcher and no city card
          //Friend is research and has city card
          pandemic_self.addMove(`begcard\t${pandemic_self.game.player}\t${researcher}\t${city}`); //Remove from their hand
          pandemic_self.endTurn();
        }
      }
    }
  }

  /*
  Two players must be in the same city and one of them has to have the card
  */
  canPlayerShareKnowledge() {
    let player = this.game.players_info[this.game.player - 1];
    let city = player.city;
    let has_city_card = false;
    let is_there_a_researcher = false;
    players_in_city = 0;
    for (let i = 0; i < this.game.players_info.length; i++) {
      if (this.game.players_info[i].city == city) {
        for (let k = 0; k < this.game.players_info[i].cards.length; k++) {
          if (this.game.players_info[i].cards[k] == city) {
            has_city_card = true;
          }
          if (this.game.players_info[i].type === 6) {
            is_there_a_researcher = true;
          }
        }
        players_in_city++;
      }
    }

    if (players_in_city >= 2 && (has_city_card || is_there_a_researcher)) {
      return true;
    }

    return false;
  }

  sortHand(cards) {
    let order = ['blue', 'yellow', 'black', 'red'];
    let newHand = [];

    for (let c of order) {
      for (let i = cards.length - 1; i >= 0; i--) {
        if (this.skin.cities[cards[i]]?.virus === c) {
          newHand.push(cards[i]);
        }
      }
    }
    for (let i = cards.length - 1; i >= 0; i--) {
      if (!this.skin.cities[cards[i]]?.virus) {
        newHand.push(cards[i]);
      }
    }

    return newHand;
  }

  canPlayerDiscoverCure() {
    let cards = this.game.players_info[this.game.player - 1].cards;
    let city = this.game.players_info[this.game.player - 1].city;

    if (!this.game.state.research_stations.includes(city)) {
      return 0;
    }

    let cardColors = { blue: 0, yellow: 0, red: 0, black: 0 };

    let research_limit = 5;
    if (this.game.players_info[this.game.player - 1].type == 2) {
      //Scientist
      research_limit = 4;
    }

    for (let i = 0; i < cards.length; i++) {
      if (this.skin.cities[cards[i]]?.virus) {
        cardColors[this.skin.cities[cards[i]].virus]++;
      }
    }
    for (let color in cardColors) {
      if (cardColors[color] >= research_limit && !this.game.state.cures[color]) {
        return 1;
      }
    }

    return 0;
  }

  /*
  We may come to this function from playerMakeMove or from discardCards,
  so continueFunction tells us where to go after we are done
  */
  playEvent(event) {
    let pandemic_self = this;
    console.log(`Playing event: ${event}`);
    //
    // AIRLIFT
    //
    if (event == 'event1') {
      let player_menu = [];
      for (let i = 0; i < pandemic_self.game.players_info.length; i++) {
        player_menu.push({
          id: `player${i + 1}`,
          label: `Player ${i + 1} (${pandemic_self.game.players_info[i].name})`
        });
      }

            pandemic_self.game.status = `Pick a pawn to move to another city:`;
      pandemic_self.hud.updateStatus(pandemic_self.game.status);
      pandemic_self.hud.updateCards([]);
      pandemic_self.clearHudActions();

      let pickAirliftPlayer = function (player_id) {
        $('.player').off();
        $('.player').css('pointerEvents', 'none');
        let player_to_move = String(player_id).replace('player', '');
        console.log(`Player to move: ${player_to_move}`);
        let cities_array = [];
        for (let key in pandemic_self.skin.cities) {
          cities_array.push(key);
        }
        cities_array.sort();
        let city_menu = [];
        for (let c of cities_array) {
          city_menu.push({ id: c, label: pandemic_self.skin.cities[c].name });
        }

                pandemic_self.game.status = 'Move to which city:';
        pandemic_self.hud.updateStatus(pandemic_self.game.status);
        pandemic_self.hud.updateCards([]);
        pandemic_self.hud.updateMenu(city_menu, function (city_destination) {
          console.log('City to airlift to: ' + city_destination);
          pandemic_self.addMove(`move\t${player_to_move}\t${city_destination}\t0\t3`);
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);
          pandemic_self.endTurn();
        });

        $('.city').off();
        $('.city').on('click', function () {
          let city_destination = $(this).attr('id');
          console.log('City to airlift to: ' + city_destination);
          pandemic_self.addMove(`move\t${player_to_move}\t${city_destination}\t0\t3`);
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);
          pandemic_self.endTurn();
        });
      };

      pandemic_self.hud.updateMenu(player_menu, function (id) {
        pickAirliftPlayer(id);
      });
      $('.city').off();
      $('.player').off();
      $('.player').css('pointerEvents', 'auto');
      $('.player').on('click', function (e) {
        e.stopPropagation();
        pickAirliftPlayer($(this).attr('id'));
      });
    }

    //
    // RESILIENT POPULATION
    // >>>>>
    if (event == 'event2') {
      this.skin.prepInfectionDeck(pandemic_self);
            pandemic_self.game.status = `Resilient Population: remove a card from the infection discard pile`;
      pandemic_self.hud.updateStatus(pandemic_self.game.status);
      pandemic_self.hud.updateMenu([]);
      pandemic_self.hud.updateCards(pandemic_self.game.deck[0].discards);
      pandemic_self.cardbox.attachCardEvents();
            pandemic_self.cardbox.bindCallback(function (c) {
        pandemic_self.addMove('resilientpopulation\t' + c);
        pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);

        //Restore defaults
        pandemic_self.skin.resetInfectionDeck(pandemic_self);
        pandemic_self.endTurn();
      });
      pandemic_self.cardbox.attachCardEvents();
    }

    //
    // ONE QUIET NIGHT
    //
    if (event == 'event3') {
      pandemic_self.addMove(`onequietnight\t${pandemic_self.game.player}`);
      pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);
      pandemic_self.endTurn();
    }

    //
    // FORECAST
    //
    if (event == 'event4') {
      pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);

      let forecast = [];
      let forecast2 = [];
      for (let i = 0; i < 6; i++) {
        forecast.push(pandemic_self.app.crypto.hexToString(pandemic_self.game.deck[0].crypt[i]));
      }

      pandemic_self.skin.prepInfectionDeck(pandemic_self);
            pandemic_self.game.status = `These are the next cities to get infected. You can rearrange them (first click, last to infect):`;
      pandemic_self.hud.updateStatus(pandemic_self.game.status);
      pandemic_self.hud.updateMenu([]);
      pandemic_self.hud.updateCards(forecast);
      pandemic_self.cardbox.attachCardEvents();
            pandemic_self.cardbox.bindCallback(function (x) {
        forecast2.push(x);

        if (forecast2.length == 6) {
          let y = 'forecast\t6';
          for (let j = 5; j >= 0; j--) {
            y += '\t' + forecast2[j];
          }
          pandemic_self.addMove(y);
          //Restore defaults
          pandemic_self.skin.resetInfectionDeck(pandemic_self);
          console.log(forecast2);
          pandemic_self.endTurn();
          return;
        }
        forecast.splice(forecast.indexOf(x), 1);
                pandemic_self.game.status = `These are the next cities to get infected. You can rearrange them  (first click, last to infect):`;
        pandemic_self.hud.updateStatus(pandemic_self.game.status);
        pandemic_self.hud.updateMenu([]);
        pandemic_self.hud.updateCards(forecast);
        pandemic_self.cardbox.attachCardEvents();
        pandemic_self.cardbox.attachCardEvents();
      });
      pandemic_self.cardbox.attachCardEvents();
    }

    //
    // GOVERNMENT GRANT
    if (event == 'event5') {
      let cities_array = [];

      for (let key in pandemic_self.skin.cities) {
        //Get keys of object
        cities_array.push(key);
      }
      cities_array.sort();

      let city_menu = [];
      for (let i of cities_array) {
        //Iterate over array
        if (!pandemic_self.game.state.research_stations.includes(i)) {
          city_menu.push({ id: i, label: pandemic_self.skin.cities[i].name });
        }
      }

            pandemic_self.game.status = `Pick a city for a free research station:`;
      pandemic_self.hud.updateStatus(pandemic_self.game.status);
      pandemic_self.hud.updateCards([]);
      pandemic_self.clearHudActions();

      let pickedStation = function (city) {
        if (pandemic_self.game.state.research_stations.includes(city)) {
          salert(`${pandemic_self.skin.cities[city].name} already has a research station!`);
          return;
        }
        let slot = pandemic_self.game.state.research_stations.length;

        //Maximum of 6
        if (slot == 6) {
          let destroy_menu = [];
          for (let i = 0; i < slot; i++) {
            destroy_menu.push({
              id: `${i}`,
              label: pandemic_self.skin.cities[pandemic_self.game.state.research_stations[i]].name
            });
          }

                    pandemic_self.game.status = `Destroy a previous research station:`;
          pandemic_self.hud.updateStatus(pandemic_self.game.status);
          pandemic_self.hud.updateCards([]);
          pandemic_self.hud.updateMenu(destroy_menu, function (id) {
            slot = id;
            pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);
            pandemic_self.placeStation(slot, city, 0, false);
          });
        } else {
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${event}`);
          pandemic_self.placeStation(slot, city, 0, false);
        }
      };

      pandemic_self.hud.updateMenu(city_menu, pickedStation);
      $('.city').off();
      $('.city').on('click', function () {
        pickedStation($(this).attr('id'));
      });
    }
  }

  playEventCard() {
    let pandemic_self = this;
    let cards = this.game.players_info[this.game.player - 1].cards.filter((c) =>
      c.includes('event')
    );

        this.game.status = `Play an event card:`;
    this.hud.updateStatus(this.game.status);
    this.hud.updateMenu([]);
    this.hud.updateCards(cards);
    this.cardbox.attachCardEvents();

    $('.card').off();
    $('.card').on('click', function () {
      $('.card').off();
      let id = $(this).attr('id');
      pandemic_self.playEvent(id);
    });
  }

  discoverCure() {
    let cards = this.game.players_info[this.game.player - 1].cards;
    let pandemic_self = this;

    let cardColors = { blue: 0, yellow: 0, red: 0, black: 0 };

    let research_limit = 5;
    if (this.game.players_info[this.game.player - 1].type == 2) {
      //Scientist
      research_limit = 4;
    }

    for (let i = 0; i < cards.length; i++) {
      if (this.game.deck[1].cards[cards[i]] != undefined) {
        cardColors[this.skin.cities[cards[i]].virus]++;
      }
    }

    let menu = [];
    for (let color in cardColors) {
      if (cardColors[color] >= research_limit && !this.game.state.cures[color]) {
        menu.push({ id: color, label: this.skin.getVirusName(color) });
      }
    }

        this.game.status = `Research Cure:`;
    this.hud.updateStatus(this.game.status);
    this.hud.updateCards([]);
    this.clearHudActions();
    this.hud.updateMenu(menu, function (c) {
      let cards = pandemic_self.game.players_info[pandemic_self.game.player - 1].cards;

      for (let i = 0, k = 0; k < research_limit && i < cards.length; i++) {
        if (pandemic_self.skin.cities[cards[i]]?.virus == c) {
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${cards[i]}`);
          k++;
        }
      }

      pandemic_self.addMove(`curevirus\t${pandemic_self.game.player}\t${c}`);
      pandemic_self.endTurn();
    });
  }

  isCityInfected(city) {
    for (let v in this.game.state.cities[city].virus) {
      if (this.game.state.cities[city].virus[v] > 0) {
        return 1;
      }
    }
    return 0;
  }

  canPlayerBuildResearchStation(city) {
    //Have to be in the city
    if (this.game.players_info[this.game.player - 1].city !== city) {
      return 0;
    }
    //Only one research station per city
    if (this.game.state.research_stations.includes(city)) {
      return 0;
    }

    // operations experts can build without card
    if (this.game.players_info[this.game.player - 1].type == 4) {
      return 1;
    }

    //Need city card
    for (let i = 0; i < this.game.players_info[this.game.player - 1].cards.length; i++) {
      if (this.game.players_info[this.game.player - 1].cards[i] == city) {
        return 1;
      }
    }

    return 0;
  }

  returnHopsToCityFromCity(fromcity, tocity) {
    let hops = 0;
    let current_cities = [];
    let new_cities = [];
    current_cities.push(fromcity);

    //
    // graph will eventually close
    //
    while (1) {
      new_cities = [];
      hops++;

      for (let i = 0; i < current_cities.length; i++) {
        let neighbours = this.skin.cities[current_cities[i]].neighbours;
        for (let k = 0; k < neighbours.length; k++) {
          if (neighbours[k] == tocity) {
            return hops;
          } else {
            if (!new_cities.includes(neighbours[k])) {
              new_cities.push(neighbours[k]);
            }
          }
        }
      }

      current_cities = new_cities;
    }
  }

  movePlayer(player = 0) {
    // 0 = me

    let pandemic_self = this;
    let city = this.game.players_info[this.game.player - 1].city;

    let menu = [];
    for (let i = 0; i < this.skin.cities[city].neighbours.length; i++) {
      let c = this.skin.cities[city].neighbours[i];
      menu.push({ id: c, label: this.skin.cities[c].name });
    }

        this.game.status = `Move where (or click board):`;
    this.hud.updateStatus(this.game.status);
    this.hud.updateCards([]);
    this.clearHudActions();
    this.hud.updateMenu(menu, function (c) {
      $('.city').off();
      pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${c}\t1`);
      pandemic_self.endTurn();
    });

    $('.city').on('click', function () {
      let selection = $(this).attr('id');
      let startCity = pandemic_self.game.players_info[pandemic_self.game.player - 1].city;
      let hops = pandemic_self.returnHopsToCityFromCity(selection, startCity);

      if (hops > pandemic_self.game.state.active_moves) {
        alert('Invalid Move -- too many hops');
      } else {
        $('.city').off();
        pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${selection}\t${hops}`);
        pandemic_self.endTurn();
      }
    });
  }

  directFlight() {
    let pandemic_self = this;
    let city = this.game.players_info[this.game.player - 1].city;
    let cards = this.game.players_info[this.game.player - 1].cards.filter(
      (c) => !c.includes('event') && c !== city
    );

        this.game.status = 'Take a direct flight to which city:';
    this.hud.updateStatus(this.game.status);
    this.hud.updateMenu([]);
    this.hud.updateCards(cards);
    this.cardbox.attachCardEvents();
        this.cardbox.bindCallback(function (c) {
      pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${c}`);
      pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${c}\t1`);
      pandemic_self.endTurn();
    });
    this.cardbox.attachCardEvents();
    $('.city').off();
    $('.city').on('click', function () {
      let selection = $(this).attr('id');
      if (cards.includes(selection)) {
        $('.card').off();
        pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${selection}`);
        pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${selection}\t1`);
        pandemic_self.endTurn();
      }
    });
  }

  charterFlight(city) {
    let pandemic_self = this;
    if (
      this.game.players_info[this.game.player - 1].type === 4 &&
      this.game.state.research_stations.includes(city)
    ) {
      let cards = this.game.players_info[this.game.player - 1].cards.filter(
        (c) => !c.includes('event')
      );
            this.game.status = `Discard a city card to charter a flight anywhere on the board`;
      this.hud.updateStatus(this.game.status);
      this.hud.updateMenu([]);
      this.hud.updateCards(cards);
      this.cardbox.attachCardEvents();
            this.cardbox.bindCallback(function (c) {
                pandemic_self.game.status = `Discard [${pandemic_self.skin.cities[c].name}] to go anywhere on the board`;
        pandemic_self.hud.updateStatus(pandemic_self.game.status);
        pandemic_self.hud.updateCards([]);
        pandemic_self.hud.updateMenu([]);
        $('.city').off();
        $('.city').on('click', function () {
          $('.city').off();
          let destination = $(this).attr('id');
          pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${c}`);
          pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${destination}\t1`);
          pandemic_self.endTurn();
        });
      });
      this.cardbox.attachCardEvents();
    } else {
            this.game.status = `Discard [${this.skin.cities[city].name}] to go anywhere on the board`;
      this.hud.updateStatus(this.game.status);
      this.hud.updateCards([]);
      this.hud.updateMenu([]);
      $('.city').off();
      $('.city').on('click', function () {
        let c = $(this).attr('id');
        pandemic_self.addMove(`discard\t${pandemic_self.game.player}\t${city}`);
        pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${c}\t1`);
        pandemic_self.endTurn();
      });
    }
  }

  shuttleFlight() {
    let pandemic_self = this;
    let city = this.game.players_info[this.game.player - 1].city;
    let rsIndex = 0;
    let menu = [];
    for (let i = 0; i < this.game.state.research_stations.length; i++) {
      let rs = this.game.state.research_stations[i];
      if (rs !== city) {
        menu.push({ id: rs, label: this.skin.cities[rs].name });
      } else {
        rsIndex = i + 1;
      }
    }

        this.game.status = `Take a shuttle flight:`;
    this.hud.updateStatus(this.game.status);
    this.hud.updateCards([]);
    this.clearHudActions();
    this.hud.updateMenu(menu, function (c) {
      pandemic_self.addMove(`move\t${pandemic_self.game.player}\t${c}\t1`);
      pandemic_self.endTurn();
    });

    $('.research_station').off();
    $('.research_station').css('z-index', '45');
    $('.research_station').on('click', function () {
      let stationNumber = parseInt($(this).attr('id').split('_')[1]) - 1;
      pandemic_self.addMove(
        `move\t${pandemic_self.game.player}\t${pandemic_self.game.state.research_stations[stationNumber]}\t1`
      );
      pandemic_self.endTurn();
    });
    //Undo for the station I am in
    $(`#station_${rsIndex}`).off();
    $(`#station_${rsIndex}`).css('z-index', '');
  }

  cureDisease(cube_selection = 3) {
    let pandemic_self = this;
    let city = this.game.players_info[this.game.player - 1].city;
    let cubes_to_cure = 1;
    let number_of_diseases = 0;
    let disease = '';
    let disease_menu = [];

    for (let v in this.game.state.cities[city].virus) {
      if (this.game.state.cities[city].virus[v] > 0) {
        number_of_diseases++;
        disease = v;
        disease_menu.push({ id: v, label: v });
      }
    }

    //
    // if there is just one type, cure it
    if (number_of_diseases === 1) {
      //Medics can clear it all in one move or if we have the cure
      if (
        this.game.players_info[this.game.player - 1].type == 3 ||
        this.game.state.cures[disease]
      ) {
        cubes_to_cure = Math.min(3, this.game.state.cities[city].virus[disease]);
      }

      let cure_capacity = Math.min(
        this.game.state.active_moves,
        this.game.state.cities[city].virus[disease],
        cube_selection
      );
      if (cure_capacity > cubes_to_cure) {
        let html = `<div class="status-icon-menu smaller-icon">
                <div class="menu_icon" id="1"><i class="menu_icon_icon fas fa-fw fa-2x fa-cube fa-border"></i><div class="menu-text">One cube</div></div>
                <div class="menu_icon" id="2"><span class="fake-border"><i class="menu_icon_icon fas fa-fw fa-cube"></i><i class="menu_icon_icon fas fa-fw fa-cube"></i></span><div class="menu-text">Two cubes</div></div>
                `;
        if (cure_capacity == 3) {
          html += `<div class="menu_icon" id="3"><i class="menu_icon_icon fas fa-fw fa-2x fa-cubes fa-border"></i><div class="menu-text">Three cubes</div></div>`;
        }
        html += '</div>';
                this.game.status = `Remove how many cubes? [${this.game.state.active_moves}]`;
        this.hud.updateStatus(this.game.status);
        this.hud.updateCards([]);
        this.hud.updateMenu([]);
        this.setHudActions(html);
        $('.menu_icon').off();
        $('.menu_icon').on('click', function () {
          let c = parseInt($(this).attr('id'));
          pandemic_self.addMove(
            `treatvirus\t${pandemic_self.game.player}\t${city}\t${c}\t${disease}\t${c}`
          );
          pandemic_self.endTurn();
        });
      } else {
        //One move cube removal
        this.addMove(`treatvirus\t${this.game.player}\t${city}\t${cubes_to_cure}\t${disease}\t1`);
        this.endTurn();
      }
    } else {
      //Player has to pick a color of disease to cure
            this.game.status = `Cure disease:`;
      this.hud.updateStatus(this.game.status);
      this.hud.updateCards([]);
      this.clearHudActions();
      this.hud.updateMenu(disease_menu, function (c) {

        if (
          pandemic_self.game.players_info[pandemic_self.game.player - 1].type == 3 ||
          pandemic_self.game.state.cures[c]
        ) {
          cubes_to_cure = Math.min(3, pandemic_self.game.state.cities[city].virus[c]);
        } //Medics can clear it all in one move or if we have the cure

        pandemic_self.addMove(
          `treatvirus\t${pandemic_self.game.player}\t${city}\t${cubes_to_cure}\t${c}\t1`
        );
        pandemic_self.endTurn();
      });
    }
  }

  /* Done */
  buildResearchStation() {
    let pandemic_self = this;
    let player = this.game.players_info[this.game.player - 1];
    let city = player.city; //research station will be built where the player is
    let slot = this.game.state.research_stations.length;

    //Maximum of 6
    if (slot == 6) {
      //Have player pick a city
      let menu = [];
      for (let i = 0; i < slot; i++) {
        menu.push({
          id: `${i}`,
          label: this.skin.cities[this.game.state.research_stations[i]].name
        });
      }

            this.game.status = `Destroy a previous research station:`;
      this.hud.updateStatus(this.game.status);
      this.hud.updateCards([]);
      this.clearHudActions();
      this.hud.updateMenu(menu, function (id) {
        slot = id;
        pandemic_self.placeStation(slot, city, 1, player.type !== 4);
      });
    } else {
      //To avoid asynch, just use logic and a bit of repetition
      this.placeStation(slot, city, 1, player.type !== 4);
    }
  }

  placeStation(slot, city, move = 1, discard = true) {
    let player = this.game.players_info[this.game.player - 1];

    if (discard) {
      this.addMove(`discard\t${this.game.player}\t${city}`);
    }
    this.addMove(`buildresearchstation\t${this.game.player}\t${city}\t${slot}\t${move}`);
    this.endTurn();
  }

  isEradicated(virus) {
    return this.game.state.cures[virus] && this.game.state.active[virus] === 0;
  }

  acknowledgeInfectionCard(city, mycallback) {
    let pandemic_self = this;
    let virus = this.skin.cities[city].virus;
    let msg = `Infection: 1 ${this.skin.getVirusName(virus)} added to ${
      this.skin.cities[city].name
    }`;
    let blocked = 0;

    this.outbreaks = [];

    if (this.isEradicated(virus)) {
      msg = `Eradicated disease prevents infection in ${this.skin.cities[city].name}`;
      this.updateLog(`Eradicated disease prevents infection in ${this.skin.cities[city].name}`);
      blocked = 1;
    } else {
      if (
        this.quarantine &&
        (this.quarantine === city || this.skin.cities[city].neighbours.includes(this.quarantine))
      ) {
        this.updateLog(
          `Quarantine Specialist blocks new infection in ${this.skin.cities[city].name}`
        );
        msg = `Quarantine Specialist blocks new infection in ${this.skin.cities[city].name}`;
        blocked = 1;
      }
    }

    if (blocked == 0) {
      this.addDiseaseCube(city, virus);
    }

    pandemic_self.skin.animateInfection(city, msg, blocked, mycallback);

    return 0;
  }

  //
  // Core Game Logic
  //
  handleGameLoop() {
    let pandemic_self = this;

    ///////////
    // QUEUE //
    ///////////
    console.log('***** LOOP *****');
    console.log(
      'QUEUE: ' + JSON.stringify(this.game.queue) + ', MOVES: ' + JSON.stringify(this.moves)
    );
    console.log('DECKS: ');
    console.log(JSON.parse(JSON.stringify(this.game.deck)));

    if (this.game.queue.length > 0) {
      console.log('State:');
      console.log(JSON.parse(JSON.stringify(this.game.state)));
      //pandemic_self.saveGame(pandemic_self.game.id);
      pandemic_self.showBoard();

      let qe = this.game.queue.length - 1;
      let mv = this.game.queue[qe].split('\t');
      let shd_continue = 1;

      if (mv[0] === 'start') {
        this.game.queue.splice(qe, 1);
        this.game.queue.push('turn\t1\tnew');
        this.game.state.welcome = 0;
      }
      if (mv[0] === 'lose') {
        salert('GAME OVER: ' + mv[1]);
                this.game.status = 'Players lose to the virus!';
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
        this.updateLog('The game is over');
        this.triggerGameOver([], mv[1]);
        return 0;
      }

      if (mv[0] === 'win') {
        let winningPlayer = mv[1];
        this.updateLog(
          `Player ${winningPlayer} discovered the final cure and the pandemic ended. Everyone stopped wearing masks and had a big party to celebrate.`
        );
                this.game.status = 'Players win the game!';
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
        salert('Players Win! Humanity survives');
        this.triggerGameOver(this.game.players, 'All vaccines discovered!');
        return 0;
      }
      if (mv[0] === 'forecast') {
        let cards_to_update = parseInt(mv[1]);
        for (let i = 0; i < cards_to_update; i++) {
          let newcard = mv[i + 2];
          this.updateLog(newcard + ' on top of infection pile...');
          this.game.deck[0].crypt[i] = this.app.crypto.stringToHex(newcard);
        }
        this.game.queue.splice(qe, 1);
      }
      if (mv[0] === 'resilientpopulation') {
        for (let i = 0; i < this.game.deck[0].discards.length; i++) {
          if (this.game.deck[0].discards[i] == mv[1]) {
            this.game.deck[0].discards.splice(i, 1);
            break;
          }
        }
        this.updateLog(
          `${this.game.deck[1].cards['event2'].name}: The people of ${
            this.skin.cities[mv[1]].name
          } are protected`
        );
        this.game.queue.splice(qe, 1);
      }

      if (mv[0] === 'discard') {
        let player = parseInt(mv[1]);
        let card = mv[2];

        this.removeCardFromHand(player, card);
        this.game.deck[1].discards.push(card);

        this.game.queue.splice(qe, 1);
      }

      if (mv[0] === 'discardhand') {
        let player = parseInt(mv[1]); //1, 2, 3...

        //Loop until we satisfy this
        if (this.game.players_info[player - 1].cards.length <= this.maxHandSize) {
          this.game.queue.splice(qe, 1);
          return 1;
        }

        if (player === this.game.player) {
          this.playerDiscardCards();
        } else {
                    this.game.status = `Player ${player} (${
              this.game.players_info[player - 1].name
            }) has to discard some cards`;
          this.hud.updateStatus(this.game.status);
          this.hud.updateMenu([]);
          this.hud.updateCards(this.game.players_info[this.game.player - 1].cards);
          this.cardbox.attachCardEvents();
        }
        return 0;
      }

      if (mv[0] === 'endturn') {
        let player = parseInt(mv[1]);
        $(`.player`).removeClass('active_player');
        this.game.queue.splice(qe - 1, 2);
        this.game.queue.push('turn\t' + this.returnNextPlayer(player) + '\tnew');
        this.game.queue.push('infect');
        this.game.queue.push('draw_player_card\t' + player + '\t2');
        return 1;
      }

      if (mv[0] === 'turn') {
        let player = parseInt(mv[1]);

        if (this.browser_active == 1) {
          if (mv[2] === 'new') {
            //Reset number of actions for the player (Generalist = 5, otherwise 4)
            this.game.queue.splice(qe, 1);
            this.game.queue.push(`${mv[0]}\t${mv[1]}\told`);
            this.game.state.active_moves = this.game.players_info[player - 1].moves; //not saved
            this.game.state.current_player = player;
            this.game.state.one_quiet_night = 0;
          }
          $(`#player${player}`).addClass('active_player');

          $('.player.active_player .move_counter').html(this.game.state.active_moves);
          if (this.game.state.welcome == 0) {
            this.overlay.show(this.returnWelcomeOverlay());
            document.querySelector('.close_welcome_overlay').onclick = (e) => {
              this.overlay.hide();
            };
            this.game.state.welcome = 1;
          }
          if (player == this.game.player) {
            this.playerMakeMove();
          } else {
            this.removeEvents();
            let cards =
              this.game.player > 0 ? this.game.players_info[this.game.player - 1].cards : null;
                        this.game.status = `Waiting for ${this.app.keychain.returnUsername(this.game.players[player - 1])} 
              (${this.game.players_info[player - 1].name})`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards(cards);
            this.cardbox.attachCardEvents();
                        this.cardbox.bindCallback(pandemic_self.playFromCardFan);
            this.cardbox.attachCardEvents();
          }
        }
        return 0;
      }
      if (mv[0] === 'interrupt') {
        let rudePlayer = parseInt(mv[1]);
        let victim = parseInt(mv[2]);

        if (this.game.player === rudePlayer) {
          this.playEvent(mv[3]);
        } else {
          if (this.game.player === victim) {
                        this.game.status = `Hang on, ${this.app.keychain.returnUsername(this.game.players[rudePlayer - 1])} 
              (${this.game.players_info[rudePlayer - 1].name}) is playing an event card`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards(this.game.players_info[this.game.player - 1].cards);
            this.cardbox.attachCardEvents();
          } else {
                        this.game.status = `Waiting for ${this.app.keychain.returnUsername(this.game.players[rudePlayer - 1])} 
              (${this.game.players_info[rudePlayer - 1].name}) to play an event`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards(this.game.players_info[this.game.player - 1].cards);
            this.cardbox.attachCardEvents();
          }
        }
        this.game.queue.splice(qe, 1);
        return 0;
      }

      if (mv[0] === 'draw_player_card') {
        this.game.queue.splice(qe, 1); //Remove this draw_player_card
        let player = parseInt(mv[1]) - 1;
        let cards = parseInt(mv[2]);

        if (this.game.player === player + 1 && this.browser_active) {
          this.cardfan.hide();
        }

        if (cards > 0) {
          this.updateLog(
            `${this.game.deck[1].crypt.length} cards left in deck. Player ${mv[1]} drawing ${mv[2]}.`
          );
        }

        for (let i = cards; i > 0; i--) {
          if (this.game.deck[1].crypt.length == 0) {
            this.updateLog(
              'Political bickering prevented scientists from mounting a timely response to the pandemic, and humanity passed the point of no return.'
            );
            this.loseGame('No more cards. You have failed to contain the pandemic in time.');
            return;
          }

          let card = this.drawPlayerCard(player);

          if (card.includes('epidemic')) {
            this.game.queue.push('draw_player_card\t' + mv[1] + '\t' + (i - 1));
            this.game.queue.push('epidemic');
            return 1;
          } else {
            this.game.players_info[player].cards.push(card);
          }
        }
        this.game.players_info[player].cards = this.sortHand(this.game.players_info[player].cards);

        //Here is where we need to check if players have overly large hands
        //...
        // discard extra cards
        if (this.game.players_info[player].cards.length > this.maxHandSize) {
          this.game.queue.push(`discardhand\t${player + 1}`);
        }

        return 1;
      }
      if (mv[0] === 'epidemic') {
        this.game.queue.splice(qe, 1);
        this.game.state.infection_rate++;

        this.outbreaks = [];
        let city = this.drawInfectionCardFromBottomOfDeck();
        let virus = this.skin.cities[city].virus;
        this.updateLog(`Epidemic in ${this.skin.cities[city].name}!!!`.toUpperCase());
        if (this.isEradicated(virus)) {
          this.displayModal(
            'Epidemic Averted',
            `${this.skin.getVirusName(virus)} virus already eradicated`
          );
          this.updateLog(
            `No new infections because ${this.skin.getVirusName(virus)} already eradicated!`
          );
        } else {
          //If already has virus, add just enough to trigger an outbreak, otherwise 3 cubes
          //>>>>>
          let current = this.game.state.cities[city].virus[virus];
          if (current == 0) {
            this.addDiseaseCube(city, virus, 3);
          } else {
            this.addDiseaseCube(city, virus, 3 - current);
            this.addDiseaseCube(city, virus);
          }
          /*for (let i = Math.max(0,this.game.state.cities[city].virus[virus]-1); i < 3; i ++){
            this.addDiseaseCube(city, virus);
          } */
        }

        //
        // show overlay
        //
        this.overlay.show(this.returnEpidemicOverlay(city));
        document.querySelector('.close_epidemic_overlay').onclick = (e) => {
          pandemic_self.overlay.hide();
        };
        this.overlay.blockClose();

        //
        // shuffle cards into TOP of infection deck
        //
        let new_deck = [];

        for (let i = 0; i < this.game.deck[0].discards.length; i++) {
          let roll = this.rollDice(this.game.deck[0].discards.length);
          new_deck.push(this.app.crypto.stringToHex(this.game.deck[0].discards[roll - 1]));
          this.game.deck[0].discards.splice(roll - 1, 1);
        }

        for (let i = 0; i < this.game.deck[0].crypt.length; i++) {
          new_deck.push(this.game.deck[0].crypt[i]);
        }

        this.game.deck[0].crypt = new_deck;
        this.game.deck[0].discards = [];

        this.showBoard();
      }
      if (mv[0] === 'infect') {
        this.game.queue.splice(qe, 1);
        let infection_cards = 2;
        if (this.game.state.infection_rate > 2) {
          infection_cards = 3;
        }
        if (this.game.state.infection_rate > 4) {
          infection_cards = 4;
        }

        if (this.game.state.one_quiet_night == 0) {
          this.updateLog(`INFECTION STAGE: ${infection_cards} cards to draw`);

          for (let i = 0; i < infection_cards; i++) {
            let city = this.drawInfectionCard();
            this.prependMove(`infectcity\t${city}`);
          }
          console.log(JSON.parse(JSON.stringify(this.moves)));
          for (let m of this.moves) {
            this.game.queue.push(m);
          }
          this.moves = [];
        } else {
          this.displayModal('One Quiet Night', 'skipping draw of infection cards');
          this.game.state.one_quiet_night = 0;
        }
      }

      //
      // place initial cards
      if (mv[0] === 'place_initial_infection') {
        //This is a little hack until change game template
        this.game.deck[0].discards = [];
        this.game.deck[1].discards = [];

        for (let i = 3; i > 0; i--) {
          for (let k = 0; k < 3; k++) {
            let newcard = this.drawInfectionCard();
            let virus = this.skin.cities[newcard].virus;
            this.game.state.cities[newcard].virus[virus] = i;
            this.game.state.active[virus] += i;
            //console.log(this.game.state.cities[newcard].virus);
            this.updateLog(
              `${this.skin.cities[newcard].name} infected with ${i} ${this.skin.getVirusName(
                virus
              )}`
            );
          }
        }
        this.game.queue.splice(qe, 1);
      }

      //Insert Epidemics into player deck
      if (mv[0] === 'initialize_player_deck') {
        let epidemics = this.game.options.difficulty ? parseInt(this.game.options.difficulty) : 4;
        let section_length = Math.floor(this.game.deck[1].crypt.length / epidemics);

        // shuffle them into the undrawn pile
        for (let i = 0, starting_point = 0; i < epidemics; i++) {
          let cardname = 'epidemic' + (i + 1);
          this.game.deck[1].cards[cardname] = JSON.parse(JSON.stringify(this.skin.epidemic));

          let insertion_point = this.rollDice(section_length);
          this.game.deck[1].crypt.splice(
            starting_point + insertion_point,
            0,
            this.app.crypto.stringToHex(cardname)
          );
          starting_point += 1;
          starting_point += section_length;
        }

        //console.log("\n\n\nCARDS AS INITED: ");
        //for (let i = 0; i < this.game.deck[1].crypt.length; i++) {
        //  console.log(this.app.crypto.hexToString(this.game.deck[1].crypt[i]));
        //}

        this.game.queue.splice(qe, 1);
      }

      if (mv[0] === 'infectcity') {
        pandemic_self.halted = 1;

        pandemic_self.acknowledgeInfectionCard(mv[1], function () {
          console.log('Acknowledgeing...');
          console.log(JSON.stringify(pandemic_self.game.queue));
          console.log(JSON.stringify(pandemic_self.moves));
          pandemic_self.game.queue.splice(pandemic_self.game.queue.length - 1, 1);
          pandemic_self.game.queue = pandemic_self.game.queue.concat(pandemic_self.moves);
          pandemic_self.moves = [];
          console.log('continuing...');
          console.log(JSON.stringify(pandemic_self.game.queue));
          console.log(JSON.stringify(pandemic_self.moves));

          pandemic_self.restartQueue();
          return 1;
        });

        return 0;
      }

      if (mv[0] === 'curevirus') {
        let player = parseInt(mv[1]);
        let virus = mv[2];

        this.game.queue.splice(qe, 1);
        this.game.state.active_moves--;
        this.game.state.cures[virus] = true;

        this.updateLog(
          `Player ${player} (${
            this.game.players_info[player - 1].name
          }) found the cure for ${this.skin.getVirusName(virus)} disease`
        );
        if (this.game.player !== player) {
          this.displayModal(
            'Cure Discovered!',
            `Player ${player} found the cure to ${this.skin.getVirusName(virus)}`
          );
        }
        if (this.game.state.active[virus] === 0) {
          this.displayModal(
            'Virus Eradicated',
            `${this.skin.getVirusName(virus)} removed from game`
          );
          this.updateLog(`${this.skin.getVirusName(virus)} disease is eradicated!!!`);
        }
        if (
          this.game.state.cures.yellow &&
          this.game.state.cures.red &&
          this.game.state.cures.blue &&
          this.game.state.cures.black
        ) {
          this.winGame(player);
        }
      }

      if (mv[0] === 'onequietnight') {
        let player = parseInt(mv[1]);
        pandemic_self.updateLog('One Quiet Night: skipping the next infection phase.');
        this.game.state.one_quiet_night = 1; //Set a flag to ignore the infection phase, messaging there
        this.game.queue.splice(qe, 1);
      }
      if (mv[0] === 'buildresearchstation') {
        let player = parseInt(mv[1]);
        let city = mv[2];
        let slot = parseInt(mv[3]);
        let movesRequired = parseInt(mv[4]);
        this.game.queue.splice(qe, 1);
        this.game.state.research_stations[slot] = city;
        this.game.state.active_moves -= movesRequired;
        this.updateLog(
          `Player ${player} (${
            this.game.players_info[player - 1].name
          }) built a research station in ${this.skin.cities[city].name}.`
        );
      }

      if (mv[0] === 'begcard') {
        let player = parseInt(mv[1]);
        let researcher = parseInt(mv[2]);

        if (this.game.player === researcher) {
          let cards = this.game.players_info[researcher - 1].cards.filter(
            (c) => !c.includes('event')
          );
                    this.game.status = `Player ${player} wants you to share knowledge with them:`;
          this.hud.updateStatus(this.game.status);
          this.hud.updateMenu([]);
          this.hud.updateCards(cards);
          this.cardbox.attachCardEvents();
                    this.cardbox.bindCallback(function (c) {
            pandemic_self.addMove(`shareknowledge\t${researcher}\t${player}\t${c}`);
            pandemic_self.endTurn();
          });
          this.cardbox.attachCardEvents();
          this.hud.showBackButton(function () {
            pandemic_self.addMove(`nosharing\t${researcher}\t${player}\t`);
            pandemic_self.endTurn();
          });
        } else {
          if (player === this.game.player) {
                        this.game.status = `Player ${researcher} is deciding about sharing knowledge with you`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards([]);
            this.cardbox.attachCardEvents();
          } else {
                        this.game.status = `Player ${researcher} is deciding about sharing knowledge with Player ${player}`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards([]);
            this.cardbox.attachCardEvents();
          }
        }
        return 0;
      }

      if (mv[0] === 'givecard') {
        let player = parseInt(mv[1]);
        let recipient = parseInt(mv[2]);
        let card = mv[3];

        if (this.game.player === recipient) {
                    this.game.status = `Player ${player} wants to share knowledge <span class="showcard" id="${card}">(${this.skin.cities[card].name})</span> with you, okay?`;
          this.hud.updateStatus(this.game.status);
          this.hud.updateCards([]);
          this.clearHudActions();
          this.hud.updateMenu(
            [
              { id: 'yes', label: 'accept player card' },
              { id: 'no', label: 'refuse card' }
            ],
            function (choice) {
              if (choice === 'yes') {
                pandemic_self.addMove(`shareknowledge\t${player}\t${recipient}\t${card}`);
              } else {
                pandemic_self.addMove(`nosharing\t${recipient}\t${player}\t${card}`);
              }
              pandemic_self.endTurn();
            }
          );
                    this.cardbox.attachCardEvents();
        } else {
          if (player === this.game.player) {
                        this.game.status = `Player ${recipient} is deciding about sharing knowledge with you`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards([card]);
            this.cardbox.attachCardEvents();
          } else {
                        this.game.status = `Player ${recipient} is deciding about sharing knowledge with Player ${player}`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards([]);
            this.cardbox.attachCardEvents();
          }
        }
        return 0;
      }

      if (mv[0] === 'takecard') {
        let player = parseInt(mv[1]);
        let owner = parseInt(mv[2]);
        let card = mv[3];

        if (this.game.player === owner) {
                    this.game.status = `Will you share knowledge <span class="showcard" id="${card}">(${this.skin.cities[card].name})</span> with Player ${player}?`;
          this.hud.updateStatus(this.game.status);
          this.hud.updateCards([]);
          this.clearHudActions();
          this.hud.updateMenu(
            [
              { id: 'yes', label: 'give player card' },
              { id: 'no', label: 'keep card' }
            ],
            function (choice) {
              if (choice === 'yes') {
                pandemic_self.addMove(`shareknowledge\t${owner}\t${player}\t${card}`);
              } else {
                pandemic_self.addMove(`nosharing\t${owner}\t${player}\t${card}`);
              }
              pandemic_self.endTurn();
            }
          );
                    this.cardbox.attachCardEvents();
        } else {
          if (player === this.game.player) {
                        this.game.status = `Player ${owner} is deciding about sharing knowledge with you`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards([]);
            this.cardbox.attachCardEvents();
          } else {
                        this.game.status = `Player ${owner} is deciding about sharing knowledge with Player ${player}`;
            this.hud.updateStatus(this.game.status);
            this.hud.updateMenu([]);
            this.hud.updateCards([]);
            this.cardbox.attachCardEvents();
          }
        }
        return 0;
      }

      if (mv[0] === 'shareknowledge') {
        let sender = mv[1];
        let player = mv[2];
        let card = mv[3];
        this.game.queue.splice(qe - 1, 2); //resolve takecard or givecard
                this.game.status = 'Sharing Knowledge: Teamwork for the win!';
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
        this.removeCardFromHand(sender, card);
        this.game.players_info[player - 1].cards.push(card);
        this.game.players_info[player - 1].cards = this.sortHand(
          this.game.players_info[player - 1].cards
        );
        if (this.game.player === player) {
          this.cardfan.hide();
        }
        this.game.state.active_moves--;
        this.updateLog(
          `Player ${sender} (${this.game.players_info[sender - 1].name}) shared the ${
            this.skin.cities[card].name
          } card with Player ${player} (${this.game.players_info[player - 1].name})`
        );
        if (this.game.players_info[player - 1].cards.length > this.maxHandSize) {
          this.game.queue.push(`discardhand\t${player}`);
        }
        return 1;
      }

      if (mv[0] === 'nosharing') {
        let refuser = mv[1];
        let offerer = mv[2];
        let card = mv[3];
        this.game.queue.splice(qe - 1, 2); //resolve takecard or givecard
        let city = card ? `(${this.skin.cities[card].name}) ` : '';
        this.updateLog(`Player ${refuser} declined to share knowledge ${city}with ${offerer}`);
        return 1;
      }

      if (mv[0] === 'move') {
        let player = parseInt(mv[1]);
        let movesRequired = parseInt(mv[3]);

        this.game.queue.splice(qe, 1);

        this.updateLog(
          `Player ${player} (${
            this.game.players_info[player - 1].name
          }) moves to ${this.skin.cities[mv[2]].name}`
        );

        this.game.state.active_moves -= movesRequired;

        //Keep track of where the quarantine specialist is

        if (document.getElementById(`player${player}`)) {
          let tTime = 0.2 + movesRequired * 0.6;
          document.getElementById(`player${player}`).style.transition =
            `top ${tTime}s, left ${tTime}s`;
        }

        if (this.game.players_info[player - 1].type == 5) {
          this.quarantine = mv[2];
        }

        //Update the location
        pandemic_self.game.players_info[player - 1].city = mv[2];
      }

      if (mv[0] === 'treatvirus') {
        let player = parseInt(mv[1]);
        let city = mv[2];
        let numCubes = parseInt(mv[3]);
        let virus = mv[4];
        let movesRequired = parseInt(mv[5]);

        this.game.queue.splice(qe, 1);
        console.log(JSON.stringify(mv));

        console.log(JSON.parse(JSON.stringify(this.game.state.cities)));
        console.log(JSON.parse(JSON.stringify(this.game.state.active)));
        console.log('===================');
        //update stats for everyone
        this.game.state.cities[city].virus[virus] -= numCubes;
        this.game.state.active[virus] -= numCubes;
        this.game.state.active_moves -= movesRequired;

        console.log(JSON.parse(JSON.stringify(this.game.state.cities)));
        console.log(JSON.parse(JSON.stringify(this.game.state.active)));
        this.updateLog(
          `Player ${player} (${
            this.game.players_info[player - 1].name
          }) removes ${numCubes} ${this.skin.getVirusName(
            virus
          )} cube${numCubes > 1 ? 's' : ''} from ${this.skin.cities[city].name}`
        );
        if (!this.game.state.active[virus] && this.game.state.cures[virus]) {
          this.displayModal(
            'Virus Eradicated',
            `${this.skin.getVirusName(virus)} virus removed from game`
          );
          this.updateLog(`${this.skin.getVirusName(virus)} disease is eradicated!!!`);
        }
      }

      if (shd_continue == 0) {
        console.log('NOT CONTINUING');
        return 0;
      }

      return 1;
    }
  }

  loseGame(notice) {
    this.prependMove(`lose\t${notice}`);
    this.endTurn();
  }

  winGame(player) {
    this.addMove(`win\t${player}`);
    this.endTurn();
  }

  triggerOutbreak(city, virus) {
    this.outbreaks.push(city); //To prevent infinite loops
    this.game.state.outbreaks++;
    let msg = `Outbreak! ${this.skin
      .getVirusName(virus)
      .toUpperCase()} spreads from ${this.skin.cities[city].name} to ...`;

    if (this.game.state.outbreaks >= 8) {
      this.updateLog(
        'The pandemic rages out of control with too many outbreaks to contain. Humanity briefly enjoys its last gasp of breath before joining the dinosaurs in oblivion.'
      );
      this.loseGame('Too many outbreaks');
      return;
    }

    for (let i = 0; i < this.skin.cities[city].neighbours.length; i++) {
      if (!this.outbreaks.includes(this.skin.cities[city].neighbours[i])) {
        msg += this.skin.cities[this.skin.cities[city].neighbours[i]].name + ', ';
        this.addDiseaseCube(this.skin.cities[city].neighbours[i], virus);
        this.skin.animateInfection(this.skin.cities[city].neighbours[i], msg, 0, () => {});
      }
    }
    msg = msg.substr(0, msg.length - 2);
    this.updateLog(msg);
    this.addMove(`ACKNOWLEDGE\t${msg}`); //move
    console.log(JSON.stringify(this.outbreaks));
  }

  addDiseaseCube(city, virus, num = 1) {
    if (num === 0) {
      return;
    }

    if (
      this.quarantine &&
      (this.quarantine === city || this.skin.cities[city].neighbours.includes(this.quarantine))
    ) {
      this.updateLog(
        `Quarantine Specialist blocks new infection in ${this.skin.cities[city].name}`
      );
    } else {
      if (this.game.state.cities[city].virus[virus] == 3) {
        this.updateLog(
          `Additional ${this.skin.getVirusName(virus)} cubes trigger an outbreak in ` +
            this.skin.cities[city].name
        );
        this.triggerOutbreak(city, virus);
      } else {
        this.updateLog(
          this.skin.cities[city].name +
            ` gains ${num} ${this.skin.getVirusName(virus)} cube${num > 1 ? 's' : ''}`
        );
        this.game.state.cities[city].virus[virus] += num;
        this.game.state.active[virus] += num;
        if (this.game.state.active[virus] > 24) {
          this.updateLog(
            `The ${this.skin.getVirusName(
              virus
            )} virus proliferates without check infecting more people than can even be counted. You have failed at containing the global pandemic.`
          );
          this.loseGame(`${this.skin.getVirusName(virus).toUpperCase()} virus beyond control`);
          return;
        }
      }
    }
  }

  drawInfectionCard() {
    let newcard = this.game.deck[0].crypt[0];
    newcard = this.app.crypto.hexToString(newcard);

    this.game.deck[0].discards.push(newcard); // = this.game.deck[0].cards[newcard];
    this.game.deck[0].crypt.splice(0, 1);

    return newcard;
  }

  drawInfectionCardFromBottomOfDeck() {
    let newcard = this.game.deck[0].crypt.pop();
    newcard = this.app.crypto.hexToString(newcard);

    this.game.deck[0].discards.push(newcard); // = this.game.deck[0].cards[newcard];

    this.showBoard();

    return newcard;
  }

  drawPlayerCard() {
    let hex = this.game.deck[1].crypt.shift();
    let newcard = this.app.crypto.hexToString(hex);
    console.log('Draw: (' + hex + ') =  ' + newcard);

    return newcard;
  }

  returnState() {
    var state = {};

    state.outbreaks = 0;
    state.infection_rate = 0;
    state.active_moves = 0;
    state.current_player = 0;
    // events
    state.one_quiet_night = 0;

    // cards
    state.research_stations = ['atlanta'];

    // cures
    state.cures = { blue: false, yellow: false, red: false, black: false };

    // onboard
    state.active = { blue: 0, yellow: 0, red: 0, black: 0 };

    // set initial viral load
    state.cities = {};
    for (var key in this.skin.cities) {
      state.cities[key] = {};
      state.cities[key].virus = { yellow: 0, red: 0, blue: 0, black: 0 };
    }

    return state;
  }

  displayDisease() {
    /*Move the players off the board so they don't get erased
    for (let p of document.querySelectorAll(".player")){
      document.body.appendChild(p);
    }*/

    let cubeCounts = { black: 0, red: 0, yellow: 0, blue: 0 };

    for (var i in this.game.state.cities) {
      let divname = '#' + i + ' > .infectionCubes';
      let width = 100;
      let cubedeath = ''; //html for the cubes
      let cubes = 0;
      let colors = 0;
      let color = '';

      for (let v in this.game.state.active) {
        if (this.game.state.cities[i].virus[v] > 0) {
          colors++;
          if (this.game.state.cities[i].virus[v] >= cubes) {
            color = v;
          }
          cubes += this.game.state.cities[i].virus[v];
          cubeCounts[v] += this.game.state.cities[i].virus[v];
        } else {
          if (this.game.state.cities[i].virus[v] < 0) {
            console.log(`GAME ERROR: ${this.game.state.cities[i].virus[v]} ${v} in ${i}`);
          }
        }
      }

      if (colors > 0) {
        switch (this.game.state.cities[i].virus[color]) {
          case 1:
            cubedeath = `<img class="cube" src="${this.skin.returnDiseaseImg(
              color
            )}" style="top:${this.scale(10)}px;left:${this.scale(15)}px;"/>`;
            break;
          case 2:
            cubedeath = `<img class="cube" src="${this.skin.returnDiseaseImg(
              color
            )}" style="top:${this.scale(0)}px;left:${this.scale(35)}px;"/>
             <img class="cube" src="${this.skin.returnDiseaseImg(
               color
             )}" style="top:${this.scale(10)}px;left:${this.scale(0)}px;"/>`;
            break;
          case 3:
            cubedeath = `<img class="cube" src="${this.skin.returnDiseaseImg(
              color
            )}" style="top:-${this.scale(10)}px;left:${this.scale(35)}px;"/>
             <img class="cube" src="${this.skin.returnDiseaseImg(
               color
             )}" style="top:${this.scale(0)}px;left:${this.scale(0)}px;"/>
             <img class="cube" src="${this.skin.returnDiseaseImg(
               color
             )}" style="top:-${this.scale(30)}px;left:${this.scale(20)}px;"/>`;
            break;
          default:
            console.error('Cube death');
            console.log(cubes);
        }
        if (colors > 1) {
          //multiple colors
          console.log(`Placed ${this.game.state.cities[i].virus[color]} cubes of ${color}`);
          cubes -= this.game.state.cities[i].virus[color];
          console.log(`${cubes} cubes from ${colors - 1} other colors to place`);
          let startTop = 30;
          let startLeft = 30;
          if (cubes > 1) {
            startTop = 20;
            startLeft = 70;
          }
          for (let v in this.game.state.cities[i].virus) {
            console.log(v);
            if (v !== color && this.game.state.cities[i].virus[v] > 0) {
              for (let j = 0; j < this.game.state.cities[i].virus[v]; j++) {
                cubedeath += `<img class="cube" src="${this.skin.returnDiseaseImg(
                  v
                )}" style="top:${this.scale(startTop)}px;left:${this.scale(startLeft)}px;"/>`;
                startLeft -= 40;
                startTop += 10;
              }
            }
          }
        }
      }
      try {
        document.querySelector(divname).innerHTML = cubedeath;
      } catch (err) {
        console.error(err);
        console.log(divname);
      }
    }
    let html = '';
    for (let v in this.game.state.active) {
      if (this.game.state.active[v] !== cubeCounts[v]) {
        salert('--Mismatch in active virus and cubes---' + v + '--');
        console.log('--Mismatch in active virus and cubes---' + v + '--');
        console.log(`${cubeCounts[v]} cubes on board, ${this.game.state.active[v]} in game logic`);
      }
      let threat_level = 'safe';
      if (cubeCounts[v] > 9) threat_level = 'caution';
      if (cubeCounts[v] > 16) threat_level = 'danger';
      html += `<div id="${v}-count" class="scoreboard_virus_group tip">
                <img class="cube" src="${this.skin.returnDiseaseImg(v)}">
                <div class="virus-count ${threat_level}">: ${24 - cubeCounts[v]}</div>
                <div class="tiptext">Don't let this number reach zero!</div>
              </div>`;
    }
    this.scoreboard.update(html);
  }

  definePlayersPawns() {
    let gameboard = document.getElementById('gameboard');
    if (!gameboard) {
      console.error('Gameboard not found');
      return;
    }
    for (let i = 0; i < this.game.players_info.length; i++) {
      let player = document.getElementById(`player${i + 1}`);
      if (!player) {
        console.error('player undefined in DOM');
        return;
      }
      let title = `${this.game.players_info[i].name}`;
      if (this.game.player == i + 1) {
        title += ' (me)';
      }
      player.style.display = 'block';
      player.innerHTML = `${this.game.players_info[i].pawn}<div class="tiptext">${title}</div><div class="move_counter"></div>`;
      gameboard.append(player);
    }
  }

  //To Do: Define more roles
  initializePlayers(num = 1) {
    //Initialize Players
    var players = [];

    for (let i = 0; i < num; i++) {
      players[i] = {};
      players[i].city = 'atlanta';
      players[i].moves = 4;
      players[i].cards = [];
      players[i].type = 1;
    }

    //console.log(this.game.options);

    //Remove specified roles
    let defaultroles = [
      'generalist',
      'scientist',
      'medic',
      'operationsexpert',
      'quarantinespecialist',
      'researcher'
    ];
    let roles = [];
    for (i = 0; i < defaultroles.length; i++) {
      if (this.game.options[defaultroles[i]] == 1) {
        roles.push(defaultroles[i]);
        defaultroles.splice(i, 1);
        i--;
      }
    }

    while (roles.length < num) {
      roles.push(defaultroles.splice(this.rollDice(defaultroles.length) - 1, 1)[0]);
    }

    //Randomly assign other roles and fill in the details
    for (let i = 0; i < num; i++) {
      //Remove role as we randomly select
      let role = roles.splice(this.rollDice(roles.length) - 1, 1)[0];
      Object.assign(players[i], this.skin.queryPlayer(role));
    }
    return players;
  }

  refreshPlayers() {
    for (let i = 0; i < this.game.players_info.length; i++) {
      Object.assign(
        this.game.players_info[i],
        this.skin.queryPlayer(this.game.players_info[i].role)
      );
    }
  }

  /*
  The easy way is to append player div inside the city div with relative positioning to arrange them with disease cubes
  but we will try absolute positioning on the gameboard.
  */
  displayPlayers() {
    for (let i = 0; i < this.game.players_info.length; i++) {
      let divname = `#player${i + 1}`;
      let city = this.game.players_info[i].city;
      let t = this.skin.cities[city].top + 40;
      let l = this.skin.cities[city].left + 32 * i;

      $(divname).css('top', this.scale(t) + 'px');
      $(divname).css('left', this.scale(l) + 'px');
    }
  }

  showBoard() {
    if (this.browser_active == 0) {
      return;
    }
    this.displayDisease();
    this.displayPlayers();
    this.skin.displayInfectionRate(this.game.state.infection_rate);
    this.skin.displayOutbreaks(this.game.state.outbreaks);
    this.skin.displayResearchStations(this.game.state.research_stations);

    this.skin.displayDecks();
    this.skin.displayVials();
  }

  /*Need to overwrite returnCardList because Pandemic stores hands in a public variable, not the internal deck.hand*/
  returnCardList(cardarray = [], cardtype = this.defaultDeck) {
    if (cardarray.length == 0) {
      cardarray = this.game.players_info[this.game.player - 1].cards;
    }
    console.log(JSON.stringify(cardarray));
    return super.returnCardList(cardarray, cardtype);
  }

  returnCardImage(cardname, ctype = this.defaultDeck) {
    if (cardname === 'action_help') {
      return `<img class="cardimg" src="/${this.name.toLowerCase()}/img/${this.skin.actionKey}" />`;
    }
    if (cardname === 'player_role') {
      let player = this.game.players_info[this.game.player - 1];
      return `<img class="cardimg" src="/${this.name.toLowerCase()}/img/${player.card}" />`;
    }

    //console.log(cardname,ctype);
    //console.log(this.game.deck)
    let c = this.game.deck[ctype].cards[cardname];
    if (c == undefined || c == null || c === '') {
      return null;
    }
    let img = ctype == 1 ? this.skin.cards[cardname].img : c.img;
    return `<img class="cardimg" src="/${this.name.toLowerCase()}/img/${img}" />`;
  }

  /* Remove the specified card from the specified player's hand*/
  removeCardFromHand(plyr, card) {
    let player = this.game.players_info[plyr - 1];
    let cards = player.cards;

    if (this.game.player == plyr) {
      this.cardfan.hide();
    }

    for (let i = 0; i < cards.length; i++) {
      if (cards[i] == card) {
        cards.splice(i, 1);
        return;
      }
    }
  }

  returnGameRulesHTML() {
    return PandemicGameRulesTemplate(this.app, this);
  }

  returnAdvancedOptions() {
    return PandemicGameOptionsTemplate(this.app, this);
  }

  returnQuickLinkGameOptions(options) {
    let new_options = {};
    let player1 = '';
    let player2 = '';

    for (var index in options) {
      if (index == 'player1') {
        player1 = options[index];
      }
      if (index == 'player2') {
        player2 = options[index];
      }
    }

    for (var index in options) {
      new_options[index] = options[index];
    }
    new_options['player1'] = player2;
    new_options['player2'] = player1;

    return new_options;
  }

  returnEpidemicOverlay(city) {
    let html = `
      <div class="epidemic_overlay">
        <h1>Epidemic in ${this.skin.cities[city].name}!!!</h1>
        <div class="epidemic-card">
          <img src="/${this.name.toLowerCase()}/img/${this.skin.epidemic.img}"/>
        </div>
        <div class="saito-button-primary close_epidemic_overlay" id="close_epidemic_overlay">close</div>
      </div>
    `;

    return html;
  }

  returnWelcomeOverlay() {
    let html = `<div class="welcome_overlay">`;

    for (let i = 0; i < this.game.players_info.length; i++) {
      let player = this.game.players_info[i];
      let cards_overview = '';
      let deck = player.cards;

      for (let i = 0; i < deck.length; i++) {
        //let city = this.game.deck[1].cards[deck[i]];
        if (i > 0) {
          cards_overview += ', ';
        }
        cards_overview += this.game.deck[1].cards[deck[i]].name;
      }

      html += `
        <div class="player_info_box">
          <div class="player_role_card">
            <img src="/${this.name.toLowerCase()}/img/${player.card}" />
          </div>
          <div class="player_role_description">
            <table>
              <tr>
                <td class="player_role_description_header">Player ${i + 1}: </td>
                <td>${this.app.keychain.returnUsername(this.game.players[i])}</td>
              </tr>
              <tr>
                <td class="player_role_description_header">Role: </td>
                <td>${player.name}</td>
              </tr>
              <tr>
                <td class="player_role_description_header">Description: </td>
                <td>${player.desc}</td>
              </tr>
              <tr>
                <td class="player_role_description_header">Cards: </td>
                <td>${cards_overview}</td>
              </tr>
            </table>
          </div>
        </div>
      `;
    }

    html += `
        <div class="saito-button-primary close_welcome_overlay" id="close_welcome_overlay">Start Playing</div>
      </div>`;

    return html;
  }

  processResignation(resigning_player) {
    this.updateLog(`${resigning_player} quits the game, perhaps they fell ill?`);
    this.removeEvents();

    if (this.game.over > 0) {
      return;
    }

    this.game.over = 2;
    this.saveGame(this.game.id);
    this.triggerGameOver([], 'cancellation');
  }
}

module.exports = Pandemic;
