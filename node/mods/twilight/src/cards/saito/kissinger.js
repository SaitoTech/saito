
    if (card == "kissinger") {

      let twilight_self = this;

      if (this.game.player == 1) {
        this.game.status = "US playing Kissinger:";
        this.hud.updateStatus(this.game.status);
        this.hud.updateMenu([]);
        this.hud.updateCards([]);
        return 0;
      }

      let user_message = "Designate a region to turn all 1-stability countries into battleground countries:";
      this.game.status = user_message;
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

	let selreg = "europe";
	if (action2 == "asia") { selreg = "Asia"; }
	if (action2 == "africa") { selreg = "Africa"; }
	if (action2 == "camerica") { selreg = "Central America"; }
	if (action2 == "samerica") { selreg = "South America"; }
	if (action2 == "mideast") { selreg = "Middle East"; }

        twilight_self.addMove("resolve\tkissinger");
        twilight_self.addMove("bgs");
        twilight_self.addMove(`SETVAR\tstate\tevents\tkissinger\t${action2}`);

	for (let i in twilight_self.countries) {
	  if (twilight_self.countries[i].region.indexOf(action2) != -1 && twilight_self.countries[i].control == 1) {
            twilight_self.addMove("SETVAR\tcountries\t"+i+"\tbg\t"+1);
            twilight_self.addMove("notify\t"+twilight_self.countries[i].name + " is now a battleground country");
	  }
	}

        twilight_self.endTurn();

      });

      return 0;
    }



