/**********************************************************************************
 *
 * GAME ELEMENTS: BOARD, DICE, CARDS
 *
 * This file contains:
 *
 * 1) some utility functions for scaling games that rely on a game board
 * 2) random dice operations
 * 3) all card-related functions, such as returning cards or
 * calculating their width/height, etc.
 *
 *
 *********************************************************************************/

class GameCards {
  /***********************************************************************************************************
   * Some game modules place elements directly on the board, but when we resize the board (to fit the screen).
   * need to remember the scale ratio in order for the board elements to move with the board
   */
  scale(x) {
    let y = Math.floor(this.boardRatio * x);
    return y;
  }

  //
  // screen ratio (for determining scaling)
  //
  calculateBoardRatio() {
    try {
      const board = this.getBoardElement();
      if (board && this.boardWidth) {
        //Only needed for gameTemplate.scale, for putting game pieces on a game board
        this.boardRatio = board.getBoundingClientRect().width / this.boardWidth;
      }
    } catch (err) {
      console.error(`GT [calculateBoardRatio] ERROR: `, err);
    }
  }

  getBoardElement() {
    const hex = document.getElementById('hexGrid');
    if (hex && !hex.classList.contains('game-minimap-clone') && !hex.closest('.game-minimap')) {
      return hex;
    }
    return document.querySelector('.gameboard:not(.game-minimap-clone):not(.gameboard-clone)');
  }

  prepareBoard(el) {
    el.style.position = 'fixed';
    el.style.margin = '0';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.zIndex = '1';
    el.style.transformOrigin = 'top left';
  }

  boardDocumentOffset(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }

  saveBoardDocumentOffset(el) {
    if (this.remember_board_position === false) {
      return;
    }
    this.saveGamePreference(this.returnSlug() + '-board-offset', this.boardDocumentOffset(el));
  }

  // left/top are viewport coordinates of the visual top-left.
  boardOffsetInWindow(left, top, visualW, visualH) {
    if (left == null || top == null || !(visualW > 0) || !(visualH > 0)) {
      return false;
    }
    const ix = Math.min(left + visualW, window.innerWidth) - Math.max(left, 0);
    const iy = Math.min(top + visualH, window.innerHeight) - Math.max(top, 0);
    return ix > 160 && iy > 160;
  }

  boardFillsView(el) {
    if (!el) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return this.boardOffsetInWindow(r.left, r.top, r.width, r.height);
  }

  // The grid box is much larger than the sectors. A corner of that box can
  // sit in the window while every sector is off-screen.
  boardShowsSectors(el) {
    if (!el) {
      return false;
    }
    const nodes = el.querySelectorAll('.sector');
    if (!nodes.length) {
      return this.boardFillsView(el);
    }
    for (let i = 0; i < nodes.length; i++) {
      const r = nodes[i].getBoundingClientRect();
      const ix = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      const iy = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (ix > 48 && iy > 48) {
        return true;
      }
    }
    return false;
  }

  moveBoardTo(el, viewLeft, viewTop) {
    this.prepareBoard(el);
    el.style.left = viewLeft + 'px';
    el.style.top = viewTop + 'px';
  }

  placeBoardInWindow(el) {
    if (!el) {
      el = this.getBoardElement();
    }
    if (!el) {
      return;
    }
    this.prepareBoard(el);
    const r = el.getBoundingClientRect();
    const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const visualW = el.offsetWidth * scale;
    const visualH = el.offsetHeight * scale;
    el.style.left = (window.innerWidth - visualW) / 2 + 'px';
    el.style.top = (window.innerHeight - visualH) / 2 + 'px';
    this.saveBoardDocumentOffset(el);
  }

  ensureBoardVisible() {
    const el = this.getBoardElement();
    if (!el || this.boardShowsSectors(el)) {
      return;
    }
    const scaled = el.offsetWidth && el.getBoundingClientRect().width / el.offsetWidth > 1.05;
    if (!scaled && this.default_board_scale) {
      this.setBoardScale(this.default_board_scale, false);
    }
    if (!this.boardShowsSectors(el)) {
      this.placeBoardInWindow(el);
    }
  }

  getBoardBackdrop() {
    return '';
  }

