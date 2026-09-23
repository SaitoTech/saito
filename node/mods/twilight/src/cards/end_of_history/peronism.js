
    if (card == "peronism") {

      let twilight_self = this;
      let me = "ussr";
      let opponent = "us";
      if (this.game.player == 2) { opponent = "ussr"; me = "us"; }

      this.placeInfluence("argentina", 1, "us");
      this.placeInfluence("argentina", 1, "ussr");

      if (player != me) {
        this.game.status = "Opponent deciding to add influence to or coup or realign Argentina";
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
        return 0;

      } else {

        this.game.status = "Do you choose to:";
        this.hud.updateStatus(this.game.status);
        this.hud.updateCards([]);
        this.hud.updateMenu([
          { id: 'place', label: 'place 1 influence in Argentina' },
          { id: 'couporrealign', label: 'coup or realign Argentina' }
        ], function(action2) {
          if (action2 == "place") {
            twilight_self.placeInfluence("argentina", 1, player, function() {
              twilight_self.addMove("resolve\tperonism");
              twilight_self.addMove("place\t"+player+"\t"+player+"\targentina\t1");
              twilight_self.addMove("notify\t"+player+" places an extra influence in Argentina");
              twilight_self.endTurn();
            });
          }
          if (action2 == "couporrealign") {
            let user_message = "Do you choose to:";
            twilight_self.game.status = user_message;
            twilight_self.hud.updateStatus(twilight_self.game.status);
            twilight_self.hud.updateCards([]);
            twilight_self.hud.updateMenu([
              { id: 'coup', label: 'coup in Argentina' },
              { id: 'realign', label: 'realign in Argentina' }
            ], function(action2) {

              let modified_ops = twilight_self.modifyOps(1, "peronism", me);

              if (action2 == "coup") {
                twilight_self.addMove("resolve\tperonism");
                twilight_self.addMove("coup\t"+player+"\targentina\t"+modified_ops+"\tperonism");
                twilight_self.endTurn();
              }
              if (action2 == "realign") {
                twilight_self.addMove("resolve\tperonism");
                let result = twilight_self.playRealign("argentina");
                modified_ops--;
                if (modified_ops > 0) {
                  user_message = "You have an OP Bonus. Realign again?:";
                  html = `<ul>
                          <li class="option" id="realign">realign in Argentina</li>
                          <li class="option" id="skip">no, please stop</li>
                          </ul>`;
                  //Is there a bug here?? 

                  let action2 = $(this).attr("id");
                  if (action2 == "realign") {
                    let result2 = twilight_self.playRealign("argentina");
                    twilight_self.addMove("realign\t"+player+"\targentina");
                    twilight_self.addMove("realign\t"+player+"\targentina");
                  }
                  if (action2 == "skip") {
                    twilight_self.addMove("realign\t"+player+"\targentina");
                    twilight_self.endTurn();
                  }

                } else {
                  twilight_self.addMove("realign\t"+player+"\targentina");
                  twilight_self.endTurn();
                }

                twilight_self.playerFinishedPlacingInfluence();
                twilight_self.endTurn();
              }
            });
          }
        });
      }

      return 0;
    }

