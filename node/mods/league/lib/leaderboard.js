const LeaderboardTemplate = require('./leaderboard.template');
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');

class Leaderboard {
	constructor(app, mod, container = '.league-overlay-leaderboard', league = null) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.league = league;
		this.overlay = new SaitoOverlay(app, mod);
	}

	async render() {
		if (this.league == null) {
			console.error('ERROR: leaderboard does not have league defined');
			return;
		}

		let title = 'Games';
		let gm = this.app.modules.returnModuleByName(this.league.game);
		if (gm) {
			title = gm.statistical_unit + 's';
		}

		if (document.querySelector('.league-leaderboard')) {
			this.app.browser.replaceElementBySelector(LeaderboardTemplate(title), '.league-leaderboard');
		} else {
			this.app.browser.addElementToSelector(LeaderboardTemplate(title), this.container);
		}

		//
		//
		this.renderLeaderboardContents();
		//
		// fetch league info if it is not already downloaded
		//
		if (
			this.league.players.length == 0 ||
			!this.league.timestamp ||
			this.league.timestamp + 900000 < new Date().getTime()
		) {
			document.querySelector(this.container + ' .leaderboard-updating-msg').style.display = 'block';
			if (this.mod.debug) {
				console.debug(
					this.league.numPlayers,
					this.league.players.length,
					'Query Server for leaderboard'
				);
			}
			this.mod.fetchLeagueLeaderboard(this.league.id, (rows) => {
				if (document.querySelector(this.container + ' .leaderboard-updating-msg')) {
					document.querySelector(this.container + ' .leaderboard-updating-msg').style.display =
						'none';
				}
				this.renderLeaderboardContents();
			});
		}

		this.attachEvents();
	}

	renderLeaderboardContents() {
		//
		// safety check
		//
		if (!document.querySelector('.league-leaderboard .saito-table-body')) {
			return;
		}

		document.querySelector('.league-leaderboard .saito-table-body').innerHTML = '';

		//
		// add players
		//
		for (let i = 0; i < this.league.players.length; i++) {
			let html = '';
			let player = this.league.players[i];
			let publicKey = player.publicKey;
			html += `
        <div class="saito-table-row${
					publicKey == this.mod.publicKey ? ' my-leaderboard-position' : ''
				}">
          <div class="center-align">${i + 1}</div>
          ${this.app.browser.returnAddressHTML(publicKey)}
          <div class="right-align">${Math.round(player.score)}</div>
          <div class="right-align">${Math.round(player.games_finished)}</div>
          <div class="right-align">${Math.round(player.games_won)}</div>
        </div>
      `;

			//Player score is stored as an integer, but we round just in case things change

			this.app.browser.addElementToSelector(html, '.league-leaderboard .saito-table-body');
		}

		let container = document.querySelector(this.container);

		if (container.getBoundingClientRect().bottom < window.innerHeight) {
			let myListing = document.querySelector('.my-leaderboard-position');
			if (myListing) {
				myListing.scrollIntoView(false);

				//Old way: scroll to top then shift down
				//myListing.parentElement.parentElement.parentElement.parentElement.scrollBy(0,	-84);
			}
		}
	}

	attachEvents() {
		let gm = this.app.modules.returnModuleByName(this.league.game);
		let obj = gm?.respondTo('default-league');

		let html = `<div class="ranking-overlay">
					<h5>${obj.name} Leaderboard Score</h5>
					<div>This game uses ${obj.ranking_algorithm} to calculate your score, which starts at ${obj.default_score}</div>`;

		if (obj.ranking_algorithm == 'EXP') {
			html += `<div>Players get "EXP" (experience points) for playing the game, one point minimum for trying and five points for beating a round.</div>`;
		} else if (obj.ranking_algorithm == 'HSC') {
			html += `<div>The game includes its own measurement of score, so players are ranked based on who can achieve the highest score. Unlike an Arcade, each player only gets one entry.</div>`;
		} else if (obj.ranking_algorithm == 'ELO') {
			html += `<div>This is the classic ranking algorithm where the amount each player's score is adjusted up or down based on the difference in their scores, i.e. the estimated likelihood that one player would beat the other. You gain more points by beating players with higher ELO scores than beating lower rated players.</div>`;
		}

		html += `<div>NOTE: all leaderboards have a decay algorithm that takes away a point for every day of inactivity.</div>`;
		html += `</div>`;

		if (document.querySelector('.league-score-header')) {
			document.querySelector('.league-score-header').onclick = (e) => {
				console.log(e);
				console.log(e.currentTarget);
				this.overlay.show(html);

				this.overlay.move(
					e.clientY + 20,
					Math.max(0, Math.min(e.clientX - 180, window.innerWidth - 460))
				);
				this.overlay.setBackgroundColor('#0000');
			};
		}
	}
}

module.exports = Leaderboard;
