
    this.importFaction('faction4', {
      id		:	"faction4" ,
      name		: 	"Carapace Swarm",
      nickname		: 	"Carapace",
      homeworld		: 	"sector28",
      space_units	: 	["carrier","carrier","cruiser"],
      ground_units	: 	["infantry","infantry","infantry","infantry","infantry","spacedock"],
      tech		: 	["faction4-unrelenting", "faction4-exotrireme-i", "faction4-flagship"],
      background	: 	'faction4.jpg' ,
      promissary_notes	:	["trade","political","ceasefire","throne","faction4-promissary"],
      commodity_limit	:	3,
      intro             :       `You are the Carapace Swarm, a race of spiny teeth and jaws whose raw strength and imperviousness to pain has earned a grim reputatation.`
    });




    this.importTech('faction4-unrelenting', {

      name        :       "Unstoppable" ,
      faction     :       "faction4",
      type        :       "ability" ,
      text	  :	  "+1 on all combat rolls" ,
      onNewRound     :    function(imperium_self, player) {
        if (imperium_self.doesPlayerHaveTech(player, "faction4-unrelenting")) {
          imperium_self.game.state.players_info[player-1].faction4_unrelenting = 1;
        }
      },
      modifyCombatRoll :	  function(imperium_self, attacker, defender, player, combat_type, roll) {
	if (combat_type == "space" || combat_type == "ground") {
          if (imperium_self.doesPlayerHaveTech(attacker, "faction4-unrelenting")) {
  	    imperium_self.updateLog("Sardakk combat rolls +1 due to Sardakk");
	    roll += 1;
	    if (roll > 10) { roll = 10; }
	  }
        }
	return roll;
      },
    });


    this.importTech("faction4-flagship", {
      name        	:       "Carapace Flagship" ,
      faction     	:       "faction4",
      type      	:       "ability" ,
      text	  :	  "+1 on all combat rolls for ships in same sector" ,
      modifyCombatRoll :	  function(imperium_self, attacker, defender, player, combat_type, roll) {
	if (combat_type == "space") {
	  let flagship_bonus = 0;
	  if (imperium_self.doesSectorContainPlayerUnit(attacker, imperium_self.game.state.activated_sector, "flagship")) {
	    imperium_self.updateLog("Carapace Flagship adds +1 to dice roll");
	    roll += 1;
	    if (roll > 10) { roll = 10; }
	  } 
	}
        return roll;
      },
    });




    this.importTech("faction4-exotrireme-i", {

      name        :       "ExoSiege I" ,
      faction     :       "faction4",
      replaces    :       "dreadnaught",
      unit        :       1 ,
      type        :       "special",
      text	  :	  "A more powerful dreadnaught" ,
      prereqs     :       [],
      initialize :       function(imperium_self, player) {
        if (imperium_self.game.state.players_info[player-1].faction4_advanced_dreadnaught_i == undefined) {
          imperium_self.game.state.players_info[player-1].faction4_advanced_dreadnaught_i = 0;
        }
      },
      gainTechnology :       function(imperium_self, gainer, tech) {
        imperium_self.game.state.players_info[gainer-1].faction4_advanced_dreadnaught_i = 1;
      },
      upgradeUnit :       function(imperium_self, player, unit) {
        if (imperium_self.game.state.players_info[unit.owner-1].faction4_advanced_dreadnaught_i == 1 && unit.type == "dreadnaught") {
          unit.cost = 4;
          unit.combat = 5;
          unit.move = 1;
          unit.capacity = 1;
	  unit.strength = 2;
	  unit.bombardment_rolls = 2;
	  unit.bombardment_combat = 4;
	  unit.description = "The ExoSiege I is a more powerful dreadnaught not vulnerable to Kill Shot cards";
        }

        return unit;
      },

    });



    this.importTech("faction4-exotrireme-ii", {

      name        :       "ExoSiege II" ,
      faction     :       "faction4",
      replaces    :       "dreadnaught",
      unit        :       1 ,
      type        :       "special",
      prereqs     :       ["blue","blue","yellow"],
      text	  :	  "A much more powerful dreadnaught" ,
      initialize :       function(imperium_self, player) {
        if (imperium_self.game.state.players_info[player-1].faction4_advanced_dreadnaught_ii == undefined) {
          imperium_self.game.state.players_info[player-1].faction4_advanced_dreadnaught_ii = 0;
        }
      },
      gainTechnology :       function(imperium_self, gainer, tech) {
        imperium_self.game.state.players_info[gainer-1].faction4_advanced_dreadnaught_ii = 1;
        imperium_self.game.state.players_info[gainer-1].faction4_advanced_dreadnaught_i = 0;
      },
      upgradeUnit :       function(imperium_self, player, unit) {
        if (imperium_self.game.state.players_info[unit.owner-1].faction4_advanced_dreadnaught_ii == 1 && unit.type == "dreadnaught") {
          unit.cost = 4;
          unit.combat = 5;
          unit.move = 2;
          unit.capacity = 1;
	  unit.strength = 2;
	  unit.bombardment_rolls = 2;
	  unit.bombardment_combat = 4;
	  unit.description = "The ExoSiege II is a more powerful dreadnaught not vulnerable to Kill Shot cards. It may be destroyed after a round of space combat to destroy up to two opponent ships.";
        }
        return unit;
      },
      spaceCombatRoundEnd :    function(imperium_self, attacker, defender, sector) {
        if (imperium_self.game.player == attacker) {
          if (imperium_self.doesPlayerHaveTech(attacker, "faction4-exotrireme-ii")) {
	    if (imperium_self.doesSectorContainPlayerUnit(attacker, sector, "dreadnaught")) {
	      imperium_self.addMove("faction4_exotrireme_ii_sacrifice\t"+attacker+"\t"+sector);
	    }
	  }
          if (imperium_self.doesPlayerHaveTech(defender, "faction4-exotrireme-ii")) {
	    if (imperium_self.doesSectorContainPlayerUnit(defender, sector, "dreadnaught")) {
	      imperium_self.addMove("faction4_exotrireme_ii_sacrifice\t"+defender+"\t"+sector);
	    }
	  }
	  return 1;
        }
	return 0;
      },
      handleGameLoop : function(imperium_self, qe, mv) {

        if (mv[0] == "faction4_exotrireme_ii_sacrifice") {

          let player_to_go = parseInt(mv[1]);
          let sys = imperium_self.returnSectorAndPlanets(mv[2]);
          let opponent = imperium_self.returnOpponentInSector(player_to_go, mv[2]);

	  if (player_to_go == imperium_self.game.player) {

	    if (opponent == -1) {
	      imperium_self.addMove("resolve\tfaction4_exotrireme_ii_sacrifice");

	      imperium_self.addMove("NOTIFY\tNo target ships for Sardakk ExoSiege II faction ability");
	      imperium_self.endTurn();
	      return 0;
	    }

	    let anything_to_kill = 0;
	    for (let i = 0; i < sys.s.units[opponent-1].length; i++) {
	      if (sys.s.units[opponent-1][i].strength > 0) {
	        anything_to_kill = 1;
	      }
	    }

	    if (anything_to_kill == 0) {
	      imperium_self.addMove("resolve\tfaction4_exotrireme_ii_sacrifice");
	      imperium_self.addMove("NOTIFY\tNo target ships for Sardakk ExoSiege II action ability");
	      imperium_self.endTurn();
	      return 0;
	    }

            let html = '<div class="sf-readable">Do you wish to sacrifice a Dreadnaught to destroy up to 2 opponent ships?</div>';
            let menu = [];
	    for (let i = 0; i < sys.s.units[imperium_self.game.player-1].length; i++) {
	      if (sys.s.units[imperium_self.game.player-1][i].type == "dreadnaught") {
                menu.push({ id: String(i), label: 'sacrifice ' + imperium_self.returnShipInformation(sys.s.units[imperium_self.game.player-1][i]) });
	      }
	    }
            menu.push({ id: 'no', label: 'do not sacrifice' });

	    	    imperium_self.game.status = html;
	    imperium_self.hud.preparePrompt(imperium_self.game.status);
	    imperium_self.hud.updateCards([]);

            imperium_self.hud.updateMenu(menu, function (action2) {
	      if (action2 === "no") {
	        imperium_self.addMove("resolve\tfaction4_exotrireme_ii_sacrifice");
	        imperium_self.endTurn();
	        return 0;
	      }

	      imperium_self.addMove("resolve\tfaction4_exotrireme_ii_sacrifice");
 	      imperium_self.addMove("faction4_exotrireme_ii_picktwo\t"+imperium_self.game.player+"\t"+mv[2]);
 	      imperium_self.addMove("NOTIFY\tSardakk sacrifies Exotritreme II to destroy opponent ships");
 	      imperium_self.addMove("destroy_unit\t"+imperium_self.game.player+"\t"+imperium_self.game.player+"\t"+"space"+"\t"+mv[2]+"\t"+"0"+"\t"+action2+"\t"+"1");
	      imperium_self.endTurn();
	      return 0;
	    });
	  }
	  return 0;
        }



        if (mv[0] == "faction4_exotrireme_ii_picktwo") {

          let player_to_go = parseInt(mv[1]);
          let sys = imperium_self.returnSectorAndPlanets(mv[2]);

	  if (player_to_go == imperium_self.game.player) {
	    imperium_self.addMove("resolve\tfaction4_exotrireme_ii_picktwo");
	    imperium_self.playerDestroyOpponentShips(player_to_go, 2, mv[2]);
	  } else {
	    	    imperium_self.game.status = "ExoSiege II engaging in suicide assault";
	    imperium_self.hud.prepareIdle(imperium_self.game.status);
	    imperium_self.hud.updateCards([]);
	  }

	  return 0;

        }
      }
    });




    this.importTech('faction4-particle-weave', {
      name        :       "Particle Matrix" ,
      faction     :       "faction4",
      type        :       "special" ,
      prereqs	  :	["red","red"],
      text	  :	  "Infantry vaporize 1 opponent for each hit received" ,
      initialize : function(imperium_self, player) {
        if (imperium_self.game.state.players_info[player-1].faction4_particle_weave == undefined) {
          imperium_self.game.state.players_info[player-1].faction4_particle_weave = 0;
          imperium_self.game.state.players_info[player-1].faction4_particle_weave_opponent = 0;
          imperium_self.game.state.players_info[player-1].faction4_particle_weave_my_forces = 0;
        }
      },
      gainTechnology : function(imperium_self, gainer, tech) {
	if (tech == "faction4-particle-weave") {
          imperium_self.game.state.players_info[gainer-1].faction4_particle_weave = 1;
        }
      },
      groundCombatTriggers : function(imperium_self, player, sector, planet_idx) {
        if (imperium_self.doesPlayerHaveTech(player, "faction4-particle-weave")) {
	  //
	  // if player is in combat
	  //
	  let sys = imperium_self.returnSectorAndPlanets(sector);
          let planet = sys.p[planet_idx];
          imperium_self.game.state.players_info[player-1].faction4_particle_weave_my_forces = planet.units[player-1].length;

        }
        return 0;
      },

      groundCombatRoundEnd(imperium_self, attacker, defender, sector, planet_idx) { 

        if (imperium_self.doesPlayerHaveTech(attacker, "faction4-particle-weave")) {
	  let sys = imperium_self.returnSectorAndPlanets(sector);
	  let planet = sys.p[planet_idx];
	  let current_forces = planet.units[attacker-1].length;
	  if (current_forces < imperium_self.game.state.players_info[attacker-1].faction4_particle_weave_my_forces) {
	    imperium_self.updateLog("Sardakk Particle Matrix vaporizes 1 opponent infantry...");
	    for (let z = 0; z < planet.units[defender-1].length; z++) {
	      if (planet.units[defender-1][z].type == "infantry") {
		planet.units[defender-1].splice(z, 1);
		z = planet.units[defender-1].length+1;
	      }
	    }
	  }
	  imperium_self.saveSystemAndPlanets(sys);
	}

        if (imperium_self.doesPlayerHaveTech(defender, "faction4-particle-weave")) {
	  let sys = imperium_self.returnSectorAndPlanets(sector);
	  let planet = sys.p[planet_idx];
	  let current_forces = planet.units[defender-1].length;
	  if (current_forces < imperium_self.game.state.players_info[defender-1].faction4_particle_weave_my_forces) {
	    imperium_self.updateLog("Sardakk Particle Matrix vaporizes 1 opponent infantry...");
	    for (let z = 0; z < planet.units[attacker-1].length; z++) {
	      if (planet.units[attacker-1][z].type == "infantry") {
		planet.units[attacker-1].splice(z, 1);
		z = planet.units[attacker-1].length+1;
	      }
	    }
	  }
	  imperium_self.saveSystemAndPlanets(sys);
	}

	return 1; 
      }
    });




    this.importPromissary("faction4-promissary", {
      name        :       "Tekklar Legion",
      faction     :       -1,
      text        :       "Redeemer gets +1 on all combat rolls this combat, owner gets -1 if in combat",
      initialize  : function(imperium_self, player) {
	imperium_self.game.state.players_info[player - 1].tekklar_legion_modifier = 0;
      },
      modifySpaceCombatRoll : function(imperium_self, attacker, defender, roll) {
	let tmod = imperium_self.game.state.players_info[attacker - 1].tekklar_legion_modifier;
	if (tmod != 0) {
	  roll += tmod;
	  imperium_self.updateLog("Tekklar Legion applies modifier on combat rolls");
        }
	return roll;
      },
      modifySpaceCombatRoll : function(imperium_self, attacker, defender, roll) {
	let tmod = imperium_self.game.state.players_info[attacker - 1].tekklar_legion_modifier;
	if (tmod != 0) {
	  roll += tmod;
	  imperium_self.updateLog("Tekklar Legion applies modifier on combat rolls");
        }
	return roll;
      },
      modifyGroundCombatRoll : function(imperium_self, attacker, defender, roll) {
	let tmod = imperium_self.game.state.players_info[attacker - 1].tekklar_legion_modifier;
	if (tmod != 0) {
	  roll += tmod;
	  imperium_self.updateLog("Tekklar Legion applies modifier on combat rolls");
        }
	return roll;
      },
      modifyGroundCombatRoll : function(imperium_self, attacker, defender, roll) {
	let tmod = imperium_self.game.state.players_info[attacker - 1].tekklar_legion_modifier;
	if (tmod != 0) {
	  roll += tmod;
	  imperium_self.updateLog("Tekklar Legion applies modifier on combat rolls");
        }
	return roll;
      },
      spaceCombatTriggers : function(imperium_self, player, sector) {
	if (imperium_self.game.state.players_info[player - 1].tekklar_legion_modifier == 1) { return 0; };
        if (imperium_self.hasUnresolvedSpaceCombat(player, sector)) {
          if (imperium_self.doesPlayerHavePromissary(player, "faction4-promissary")) {
            if (imperium_self.returnPlayerOfFaction("faction4") != player) {
              return 1;
	    }
          }
        }
	return 0;
      },
      spaceCombatEvent : function(imperium_self, player, sector) {
        if (imperium_self.game.player == player) {

	  let sardaak_player = imperium_self.returnPlayerOfFaction("faction4");

          let html = `<div class="status-message">Do you wish to return your Sardaak Promissary for +1 combat bonus?</div>`;
              let menu = [];
              menu.push({ id: 'yes', label: 'Yes' });
              menu.push({ id: 'no', label: 'No' });

                    imperium_self.game.status = html;
          imperium_self.hud.preparePrompt(imperium_self.game.status);
          imperium_self.hud.updateCards([]);

          imperium_self.hud.updateMenu(menu, function(id) {

            if (id === "no") {
	      imperium_self.endTurn();
	    }
            if (id === "yes") {
	      let sardaak_player = imperium_self.returnPlayerOfFaction("faction4");
	      imperium_self.addMove("setvar\tplayers\t"+imperium_self.game.player+"\t"+"tekklar_legion_modifier"+"\t"+"int"+"\t"+"1");
	      imperium_self.addMove("setvar\tplayers\t"+sardaak_player+"\t"      +"tekklar_legion_modifier"+"\t"+"int"+"\t"+"-1");
              imperium_self.addMove("give" + "\t" + player + "\t" + sardaak_player + "\t" + "promissary" + "\t"+"faction4-promissary");
              imperium_self.addMove("NOTIFY" + "\t" + "Sardaak Promissary redeemed");
	      imperium_self.endTurn();
	    }
	  });
        }
	return 0;
      },
      groundCombatTriggers : function(imperium_self, player, sector, planet_idx) {
	if (imperium_self.game.state.players_info[player - 1].tekklar_legion_modifier == 1) { return 0; };
        if (imperium_self.hasUnresolvedGroundCombat(player, sector, planet_idx)) {
          if (imperium_self.doesPlayerHavePromissary(player, "faction4-promissary")) {
            if (imperium_self.returnPlayerOfFaction("faction4") != player) {
              return 1;
	    }
          }
        }
        return 0;
      },
      groundCombatEvent : function(imperium_self, player, sector, planet_idx) {
        if (imperium_self.game.player == player) {

          let html = `<div class="status-message">Do you wish to return your Sardaak Promissary for +1 combat bonus?</div>`;
              let menu = [];
              menu.push({ id: 'yes', label: 'Yes' });
              menu.push({ id: 'no', label: 'No' });

                    imperium_self.game.status = html;
          imperium_self.hud.preparePrompt(imperium_self.game.status);
          imperium_self.hud.updateCards([]);

          imperium_self.hud.updateMenu(menu, function(id) {

            if (id === "no") {
	      imperium_self.endTurn();
	    }
            if (id === "yes") {
	      let sardaak_player = imperium_self.returnPlayerOfFaction("faction4");
	      imperium_self.addMove("setvar\tplayers\t"+imperium_self.game.player+"\t"+"tekklar_legion_modifier"+"\t"+"int"+"\t"+"1");
	      imperium_self.addMove("setvar\tplayers\t"+sardaak_player           +"\t"+"tekklar_legion_modifier"+"\t"+"int"+"\t"+"-1");
              imperium_self.addMove("give" + "\t" + player + "\t" + sardaak_player + "\t" + "promissary" + "\t"+"faction4-promissary");
              imperium_self.addMove("NOTIFY" + "\t" + "Sardaak Promissary redeemed");
	      imperium_self.endTurn();
	    }
	  });
        }
	return 0;
      },
      spaceCombatRoundEnd : function(imperium_self, attacker, defender, sector) {
        if (imperium_self.hasUnresolvedSpaceCombat(attacker, sector) || imperium_self.hasUnresolvedSpaceCombat(defender, sector)) {
	  imperium_self.game.state.players_info[attacker - 1].tekklar_legion_modifier = 0;
	  imperium_self.game.state.players_info[defender - 1].tekklar_legion_modifier = 0;
	};
	return 1;
      },
      groundCombatRoundEnd : function(imperium_self, attacker, defender, sector, planet_idx) {
        if (imperium_self.hasUnresolvedGroundCombat(attacker, sector, planet_idx) || imperium_self.hasUnresolvedGroundCombat(defender, sector, planet_idx)) {
	  imperium_self.game.state.players_info[attacker - 1].tekklar_legion_modifier = 0;
	  imperium_self.game.state.players_info[defender - 1].tekklar_legion_modifier = 0;
	};
	return 1;
      }
    });




