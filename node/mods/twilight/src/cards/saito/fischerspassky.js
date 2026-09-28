
    if (card == "fischerspassky") {

      this.startClockAndSetActivePlayer(this.roles.indexOf(player));

      if (!i_played_the_card) {
        this.game.status = "Opponent playing Fischer-Spassky";
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
        return 0;
      }

      let twilight_self = this;

      this.game.status = "Fischer-Spassky triggered. Designate region to downgrade Control and Dominance:";
      this.hud.updateStatus(this.game.status);
      this.hud.updateCards([]);
      this.hud.updateMenu([
        { id: 'asia', label: 'Asia' },
        { id: 'europe', label: 'Europe' },
        { id: 'africa', label: 'Africa' },
        { id: 'camerica', label: 'Central America' },
        { id: 'samerica', label: 'South America' },
        { id: 'mideast', label: 'Middle-East' }
      ], function(action2) {
        twilight_self.addMove("resolve\tfischerspassky");
        twilight_self.addMove(`SETVAR\tstate\tevents\tfischerspassky\t${action2}`)
        twilight_self.addMove("NOTIFY\tFischer-Spassky is evented targetting "+action2);
        twilight_self.endTurn();
      });

      return 0;
    }



