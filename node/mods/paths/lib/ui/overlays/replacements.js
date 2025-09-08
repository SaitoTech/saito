const ReplacementsTemplate = require('./replacements.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ReplacementsOverlay {

	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.visible = false;
		this.overlay = new SaitoOverlay(app, mod);
	}

	hide() {
		this.mod.updateStatus("submitting...");
		this.visible = false;
		this.overlay.hide();
	}

        pullHudOverOverlay() {
                //
                // pull GAME HUD over overlay
                //
                let overlay_zindex = parseInt(this.overlay.zIndex);
                if (document.querySelector('.hud')) {
                        document.querySelector('.hud').style.zIndex = overlay_zindex + 1;
                        this.mod.hud.zIndex = overlay_zindex + 1;
                }
        }
        pushHudUnderOverlay() {
                //
                // push GAME HUD under overlay
                //
                let overlay_zindex = parseInt(this.overlay.zIndex);
                if (document.querySelector('.hud')) {
                        document.querySelector('.hud').style.zIndex = overlay_zindex - 2;
                        this.mod.hud.zIndex = overlay_zindex - 2;
                }
        }

	render() {

		let paths_self = this.mod;
		let faction = paths_self.returnFactionOfPlayer();

                paths_self.game.state.is_movement_from_outside_near_east = true;

		this.visible = true;
		this.overlay.show(ReplacementsTemplate());

		let pts = document.querySelector('.replacements-overlay .points');
		pts.innerHTML = "";
		for (let key in paths_self.game.state.rp[faction]) {
		  if (paths_self.game.state.rp[faction][key] > 0) {
		    pts.innerHTML += `
		      <div class="box">
		        <div class="num">${paths_self.game.state.rp[faction][key]}</div>
		        <div class="ckey">${key}</div>
		      </div>
		    `;
		  }
		}

		let obj = document.querySelector('.replacements-overlay .mainmenu .status');
		obj.innerHTML = "Select Option:";

		let obk = document.querySelector('.replacements-overlay .mainmenu .controls');	
		let html = '<ul>';
		for (let z = 0; z < paths_self.game.state.replacements.options.length; z++) {
		  html += paths_self.game.state.replacements.options[z];
		}
		html += "</ul>";
		obk.innerHTML = html;

		document.querySelectorAll(".replacements-overlay .mainmenu .controls ul li").forEach((el) => {

			el.onclick = (e) => {
			
				let id = e.currentTarget.id;
				
				if (id == "finish") {
					this.hide();
					paths_self.endTurn();
					return 1;
				}

				this.showSubMenu(id);

			}

		});

	}


	hideSubMenu() {
		try {
			document.querySelector('.replacements-overlay .submenu').style.visibility = "hidden";
		} catch (err) {}
	}

	showSubMenu(id="uneliminate") {

		let paths_self = this.mod;
		let eu = paths_self.game.state.replacements.can_uneliminate_unit_array;
		if (id == "repair_board") {
		  eu = paths_self.game.state.replacements.can_repair_unit_on_board_array;
		}
		if (id == "repair_reserves") {
		  eu = paths_self.game.state.replacements.can_repair_unit_in_reserves_array;
		}
		if (id == "deploy") {
		  let units_available = {};
		  eu = paths_self.game.state.replacements.can_deploy_unit_in_reserves_array;
		  for (let i = eu.length-1; i >= 0; i--) {
		    let u = paths_self.game.spaces[eu[i].key].units[eu[i].idx];
		    if (!paths_self.doReplacementPointsExistForUnit(u)) {
		      eu.splice(i, 1);
		    } else {
		      if (!units_available[eu[i].name]) { units_available[eu[i].name] = 1; } else {
			eu.splice(i, 1);
		      }
		    }
		  }
		}

		let obk = document.querySelector('.replacements-overlay .submenu .controls');	
		let html = '<ul>';
		for (let z = 0; z < eu.length; z++) {
		  html += `<li class="option" id="${z}">${eu[z].ckey} ${eu[z].name} - ${paths_self.game.spaces[eu[z].key].name}</li>`;
		}
		html += "</ul>";
		obk.innerHTML = html;

		document.querySelectorAll(".replacements-overlay .submenu .controls ul li").forEach((el) => {

			el.onclick = (e) => {

				let z = parseInt(e.currentTarget.id);
				let unit = paths_self.game.spaces[eu[z].key].units[eu[z].idx];
				let faction = paths_self.returnFactionOfPlayer();

				//
				// deduct RP
				//
				if (paths_self.game.state.rp[faction][unit.ckey] > 0) {
					paths_self.game.state.rp[faction][unit.ckey]--;
				} else {
					if (paths_self.game.state.rp[faction]["CP"] > 0) {
						paths_self.game.state.rp[faction]["CP"]--;
					} else {
						if (paths_self.game.state.rp[faction]["AP"] > 0) {
							paths_self.game.state.rp[faction]["AP"]--;
						} else {
							if (paths_self.game.state.rp[faction]["A"] > 0) {
								paths_self.game.state.rp[faction]["A"]--;
							} else {
								alert("You do not seem to have enough RPs to treat that unit...");
								return;
							}
						}
					}
				}

				if (id == "uneliminate") {
        				paths_self.game.spaces[eu[z].key].units[eu[z].idx].destroyed = 0;
        				paths_self.game.spaces[eu[z].key].units[eu[z].idx].damaged = 1;
        				if (paths_self.returnFactionOfPlayer() == "central") {
						paths_self.moveUnit(eu[z].key, eu[z].idx, "crbox");
						paths_self.prependMove(`NOTIFY\t${paths_self.returnFactionName(faction)} uneliminates ${unit.name}`);
						paths_self.prependMove(`repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`);
        					paths_self.prependMove(`move\t${faction}\t${eu[z].key}\t${eu[z].idx}\tcrbox\t${paths_self.game.player}`);
        				} else {
						paths_self.moveUnit(eu[z].key, eu[z].idx, "arbox");
						paths_self.prependMove(`NOTIFY\t${paths_self.returnFactionName(faction)} uneliminates ${unit.name}`);
						paths_self.prependMove(`repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`);
        					paths_self.prependMove(`move\t${faction}\t${eu[z].key}\t${eu[z].idx}\tarbox\t${paths_self.game.player}`);
        				}
        				paths_self.displaySpace(eu[z].key);
        				paths_self.displaySpace("arbox");
        				paths_self.displaySpace("crbox");
					paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
				}
				if (id == "repair_reserves") {
          				paths_self.game.spaces[eu[z].key].units[eu[z].idx].damaged = 0;
					paths_self.prependMove(`NOTIFY\t${paths_self.returnFactionName(faction)} repairs ${unit.name} (reserves)`);
				        paths_self.prependMove(`repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`);
          				paths_self.displaySpace(eu[z].key);
					paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
				}
				if (id == "repair_board") {
          				paths_self.game.spaces[eu[z].key].units[eu[z].idx].damaged = 0;
					paths_self.prependMove(`NOTIFY\t${paths_self.returnFactionName(faction)} repairs ${unit.name} (${paths_self.returnSpaceNameForLog(eu[z].key)})`);
				        paths_self.prependMove(`repair\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${paths_self.game.player}`);
          				paths_self.displaySpace(eu[z].key);
					paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
				}
				if (id == "deploy") {

					this.hideSubMenu();

					paths_self.game.state.does_movement_start_outside_near_east = 1;
					paths_self.game.state.does_movement_start_inside_near_east = 0;

					paths_self.playerSelectSpaceWithFilter(

              					`Destination for ${unit.name}` ,

              					(spacekey) => { 

							if (paths_self.game.spaces[spacekey].control == faction) {

								if (spacekey == "belgrade" && unit.ckey == "SB") {
									if (paths_self.game.spaces["nis"].control == "central") { return 0; }
								}

								if (paths_self.game.spaces[spacekey].besieged == 1) { return 0; }

								if (paths_self.game.spaces[spacekey].units.length > 0) {

									for (let z = 0; z < paths_self.game.spaces[spacekey].units.length; z++) {
									  let u = paths_self.game.spaces[spacekey].units[z];

									  if (faction != paths_self.returnPowerOfUnit(u)) {
										return 0;
									  }

									  if (u.ckey == unit.ckey) { return 1; }


									}
								}

								//
								// Serbs at Salonika
								//
								if (spacekey == "salonika") {
									if (unit.ckey == "SB" && (paths_self.game.state.events.salonika || paths_self.game.state.events.greek_neutral_entry)) {
										return 1;
									}
								}

								//
								// Belgian
								//
								if (unit.ckey == "BE") {
									if (spacekey == "brussels") { return 1; }
									if (spacekey == "ostend") { return 1; }
									if (spacekey == "antwerp") { 
										if (paths_self.checkSupplyStatus(unit.ckey.toLowerCase(), spacekey) == 1) {
											return 1;
										}
									}
									if (spacekey == "calais") {
										if (
											paths_self.game.spaces["brussels"].control == "central" &&
											paths_self.game.spaces["ostend"].control == "central" &&
											(paths_self.game.spaces["antwerp"].control == "central" || 
											!paths_self.checkSupplyStatus(unit.ckey.toLowerCase(), "antwerp"))
										) {
											return 1;
										}
									}
								}


								if (paths_self.checkSupplyStatus(unit.ckey.toLowerCase(), spacekey) == 1) {
									if (paths_self.game.spaces[spacekey].units.length < 3) {

         								        //
        									// is this on the near east?
        									//
	        								if (paths_self.isSpaceOnNearEastMap(spacekey)) {
        								    	  if (!paths_self.canPlayerDeployUnitIntoNearEast(faction, unit)) {
										    return 1;
										  }
										  return 0;
										}

										return 1;
									}
								}
 							}
							return 0;
						} ,
              					(spacekey) => {

							if (spacekey === "mainmenu") {
								this.render();
								return 1;
							}

 							if (paths_self.isSpaceOnNearEastMap(spacekey)) {
							  paths_self.game.state.does_movement_end_outside_near_east = 0;
							  paths_self.game.state.does_movement_end_inside_near_east = 1;
							  paths_self.trackDeploymentIntoNearEast(faction, unit);
							} else {
							  paths_self.game.state.does_movement_end_outside_near_east = 1;
							  paths_self.game.state.does_movement_end_inside_near_east = 0;
							  paths_self.trackDeploymentIntoNearEast(faction, unit);
							}

					              	paths_self.updateStatus("moving...");
              						paths_self.moveUnit(eu[z].key, eu[z].idx, spacekey);
							paths_self.prependMove(`NOTIFY\t${paths_self.returnFactionName(faction)} deploys ${unit.name} to ${paths_self.returnSpaceNameForLog(eu[z].key)}`);
              						paths_self.prependMove(`move\t${faction}\t${eu[z].key}\t${eu[z].idx}\t${spacekey}\t${paths_self.game.player}`);
              						paths_self.displaySpace(eu[z].key);
              						paths_self.displaySpace(spacekey);
							paths_self.playerSpendReplacementPoints(paths_self.returnFactionOfPlayer());
						},
              					null ,
             					true ,
						[{ key : "mainmenu" , value : "back to menu" }] ,
            				);
				}
			}

		});

		try {
			document.querySelector('.replacements-overlay .submenu').style.visibility = "visible";
		} catch (err) {
		}
	}

}

module.exports = ReplacementsOverlay;
