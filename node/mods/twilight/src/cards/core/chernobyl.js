
    if (card == "chernobyl") {

      this.startClockAndSetActivePlayer(2);

      if (this.game.player == 1) {
        return 0;
      }

      let twilight_self = this;

      this.game.status = "Chernobyl triggered. Designate region to prohibit USSR placement of influence from OPS:";
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

        twilight_self.addMove("resolve\tchernobyl");
        twilight_self.addMove("chernobyl\t"+action2);
        twilight_self.addMove("NOTIFY\tUS restricts placement in "+action2);
        twilight_self.endTurn();

      });

      return 0;
    }



