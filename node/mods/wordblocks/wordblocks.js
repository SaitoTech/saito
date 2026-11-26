const GameTemplate = require('../../lib/templates/gametemplate');
const WordblocksGameRulesTemplate = require('./lib/wordblocks-game-rules.template');
const WordblocksGameOptionsTemplate = require('./lib/wordblocks-game-options.template');
const MainTemplate = require('./lib/ui/main.template');
const WordblocksHUD = require('./lib/ui/hud');
const WordblocksPlayers = require('./lib/ui/players');
const WordblocksPlay = require('./lib/ui/play');
const GameMinimap = require('../../lib/saito/ui/game-minimap/game-minimap');

class Wordblocks extends GameTemplate {
	constructor(app) {
		super(app);

		this.wordlist = [];
		this.score = '';
		this.app = app;
		this.icon = 'fa-solid fa-braille';

		this.name = 'Wordblocks';
		this.slug = 'wordblocks';
		this.description = `A crossword puzzle game with customizable dictionary (language) options. Players take turns moving tiles from their rack to the board to spell out words. `;
		this.categories = 'Games Boardgame Classic';
		this.status = 'prod';
		this.class = 'app';
		//
		// Game Class VARS
		//
		this.minPlayers = 2;
		this.maxPlayers = 4;

		this.boardWidth = 1000;
		this.tileHeight = 163;
		this.tileWidth = 148;
		this.letters = {};
		this.grace_window = 10;
		this.insert_rankings = true;

		/*this.clock.useShotClock = true;*/

		//All Wordblocks games will be async enabled
		this.async_dealing = 1;
		this.can_play_async = 1;

		this.tilesToHighlight = [];
		this.moves = [];
		this.firstmove = 1;
		this.last_played_word = [];
		this.loadingDictionary = null; //a flag that we are loading the dictionary in the background

		this.defaultMsg = 'Select a tile, place it on the board, then press Play word.';

		this.clock.container = '#clock_';

		this.hud = new WordblocksHUD(app, this);
		this.players = new WordblocksPlayers(app, this);
		this.playerbox = this.players;
		this.play = new WordblocksPlay(app, this);
		this.minimap = new GameMinimap(app, this);
		this.minimap.enable_zoom = 1;

		return this;
	}

