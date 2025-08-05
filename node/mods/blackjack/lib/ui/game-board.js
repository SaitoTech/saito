const GameBoardTemplate = require('./game-board.template');

class GameBoard {

	/**
	 * @param app - the Saito application
	 * @param mod - reference to the game module
	 */
	constructor(app, mod) {
		this.app = app;
		this.game_mod = mod;
		this.cards_visible = 0;
		this.timer = null;
	}

	render(enable = false) {

		if (enable){
			delete this.disable;
		}

		if (this.disable){
			console.log("Prevent board rendering between rounds");
			return;
		}

		if (!this.game_mod.gameBrowserActive()){
			return;
		}
		
		if (!document.querySelector(".gameboard")) {
		  this.app.browser.addElementToDom(GameBoardTemplate(this.game_mod));
		  this.attachEvents();
		} 

		this.game_mod.cardfan.render();	

		this.displayTable();

	}

	toggleView(){
		let gb = document.querySelector(".gameboard");
		if (!gb) {
			return;
		}
		if (this.game_mod.theme == "threed"){
			gb.classList.remove("flat");
			gb.classList.add("threed");
		}else{
			gb.classList.add("flat");
			gb.classList.remove("threed");
		}
	}

	changeFelt(){
		let gb = document.querySelector(".gameboard");
		if (!gb) {
			return;
		}
		gb.classList.remove("green");
		gb.classList.remove("red");
		gb.classList.remove("blue");
		gb.classList.add(this.game_mod.felt);
	}

  	displayTable() {

                try {
                        let cardhtml = '';
                        for (let c of this.game_mod.myCards()) {
                                cardhtml += `<img class="card" src="${this.game_mod.card_img_dir}/${c}.png">`;
                        }

                        this.game_mod.cardfan.render(cardhtml);

                        //Add split hands
                        if (this.game_mod.game.state.player[this.game_mod.game.player - 1].split.length > 0) {
                                let newhtml = '';
                                for (
                                        let z = 0;
                                        z <
                                        this.game_mod.game.state.player[this.game_mod.game.player - 1].split.length;
                                        z++
                                ) {
                                        let ts = this.game_mod.scoreArrayOfCards(
                                                this.game_mod.game.state.player[this.game_mod.game.player - 1].split[z]
                                        );

                                        newhtml +=
                                                ts > 0
                                                        ? `<span>Score: ${ts}</span>`
                                                        : `<span>Bust</span>`;

                                        newhtml += `<div class="splithand">`;
                                        newhtml += this.game_mod.handToHTML(
                                                this.game_mod.game.state.player[this.game_mod.game.player - 1].split[z]
                                        );
                                        newhtml += '</div>';
                                }
                                //this.game_mod.playerbox.refreshGraphic(newhtml);
                                //$('#player-box-graphic-1').removeClass(
                                //        'hidden-playerbox-element'
                                //);
                        }
                } catch (err) {
                        console.error('Display Hand err: ' + err);
                }

        }                                       
                


	attachEvents() {
	}

	clearTable() {

		this.cards_visible = 0;
		this.disable = true;

		//
		// this animation sweeps the cards off the table
		//
/*****
                $($('#deal').children().get().reverse()).each(function (index) {
                        $(this)
                                .delay(50 * index)
                                .queue(function () {
                                        $(this)
                                                .removeClass('flipped')
                                                .delay(20 * index)
                                                .queue(function () {
                                                        $(this)
                                                                .animate(
                                                                        { left: '1000px' },
                                                                        1200,
                                                                        'swing',
                                                                        function () {
                                                                                $(this).remove();
                                                                        }
                                                                )
                                                                .dequeue();
                                                })
                                                .dequeue();
                                });
                });
*****/

		//
		// this animation sweeps the hands off the table
		//
/*****
                $('.game-playerbox-graphics .hand').animate(
                        { left: '1000px' },
                        1200,
                        'swing',
                        function () {
                                $(this).remove();
                        }
                );
*****/


	}

}

module.exports = GameBoard;

