
	displayBoard() {
		if (this.browser_active == 0) {
			return;
		}

		this.board.render();
		this.displayPlayers();
		this.displayHand();
	}

	displayPlayers() {
		if (this.browser_active == 0) {
			return;
		}

		try {
			for (let i = 0; i < this.game.state.player.length; i++) {

				let newhtml = '';
				let player_hand_shown = 0;

//				this.playerbox.refreshName(i + 1);

				if (
					this.game.state.player[i].wager > 0 &&
					this.game.state.dealer !== i + 1
				) {
					newhtml = `<div class="chips">${this.app.crypto.convertStringToDecimalPrecision(
						this.game.state.player[i].credit -
							this.game.state.player[i].wager
					)} ${
						this.game.crypto || 'SAITO'
					}, Bet: ${this.app.crypto.convertStringToDecimalPrecision(
						this.game.state.player[i].wager
					)}</div>`;
				} else {
					newhtml = `<div class="chips">${this.app.crypto.convertStringToDecimalPrecision(
						this.game.state.player[i].credit
					)} ${this.game.crypto || 'SAITO'}</div>`;
				}

				if (this.game.state.dealer == i + 1) {
					newhtml += `<div class="player-notice dealer">DEALER</div>`;
				} else {
					newhtml += `<div class="player-notice">Player ${
						i + 1
					}</div>`;
				}
				//
//				this.playerbox.refreshInfo(newhtml, i + 1);
				newhtml = '';

				//Check for backup hands
				if (this.game.state.player[i].split.length > 0) {
					for (
						let z = 0;
						z < this.game.state.player[i].split.length;
						z++
					) {
						newhtml += `<div class="splithand">`;
						let ts = this.scoreArrayOfCards(
							this.game.state.player[i].split[z]
						);
						if (ts > 0) {
							newhtml += `<span>Score: ${ts}</span>`;
						} else {
							newhtml += `<span>Bust</span>`;
						}
						newhtml += this.handToHTML(
							this.game.state.player[i].split[z]
						);
						newhtml += '</div>';
					}
				}

//				if (
//					this.game.player !== i + 1 &&
//					this.game.state.player[i].total !== 0
//				) {
//					this.playerbox.refreshLog(
//						newhtml +
//							`<div class="status-info">Hand Score: ${
//								this.game.state.player[i].total > 0
//									? this.game.state.player[i].total
//									: 'Bust'
//							}</div>`,
//						i + 1
//					);
//				}

				if (
					this.game.state.player[i].hand &&
					this.game.player !== i + 1
				) {
					newhtml = '';

console.log("HAND LENGTH: " + JSON.stringify(this.game.state.player[i].hand));

					for (
						let y = this.game.state.player[i].hand.length;
						y < 2;
						y++
					) {
						newhtml += `<img class="card" src="${this.card_img_dir}/red_back.png">`;
					}
					for (let c of this.game.state.player[i].hand) {
						// show all visible cards
alert("showing: " + c);
						newhtml += `<img class="card" src="${this.card_img_dir}/${c}.png">`;
					}

//					this.playerbox.refreshGraphic(newhtml, i + 1);
				}
			}
		} catch (err) {
			console.error('Display Players err: ' + err);
		}
	}

	displayHand() {
		if (this.game.player == 0) {
			return;
		}
		try {
			let cardhtml = '';
			for (let c of this.myCards()) {
				cardhtml += `<img class="card" src="${this.card_img_dir}/${c}.png">`;
			}

			this.cardfan.render(cardhtml);

			//Add split hands
			if (this.game.state.player[this.game.player - 1].split.length > 0) {
				let newhtml = '';
				for (
					let z = 0;
					z <
					this.game.state.player[this.game.player - 1].split.length;
					z++
				) {
					let ts = this.scoreArrayOfCards(
						this.game.state.player[this.game.player - 1].split[z]
					);

					newhtml +=
						ts > 0
							? `<span>Score: ${ts}</span>`
							: `<span>Bust</span>`;

					newhtml += `<div class="splithand">`;
					newhtml += this.handToHTML(
						this.game.state.player[this.game.player - 1].split[z]
					);
					newhtml += '</div>';
				}
				this.playerbox.refreshGraphic(newhtml);
				$('#player-box-graphic-1').removeClass(
					'hidden-playerbox-element'
				);
			} else {
				$('#player-box-graphic-1').addClass('hidden-playerbox-element');
			}
		} catch (err) {
			console.error('Display Hand err: ' + err);
		}
	}

        updateStatus(str, hide_info = 0) {
	
                try {
                        //if (hide_info == 0) {
                        //      this.playerbox.showInfo();
                        //} else {
                        //      this.playerbox.hideInfo();
                        //}

//                        if (this.lock_interface == 1) {
//                                return;
//                        }
//
//                        this.game.status = str;
//
//                        if (this.browser_active == 1) {
//                                let status_obj = document.querySelector('.status');
//                                if (this.game.players.includes(this.publicKey)) {
//                                        status_obj.innerHTML = str;
//                                }
//                        }

console.log("uPDATING Status: " + str);

                } catch (err) {
                        console.error('ERR: ' + err);
                }
        }

        getLastNotice(preserveLonger = false) {
                if (document.querySelector('.status .persistent')) {
                        let nodes = document.querySelectorAll('.status .persistent');
                        return `<div class="${
                                preserveLonger ? 'persistent' : 'status-info'
                        }">${nodes[nodes.length - 1].innerHTML}</div>`;
                }

                return '';
        }