	async render(app) {
		if (!this.browser_active) {
			return;
		}
		if (this.initialize_game_run) {
			return;
		}
		await this.injectGameHTML(MainTemplate());
		await super.render(app);

		this.menu.addMenuOption('game-game', 'Game');
		this.menu.addSubMenuOption('game-game', {
			text: 'How to Play',
			id: 'game-intro',
			class: 'game-intro',
			callback: function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				game_mod.overlay.showClosable(game_mod.returnGameRulesHTML());
			}
		});
		this.menu.addSubMenuOption('game-game', {
			text: 'Stats',
			id: 'game-stats',
			class: 'game-stats',
			callback: function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				game_mod.overlay.showClosable(game_mod.returnStatsOverlay());
			}
		});
		this.menu.addSubMenuOption('game-game', {
			text: 'Log',
			id: 'game-log',
			class: 'game-log',
			callback: function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				game_mod.log.toggleLog();
			}
		});
		this.menu.addChatMenu();
		this.menu.render();
		this.log.render();

		this.players.render();
		this.hud.container = '#wb-hud-dock';
		this.hud.render();
		this.paintBoard();
		this.play.render();
		if (this.minimap) {
			this.minimap.render();
		}
		if (this.play && this.play.armBoardDrag) {
			this.play.armBoardDrag();
		}
		this.centerBoard();
	}

	getBoardBackdrop() {
		return '';
	}

	syncBoardMap() {
		if (this.minimap && this.browser_active && typeof document !== 'undefined') {
			this.minimap.render();
		}
	}

	stageRect() {
		let stage = typeof document !== 'undefined' ? document.querySelector('.wb-stage') : null;
		if (stage) {
			let box = stage.getBoundingClientRect();
			if (box.width > 160 && box.height > 160) {
				return {
					left: box.left + 4,
					top: box.top + 4,
					width: Math.max(160, box.width - 8),
					height: Math.max(160, box.height - 8)
				};
			}
		}
		return this.playfieldRect();
	}

	fitScale() {
		const el = this.getBoardElement();
		if (!el || !el.offsetWidth || !el.offsetHeight) {
			return 100;
		}
		const stage = this.stageRect();
		let scale = Math.floor(100 * Math.min(stage.width / el.offsetWidth, stage.height / el.offsetHeight));
		return Math.max(2, Math.min(200, scale));
	}

	playfieldRect() {
		let top = 8;
		let left = 8;
		let right = 8;
		let bottom = 8;
		let header = document.querySelector('#saito-header');
		if (header) {
			let box = header.getBoundingClientRect();
			if (box.bottom > 0) {
				top = Math.max(top, box.bottom + 8);
			}
		}
		let rail = document.querySelector('.wb-rail');
		let dock = document.querySelector('.wb-dock');
		let narrow = window.innerWidth < 900 || window.innerHeight < 560;
		if (rail) {
			let box = rail.getBoundingClientRect();
			if (narrow) {
				top = Math.max(top, box.bottom + 8);
			} else if (box.right > 0) {
				left = Math.max(left, box.right + 8);
			}
		}
		if (dock) {
			let box = dock.getBoundingClientRect();
			if (box.top > 0 && box.top < window.innerHeight) {
				bottom = Math.max(bottom, window.innerHeight - box.top + 8);
			}
		}
		return {
			left,
			top,
			width: Math.max(160, window.innerWidth - left - right),
			height: Math.max(160, window.innerHeight - top - bottom)
		};
	}

	// The shared minimap places a board point at the centre of the window.
	// Shift that point into the centre of the open table, and leave a board
	// that already fits the table where centerBoard put it.
	playfieldAnchor(x, y, board) {
		const stage = this.stageRect();
		const scale = board && board.scale ? board.scale : 1;
		const width = board && board.width ? board.width : 0;
		const height = board && board.height ? board.height : 0;
		const viewW = window.innerWidth / scale;
		const viewH = window.innerHeight / scale;
		if (width && height && viewW >= width - 1 && viewH >= height - 1) {
			return {
				left: stage.left + (stage.width - width * scale) / 2,
				top: stage.top + (stage.height - height * scale) / 2
			};
		}
		return {
			left: x + stage.left + stage.width / 2 - window.innerWidth / 2,
			top: y + stage.top + stage.height / 2 - window.innerHeight / 2
		};
	}

	setBoardPosition(x, y) {
		const el = this.getBoardElement();
		if (!el) {
			return;
		}
		const anchor = this.playfieldAnchor(x, y, this.getBoardState());
		this.moveBoardTo(el, anchor.left, anchor.top);
		this.saveBoardDocumentOffset(el);
	}

	setBoardScale(scale, save = true) {
		const el = this.getBoardElement();
		if (!el) {
			return;
		}
		scale = Math.max(2, Math.min(200, Math.round(Number(scale) || 100)));
		this.prepareBoard(el);
		const stage = this.stageRect();
		const before = el.getBoundingClientRect();
		const oldScale = el.offsetWidth ? before.width / el.offsetWidth : 0;
		const cx = stage.left + stage.width / 2;
		const cy = stage.top + stage.height / 2;
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
	}

	centerBoard() {
		const el = this.getBoardElement();
		if (!el) {
			return;
		}
		const boardWidth = el.offsetWidth;
		const boardHeight = el.offsetHeight;
		if (!boardWidth || !boardHeight) {
			return;
		}
		const stage = this.stageRect();
		let scale = this.fitScale();
		this.prepareBoard(el);
		el.style.transform = `scale(${scale / 100})`;
		const visualW = boardWidth * (scale / 100);
		const visualH = boardHeight * (scale / 100);
		el.style.left = stage.left + (stage.width - visualW) / 2 + 'px';
		el.style.top = stage.top + (stage.height - visualH) / 2 + 'px';
		this.saveGamePreference(this.returnSlug() + '-board-scale', scale);
		this.saveBoardDocumentOffset(el);
		if (this.play && this.play.placeHud) {
			this.play.placeHud();
		}
	}

	paintBoard() {
		if (!this.game?.board || typeof $ === 'undefined') {
			return;
		}
		for (var i in this.game.board) {
			let divname = '#' + i;
			let letter = this.game.board[i].letter;
			let already = $(divname).hasClass('set');
			this.addTile($(divname), letter);
			if (!(letter == '_') && !(letter == '')) {
				try {
					if (this.game.state && this.game.state.newLetters && this.game.state.newLetters.includes(i)) {
						$(divname).addClass('new');
					}
					if (!already) {
						$(divname).addClass('set');
						if (this.letters[letter]) {
							this.letters[letter].count--;
						}
					}
				} catch (err) {}
			}
		}
		this.syncBoardMap();
	}

	returnGameRulesHTML() {
		return WordblocksGameRulesTemplate(this.app, this);
	}

	returnMath(play) {
		let sum = 0;
		let html = `<div class="score-overlay"><table>
              <thead><tr><td>Word</td><td>Calculation</td><td>Points</td></tr></thead><tbody>`;
		for (let word of play) {
			html += `<tr><td>${word.word}</td><td>${word.math}</td><td>${word.score}</td></tr>`;
			sum += word.score;
		}

		html += `</tbody><tfoot><tr><td colspan="3"><hr></td></tr><tr><td>Total:</td><td></td><td>${sum}</td></tr></tfoot></table></div>`;
		return html;
	}

	returnStatsOverlay() {
		let html = `<div class="stats-overlay"><table cellspacing="10px" rowspacing="10px"><tr><th>Round</th>`;
		for (let i = 0; i < this.game.opponents.length + 1; i++) {
			html += `<th colspan="2">${this.game.playerNames[i]}</th>`;
		}

		let totals = new Array(this.game.opponents.length + 1); //Each players total...
		totals.fill(0);
		//console.log(this.game.opponents);
		for (let z = 0; z < this.game.words_played[0].length; z++) {
			html += `</tr><tr><td class="center_align">${z + 1}</td>`;
			for (let i = 0; i < this.game.opponents.length + 1; i++) {
				//totals.push(0); //Initialize
				//let words_scored_html = '<table>';
				if (this.game.words_played[i][z] != undefined) {
					html +=
						'<td>' +
						this.game.words_played[i][z].word +
						'</td><td class="right_align">' +
						this.game.words_played[i][z].score +
						'</td>';
					totals[i] += this.game.words_played[i][z].score;
				}
			}
			//words_scored_html += '</table>';
			//html += `<td>${words_scored_html}</td>`;
		}
		//console.log(totals);
		html += '</tr><tr><td colspan="10"><hr></td></tr><tfoot><tr><td>Totals</td>';
		for (let total of totals) {
			html += `<td colspan="2" class="right_align">${total}</td>`;
		}
		html += '</tr></tfoot></table></div>';
		return html;
	}

	respondTo(type, obj = null) {
		switch (type) {
			case 'ntfy-notification':
				if (obj.tx?.msg?.module != 'Wordblocks') {
					return null;
				}

				let tx = obj.tx;
				let notification = obj.notification;

				//Add from.
				let from = this.app.keychain.returnIdentifierByPublicKey(tx.from[0].publicKey, true);

				notification.title = 'Saito Wordblocks';

				notification.tags = ['game', 'turn'];

				switch (tx.msg.request) {
					case 'join':
						notification.message = from + ' has joined your Wordblocks Game.\n';
						break;

					case 'game':
						notification.message = from + ' has played.\n';
						break;
				}

				let url = `${this.app.server.server.url}/${this.returnSlug()}/`;
				url += `#gid=${encodeURIComponent(tx.msg.game_id)}`;

				notification.actions = [{ action: 'view', label: 'Play', url }];
				return notification;

			default:
				return super.respondTo(type, obj);
		}
	}

	initializeGame(game_id) {
		this.game.playerNames = [];
		for (let i = 0; i < this.game.players.length; i++) {
			this.game.playerNames.push(this.app.keychain.returnUsername(this.game.players[i]));
		}

		//
		// deal cards
		//
		if (this.game.deck.length == 0 && this.game.step.game == 0) {
			//Set a flag to keep processing moves until ready for gameover state
			this.game.canProcess = false;

						this.game.status = 'Generating the Game';
			this.hud.updateStatus(this.game.status);
			this.hud.updateMenu([]);
			this.hud.updateCards([]);
			this.game.queue = [];
			this.game.queue.push('READY');
			for (let i = this.game.players.length; i > 0; i--) {
				this.game.queue.push(`DEAL\t1\t${i}\t7`);
			}
			this.game.queue.push('SHUFFLE\t1');
			for (let i = this.game.players.length; i > 0; i--) {
				this.game.queue.push(`DECKENCRYPT\t1\t${i}`);
			}
			for (let i = this.game.players.length; i > 0; i--) {
				this.game.queue.push(`DECKXOR\t1\t${i}`);
			}
			this.game.queue.push('DECK\t1\t' + JSON.stringify(this.returnDeck()));
		}

		this.getPlayerScore(0); //initialize playerscore variable if not already existing
		this.getLastMove(0); //initialize lastmove variable if not already existing

		this.letters = this.returnLetters();

		//
		// stop here if initializing
		//
		if (/*this.game.initializing == 1 ||*/ !this.gameBrowserActive()) {
			return;
		}

		console.log('InitializeGame Checkpoint');

		// To do... if playing Worblocks in Spanish and SOWPODS, need to be able to swap...
		if (this.wordlist == '') {
			//TODO -- Dynamically read letter tiles so wordblocks can more easily add new languages
			try {
				var dictionary = this.game.options.dictionary;
				let durl = '/wordblocks/dictionaries/' + dictionary + '/' + dictionary + '.json';
				let xhr = new XMLHttpRequest();
				xhr.open('GET', durl, true); //true -> async
				xhr.responseType = 'json'; //only in async
				xhr.send();
				this.loadingDictionary = true; //flag that the game module is processing xhr
				xhr.onload = () => {
					if (xhr.status != 200) {
						salert(`Network issues downloading dictionary -- ${durl}`);
					} else {
						this.loadingDictionary = false;
						this.wordlist = xhr.response; //;Array.from(JSON.parse(xhr.response));
						//console.log("\n\n\nDOWNLOADED WORDLIST: " + JSON.parse(JSON.stringify(xhr.response)));
						//console.log("My word list is a :", typeof this.wordlist);
						this.restartQueue();
					}
				};
			} catch (err) {
				// instead of onerror
				console.error(err);
				salert('Network issues downloading dictionary, error caught');
			}
		}

		if (!this.game.state) {
			this.game.state = {};
			this.game.state.newLetters = [];
		}

		//
		// load any existing tiles
		//
		if (this.game.board == undefined) {
			//
			// new board
			//
			this.game.board = this.returnBoard();
		}

		this.paintBoard();

		//
		// has a move been made
		//
		for (let i = 1; i < 16; i++) {
			for (let k = 1; k < 16; k++) {
				let boardslot = i + '_' + k;
				if (this.game.board[boardslot].letter != '_') {
					this.firstmove = 0;
				}
			}
		}

		/*This starts the game*/
		console.log('Initialize Game, Queue:', this.game.queue);

		if (this.game.queue.length == 0) {
			if (this.game.target == this.game.player) {
				this.updateStatusWithTiles('YOUR GO! ' + this.defaultMsg);
				this.setPlayerActive();
				this.enableEvents();
			} else {
				this.updateStatusWithTiles(`Waiting on ${this.game.playerNames[this.game.target - 1]}`);
			}
		}

		if (this.players) {
			this.players.render();
		}
		$('.score.active').removeClass('active');
		this.playerbox.setActive(this.game.target);
		$(`#mobile_score_${this.game.target}`).addClass('active');

		if (this.game.players.length > 2) {
			this.grace_window = this.game.players.length * 8;
		}
	}

	/*
  A utility function to return the given players score with ample validity checking and dynamic creation of property
  */
	getPlayerScore(player) {
		if (this.game.score == undefined) {
			this.game.score = [];
			for (let i = 0; i < this.game.players.length; i++) {
				this.game.score[i] = 0;
			}
			return 0;
		} else {
			if (player >= 1 && player <= this.game.players.length) {
				return this.game.score[player - 1];
			}
		}
		return 0;
	}

	/*
  A utility function to return the given players last played word with ample validity checking and dynamic creation of property
  */
	getLastMove(player) {
		if (this.game.words_played == undefined) {
			this.game.words_played = [];
			for (let i = 0; i < this.game.players.length; i++) {
				this.game.words_played[i] = [];
			}
		} else {
			if (player >= 1 && player <= this.game.players.length) {
				let playersMoves = this.game.words_played[player - 1];
				if (playersMoves.length > 0) {
					return playersMoves[playersMoves.length - 1];
				}
			}
		}
		return { word: '', score: 0 };
	}

	updateStatusWithTiles(status) {
		let text = String(status || '').replace(/<[^>]+>/g, '');
		let turnNotice = /your go|waiting|['’]s turn|peers/i.test(text);
		let html = turnNotice ? '' : `<div class="wb-status-line">${text}</div>`;
		this.game.status = html;
		if (this.browser_active && this.hud) {
			this.hud.updateStatus(html);
			this.hud.updateMenu([]);
			this.hud.updateCards([]);
		}
		if (this.gameBrowserActive() && this.play) {
			this.play.renderRack();
			this.play.renderControls();
			if (this.game.player === this.game.target) {
				this.play.enable();
			}
		}
		if (this.players) {
			this.players.refreshStatus();
		}
	}

	returnTileHTML(letter) {
		let html = '';
		let letterScore = this.returnLetters();
		if (letterScore[letter]) {
			//html =`<div class="tile ${letter} sc${letterScore[letter].score}">${letter}</div>`;
			html = `<div class="tile sc${letterScore[letter].score}"><div class="letter">${letter}</div></div>`;
		}
		return html;
	}

	addTile(obj, letter) {
		obj.find('.tile').remove();
		if (letter !== '_') {
			obj.find('.bonus').css('display', 'none');
			obj.append(this.returnTileHTML(letter));
		} else {
			obj.find('.bonus').css('display', 'flex');
		}
	}

	/*
  Basic events for all players to interact with their hud even when not their turn
  */
	limitedEvents() {
		if (this.play) {
			this.play.bindAlways();
		}
	}

	removeEvents() {
		let board = typeof document !== 'undefined' ? document.getElementById('gameboard') : null;
		if (board) {
			board.classList.remove('active_board');
		}
	}

	enableEvents() {
		if (this.gameBrowserActive() && this.play) {
			this.play.enable();
		}
	}

	clearBoard() {
		if (typeof document === 'undefined') {
			return;
		}
		document.querySelectorAll('.tile-submit-controls').forEach((el) => el.remove());
		let helper = document.getElementById('helper');
		if (helper) {
			helper.remove();
		}
		let root = document.getElementById('gameboard');
		if (!root || !this.game?.board) {
			return;
		}
		let playedTiles = root.querySelectorAll('.tempplacement');
		for (let t of playedTiles) {
			if (this.game.board[t.parentElement.id]) {
				this.game.board[t.parentElement.id].letter = '_';
			}
			let bonus = t.parentElement.querySelector('.bonus');
			if (bonus) {
				bonus.style.display = '';
			}
			let rack = document.getElementById('tiles');
			if (rack) {
				rack.appendChild(t);
			}
			t.classList.remove('tempplacement');
		}
		this.syncBoardMap();
	}

	/*
  Scan for the board to find a consecutive arrangement of temporary tiles
  Returns: Word, orientation, x, y (of starting square)
*/
	readWordFromBoard() {
		let playedTiles = document.querySelectorAll('#gameboard .slot .tempplacement');
		let minx = 16,
			miny = 16,
			maxx = 0,
			maxy = 0;
		let word = '';
		let orientation = '';
		let fail = false;

		if (playedTiles.length === 1) {
			let [r, c] = playedTiles[0].parentElement.id.split('_');
			minx = parseInt(r);
			miny = parseInt(c);
			//console.log(`1 tile at ${r}_${c}`);
			({ word, miny, minx } = this.expandWord(r, c, 'horizontal'));
			if (word.length > 1) {
				orientation = 'horizontal';
				return [word, orientation, miny, minx];
			}
			({ word, miny, minx } = this.expandWord(r, c, 'vertical'));
			if (word.length > 1) {
				orientation = 'vertical';
				return [word, orientation, miny, minx];
			}
			return ['', 'invalid', miny, minx];
		} else {
			//Have guaranteed orientation for main axis
			for (let t of playedTiles) {
				let [x, y] = t.parentElement.id.split('_');
				x = parseInt(x);
				y = parseInt(y);
				if (x > maxx) maxx = x;
				if (x < minx) minx = x;
				if (y > maxy) maxy = y;
				if (y < miny) miny = y;
			}
			//console.log(minx,miny,"---",maxx,maxy);
			if (maxx == minx) {
				orientation = 'horizontal';
				for (let i = miny; i <= maxy; i++) {
					let slot = maxx + '_' + i;
					let div = document.getElementById(slot);
					if (div) {
						if (div.querySelector('.tile')) {
							word += div.querySelector('.tile').textContent;
						} else fail = true;
					} else fail = true;
				}
			} else if (maxy == miny) {
				orientation = 'vertical';
				for (let i = minx; i <= maxx; i++) {
					let slot = i + '_' + maxy;
					let div = document.getElementById(slot);
					if (div) {
						if (div.querySelector('.tile')) {
							word += div.querySelector('.tile').textContent;
						} else fail = true;
					} else fail = true;
				}
			} else {
				//orientation  "invalid";
				fail = true;
			}
			if (fail) return ['', 'invalid', miny, minx];
			//console.log(`Expanding from temporary tiles (${orientation})`);
			({ word, miny, minx } = this.expandWord(minx, miny, orientation));
			return [word, orientation, miny, minx];
		}
	}

	/*
  See if a word fits in the spot and score it if so...
*/
	tryPlayingWord(x, y, orientation, word) {
		word = word.toUpperCase();
		//console.log(`Y:${y}_X:${x},  ${orientation}, ${word}`);
		// reset board
		$('.tile-placement-controls').html('');
		//$(".status").html("Processing your turn.");

		// if entry is valid (position and letters available)
		if (this.isEntryValid(word, orientation, x, y)) {
			let myscore = 0;
			this.addWordToBoard(word, orientation, x, y);

			//Orientation check for single tile plays...
			let fullword = this.expandWord(y, x, orientation).word;
			//console.log("Expanded word:",fullword);
			if (fullword.length == 1) {
				let newOrientation = orientation == 'vertical' ? 'horizontal' : 'vertical';
				if (this.expandWord(y, x, newOrientation).word.length > 1) {
					this.removeWordFromBoard(word, orientation, x, y);
					return this.tryPlayingWord(x, y, newOrientation, word);
				} //Otherwise just let it fail with normal logic
			}

			myscore = this.scorePlay(word, this.game.player, orientation, x, y);
			if (myscore <= 1) {
				//If not found in dictionary
				this.removeWordFromBoard(word, orientation, x, y);
				this.updateStatusWithTiles(`Not a valid word, try again! ${this.defaultMsg}`);
				this.enableEvents();
				return false;
			} else {
				this.game.words_played[parseInt(this.game.player) - 1].push({
					word: fullword,
					score: myscore
				});
				this.updateLog(`You played ${fullword} for ${myscore} points.`);
				//
				// discard tiles
				// (not really a discard, just changing flags on the board spaces to enable scoring??)
				//this.discardTiles(word, orientation, x, y);
				//Lock in Move in the DOM
				//this.setBoard(word, orientation, x, y);
				this.discardTiles(word, orientation, x, y); //remove Played tiles from Hand
				this.finalizeWord(word, orientation, x, y); //update board
				this.addScoreToPlayer(this.game.player, myscore);
				this.drawTiles();

				this.addMove(
					`place\t${word}\t${this.game.player}\t${x}\t${y}\t${orientation}\t${fullword}`
				);

				if (this.checkForEndGame() == 1) {
					this.prependMove('gameover');
				}

				this.endTurn();
				return true;
			}
		} else {
			//!isEntryValid
			this.updateStatusWithTiles(`Not a valid word, try again! ${this.defaultMsg}`);
			this.enableEvents();
			return false;
		}
		return false;
	}

	drawTiles() {
		let cards_needed = 7;
		cards_needed = cards_needed - this.game.deck[0].hand.length;

		if (cards_needed > this.game.deck[0].crypt.length) {
			this.prependMove(
				`report_tiles\t${this.game.player}\t${
					this.game.deck[0].hand.length + this.game.deck[0].crypt.length
				}`
			);
			cards_needed = this.game.deck[0].crypt.length;
		}

		if (cards_needed > 0) {
			this.addMove('DEAL\t1\t' + this.game.player + '\t' + cards_needed);
		}
	}

	/*
  Main call for deleting some tiles from the players rack, having them draw new tiles, and ending their turn
*/
	discardAndDrawTiles(tiles) {
		salert('Tossed: ' + tiles);
		this.removeTilesFromHand(tiles);
		this.drawTiles();
		this.addMove('discard_tiles\t' + this.game.player + '\t' + tiles);
		this.endTurn();
	}

	removeTilesFromHand(word) {
		while (word.length > 0) {
			let tmpx = word[0];
			tmpx = tmpx.toUpperCase();

			for (let i = 0; i < this.game.deck[0].hand.length; i++) {
				if (this.game.deck[0].cards[this.game.deck[0].hand[i]].name == tmpx) {
					this.game.deck[0].hand.splice(i, 1);
					i = this.game.deck[0].hand.length;
				}
			}

			if (word.length > 1) {
				word = word.substring(1);
			} else {
				word = '';
			}
		}
	}

	isEntryValid(word, orientation, x, y) {
		let tmphand = JSON.parse(JSON.stringify(this.game.deck[0].hand));
		x = parseInt(x);
		y = parseInt(y);

		//
		// if this is the first word, it has to cross a critical star
		//
		if (this.firstmove == 1) {
			if (orientation == 'vertical') {
				if (x != 6 && x != 10) {
					salert('First Word must be placed to cross a Star');
					return false;
				}

				let starting_point = y;
				let ending_point = y + word.length - 1;

				if (
					(starting_point <= 6 && ending_point >= 6) ||
					(starting_point <= 10 && ending_point >= 10)
				) {
				} else {
					salert('First Word must be long enough to cross a Star');
					return false;
				}
			}

			if (orientation == 'horizontal') {
				if (y != 6 && y != 10) {
					salert('First Word must be placed to cross a Star');
					return false;
				}

				let starting_point = x;
				let ending_point = x + word.length - 1;

				if (
					(starting_point <= 6 && ending_point >= 6) ||
					(starting_point <= 10 && ending_point >= 10)
				) {
				} else {
					salert('First Word must be long enough to cross a Star');
					return false;
				}
			} //this.firstmove = 0;
		} else {
			//Check to make sure newly played word touches another word
			// let touchesWord = 0;
			/*let xStart = Math.max(1, x - 1);
      let yStart = Math.max(1, y - 1);
      let xEnd, yEnd;
      if (orientation == "horizontal") {
        xEnd = Math.min(15, x + word.length + 1);
        yEnd = Math.min(15, y + 1);
      } else {
        xEnd = Math.min(15, x + 1);
        yEnd = Math.min(15, y + word.length + 1);
      }
      //// old code
      // for (let i = xStart; i <= xEnd; i++)
      //   for (let j = yStart; j <= yEnd; j++) {
      //     let boardslot = j + "_" + i;
      //     console.log(boardslot)
      //     if (this.game.board[boardslot].fresh == 0) {
      //       touchesWord = 1;
      //       break;
      //     }
      //     console.log(touchesWord)
      //   }
      */
			const touchesWord = [];
			if (orientation == 'horizontal') {
				let left = `${y}_${x - 1}`;
				let right = `${y}_${x + word.length}`;
				let allBoardSlots = [[left, right]];

				for (let i = x; i < x + word.length; i++) {
					let top = `${y - 1}_${i}`;
					let bottom = `${y + 1}_${i}`;
					let neighbors = [top, bottom];
					allBoardSlots.push(neighbors);
				}
				//console.log(allBoardSlots);

				allBoardSlots.forEach((neighbor) => {
					neighbor.forEach((slot) => {
						if (this.game.board[slot] && this.game.board[slot].fresh == 0) {
							touchesWord.push({
								touchesWord: true,
								slot,
								letter: this.game.board[slot]
							});
						}
					});
				});
			}

			if (orientation == 'vertical') {
				let top = `${y - 1}_${x}`;
				let bottom = `${y + word.length}_${x}`;
				let allBoardSlots = [[top, bottom]];

				for (let i = y; i < y + word.length; i++) {
					let left = `${i}_${x - 1}`;
					let right = `${i}_${x + 1}`;
					let neighbors = [left, right];
					allBoardSlots.push(neighbors);
				}
				//console.log(allBoardSlots);

				allBoardSlots.forEach((neighbor) => {
					neighbor.forEach((plane) => {
						if (this.game.board[plane] && this.game.board[plane].fresh == 0) {
							touchesWord.push({
								touchesWord: true,
								plane,
								letter: this.game.board[plane]
							});
						}
					});
				});
			}

			if (!touchesWord.find((item) => item.touchesWord == true)) {
				salert('Word does not cross or touch an existing word.');
				console.log(touchesWord);
				return false;
			}
		}

		//In all cases, must have the letters in hand or on board to spell word
		let letters_used = 0;
		for (let i = 0; i < word.length; i++) {
			let boardslot = '';
			let letter = word[i].toUpperCase();

			if (orientation == 'horizontal') {
				boardslot = y + '_' + (x + i);
				if (x + i > 15) {
					salert('Word must fit on board!');
					return false;
				}
			}

			if (orientation == 'vertical') {
				boardslot = y + i + '_' + x;
				if (y + i > 15) {
					salert('Word must fit on board!');
					return false;
				}
			}

			if (this.game.board[boardslot].letter != '_') {
				if (this.game.board[boardslot].letter != letter) {
					salert('Cannot overwrite existing words!');
					return false;
				}
			} else {
				let letter_found = 0;
				letters_used++;
				for (let k = 0; k < tmphand.length; k++) {
					if (this.game.deck[0].cards[tmphand[k]].name == letter) {
						tmphand.splice(k, 1);
						letter_found = 1;
						k = tmphand.length + 1;
					}
				}

				if (letter_found == 0) {
					salert('INVALID: letter not in hand: ' + letter);
					return false;
				}
			}
		}

		if (!letters_used) {
			salert('Must place at least one new tile on board!');
			return false;
		}

		return true;
	}

	//Mark word as no longer new (.fresh is a flag used in scoring)
	//--AND-- remove newly used tiles from players hand
	//--AND-- update DOM classes
	finalizeWord(word, orientation, x, y) {
		x = parseInt(x);
		y = parseInt(y);

		$('#gameboard .new').removeClass('new');

		this.game.state.newLetters = [];
		for (let i = 0; i < word.length; i++) {
			let boardslot = '';
			let divname = '';
			let letter = word[i].toUpperCase();

			if (orientation == 'horizontal') {
				boardslot = y + '_' + (x + i);
			}

			if (orientation == 'vertical') {
				boardslot = y + i + '_' + x;
			}

			divname = '#' + boardslot;

			if (this.game.board[boardslot] && this.game.board[boardslot].fresh == 1) {
				this.game.board[boardslot].fresh = 0;
				$(divname).addClass('new');
				this.game.state.newLetters.push(boardslot);

				this.letters[letter].count--;
			}

			$(divname).addClass('set');
		}
	}

	/*Discard tiles used to create the given word*/
	discardTiles(word, orientation, x, y) {
		x = parseInt(x);
		y = parseInt(y);

		for (let i = 0; i < word.length; i++) {
			let boardslot = '';
			let letter = word[i].toUpperCase();

			if (orientation == 'horizontal') {
				boardslot = y + '_' + (x + i);
			}

			if (orientation == 'vertical') {
				boardslot = y + i + '_' + x;
			}

			if (this.game.board[boardslot] && this.game.board[boardslot].fresh == 1) {
				this.removeTilesFromHand(word[i]);
			}
		}
	}

	addLetterToBoard(letter, slot) {
		this.game.board[slot].letter = letter.toUpperCase();
	}
	removeLetterFromBoard(slot) {}
	/*
  Updates GUI and game.board with newly played word
  */
	addWordToBoard(word, orientation, x, y) {
		x = parseInt(x);
		y = parseInt(y);

		for (let i = 0; i < word.length; i++) {
			let boardslot = '';
			let divname = '';
			let letter = word[i].toUpperCase();

			if (orientation == 'horizontal') {
				boardslot = y + '_' + (x + i);
			}

			if (orientation == 'vertical') {
				boardslot = y + i + '_' + x;
			}

			divname = '#' + boardslot;

			if (this.game.board[boardslot].letter != '_') {
				if (this.game.board[boardslot].letter != letter) {
					//We can overwrite tiles??
					console.log('UNEXPECTED OUTCOME IN addWordToBoard ******');
					console.log(this.game.board[boardslot].letter, letter); //what is going on here?
					this.game.board[boardslot].letter = letter;
					this.addTile($(divname), letter);
				}
			} else {
				this.game.board[boardslot].letter = letter;
				this.addTile($(divname), letter);
			}
		}
		this.syncBoardMap();
	}

	/*
  Undoes addWordToBoard, updates GUI to remove newly played tiles (as defined by class:set)
  */
	removeWordFromBoard(word, orientation, x, y) {
		x = parseInt(x);
		y = parseInt(y);

		for (let i = 0; i < word.length; i++) {
			let boardslot = '';
			let divname = '';
			let letter = word[i].toUpperCase();

			if (orientation == 'horizontal') {
				boardslot = y + '_' + (x + i);
			}

			if (orientation == 'vertical') {
				boardslot = y + i + '_' + x;
			}

			divname = '#' + boardslot;

			if ($(divname).hasClass('set') != true) {
				this.game.board[boardslot].letter = '_';
				$(divname).find('.tile').remove();
				$(divname).find('.bonus').css('display', 'flex');
			}
		}
	}

	/*
  Board is 1-indexed, 15 Rows and 15 Columns ( y_x)
  */
	returnBoard() {
		var board = {};

		for (let i = 1; i <= 15; i++) {
			for (let j = 1; j <= 15; j++) {
				let divname = i + '_' + j;
				board[divname] = {
					letter: '_',
					fresh: 1
				};
			}
		}

		return board;
	}

	returnDeck() {
		var dictionary = this.game.options.dictionary;
		console.log('Dictionary: ' + dictionary);

		if (dictionary === 'twl' || dictionary === 'sowpods') {
			return {
				1: { name: 'A' },
				2: { name: 'A' },
				3: { name: 'A' },
				4: { name: 'A' },
				5: { name: 'A' },
				6: { name: 'A' },
				7: { name: 'A' },
				8: { name: 'A' },
				9: { name: 'A' },
				10: { name: 'B' },
				11: { name: 'B' },
				12: { name: 'C' },
				13: { name: 'C' },
				14: { name: 'D' },
				15: { name: 'D' },
				16: { name: 'D' },
				17: { name: 'D' },
				18: { name: 'E' },
				19: { name: 'E' },
				20: { name: 'E' },
				21: { name: 'E' },
				22: { name: 'E' },
				23: { name: 'E' },
				24: { name: 'E' },
				25: { name: 'E' },
				26: { name: 'E' },
				27: { name: 'E' },
				28: { name: 'E' },
				29: { name: 'E' },
				30: { name: 'F' },
				41: { name: 'F' },
				42: { name: 'G' },
				43: { name: 'G' },
				44: { name: 'G' },
				45: { name: 'H' },
				46: { name: 'H' },
				47: { name: 'I' },
				48: { name: 'I' },
				49: { name: 'I' },
				50: { name: 'I' },
				51: { name: 'I' },
				52: { name: 'I' },
				53: { name: 'I' },
				54: { name: 'I' },
				55: { name: 'I' },
				56: { name: 'J' },
				57: { name: 'K' },
				58: { name: 'L' },
				59: { name: 'L' },
				60: { name: 'L' },
				61: { name: 'L' },
				62: { name: 'M' },
				63: { name: 'M' },
				64: { name: 'N' },
				65: { name: 'N' },
				66: { name: 'N' },
				67: { name: 'N' },
				68: { name: 'N' },
				69: { name: 'N' },
				70: { name: 'O' },
				71: { name: 'O' },
				72: { name: 'O' },
				73: { name: 'O' },
				74: { name: 'O' },
				75: { name: 'O' },
				76: { name: 'O' },
				77: { name: 'O' },
				78: { name: 'P' },
				79: { name: 'P' },
				80: { name: 'Q' },
				81: { name: 'R' },
				82: { name: 'R' },
				83: { name: 'R' },
				84: { name: 'R' },
				85: { name: 'R' },
				86: { name: 'R' },
				87: { name: 'S' },
				88: { name: 'S' },
				89: { name: 'S' },
				90: { name: 'S' },
				91: { name: 'T' },
				92: { name: 'T' },
				93: { name: 'T' },
				94: { name: 'T' },
				95: { name: 'T' },
				96: { name: 'T' },
				97: { name: 'U' },
				98: { name: 'U' },
				99: { name: 'U' },
				100: { name: 'U' },
				101: { name: 'V' },
				102: { name: 'V' },
				103: { name: 'W' },
				104: { name: 'W' },
				105: { name: 'X' },
				106: { name: 'U' },
				107: { name: 'Y' },
				108: { name: 'Y' },
				109: { name: 'Z' }
			};
		}
		if (dictionary === 'fise' || dictionary === 'tagalog') {
			return {
				1: { name: 'A' },
				2: { name: 'A' },
				3: { name: 'A' },
				4: { name: 'A' },
				5: { name: 'A' },
				6: { name: 'A' },
				7: { name: 'A' },
				8: { name: 'A' },
				9: { name: 'A' },
				10: { name: 'A' },
				11: { name: 'A' },
				12: { name: 'A' },
				13: { name: 'B' },
				14: { name: 'B' },
				15: { name: 'C' },
				16: { name: 'C' },
				17: { name: 'C' },
				18: { name: 'C' },
				19: { name: 'C' },
				20: { name: 'D' },
				21: { name: 'D' },
				22: { name: 'D' },
				23: { name: 'D' },
				24: { name: 'D' },
				25: { name: 'E' },
				26: { name: 'E' },
				27: { name: 'E' },
				28: { name: 'E' },
				29: { name: 'E' },
				30: { name: 'E' },
				31: { name: 'E' },
				32: { name: 'E' },
				33: { name: 'E' },
				34: { name: 'E' },
				35: { name: 'E' },
				36: { name: 'E' },
				37: { name: 'E' },
				38: { name: 'F' },
				39: { name: 'G' },
				40: { name: 'G' },
				41: { name: 'H' },
				42: { name: 'H' },
				43: { name: 'H' },
				44: { name: 'I' },
				45: { name: 'I' },
				46: { name: 'I' },
				47: { name: 'I' },
				48: { name: 'I' },
				49: { name: 'I' },
				50: { name: 'J' },
				51: { name: 'L' },
				52: { name: 'L' },
				53: { name: 'L' },
				54: { name: 'L' },
				55: { name: 'L' },
				56: { name: 'L' },
				57: { name: 'M' },
				58: { name: 'M' },
				59: { name: 'N' },
				60: { name: 'N' },
				61: { name: 'N' },
				62: { name: 'N' },
				63: { name: 'N' },
				64: { name: 'Ñ' },
				65: { name: 'Ñ' },
				66: { name: 'O' },
				67: { name: 'O' },
				68: { name: 'O' },
				69: { name: 'O' },
				70: { name: 'O' },
				71: { name: 'O' },
				72: { name: 'O' },
				73: { name: 'O' },
				74: { name: 'O' },
				75: { name: 'O' },
				76: { name: 'P' },
				77: { name: 'P' },
				78: { name: 'Q' },
				79: { name: 'R' },
				80: { name: 'R' },
				81: { name: 'R' },
				82: { name: 'R' },
				83: { name: 'R' },
				84: { name: 'R' },
				85: { name: 'R' },
				86: { name: 'S' },
				87: { name: 'S' },
				88: { name: 'S' },
				89: { name: 'S' },
				90: { name: 'S' },
				91: { name: 'S' },
				92: { name: 'S' },
				93: { name: 'T' },
				94: { name: 'T' },
				95: { name: 'T' },
				96: { name: 'T' },
				97: { name: 'U' },
				98: { name: 'U' },
				99: { name: 'U' },
				100: { name: 'U' },
				101: { name: 'U' },
				102: { name: 'V' },
				103: { name: 'X' },
				104: { name: 'Y' },
				105: { name: 'Z' }
			};
		}

		if (dictionary === 'test') {
			return {
				1: { name: 'A' },
				2: { name: 'A' },
				3: { name: 'A' },
				4: { name: 'A' },
				5: { name: 'A' },
				6: { name: 'A' },
				7: { name: 'A' },
				8: { name: 'A' },
				9: { name: 'A' },
				10: { name: 'C' },
				11: { name: 'C' },
				12: { name: 'C' },
				13: { name: 'C' },
				14: { name: 'T' },
				15: { name: 'T' },
				16: { name: 'T' },
				17: { name: 'T' },
				18: { name: 'T' },
				19: { name: 'T' },
				20: { name: 'T' }
			};
		}
		console.error('Undefined Letter Set');
		return {};
	}

	returnLetters() {
		var dictionary = this.game.options.dictionary;

		if (dictionary === 'twl' || dictionary === 'sowpods') {
			return {
				A: { score: 1, count: 9 },
				B: { score: 3, count: 2 },
				C: { score: 2, count: 2 },
				D: { score: 2, count: 4 },
				E: { score: 1, count: 12 },
				F: { score: 2, count: 2 },
				G: { score: 2, count: 3 },
				H: { score: 1, count: 2 },
				I: { score: 1, count: 9 },
				J: { score: 8, count: 1 },
				K: { score: 4, count: 1 },
				L: { score: 2, count: 4 },
				M: { score: 2, count: 2 },
				N: { score: 1, count: 6 },
				O: { score: 1, count: 8 },
				P: { score: 2, count: 2 },
				Q: { score: 10, count: 1 },
				R: { score: 1, count: 6 },
				S: { score: 1, count: 4 },
				T: { score: 1, count: 6 },
				U: { score: 2, count: 5 },
				V: { score: 3, count: 2 },
				W: { score: 2, count: 2 },
				X: { score: 8, count: 1 },
				Y: { score: 2, count: 2 },
				Z: { score: 10, count: 1 }
			};
		}
		if (dictionary === 'fise' || dictionary === 'tagalog') {
			return {
				A: { score: 1, count: 12 },
				B: { score: 2, count: 2 },
				C: { score: 3, count: 5 },
				D: { score: 2, count: 5 },
				E: { score: 1, count: 13 },
				F: { score: 4, count: 1 },
				G: { score: 2, count: 2 },
				H: { score: 4, count: 3 },
				I: { score: 1, count: 6 },
				J: { score: 8, count: 1 },
				L: { score: 1, count: 6 },
				M: { score: 3, count: 2 },
				N: { score: 1, count: 5 },
				Ñ: { score: 8, count: 2 },
				O: { score: 1, count: 10 },
				P: { score: 3, count: 2 },
				Q: { score: 6, count: 1 },
				R: { score: 2, count: 7 },
				S: { score: 1, count: 7 },
				T: { score: 1, count: 4 },
				U: { score: 1, count: 5 },
				V: { score: 4, count: 1 },
				X: { score: 8, count: 1 },
				Y: { score: 4, count: 1 },
				Z: { score: 10, count: 1 }
			};
		}

		if (dictionary === 'test') {
			return { A: { score: 1, count: 9 }, C: { score: 3, count: 4 }, T: { score: 2, count: 7 } };
		}
		console.log('Error: No defined letter values');
		return {};
	}

	checkWord(word) {
		if (word.length == 0) {
			return false;
		}
		return this.wordlist.indexOf(word.toLowerCase()) >= 0;
	}

	returnBonus(pos) {
		let bonus = '';

		if (pos == '1_1') {
			return '3L';
		}
		if (pos == '1_15') {
			return '3L';
		}
		if (pos == '3_8') {
			return '3L';
		}
		if (pos == '8_3') {
			return '3L';
		}
		if (pos == '8_13') {
			return '3L';
		}
		if (pos == '13_8') {
			return '3L';
		}
		if (pos == '15_1') {
			return '3L';
		}
		if (pos == '15_15') {
			return '3L';
		}
		if (pos == '2_2') {
			return '3W';
		}
		if (pos == '2_14') {
			return '3W';
		}
		if (pos == '8_8') {
			return '3W';
		}
		if (pos == '14_2') {
			return '3W';
		}
		if (pos == '14_14') {
			return '3W';
		}
		if (pos == '1_5') {
			return '2L';
		}
		if (pos == '1_11') {
			return '2L';
		}
		if (pos == '3_4') {
			return '2L';
		}
		if (pos == '3_12') {
			return '2L';
		}
		if (pos == '4_3') {
			return '2L';
		}
		if (pos == '4_13') {
			return '2L';
		}
		if (pos == '5_8') {
			return '2L';
		}
		if (pos == '5_1') {
			return '2L';
		}
		if (pos == '5_15') {
			return '2L';
		}
		if (pos == '8_5') {
			return '2L';
		}
		if (pos == '8_11') {
			return '2L';
		}
		if (pos == '11_1') {
			return '2L';
		}
		if (pos == '11_8') {
			return '2L';
		}
		if (pos == '11_15') {
			return '2L';
		}
		if (pos == '12_3') {
			return '2L';
		}
		if (pos == '12_13') {
			return '2L';
		}
		if (pos === '13_4') {
			return '2L';
		}
		if (pos === '13_12') {
			return '2L';
		}
		if (pos == '15_5') {
			return '2L';
		}
		if (pos == '15_11') {
			return '2L';
		}
		if (pos == '1_8') {
			return '2W';
		}
		if (pos == '4_6') {
			return '2W';
		}
		if (pos == '4_10') {
			return '2W';
		}
		if (pos == '6_4') {
			return '2W';
		}
		if (pos == '6_12') {
			return '2W';
		}
		if (pos == '8_1') {
			return '2W';
		}
		if (pos == '8_15') {
			return '2W';
		}
		if (pos == '10_4') {
			return '2W';
		}
		if (pos == '10_12') {
			return '2W';
		}
		if (pos == '12_6') {
			return '2W';
		}
		if (pos == '12_10') {
			return '2W';
		}
		if (pos == '15_8') {
			return '2W';
		}
		return bonus;
	}

	/*
  For scoring words, I use cartesian coordinate templating to make the coding easier
  (x,y) is represented as "y_x". A slot template fixes one of the dimensions with a constant
  to traverse the (main) axis of the word, or, alternately examine the cross axis of an 
  intersecting word.  "#" is used as a variable, to be replaced by "i" in the for loops.  
  */

	getWordScope(head, slotPattern) {
		let boardslot;
		let wordStart = head;
		let wordEnd = head;
		for (let i = parseInt(head); i >= 1; i--) {
			boardslot = slotPattern.replace('#', i);
			if (this.game.board[boardslot].letter == '_') break;
			wordStart = i;
		}
		for (let i = parseInt(head); i <= 15; i++) {
			boardslot = slotPattern.replace('#', i);
			if (this.game.board[boardslot].letter == '_') break;
			wordEnd = i;
		}

		return { start: wordStart, end: wordEnd };
	}

	scoreWord(wordStart, wordEnd, boardSlotTemplate) {
		let tilesUsed = 0;
		let word_bonus = 1;
		let thisword = '';
		let score = 0;
		let html = '';
		let boardslot = '';
		let touchesWord = 0;
		if (Object.keys(this.letters).length === 0) {
			this.letters = this.returnLetters();
		}
		for (let i = wordStart; i <= wordEnd; i++) {
			boardslot = boardSlotTemplate.replace('#', i);
			let letter_bonus = 1;

			if (this.game.board[boardslot] && this.game.board[boardslot].fresh == 1) {
				let tmpb = this.returnBonus(boardslot);
				switch (
					tmpb //Word_bonuses can be combined...maybe
				) {
					case '3W':
						word_bonus = word_bonus * 3;
						break;
					case '2W':
						word_bonus = word_bonus * 2;
						break;
					case '3L':
						letter_bonus = 3;
						break;
					case '2L':
						letter_bonus = 2;
						break;
				}
				tilesUsed += 1;
			} else {
				touchesWord = 1;
			}

			let thisletter = this.game.board[boardslot].letter;
			//console.log(boardslot,thisletter);

			/*
      So we just save all the tiles in the play in a queue to animate after the fact
      Because it may be confusing if multiple words are being played at once and they
      all start flashing at once
      However, we do need a way to also queue the numbers to display on the screen 
      */
			this.tilesToHighlight.push(`#${boardslot} .tile`);

			thisword += thisletter;
			score += this.letters[thisletter].score * letter_bonus;
			if (letter_bonus > 1) {
				html += ` + ${this.letters[thisletter].score} x ${letter_bonus}`;
			} else {
				html += ' + ' + this.letters[thisletter].score;
			}
		}

		if (!this.checkWord(thisword)) {
			salert(thisword + ' is not in the dictionary.');
			return -1;
		}

		/*Technically only care for the main word, but not worth adding code to avoid 
      doing a couple extra additions and a comparison
    */
		if (tilesUsed == 7) {
			score += 10;
			word_bonus += 1;
			html += ' +10(!)';
		}

		score *= word_bonus;
		html = html.substring(3);
		if (word_bonus > 1) {
			html = '(' + html + ') x ' + word_bonus;
		}
		//console.log("word:", thisword, "score:", score);
		return { word: thisword, score: score, math: html };
	}

	////////////////
	// Score Word //
	// Returns -1 if not found in dictionary //
	////////////////
	scorePlay(word, player, orientation, x, y) {
		let boardslot;
		//Orientation-dependent metadata/variables
		const mainAxis = orientation == 'horizontal' ? x : y;
		const crossAxis = orientation == 'horizontal' ? y : x;
		const boardSlotTemplate = orientation == 'horizontal' ? crossAxis + '_#' : '#_' + crossAxis;

		//console.log(mainAxis, crossAxis, boardSlotTemplate);
		//
		// find the start and end of the word
		//
		let wordBoundaries = this.getWordScope(mainAxis, boardSlotTemplate);
		this.tilesToHighlight = []; // reset to empty array
		//Score main-axis word
		let results = this.scoreWord(wordBoundaries.start, wordBoundaries.end, boardSlotTemplate);
		if (results == -1) return -1;
		//console.log(orientation, wordBoundaries, results);
		let play = new Array(results);
		let totalscore = results.score;

		//For each letter in the main-axis word...

		for (let i = wordBoundaries.start; i <= wordBoundaries.end; i++) {
			boardslot = boardSlotTemplate.replace('#', i);

			//console.log(boardslot);
			if (this.game.board[boardslot] && this.game.board[boardslot].fresh == 1) {
				//...Is it newly placed...?
				let altTemplate = boardSlotTemplate
					.replace(crossAxis, '@')
					.replace('#', i)
					.replace('@', '#');
				//..and does it have a word along the cross axis
				let crossWord = this.getWordScope(crossAxis, altTemplate);
				if (crossWord.start != crossWord.end) {
					//Only score word if more than 1 letter
					//Make cross-axis variable
					//console.log(crossAxis, altTemplate, crossWord);
					results = this.scoreWord(crossWord.start, crossWord.end, altTemplate);
					if (results == -1) return -1;

					play.push(results);
					totalscore += results.score;
				}
			}
		}

		this.firstmove = 0; //We have an acceptable move, so game has commenced. Repeat assignment simpler than adding conditional
		//console.log(play);

		this.last_played_word[player - 1] = {
			word: play[0].word,
			totalscore,
			play
		};
		//console.log(this.last_played_word);
		return totalscore;
	}

	expandWord(row, col, orientation) {
		const mainAxis = orientation == 'horizontal' ? col : row;
		const crossAxis = orientation == 'horizontal' ? row : col;
		const boardSlotTemplate = orientation == 'horizontal' ? crossAxis + '_#' : '#_' + crossAxis;
		let wordBoundaries = this.getWordScope(mainAxis, boardSlotTemplate);

		let fullword = '';
		let boardslot = '';

		for (let i = wordBoundaries.start; i <= wordBoundaries.end; i++) {
			boardslot = boardSlotTemplate.replace('#', i);
			fullword += this.game.board[boardslot].letter; //Reading letter
		}
		//console.log(`Found ${fullword} at row ${row}, col ${col} (${orientation})`, wordBoundaries);
		let newx, newy;
		if (orientation == 'horizontal') {
			newy = row;
			newx = wordBoundaries.start;
		} else {
			newy = wordBoundaries.start;
			newx = col;
		}
		//console.log(`${orientation}, new row: ${newy}, new col: ${newx}`);
		return {
			word: fullword,
			minx: newx,
			miny: newy
		};
	}

	//
	// Core Game Logic
	//
	async handleGameLoop(msg = null) {
		let wordblocks_self = this;

		if (this.loadingDictionary) {
			return 0;
		}

		///////////
		// QUEUE // Possibilities: gameover, endgame, place, discard_tiles
		///////////
		if (this.game.queue.length > 0) {
			let qe = this.game.queue.length - 1;
			let mv = this.game.queue[qe].split('\t');

			//
			// game over -- pick the winner
			//

			if (mv[0] === 'gameover') {
				this.game.queue = [];

				let x = 0;
				let idx = -1;

				//Find Highest Score
				for (let i = 0; i < this.game.score.length; i++) {
					if (this.game.score[i] > x) {
						x = this.game.score[i];
						idx = i;
					}
				}

				this.game.canProcess = true;

				if (this.gameOverCallback) {
					console.log('Run game over callback!!!');
					this.gameOverCallback();
					return 0;
				}

				let txSent = null;

				if (idx < 0) {
					txSent = await this.sendGameOverTransaction([], 'no winners');
				} else {
					let winners = [this.game.players[idx]];

					//Check for ties -- will need to improve the logic for multi winners
					for (let i = 0; i < this.game.score.length; i++) {
						if (i != idx && this.game.score[i] == this.game.score[idx]) {
							winners.push(this.game.players[i]);
						}
					}

					if (winners.length == this.game.players.length) {
						txSent = await this.sendGameOverTransaction(this.game.players, 'tie');
					} else {
						txSent = await this.sendGameOverTransaction(winners, 'high score');
					}
				}

				// If async and I finish, but lose... won't get the official game over tx
				// until my friend reconnects..., so simulate!
				if (txSent) {
					this.receiveGameoverTransaction(0, txSent, 0, this.app);
				}

				return 0;
			}

			if (mv[0] === 'report_tiles') {
				let player = parseInt(mv[1]);
				let tileCt = parseInt(mv[2]);
				this.game.queue.splice(this.game.queue.length - 1, 1);
				console.log(player, tileCt);

				let name =
					player === this.game.player ? 'You are' : `${this.game.playerNames[player - 1]} is`;
				this.updateLog(`${name} down to ${tileCt} tiles`);
			}

			//
			// place word player x y [horizontal/vertical]
			//
			if (mv[0] === 'place') {
				let word = mv[1];
				let player = mv[2];
				let x = mv[3];
				let y = mv[4];
				let orient = mv[5];
				let expanded = mv[6];
				let score = 0;

				//Set up next player's turn
				this.game.target = this.returnNextPlayer(player);
				console.log('Update target: ', this.game.target);

				//Don't process placement until user is in game
				if (!this.gameBrowserActive()) {
					if (this.game.player == this.game.target) {
						this.updateStatusWithTiles(`YOUR GO: ${this.defaultMsg}`);
						this.setPlayerActive();
						console.log('Trigger Playerturn: ', JSON.parse(JSON.stringify(this.game)));
					}
					return 0;
				}

				this.game.queue.splice(this.game.queue.length - 1, 1);

				if (player != this.game.player) {
					this.addWordToBoard(word, orient, x, y);
					//this.setBoard(word, orient, x, y);
					score = this.scorePlay(word, player, orient, x, y);
					this.finalizeWord(word, orient, x, y);
					this.addScoreToPlayer(player, score);

					this.game.words_played[parseInt(player) - 1].push({
						word: expanded,
						score: score
					});
					this.updateLog(
						`${this.game.playerNames[player - 1]} played ${expanded} for ${score} points`
					);
				} else {
					score = this.getLastMove(player).score;
				}
				this.animatePlay();
			}

			if (mv[0] === 'discard_tiles') {
				let player = parseInt(mv[1]);
				let discardedTiles = mv[2]; //string

				this.game.target = this.returnNextPlayer(player);
				console.log('Update target: ', this.game.target);

				if (!this.gameBrowserActive()) {
					if (this.game.player == this.game.target) {
						this.updateStatusWithTiles(`YOUR GO: ${this.defaultMsg}`);
						this.setPlayerActive();
					}
					return 0;
				}

				this.game.queue.splice(this.game.queue.length - 1, 1);

				let msg = discardedTiles.length > 0 ? 'discarded some tiles' : 'passed';
				if (player !== this.game.player) {
					this.updateLog(`${this.game.playerNames[player - 1]} ${msg}.`);
				} else {
					this.updateLog(`You ${msg}.`);
				}

				//Code to keep the discard and redraws in the game log history
				wordblocks_self.last_played_word[player - 1] = {
					word: discardedTiles,
					totalscore: 0
				};
				wordblocks_self.game.words_played[player - 1].push({
					word: '---',
					score: 0
				});
			}
		}

		// Set UI here...
		if (this.game.queue.length == 0) {
			if (this.game.player == this.game.target) {
				this.updateStatusWithTiles(`YOUR GO: ${this.defaultMsg}`);
				this.setPlayerActive();
				this.enableEvents();
			} else {
				this.updateStatusWithTiles(`${this.game.playerNames[this.game.target - 1]}'s turn`);
				this.startClock();
			}

			$('.score.active').removeClass('active');
			this.playerbox.setActive(this.game.target);
			$(`#mobile_score_${this.game.target}`).addClass('active');
			if (this.playerbox && this.playerbox.refreshStatus) {
				this.playerbox.refreshStatus();
			}

			// We add a save point here so closing the tab doesn't break the game
			console.log('Save Wordblocks game');
			await this.saveGame(this.game.id);
		}

		return 1;
	}

	checkForEndGame() {
		if (this.game.deck[0].hand.length == 0 && this.game.deck[0].crypt.length == 0) {
			return 1;
		}
		return 0;
	}

	addScoreToPlayer(player, score) {
		if (!this.gameBrowserActive()) {
			return;
		}

		this.game.score[player - 1] = this.getPlayerScore(player) + score;
		this.refreshPlayerScore(player);
	}

	endTurn() {
		this.updateStatusWithTiles('Waiting for information from peers....');
		super.endTurn();
	}

	returnAdvancedOptions() {
		return WordblocksGameOptionsTemplate(this.app, this);
	}

	async animatePlay() {
		for (let tile of this.tilesToHighlight) {
			$(tile)
				.css('color', 'white')
				.css('background', 'black')
				.delay(250)
				.queue(function () {
					$(this).css('color', '').css('background', '').dequeue();
				});

			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}

	refreshPlayerScore(player) {
		let score = this.getPlayerScore(player);

		if (document.getElementById(`score_${player}`)) {
			document.getElementById(`score_${player}`).innerHTML = score;
		}

		if (document.getElementById(`mobile_score_${player}`)) {
			document.getElementById(`mobile_score_${player}`).innerHTML =
				`<img class="player-identicon" src="${this.app.keychain.returnIdenticon(
					this.game.players[player - 1]
				)}"><span>: ${score}</span>`;
		}
		if (this.players) {
			this.players.refreshStatus();
		}
	}

	displayRemainingTiles() {
		let html = `<div class="remaining_tiles">`;

		for (let letter in this.letters) {
			let printed = false;
			for (let j = 0; j < this.letters[letter].count; j++) {
				printed = true;
				html += this.returnTileHTML(letter);
			}
			if (printed) {
				html += `<div class="gap"></div>`;
			}
		}
		html += '</div>';

		this.overlay.show(html);
	}
}

module.exports = Wordblocks;
