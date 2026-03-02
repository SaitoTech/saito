const JSON = require('json-bigint');
const ArcadeMainTemplate = require('./main.template');
const ArcadeInitializer = require('../main/initializer');
const ArcadeSidebar = require('./sidebar');
const ArcadeTeasers = require('./teasers');

class ArcadeMain {
	constructor(app, mod, container = 'body') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.sidebar = new ArcadeSidebar(app, mod, '.arcade-sidebar');
		this.teasers = new ArcadeTeasers(app, mod, '.arcade-teasers');

		let league_hook = app.modules.returnFirstRespondTo("leagues-for-arcade");
		if (league_hook){
			app.connection.on('league-rankings-render-request', ()=>{
				for (let league of league_hook.returnLeagues()){
					let card = document.querySelector(`.arcade-teaser[data-league="${league.id}"] .arcade-teaser-footer`);
					if (card){
						let html = "";
						if (league.rank > 0){
							html = `<div class="leaderboard-rank angled-notification">${league.rank}</div>`;
						}
						card.innerHTML = html;
					}
				}
			});
		}

		this.intersectionObserver = new IntersectionObserver((entries) => {
		  let gameListContainer = document.querySelector(".arcade-main");			
		  entries.forEach(entry => {
			  if (entry.intersectionRatio <= 0) {
			  	if (entry.target.id == "top-of-game-list"){
			  		gameListContainer.classList.add("can-scroll-up");
			  	}else{
			  		gameListContainer.classList.add("can-scroll-down");
			  	}
			  }else{
			  	if (entry.target.id == "top-of-game-list"){
			  		gameListContainer.classList.remove("can-scroll-up");
			  	}else{
			  		gameListContainer.classList.remove("can-scroll-down");
			  	}
			  }
		  });
		});



	}

	showInitializer(game_id) {
		if (!this.mod.browser_active) return;

		this.mod.is_game_initializing = true;

		const initializer = new ArcadeInitializer(
			this.app,
			this.mod,
			'.arcade-main'
		);

		initializer.game_id = game_id;
		initializer.render();
	}

	async render() {
		if (document.querySelector('.saito-container')) {
			this.app.browser.replaceElementBySelector(
				ArcadeMainTemplate(this.app, this.mod),
				'.saito-container'
			);
		} else {
			this.app.browser.addElementToSelector(
				ArcadeMainTemplate(this.app, this.mod),
				this.container
			);
		}

		this.teasers.render();
		this.sidebar.render();
		await this.app.modules.renderInto('.arcade-sidebar');

		this.attachEvents();
	}

	renderInvites() {
		if (!this.mod.browser_active) return;
		if (!this.sidebar || !this.sidebar.invites) return;
		this.sidebar.renderInvites();
	}

	attachEvents() {

		// start observing
		this.intersectionObserver.observe(document.getElementById("top-of-game-list"));
		this.intersectionObserver.observe(document.getElementById("bottom-of-game-list"));

		Array.from(
			document.querySelectorAll('.arcade-teaser')
		).forEach((game) => {
			game.onclick = (e) => {

				e.stopPropagation();
				let league_id = e.currentTarget.getAttribute('data-league');

				if (e.currentTarget.classList.contains("arcade-teaser-install")) {
					let c = confirm("Do you want to install this game? This will take you to the app download site:");
					if (c) {
						let link = "";
						let modname = e.currentTarget.getAttribute('data-id');
						for (let z = 0; z < this.app.modules.mods.length; z++) {
							if (modname === this.app.modules.mods[z].name) {
								link = this.app.modules.mods[z].link;
							}
						}
						if (link != "") {
							navigateWindow(link, 300);
							return;
						}
						return;
					}
					return;
				}

				if (league_id){
					this.app.browser.logMatomoEvent(
						'LeagueOverlay',
						'GameSelector',
						league_id
					);

					this.app.connection.emit(
							'league-overlay-render-request',
							league_id
					);			
				}else{
					let modname = e.currentTarget.getAttribute('data-id');
					this.app.browser.logMatomoEvent(
						'GameWizard',
						'GameSelector',
						modname
					);

					this.app.connection.emit(
							'arcade-launch-game-wizard',
							{game: modname}
					);			

				}

			};
		});


	}
}

module.exports = ArcadeMain;