  getBoardState() {
    const el = this.getBoardElement();
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    const bg = window.getComputedStyle(el).backgroundImage;
    const m = bg && bg !== 'none' ? bg.match(/url\(["']?(.*?)["']?\)/) : null;
    return {
      el,
      width: el.offsetWidth,
      height: el.offsetHeight,
      scale: el.offsetWidth ? r.width / el.offsetWidth : 1,
      x: r.left,
      y: r.top,
      image: m ? m[1] : ''
    };
  }

  setBoardPosition(x, y) {
    const el = this.getBoardElement();
    if (!el) {
      return;
    }
    this.moveBoardTo(el, x, y);
    this.saveBoardDocumentOffset(el);
  }

  setBoardScale(scale, save = true) {
    const el = this.getBoardElement();
    if (!el) {
      return;
    }
    scale = Math.max(2, Math.min(200, Math.round(Number(scale) || 100)));

    this.prepareBoard(el);

    const before = el.getBoundingClientRect();
    const oldScale = el.offsetWidth ? before.width / el.offsetWidth : 0;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const bx = oldScale ? (cx - before.left) / oldScale : 0;
    const by = oldScale ? (cy - before.top) / oldScale : 0;

    el.style.transform = `scale(${scale / 100})`;

    if (oldScale) {
      const newScale = scale / 100;
      el.style.left = cx - bx * newScale + 'px';
      el.style.top = cy - by * newScale + 'px';
    }

    if (save) {
      this.saveGamePreference(this.returnSlug() + '-board-scale', scale);
      this.saveBoardDocumentOffset(el);
    }
    const input = document.querySelector('#game_board_sizer input');
    if (input) {
      input.value = scale;
      let minZoom = parseFloat(input.min) || 2;
      let maxZoom = parseFloat(input.max) || 200;
      let progress = ((scale - minZoom) / (maxZoom - minZoom)) * 100;
      input.style.setProperty('--board-scale-progress', `${Math.max(0, Math.min(100, progress))}%`);
    }
  }

  centerBoard() {
    const el = document.getElementById('hexGrid') || this.getBoardElement();
    if (!el) {
      return;
    }

    const boardWidth = el.offsetWidth;
    const boardHeight = el.offsetHeight;
    if (!boardWidth || !boardHeight) {
      return;
    }

    let scale = Math.floor(
      100 * Math.min(window.innerWidth / boardWidth, window.innerHeight / boardHeight)
    );
    this.setBoardScale(scale, false);
    this.placeBoardInWindow(el);
    this.saveGamePreference(this.returnSlug() + '-board-scale', scale);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  DICE  /////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////////////////////

  initializeDice() {
    if (this.game.dice === '') {
      if (!this.game.id) {
        this.game.id = this.app.crypto.hash(new Date().getTime() + '');
      }
      this.game.dice = this.app.crypto.hash(this.game.id);
    }
  }

  rollDice(sides = 6, mycallback = null) {
    this.game.dice = this.app.crypto.hash(this.game.dice);
    let a = parseInt(this.game.dice.slice(0, 12), 16) % sides;
    if (mycallback != null) {
      mycallback(a + 1);
    } else {
      return a + 1;
    }
  }

  //
  // requests generation of a secure random number for all
  // subsequent rolls.
  //
  requestSecureRoll() {
    this.game.sroll = 1;
  }

  returnDiceImage(roll) {
    let html = '';

    html += `<span class="die">`;
    switch (roll) {
      case 1:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/>
                    <circle fill="white" cx="100" cy="100" r="25"/></svg>`;
        break;
      case 2:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/>
                    <circle fill="white" cx="66" cy="66" r="25"/>
                    <circle fill="white" cx="133" cy="133" r="25"/></svg>`;
        break;
      case 3:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/>
                    <circle fill="white" cx="50" cy="50" r="25"/>
                    <circle fill="white" cx="100" cy="100" r="25"/>
                    <circle fill="white" cx="150" cy="150" r="25"/></svg>`;
        break;
      case 4:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/>
                    <circle fill="white" cx="55" cy="55" r="25"/>
                    <circle fill="white" cx="55" cy="145" r="25"/>
                    <circle fill="white" cx="145" cy="55" r="25"/>
                    <circle fill="white" cx="145" cy="145" r="25"/></svg>`;
        break;
      case 5:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/>
                    <circle fill="white" cx="50" cy="50" r="25"/>
                    <circle fill="white" cx="50" cy="150" r="25"/>
                    <circle fill="white" cx="100" cy="100" r="25"/>
                    <circle fill="white" cx="150" cy="50" r="25"/>
                    <circle fill="white" cx="150" cy="150" r="25"/></svg>`;
        break;
      case 6:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/>
                  <circle fill="white" cx="55" cy="40" r="25"/>
                  <circle fill="white" cx="55" cy="100" r="25"/>
                  <circle fill="white" cx="55" cy="160" r="25"/>
                  <circle fill="white" cx="145" cy="40" r="25"/>
                  <circle fill="white" cx="145" cy="100" r="25"/>
                  <circle fill="white" cx="145" cy="160" r="25"/></svg>`;
        break;
      default:
        html += `<svg viewbox="0 0 200 200"><rect fill="red" width="200" height="200" rx="25"/></svg>`;
    }
    html += `</span>`;
    return html;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////  CARDS  ////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////////////////////

  isFaceDown(card) {
    return false;
  }

  returnCardHeight(card_width = 1) {
    return card_width * this.card_height_ratio;
  }

  returnCardList(cardarray = [], deckid = 0) {
    if (cardarray.length === 0) {
      cardarray = this.game.deck[deckid].hand; //Keys to the deck object
    }

    if (cardarray.length === 0) {
      console.warn('GT: No cards to render...');
      return '';
    }

    let html = '';
    if (this.interface === 2) {
      //text
      for (let i = 0; i < cardarray.length; i++) {
        html += this.returnCardItem(cardarray[i], deckid);
      }
      return html;
    } else {
      for (let i = 0; i < cardarray.length; i++) {
        html += `<div id="${cardarray[i]}" class="card ${cardarray[i]}">${this.returnCardImage(
          cardarray[i],
          deckid
        )}</div>`;
      }
      return html;
    }
  }

  returnCardItem(card, deckid = 0) {
    card = card.replace(/ /g, '').toLowerCase();
    let c = this.game.deck[deckid].cards[card];

    //Fallback (try discard/remove piles and other decks if card not found)
    for (let z = 0; c == undefined && z < this.game.deck.length; z++) {
      c = this.game.deck[z].cards[cardname];
      if (c == undefined) {
        c = this.game.deck[z].discards[cardname];
      }
      if (c == undefined) {
        c = this.game.deck[z].removed[cardname];
      }
    }

    if (c) {
      return `<li class="card" id="${card}">${c.name}</li>`;
    } else {
      return `<li class="card noncard" id="${card}">card not found</li>`;
    }
  }

  returnCardImage(cardname, deckid = null) {
    let c = null;
    if (deckid == null) {
      for (let i = 0; i < this.game.deck.length; i++) {
        c = this.game.deck[i].cards[cardname];
        if (c) {
          deckid = i;
          break;
        }
      }
    }

    if (c == null) {
      for (let z = 0; c == null && z < this.game.deck.length; z++) {
        c = this.game.deck[z].cards[cardname];
        if (c == undefined) {
          c = this.game.deck[z].discards[cardname];
        }
        if (c == undefined) {
          c = this.game.deck[z].removed[cardname];
        }
      }
    }

    //
    // this is not a card, it is something like "skip turn" or cancel
    //
    if (c == null) {
      // if this is an object, it might have a returnCardImage() function attached
      // that will give us what we need. try before bailing.
      if (typeof cardname === 'object' && !Array.isArray(cardname) && cardname != null) {
        if (cardname.returnCardImage != null) {
          let x = cardname.returnCardImage();
          if (x) {
            return x;
          }
        }
      }
      return '<div class="noncard">' + cardname + '</div>';
    }

    if (typeof c === 'string') {
      cardname = c;
      c = this.card_library[cardname];
    }

    let suggested_img = this.returnSlug() + '/img/';
    if (c.img?.indexOf(suggested_img) != -1) {
      return `<img class="cardimg" id="${cardname}" src="${c.img}" />`;
    }
    return `<img class="cardimg" id="${cardname}" src="/${this.returnSlug()}/img/${c.img}" />`;
  }

  //
  // returns discarded cards and removes them from discard pile
  //
  returnDiscardedCards(deckidx = 1) {
    var discarded = {};
    deckidx = parseInt(deckidx - 1);

    for (var i in this.game.deck[deckidx].discards) {
      discarded[i] = this.game.deck[deckidx].cards[i];
      delete this.game.deck[deckidx].cards[i];
    }

    this.game.deck[deckidx].discards = {};

    return discarded;
  }

  removeCardFromHand(card, moveToDiscard = false) {
    for (let z = 0; z < this.game.deck.length; z++) {
      for (i = 0; i < this.game.deck[z].hand.length; i++) {
        if (this.game.deck[z].hand[i] === card) {
          if (moveToDiscard) {
            this.game.deck[z].discards[card] = this.game.deck[z].cards[card];
          }
          this.game.deck[z].hand.splice(i, 1);
          return;
        }
      }
    }
  }

  /**
   * Convert a hand (array of cards) to the html hand
   */
  handToHTML(hand) {
    let html = "<div class='htmlCards'>";
    hand.forEach((card) => {
      html += `<img class="card" src="${this.card_img_dir}/${card}.png">`;
    });
    html += '</div> ';
    return html;
  }

  shuffleDeck(deckidx = 1) {
    let new_cards = [];
    let new_keys = [];

    //
    // async_dealing the keys array won't contain keys to unlock
    // the cards, so we make sure the arrays are the same length
    // before shuffling to avoid errors.
    //
    if (this.async_dealing == 1) {
      if (!this.game.deck[deckidx - 1].keys) {
        this.game.deck[deckidx - 1].keys = [];
      }
      while (this.game.deck[deckidx - 1].keys.length < this.game.deck[deckidx - 1].crypt.length) {
        this.game.deck[deckidx - 1].keys.push('');
      }
    }

    let old_crypt = this.game.deck[deckidx - 1].crypt;
    let old_keys = this.game.deck[deckidx - 1].keys;

    let total_cards = this.game.deck[deckidx - 1].crypt.length;
    let total_cards_remaining = total_cards;

    for (let i = 0; i < total_cards; i++) {
      // never zero, so subtract 1
      let random_card = this.rollDice(total_cards_remaining) - 1;

      new_cards.push(old_crypt[random_card]);
      new_keys.push(old_keys[random_card]);

      old_crypt.splice(random_card, 1);
      old_keys.splice(random_card, 1);

      total_cards_remaining--;
    }

    this.game.deck[deckidx - 1].crypt = new_cards;
    this.game.deck[deckidx - 1].keys = new_keys;
  }

  addPool() {
    let newIndex = this.game.pool.length;
    this.resetPool(newIndex);
  }
  addDeck() {
    let newIndex = this.game.deck.length;
    this.resetDeck(newIndex);
  }
  resetPool(newIndex = 0) {
    this.game.pool[newIndex] = {};
    this.game.pool[newIndex].cards = {};
    this.game.pool[newIndex].crypt = [];
    this.game.pool[newIndex].keys = [];
    this.game.pool[newIndex].hand = [];
    this.game.pool[newIndex].decrypted = 0;
  }
  resetDeck(newIndex = 0) {
    let old_xor = this.game.deck[newIndex]?.xor;
    let old_add = this.game.deck[newIndex]?.to_add;
    let old_remove = this.game.deck[newIndex]?.to_remove;
    this.game.deck[newIndex] = {};
    this.game.deck[newIndex].cards = {};
    this.game.deck[newIndex].crypt = [];
    this.game.deck[newIndex].keys = [];
    this.game.deck[newIndex].hand = [];
    this.game.deck[newIndex].xor = old_xor || '';
    this.game.deck[newIndex].to_add = old_add || {};
    this.game.deck[newIndex].to_remove = old_remove || {};
    this.game.deck[newIndex].discards = {};
    this.game.deck[newIndex].removed = {};
  }
  addCardToDeck(deckidx, key, card) {
    while (this.game.deck.length < deckidx) {
      this.addDeck();
    }
    this.game.deck[deckidx - 1].to_add[key] = card;
  }
  removeCardFromDeck(deckidx, key) {
    while (this.game.deck.length < deckidx) {
      this.addDeck();
    }
    this.game.deck[deckidx - 1].to_remove[key] = 1; // key is what matters
  }

  newDeck() {
    let deck = {};
    deck.cards = {};
    deck.crypt = [];
    deck.keys = [];
    deck.hand = [];
    deck.to_add = {};
    deck.to_remove = {};
    deck.xor = '';
    deck.discards = {};
    deck.removed = {};
    return deck;
  }

  returnPokerDeck() {
    const deck = {};
    const suits = ['S', 'C', 'H', 'D'];
    let indexCt = 1;
    for (let i = 0; i < 4; i++) {
      for (let j = 1; j <= 13; j++) {
        let cardImg = `${suits[i]}${j}`;
        deck[indexCt.toString()] = {
          name: cardImg
        }; /*need to make this shit consistent*/
        indexCt++;
      }
    }
    return deck;
  }
}

module.exports = GameCards;
