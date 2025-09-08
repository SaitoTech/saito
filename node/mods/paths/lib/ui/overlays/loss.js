const LossTemplate = require('./loss.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class LossOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.visible = false;
		this.overlay = new SaitoOverlay(app, mod, false, true, false);
		this.faction = '';
		this.units = null;
		this.loss_factor = 0;
		this.starting_units = null;
		this.starting_loss_factor = null;
		this.moves = [];
		this.number_of_hits_assignable_attacker_units = 0;
		this.number_of_hits_assignable_defender_units = 0;
		this.sole_attacker_unit = null;
		this.sole_defender_unit = null;
		this.sole_attacker_unit_id = null;
		this.sole_defender_unit_id = null;
		this.sole_defender_unit_id = null;
		this.my_hits_auto_assigned = 0;
		this.hits_already_assigned = 0;
		this.priority_hits_required = 0;
		this.are_any_units_unassignable = 0;
	}	

	
	show() {
		this.overlay.show();
	}

	hide() {
		this.overlay.hide();
	}

	canTakeMoreLosses() {

		if (this.loss_factor == 0) {
			return false;
		}

		let x = [];
		for (let i = 0; i < this.units.length; i++) {
			x.push([]);
			if (this.units[i].damaged == false) {
				x[i].push(this.units[i].loss);
			}
			if (this.units[i].destroyed == false) {
				x[i].push(this.units[i].rloss);
				if (this.units[i].key.indexOf('army') > 0) {
					try {
						let corpskey = this.units[i].key.split('_')[0] + '_corps';
						let cunit = this.mod.cloneUnit(corpskey);
						x[i].push(cunit.loss);
						x[i].push(cunit.rloss);
					} catch (err) {
						// some armies cannot be reduced to corps
					}
				}
			}
		}

		for (let i = 0; i < x.length; i++) {
			if (this.loss_factor >= x[i][0]) {
				return true;
			}
		}

		return false;
	}


	showRetreatNotice() {
		// update the UI to show any hits taken
		this.render();
		try {
		  this.updateInstructions(`<div class="continue_btn">All Possible Damage Assigned - <span style="text-decoration:underline;cursor:pointer">Click to Continue</span></div>`);
		  document.querySelector(".continue_btn").onclick = (e) => {
		    this.hide();
		  }
		} catch (err) {}
	}

	updateInstructions(msg="") {
		let obj = document.querySelector(".loss-overlay .help");
		if (obj) {
			obj.innerHTML = "Combat in " + this.mod.returnSpaceName(this.mod.game.state.combat.key) + ": " + msg;
		}
	}maximum_hits_possible



	renderToAssignAdditionalStepwiseLoss(faction = "") {

		let qs = '.loss-overlay .units';
		let qs_attacker = '.loss-overlay .units.attacker';
		let qs_defender = '.loss-overlay .units.defender';
		let my_qs = '.loss-overlay .units.defender';
		let defender_units = this.mod.returnDefenderUnits();
		this.units = defender_units;
		let terrain = this.mod.game.spaces[this.mod.game.state.combat.key].terrain;

		this.overlay.show(LossTemplate(terrain));
		this.updateInstructions("Defender - Take Additional Hit to Cancel Retreat");

		for (let i = 0; i < defender_units.length; i++) {
			let dkey = defender_units[i].key;
			let dskey = defender_units[i].spacekey;
			let dd = 0; if (defender_units[i].damaged) { dd = 1; }
			html = `<div class="loss-overlay-unit" data-spacekey="${dskey}" data-key="${dkey}" data-damaged="${dd}" id="${i}">${this.mod.returnUnitImageWithMouseoverOfStepwiseLoss(defender_units[i])}</div>`;
			this.app.browser.addElementToSelector(html, qs_defender);
		}

		this.attachEvents(false, ".loss-overlay .units.defender", this.mod.game.state.combat.defender_power, true); // true = 1 more hit!
		this.loss_factor = 0; // this results in canTakeMoreLosses() to return NO after the first hit

	}

	render(faction = '') {

		this.faction = faction;

		let am_i_the_attacker = false;

		let space = this.mod.game.spaces[this.mod.game.state.combat.key];
		let terrain = space.terrain;
		let attacker_units;
		let defender_units;
		let attacker_loss_factor;
		let defender_loss_factor;
		let fort_bonus = 0;
		if (space.fort > 0) { fort_bonus = space.fort; }
		this.number_of_hits_assignable_attacker_units = 0;
		this.number_of_hits_assignable_defender_units = 0;
		this.my_hits_auto_assigned = 0;
		
		//
		// 
		//

		let qs = '.loss-overlay .units';
		let qs_attacker = '.loss-overlay .units.attacker';
		let qs_defender = '.loss-overlay .units.defender';
		let my_qs = '.loss-overlay .units.defender';

		attacker_units = this.mod.returnAttackerUnits();
		defender_units = this.mod.returnDefenderUnits();

console.log(JSON.stringify(this.mod.game.state.combat));
console.log("DEFENDER UNITS: " + JSON.stringify(defender_units));
console.log("ATTACKER UNITS: " + JSON.stringify(attacker_units));
 
		this.units = defender_units;

		if (
			faction == this.mod.game.state.combat.attacking_faction ||
			faction === 'attacker'
		) {
			am_i_the_attacker = true;
			my_qs = '.loss-overlay .units.attacker';
			this.units = attacker_units;
		}

		if (am_i_the_attacker) {
		  this.starting_units = JSON.parse(JSON.stringify(attacker_units));
		  this.starting_loss_factor = this.mod.game.state.combat.attacker_loss_factor;
		  this.loss_factor = this.starting_loss_factor;
		}  else {
		  this.starting_units = JSON.parse(JSON.stringify(defender_units));
		  this.starting_loss_factor = this.mod.game.state.combat.defender_loss_factor;
		  this.loss_factor = this.starting_loss_factor;
		}


		this.moves = [];

		this.overlay.show(LossTemplate(terrain));

		for (let i = 0; i < attacker_units.length; i++) {
			let html = "";
			let akey = attacker_units[i].key;
			let askey = attacker_units[i].spacekey;
			let ad = 0; if (attacker_units[i].damaged) { ad = 1; }
			if (!attacker_units[i].destroyed) {
				html = `<div class="loss-overlay-unit" data-spacekey="${askey}" data-key="${akey}" data-damaged="${ad}" id="${i}">${this.mod.returnUnitImageWithMouseoverOfStepwiseLoss(attacker_units[i])}<div class="loss-overlay-unit-spacekey">${this.mod.game.spaces[askey].name}</div></div>`;
				this.number_of_hits_assignable_attacker_units++;
				this.sole_attacker_unit = attacker_units[i];
				this.sole_attacker_unit_id = i;
			}
			this.app.browser.addElementToSelector(html, qs_attacker);
		}

		for (let i = 0; i < defender_units.length; i++) {
			let html = "";
			let dkey = defender_units[i].key;
			let dskey = defender_units[i].spacekey;
			let dd = 0; if (defender_units[i].damaged) { dd = 1; }
			if (!defender_units[i].destroyed) {
				html = `<div class="loss-overlay-unit" data-spacekey="${dskey}" data-key="${dkey}" data-damaged="${dd}" id="${i}">${this.mod.returnUnitImageWithMouseoverOfStepwiseLoss(defender_units[i])}<div class="loss-overlay-unit-spacekey">${this.mod.game.spaces[dskey].name}</div></div>`;
				this.number_of_hits_assignable_defender_units++;
				this.sole_defender_unit = defender_units[i];
				this.sole_defender_unit_id = i;
			}
			this.app.browser.addElementToSelector(html, qs_defender);
		}

		//
		// add battle information
		//
	        let lqs = ".loss-overlay .info .results_table ";

		document.querySelector(`${lqs} .row-1 .attacker_faction`).innerHTML = this.mod.game.state.combat.attacker_power;
		document.querySelector(`${lqs} .row-2 .defender_faction`).innerHTML = this.mod.game.state.combat.defender_power;

		if (this.mod.game.state.combat.attacker_power == "central") {
		  document.querySelector(`${lqs} .row-1 .attacker_faction`).classList.add("red");
		  document.querySelector(`${lqs} .row-2 .defender_faction`).classList.add("blue");
		  document.querySelector(`${lqs} .row-2 .col-6`).innerHTML = fort_bonus;
		} else {
		  document.querySelector(`${lqs} .row-1 .attacker_faction`).classList.add("blue");
		  document.querySelector(`${lqs} .row-2 .defender_faction`).classList.add("red");
		  document.querySelector(`${lqs} .row-2 .col-6`).innerHTML = fort_bonus;
		}

		document.querySelector(`${lqs} .row-1 .col-7 .attacker_roll_unmodified`).innerHTML = this.mod.game.state.combat.attacker_roll;
		document.querySelector(`${lqs} .row-2 .col-7 .defender_roll_unmodified`).innerHTML = this.mod.game.state.combat.defender_roll;

		document.querySelector(`${lqs} .row-1 .col-2 .attacker_roll`).innerHTML = this.mod.game.state.combat.attacker_modified_roll;
		document.querySelector(`${lqs} .row-2 .col-2 .defender_roll`).innerHTML = this.mod.game.state.combat.defender_modified_roll;

		document.querySelector(`${lqs} .row-1 .attacker_modifiers`).innerHTML = this.mod.game.state.combat.attacker_drm;
		document.querySelector(`${lqs} .row-2 .defender_modifiers`).innerHTML = this.mod.game.state.combat.defender_drm;

		document.querySelector(`${lqs} .row-1 .attacker_column_shift`).innerHTML = this.mod.game.state.combat.attacker_column_shift;
		document.querySelector(`${lqs} .row-2 .defender_column_shift`).innerHTML = this.mod.game.state.combat.defender_column_shift;

		document.querySelector(`${lqs} .row-1 .col-5 .attacker_damage`).innerHTML = this.mod.game.state.combat.defender_loss_factor;
		document.querySelector(`${lqs} .row-2 .col-5 .defender_damage`).innerHTML = this.mod.game.state.combat.attacker_loss_factor;

		//
		// show terrain effects
		//
		document.querySelectorAll(".effects_table .row").forEach((el) => { el.style.display = "none"; });
		document.querySelectorAll(".firing_table .row .col").forEach((el) => { el.style.color = "black"; });
		document.querySelectorAll(".firing_table .row .col").forEach((el) => { el.style.backgroundColor = "transparent"; });

		if (space.terrain == "normal")   { document.querySelector(".effects_table .clear").style.display = "contents"; }
		if (space.terrain == "mountain") { document.querySelector(".effects_table .mountain").style.display = "contents"; }
		if (space.terrain == "swamp")    { document.querySelector(".effects_table .swamp").style.display = "contents"; }
		if (space.terrain == "forest")   { document.querySelector(".effects_table .forest").style.display = "contents"; }
		if (space.terrain == "desert")   { document.querySelector(".effects_table .desert").style.display = "contents"; }
		if (space.trench == 1) 	  	 { document.querySelector(".effects_table .trench1").style.display = "contents"; }
		if (space.trench == 2) 		 { document.querySelector(".effects_table .trench2").style.display = "contents"; }

		//
		// add active card effects
		//
		for (let z = 0; z < this.mod.game.state.cc_allies_active.length; z++) {
		  let cc = this.mod.game.state.cc_allies_active[z];
		  let html = this.mod.popup(cc) + " ";
		  document.querySelector(".other_effects").innerHTML += html;
		}
		for (let z = 0; z < this.mod.game.state.cc_central_active.length; z++) {
		  let cc = this.mod.game.state.cc_central_active[z];
		  let html = this.mod.popup(cc) + " ";
		  document.querySelector(".other_effects").innerHTML += html;
		}

		//
		// 
		//
		let column_number = 0;
		let attacker_column_number = 0;
		let defender_column_number = 0;
		let attacker_table = this.mod.game.state.combat.attacker_table;
		let defender_table = this.mod.game.state.combat.defender_table;
		let attacker_power = this.mod.game.state.combat.attacker_power;
		let defender_power = this.mod.game.state.combat.defender_power;
		let attacker_strength = this.mod.game.state.combat.attacker_strength;
		let defender_strength = this.mod.game.state.combat.defender_strength;
		let attacker_modified_roll = this.mod.game.state.combat.attacker_modified_roll;
		let defender_modified_roll = this.mod.game.state.combat.defender_modified_roll;

		//
		// determine my faction
		//
		let am_iii_the_attacker = false;
		if (this.mod.game.player == this.mod.returnPlayerOfFaction(this.mod.game.state.combat.attacker_power)) { am_iii_the_attacker = true; }

		//
		// show dice rolls
		//
		let red_color = "#f2dade";			// red
		let red_color_lite = "#b6344a";			// lite-red
		let blue_color = "#dadcf2";			// blue
		let blue_color_lite = "#343ab6";		// lite-blue

		let attacker_color = red_color;
		let attacker_color_highlight = red_color_lite;
		let defender_color = blue_color;
		let defender_color_highlight = blue_color_lite;

		if (this.mod.game.state.combat.attacker_power === "allies") {
		  attacker_color = blue_color;
		  attacker_color_highlight = blue_color_lite;
		  defender_color = red_color;
		  defender_color_highlight = red_color_lite;
		}

		if (attacker_table == "army")  {
		  attacker_column_number = this.mod.returnArmyColumnNumber(attacker_strength); 
		  attacker_column_number += this.mod.game.state.combat.attacker_column_shift;
		  if (attacker_column_number < 0) { attacker_column_number = 0; }
		  if (attacker_column_number > 10) { attacker_column_number = 10; }
		  this.highlightFiringTable("army", attacker_color, attacker_color_highlight, attacker_modified_roll, attacker_column_number);
		}
		if (attacker_table == "corps") {
		  attacker_column_number = this.mod.returnCorpsColumnNumber(attacker_strength);
		  attacker_column_number += this.mod.game.state.combat.attacker_column_shift;
		  if (attacker_column_number < 0) { attacker_column_number = 0; }
		  if (attacker_column_number > 9) { attacker_column_number = 9; }
		  this.highlightFiringTable("corps", attacker_color, attacker_color_highlight, attacker_modified_roll, attacker_column_number);
		}
		let country_of_fort = this.mod.game.spaces[this.mod.game.state.combat.key].country;
		if (defender_table == "army")  {

	          //
    		  // forts lend their combat strength to the defense
    		  //
    		  if (this.mod.game.spaces[this.mod.game.state.combat.key].fort > 0) {
		    if (defender_power == "central" && ["germany", "austria", "bulgaria", "turkey"].includes(country_of_fort)) {
      		      defender_strength += this.mod.game.spaces[this.mod.game.state.combat.key].fort; 
		      fort_bonus = this.mod.game.spaces[this.mod.game.state.combat.key].fort;
		    }
		    if (defender_power == "allies" && ["england", "france", "russia", "serbia", "greece", "montenegro", "romania"].includes(country_of_fort)) {
      		      defender_strength += this.mod.game.spaces[this.mod.game.state.combat.key].fort; 
		      fort_bonus = this.mod.game.spaces[this.mod.game.state.combat.key].fort;
		    }
		  }

		  defender_column_number = this.mod.returnArmyColumnNumber(defender_strength);
		  defender_column_number += this.mod.game.state.combat.defender_column_shift;
		  if (defender_column_number < 0) { defender_column_number = 0; }
		  if (defender_column_number > 10) { defender_column_number = 10; }
		  this.highlightFiringTable("army", defender_color, defender_color_highlight, defender_modified_roll, defender_column_number);
		}
		if (defender_table == "corps") {

	          //
    		  // forts lend their combat strength to the defense
    		  //
    		  if (this.mod.game.spaces[this.mod.game.state.combat.key].fort > 0) {
		    if (defender_power == "central" && ["germany", "austria", "bulgaria", "turkey"].includes(country_of_fort)) {
      		      defender_strength += this.mod.game.spaces[this.mod.game.state.combat.key].fort; 
		    }
		    if (defender_power == "allies" && ["england", "france", "russia", "serbia", "greece", "montenegro", "romania"].includes(country_of_fort)) {
      		      defender_strength += this.mod.game.spaces[this.mod.game.state.combat.key].fort; 
		    }
		  }

		  defender_column_number = this.mod.returnCorpsColumnNumber(defender_strength);
		  defender_column_number += this.mod.game.state.combat.defender_column_shift;
		  if (defender_column_number < 0) { defender_column_number = 0; }
		  if (defender_column_number > 9) { defender_column_number = 9; }
		  this.highlightFiringTable("corps", defender_color, defender_color_highlight, defender_modified_roll, defender_column_number);
		}

		//
		// Update Information Panel 
		//
		if (faction == "attacker") {
	          if (this.mod.game.state.combat.flank_attack == "attacker") {
		    if (am_iii_the_attacker) {
		      this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} - Assign ${this.loss_factor} Damage Now`);
		    } else {
		      if (this.my_hits_auto_assigned) {
		        this.updateInstructions(`Your Hits Auto-Assigned - ${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      } else {
		        this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      }
		    }
	          }
		  if (this.mod.game.state.combat.flank_attack == "defender") {
		    if (am_iii_the_attacker) {
		      this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} - Assign ${this.loss_factor} Damage Now`);
		    } else {
		      if (this.my_hits_auto_assigned) {
		        this.updateInstructions(`Your Hits Auto-Assigned - ${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      } else {
		        this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      }
		    }
		  }
		  if (!this.mod.game.state.combat.flank_attack) {
		    if (am_iii_the_attacker) {
		      this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} - Assign ${this.loss_factor} Damage Now`);
		    } else {
		      if (this.my_hits_auto_assigned) {
		        this.updateInstructions(`Your Hits Auto-Assigned - ${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      } else {
		        this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      }
		    }
		  }
		} else {
	          if (this.mod.game.state.combat.flank_attack == "attacker") {
		    if (am_iii_the_attacker) {
		      if (this.my_hits_auto_assigned) {
		        this.updateInstructions(`Your Hits Auto-Assigned - ${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      } else {
		        this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.defender_power)} assigning ${this.loss_factor} hits`);
		      }
		    } else {
		      this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.defender_power)} - Assign ${this.loss_factor} Damage Now`);
		    }
	          }
		  if (this.mod.game.state.combat.flank_attack == "defender") {
		    if (am_iii_the_attacker) {
		      if (this.my_hits_auto_assigned) {
		        this.updateInstructions(`Your Hits Auto-Assigned - ${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      } else {
		        this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.defender_power)} assigning ${this.loss_factor} hits`);
		      }
		    } else {
		      this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.defender_power)} - Assign ${this.loss_factor} Damage Now`);
		    }
		  }
		  if (!this.mod.game.state.combat.flank_attack) {
		    if (am_iii_the_attacker) {
		      if (this.my_hits_auto_assigned) {
		        this.updateInstructions(`Your Hits Auto-Assigned - ${this.mod.returnFactionName(this.mod.game.state.combat.attacker_power)} assigning ${this.loss_factor} hits`);
		      } else {
		        this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.defender_power)} assigning ${this.loss_factor} hits`);
		      }
		    } else {
		      this.updateInstructions(`${this.mod.returnFactionName(this.mod.game.state.combat.defender_power)} - Assign ${this.loss_factor} Damage Now`);
		    }
		  }
		}


		if (am_iii_the_attacker == 1 && faction == "attacker") {
		  this.attachEvents(am_i_the_attacker, my_qs, faction);
		}
		if (am_iii_the_attacker == 0 && faction == "defender") {
		  this.attachEvents(am_i_the_attacker, my_qs, faction);
		}

	}

	highlightFiringTable(ftable="corps", color="blue", highlight_color="blue", defender_modified_roll=0, defender_column_number=0) {
		let qs = `.${ftable}_firing_table .firing_table `;
	        for (let i = 0; i <= defender_column_number; i++) {
			let obj = document.querySelector(`${qs} .row-${defender_modified_roll} .col-${i}`);
			if (obj.style.color == "black") { obj.style.backgroundColor = color; }
		}
	        for (let i = 0; i < defender_modified_roll; i++) {
			let obj = document.querySelector(`${qs} .row-${i} .col-${defender_column_number}`);
			if (obj.style.color == "black") { obj.style.backgroundColor = color; }
		}
		document.querySelector(`${qs} .row-${defender_modified_roll} .col-${defender_column_number}`).style.backgroundColor = highlight_color;
		document.querySelector(`${qs} .row-${defender_modified_roll} .col-${defender_column_number}`).style.color = "#FFFFFF";
	}



	assignHitToUnit(unit, unit_spacekey, unit_key, idx, el=null, am_i_the_attacker, my_qs, faction, just_one_more_hit) {

		let paths_self = this.mod;

		//
		// prevents auto-assigning next hit if only 1 unit left
		//
		this.hits_already_assigned = 1;

		if (unit.destroyed) { alert("destroyed"); }

		let didx = idx;
		let unit_idx = didx;

		//
		// withdrawal
		//
		if (unit.corps && unit.eligible_for_withdrawal_bonus && paths_self.game.state.events.withdrawal && paths_self.game.state.events.withdrawal_bonus_used != 1) {
		  try { salert("Withdrawal Negates 1 Corps Stepwise Loss..."); } catch (err) {}
		  if (unit.damaged) {
		    this.loss_factor -= unit.rloss;
		  } else {
		    this.loss_factor -= unit.loss;
		  }
		  paths_self.game.state.events.withdrawal_bonus_used = 1;
		}

		if (unit.damaged) {

			this.moves.push(`damage\t${unit_spacekey}\t${unit_key}\t1\t${paths_self.game.player}`);
			this.loss_factor -= unit.rloss;

			unit.damaged = true;
			unit.destroyed = true;
			unit.damaged_this_combat = true;

			if (el != null) {
			  el.style.opacity = '0.3';
			  el.onclick = (e) => {};
			  el.id = "destroyed_unit";
			}

			//
			// replace with corps if destroyed
			//
			if (unit.key.indexOf('army') > 0) {

				let corpsbox = "arbox";
				if (paths_self.returnFactionOfPlayer() == "central") { corpsbox = "crbox"; }
				let corpskey = unit.key.split('_')[0] + '_corps';
				let corpsunit = paths_self.cloneUnit(corpskey);
				corpsunit.attacked = 1; // we don't want to give this the op to attack
				corpsunit.damaged_this_combat = true; // used to be an army...
				corpsunit.spacekey = unit.spacekey;

				if (paths_self.doesSpaceHaveUnit(corpsbox, corpskey)) {
					this.units.push(corpsunit);
					if (am_i_the_attacker) {
					  paths_self.game.spaces[corpsunit.spacekey].units.push(corpsunit);
					  paths_self.game.state.combat.attacker.push({ key : paths_self.game.state.combat.key , unit_idx : paths_self.game.spaces[corpsunit.spacekey].units.length-1 , unit_sourcekey : corpsunit.spacekey });
					}
					this.moves.push(`add\t${unit.spacekey}\t${corpskey}\t${this.mod.game.player}\tattacked`);
					this.moves.push(`remove\t${corpsbox}\t${corpskey}\t${this.mod.game.player}`);
					this.mod.removeUnit(corpsbox, corpskey);
					let html = `<div class="loss-overlay-unit" data-spacekey="${corpsunit.spacekey}" data-key="${corpskey}" data-damaged="0" id="${this.units.length - 1}">${this.mod.returnUnitImageWithMouseoverOfStepwiseLoss(this.units[this.units.length - 1], false, true)}</div>`;
					this.app.browser.addElementToSelector(html, my_qs);
					//
					// replace our specified element
					//
console.log("MY_QS: " + my_qs);
					if (el != null) {
						let container = document.querySelector(my_qs);
						el = container.querySelector('.loss-overlay-unit:last-child');
					}
				}


				//
				// auto-assignment relies on the unit being properly 
				// identified. so we assign the first non-destroyed corps
				// as the unit for taking auto-hits assigment...
				//
				let attacker_units = paths_self.returnAttackerUnits();
				let defender_units = paths_self.returnDefenderUnits();

				if (faction == "attacker") {
					for (let y = 0; y < attacker_units.length; y++) {
						if (!attacker_units[y].destroyed) {
							this.sole_defender_unit_id = y;
							this.sole_defender_unit = attacker_units[y];
						}
					}
				}
				if (faction == "defender") {
					for (let y = 0; y < defender_units.length; y++) {
						if (!defender_units[y].destroyed) {
							this.sole_defender_unit_id = y;
							this.sole_defender_unit = defender_units[y];
						}
					}
				}

				//
				// now handled below...
				//
		  		if (el != null) { this.attachEvents(am_i_the_attacker, my_qs, faction, just_one_more_hit); }

			}

			//
			// move to eliminated box
			//
                	let f = this.mod.returnPowerOfUnit(unit);
		      	this.updateInstructions(`${this.mod.returnFactionName(this.mod.returnFactionOfPlayer(this.mod.game.player))} - Assign ${this.loss_factor} More Damage`);

		} else {

			this.moves.push(`damage\t${unit_spacekey}\t${unit_key}\t0\t${this.mod.game.player}`);
			unit.damaged = true;
			unit.damaged_this_combat = true;
			this.loss_factor -= unit.loss;
			if (el != null) { el.innerHTML = this.mod.returnUnitImageWithMouseoverOfStepwiseLoss(unit, false, true); }
		      	this.updateInstructions(`${this.mod.returnFactionName(this.mod.returnFactionOfPlayer(this.mod.game.player))} - Assign ${this.loss_factor} More Damage`);

		}


		//
		// redisplay space
		//
		this.mod.displaySpace(this.mod.game.state.combat.key);


		if (!this.canTakeMoreLosses()) {
			document
				.querySelectorAll('.loss-overlay-unit')
				.forEach((el) => {
					el.onclick = (e) => {};
				});
				for (let i = this.moves.length - 1; i >= 0; i--) {
					this.mod.addMove(this.moves[i]);
				}
				this.mod.updateStatus("processing..."); // prevent re-rendering from options
				this.mod.endTurn();
		} else {

		  	//
		  	// automatic hits assignment
		  	//
			if (el == null) {
		  		this.attachEvents(am_i_the_attacker, my_qs, faction, just_one_more_hit);
			}

		}

		//
		// negative loss factor = we're cancelling hits
		//
		if (this.loss_factor <= 0) { 
			this.hide();
		}

	}


	attachEvents(am_i_the_attacker, my_qs, faction, just_one_more_hit=false) {

		let paths_self = this.mod;

		if (!this.canTakeMoreLosses() && just_one_more_hit == false) {
				for (let i = this.moves.length - 1; i >= 0; i--) {
					paths_self.addMove(this.moves[i]);
				}
				paths_self.updateStatus("processing..."); // prevent re-rendering from options
				paths_self.endTurn();
				return;
		}

		this.hits_already_assigned = 0;

		if (faction === "defender" && this.number_of_hits_assignable_defender_units == 1) {
			let idx = this.sole_defender_unit_id;
			let unit = this.sole_defender_unit;
			let unit_key = this.sole_defender_unit.key;
			let unit_spacekey = this.sole_defender_unit.spacekey;
			this.assignHitToUnit(unit, unit_spacekey, unit_key, idx, null, am_i_the_attacker, my_qs, faction, just_one_more_hit);
			this.hits_already_assigned = 1;
			this.updateInstructions("Your Hits Automatically Assigned...");
			return;
		}

		if (faction === "attacker" && this.number_of_hits_assignable_attacker_units == 1) {
			let idx = this.sole_attacker_unit_id;
			let unit = this.sole_attacker_unit;
			let unit_key = this.sole_attacker_unit.key;
			let unit_spacekey = this.sole_attacker_unit.spacekey;
			this.assignHitToUnit(unit, unit_spacekey, unit_key, idx, null, am_i_the_attacker, my_qs, faction, just_one_more_hit);
			this.hits_already_assigned = 1;
			this.updateInstructions("Your Hits Automatically Assigned...");
			return;
		}


		this.updateAssignableUnits(am_i_the_attacker);


		document.querySelectorAll(my_qs + " .loss-overlay-unit").forEach((el) => {

			el.onclick = (e) => {

				this.updateAssignableUnits();

				let idx = e.currentTarget.id;
				let unit = this.units[idx];

				if (unit.unassignable == 1) {
				  if (this.priority_hits_required == 1) {
alert("Units exist which take priority damage... assign first hit to priority target...");
return;
				  } else {
alert("This unit cannot be assigned hits without leaving unassignable damage... assign hits to damaged army first...");
return;
				  }

				}

				let unit_key = e.currentTarget.dataset.key;
				let unit_spacekey = e.currentTarget.dataset.spacekey;

				this.assignHitToUnit(unit, unit_spacekey, unit_key, idx, el, am_i_the_attacker, my_qs, faction, just_one_more_hit);

			};

		});
	}


	updateAssignableUnits() {

		//
		// unset
		//
                for (let z = 0; z < this.units.length; z++) {
		  this.units[z].unassignable = 0;
		}

		//
		// first hit must be to one of these units...
		//
		this.priority_hits_required = 0;
		if (this.hits_already_assigned == 0) {
		  let priority_found = 0;
                  for (let z = 0; z < this.units.length; z++) {
                    let u = this.units[z];
		    if (u.priority > 0 && u.priority > priority_found) {
		      priority_found = u.priority;
		      for (let zz = 0; zz < this.units.length; zz++) {
			this.units[zz].unassignable = 0;
		        this.priority_hits_required = 1;
		        if (this.units[zz].priority < u.priority) { this.units[zz].unassignable = 1; }
		      }
		    }
		  }
		}


		if (this.priority_hits_required == 1) { return; }


                //
                // calculate maximum deadzone losses
                //
                // the "deadzone" variable associated with all units refers to the difference
                // between the loss factor they take at this step, and the loss-factor they
                // take as a reduced corps.
                //
                // In situations where we have a damaged army AND an undamaged army in our
                // units and the loss factor of the damaged unit + deadzone < 5, while all
                // undamaged armies have loss factors of 3 (individually) we need to assign
                // the hits to our damaged armies first.
                //
                this.are_any_units_unassignable = 0;
                let damaged_armies = false;
                let undamaged_armies = false;
                let corps_in_play = false;
                let corps_damage = 0;
                let undamaged_min_loss = 100;
                let damaged_max_loss = 0;
                for (let z = 0; z < this.units.length; z++) {
                  this.units[z].unassignable = 0;
                  if (!this.units[z].destroyed) {
                    if (this.units[z].corps) {
                      corps_in_play = true;
                      if (this.units[z].damaged) { corps_damage += 1; } else { corps_damage += 2; }
                    } else {
                      if (this.units[z].army) {
                        if (this.units[z].damaged) {
                          damaged_armies = true;
                          let max_loss = this.units[z].rloss + 2;
                          if (max_loss > damaged_max_loss) {
                            damaged_max_loss = max_loss;
                          }
                        } else {
                          undamaged_armies = true;
                          let min_loss = this.units[z].loss;
                          if (min_loss < undamaged_min_loss) {
                            undamaged_min_loss = min_loss;
                          }
                        }
                      }
                    }
                  }
                }

console.log("damaged armies: " + damaged_armies);
console.log("undamaged_armies: " + undamaged_armies);
console.log("corps_in_play: " + corps_in_play);
console.log("corps_damage: " + corps_damage);
console.log("undamaged_min_loss: " + undamaged_min_loss);
console.log("damaged_max_loss: " + damaged_max_loss);
console.log("loss_factor: " + this.loss_factor);

		//
		// loss factor is the same as the undamaged army, but corps exist
		//
		if (this.loss_factor == undamaged_min_loss && (corps_damage > 0 && corps_damage < this.loss_factor)) {
                  for (let z = 0; z < this.units.length; z++) {
		    if (this.units[z].corps) {
                      this.units[z].unassignable = 1;
                      this.are_any_units_unassignable = 1;
		    }
		  }
		}


                //
                // we need to force assign hits when the min loss of the smallest
                // undamaged army is LESS than the loss factor, but MORE than the
                // MIN damaged army + its corps potential, and when there are no
                // corps in play that can soak up the remainder
                //
                if (damaged_armies && undamaged_armies) {
                  //
                  // if the full army + any corps cannot soak up all damage
                  //
                  if ((undamaged_min_loss + corps_damage) < this.loss_factor) {
                    //
                    // but the undamaged army + corps + future hits can...
                    //
                    if ((damaged_max_loss + corps_damage) >= this.loss_factor) {
                      for (let z = 0; z < this.units.length; z++) {
                        if (!this.units[z].destroyed) {
                          if (this.units[z].army && !this.units[z].damaged) {
                            this.units[z].unassignable = 1;
                            this.are_any_units_unassignable = 1;
                          }
                        }
                      }
                    }
                  }
                }

	}

}

module.exports = LossOverlay;
