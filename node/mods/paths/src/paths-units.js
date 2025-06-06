
  returnFactionOfUnit(unit) { return this.returnPowerOfUnit(unit); }
  returnPowerOfUnit(unit) {

    try { if (!unit.ckey) { unit = this.game.units[unit]; } } catch (err) {}

    let allied = ["FR", "RU", "BR", "BE", "IT", "US", "ANA", "AUS", "BEF", "CAU", "CND", "CZL", "GR", "MEF", "MN", "NE", "OA", "POL", "PT" , "RO", "SB"];
    let central = ["GE", "AH", "TU", "BG", "AOI", "BU", "SN" , "YLD"];

    if (allied.includes(unit.ckey)) { return "allies"; }
    if (central.includes(unit.ckey)) { return "central"; }

    return "";

  }



  importUnit(key, obj) {

    if (!this.game.units) { this.game.units = {}; }

    //
    // avoid re-importing
    //
    if (this.game.units[key]) {
      if (obj.checkSupplyStatus) {
	this.game.units[key].checkSupplyStatus = obj.checkSupplyStatus;
      } else {
	this.game.units[key].checkSupplyStatus = (paths_self, spacekey) => { return 0; }
      }
      return;
    }

    obj.key = key;

    if (!obj.ckey)      	{ obj.key       = "XX"; }
    if (!obj.name)      	{ obj.name      = "Unknown"; }
    if (!obj.army)		{ obj.army 	= 0; }
    if (!obj.corps)		{ obj.corps 	= 0; }
    if (!obj.combat)		{ obj.combat 	= 5; }
    if (!obj.loss)		{ obj.loss 	= 3; }
    if (!obj.movement)		{ obj.movement 	= 3; }
    if (!obj.rcombat)		{ obj.rcombat 	= 5; }
    if (!obj.rloss)		{ obj.rloss 	= 3; }
    if (!obj.rmovement)		{ obj.rmovement = 3; }

    if (!obj.attacked)		{ obj.attacked  = 0; }
    if (!obj.moved)		{ obj.moved     = 0; }

    if (!obj.damaged)		{ obj.damaged = false; }
    if (!obj.damaged_this_combat{ obj.damaged_this_combat = false; }
    if (!obj.destroyed)		{ obj.destroyed = false; }
    if (!obj.spacekey)  	{ obj.spacekey = ""; }
    if (!obj.checkSupplyStatus) { obj.checkSupplyStatus = (paths_self, spacekey) => { return 0; } };

    if (key.indexOf("army") > -1) { obj.army = 1; } else { obj.corps = 1; }

    this.game.units[key] = obj;

  }


  removeUnit(spacekey, unitkey) {
    for (let z = 0; z < this.game.spaces[spacekey].units.length; z++) {
      if (this.game.spaces[spacekey].units[z].key === unitkey) {
        this.game.spaces[spacekey].units.splice(z, 1);
        z = this.game.spaces[spacekey].units.length + 2;
        if (this.game.state.combat.attacker) {
          for (let zz = 0; zz < this.game.state.combat.attacker.length; zz++) {
            if (this.game.state.combat.attacker[zz].unit_sourcekey == spacekey) {
              if (z < this.game.state.combat.attacker[zz].unit_idx) {
                this.game.state.combat.attacker[zz].unit_idx--;
              }
            }
          }
        }
      }
    }
  }

  moveUnit(sourcekey, sourceidx, destinationkey) {

    let unit = this.game.spaces[sourcekey].units[sourceidx];
    this.game.spaces[sourcekey].units[sourceidx].moved = 1;
    this.game.spaces[sourcekey].units.splice(sourceidx, 1);
    if (!this.game.spaces[destinationkey].units) { this.game.spaces[destinationkey].units = []; }

    if (destinationkey == "aeubox" || destinationkey == "ceubox") {
      this.updateLog(unit.name + " eliminated.");
    } else {
      this.updateLog(unit.name + " moves from " + this.returnSpaceNameForLog(sourcekey) + " to " + this.returnSpaceNameForLog(destinationkey));
    }

    unit.spacekey = destinationkey;
    this.game.spaces[destinationkey].units.push(unit);

    //
    // put under siege as needed
    //
    if (this.game.spaces[destinationkey].units.length > 0) {
      if (this.returnPowerOfUnit(this.game.spaces[destinationkey].units[0]) != this.game.spaces[destinationkey].control) {
        if (this.game.spaces[destinationkey].fort > 0) {
          this.game.spaces[destinationkey].besieged = 1;
        } else {
          //
          // switch control
          //
          this.game.spaces[destinationkey].control = this.returnPowerOfUnit(this.game.spaces[destinationkey].units[0]);

          //
          // degrade trenches
          //
          if (this.game.spaces[destinationkey].trench > 0) { this.game.spaces[destinationkey].trench--; }
        }
      }
    }

    //
    // check if no longer besieged?
    //
    if (this.game.spaces[sourcekey].besieged == 1) {
      if (this.game.spaces[sourcekey].units.length > 0) {
      } else {
        this.game.spaces[sourcekey].besieged = 0;
        if (this.game.spaces[sourcekey].fort > 0) {
          //
          // control switches back to original owner of fort
          //
          let spc = this.returnSpaces();
          this.game.spaces[sourcekey].control = spc[sourcekey].control;
        }
      }
    }



    this.displaySpace(sourcekey);
    this.displaySpace(destinationkey);
  }

  returnUnitImage(unit, just_link=false) {
    let key = unit.key;

    if (unit.destroyed) {
     return this.returnDestroyedUnitImage(unit, just_link);
    }

    if (unit.damaged) {
      if (just_link) { return `/paths/img/army/${key}_back.png`; }
      return `<img src="/paths/img/army/${key}_back.png" class="army-tile ${unit.key}" />`;
    } else {
      if (just_link) { return `/paths/img/army/${key}.png`; }
      return `<img src="/paths/img/army/${key}.png" class="army-tile ${unit.key}" />`;
    }
  }
  returnUnitBackImage(unit, just_link=false) {
    let key = unit.key;
    if (just_link) { return `/paths/img/army/${key}_back.png`; }
    return `<img src="/paths/img/army/${key}_back.png" class="army-tile ${unit.key}" />`;
  }
  returnUnitImageWithMouseoverOfStepwiseLoss(unit, just_link="", mouseout_first=false) {
    let key = unit.key;
    let face_img = "";
    let back_img = "";

    if (unit.destroyed) {
     return this.returnDestroyedUnitImage(unit, just_link);
    }

    if (unit.damaged) {
      face_img = `/paths/img/army/${key}_back.png`;
      back_img = this.returnUnitImageWithStepwiseLoss(unit, true);
    } else {
      face_img = `/paths/img/army/${key}.png`;
      back_img = `/paths/img/army/${key}_back.png`;
    }

    //
    // the workaround below is part of our strategy to prevent tiles from insta-
    // flipping once clicked on, so that mouseout is required in order to trigger
    // tiles showing their reversed side on mouseover. see /lib/ui/overlays/loss.js
    //
    if (!mouseout_first) {
      return `<img src="${face_img}" onmouseover="this.src='${back_img}'" onmouseout="this.src='${face_img}'" class="army-tile ${unit.key}" />`;
    } else {
      return `<img src="${face_img}" data-mouseover="false" onmouseover="if (this.dataset.mouseover === 'true') { this.src='${back_img}' }" onmouseout="this.dataset.mouseover = 'true'; this.src='${face_img}'" class="army-tile ${unit.key}" />`;
    }

  }
  returnUnitImageInSpaceWithIndex(spacekey, idx) {
    let unit = this.game.spaces[spacekey].units[idx];
    return this.returnUnitImage(unit);
  }
  returnDestroyedUnitImage(unit, just_link=false) {
    if (just_link) {
      return `/paths/img/cancel_x.png`;
    } else {
      return `<img src="/paths/img/cancel_x.png" class="army-tile ${unit.key}" />`;
    }

  }

  returnUnitImageWithStepwiseLoss(unit, just_link=false) {

    let key = unit.key;

    if (unit.destroyed) {
     return this.returnDestroyedUnitImage(unit, just_link);
    }

    if (!unit.damaged) {

      if (just_link) { return `/paths/img/army/${key}_back.png`; }
      return `<img src="/paths/img/army/${key}_back.png" class="army-tile ${unit.key}" />`;

    } else {

      //
      // replace with corps if destroyed
      //
      if (unit.key.indexOf('army') >= 0) {
        let corpskey = unit.key.split('_')[0] + '_corps';
        let new_unit = this.cloneUnit(corpskey);
        return this.returnUnitImage(new_unit, just_link);

      } else {

	return this.returnDestroyedUnitImage(unit, just_link);
      }

    }

    return "";
  }

  cloneUnit(unitkey) {
    return JSON.parse(JSON.stringify(this.game.units[unitkey]));
  }

  addUnitToSpace(unitkey, spacekey) {
    let unit = this.cloneUnit(unitkey);
    unit.spacekey = spacekey;
    this.game.spaces[spacekey].units.push(unit);
  }

  damageUnitInSpace(unitkey, spacekey) {
    if (!this.game.spaces[spacekey]) { return; }
    if (!this.game.spaces[spacekey].includes(unitkey)) { return; }
    for (let i = 0; i < this.game.spaces[spacekey].units.length; i++) {
      let u = this.game.spaces[spacekey].units[i];
      if (u.key === unitkey) {
	if (u.damaged == false) { u.damaged = true; }
      }
    }
  }


  //
  // 1. flip damaged units on the board
  // 2. flip damaged units in the RB
  // 3. return eliminated units to RB
  //
  doReplacementPointsExistForUnit(unit=null) {

    if (!unit) { return 0; }

    let faction = this.returnFactionOfUnit(unit);
    let rp = this.game.state.rp[faction];

    //
    // 17.1.3 - Belgian and Serbian Army units can be recreated only if they may
    // legally be placed on the map [see 17.1.5] Belgian and Serbian corps can still
    // be rebuilt in the Reserve Box, even if their countries are completely controlled
    // by the enemy.
    //
    if (unit.ckey === "BE") {
      let ptp = false; // place to place
      if (this.game.spaces["antwerp"].control == "allies") { ptp = true; }
      if (this.game.spaces["brussels"].control == "allies") { ptp = true; }
      if (this.game.spaces["ostend"].control == "allies") { ptp = true; }
      if (this.game.spaces["liege"].control == "allies") { ptp = true; }
      if (ptp) {
        if (rp["A"] > 0 || rp["BE"] > 0) { return 1; }
      }
    }
    if (unit.ckey === "SB") {
      let ptp = false; // place to place
      if (this.game.spaces["belgrade"].control == "allies") { ptp = true; }
      if (this.game.spaces["valjevo"].control == "allies") { ptp = true; }
      if (this.game.spaces["nis"].control == "allies") { ptp = true; }
      if (this.game.spaces["skopje"].control == "allies") { ptp = true; }
      if (this.game.spaces["monastir"].control == "allies") { ptp = true; }
      if (ptp) {
        if (rp["A"] > 0 || rp["SB"] > 0) { return 1; }
      }
    }

    //
    // cannot spend replacement points if capital is besieged
    //
    let capitals = this.returnCapital(unit.ckey);
    let is_capital_besieged = false;
    for (let z = 0; z < capitals.length; z++) {
      let c = this.game.spaces[capitals[z]];
      let p = this.returnPowerOfUnit(unit);
      if (c.control != p) { is_capital_besieged = true; }
      if (c.units.length > 0) {
        if (this.returnPowerOfUnit(c.units[0]) != p) {
          is_capital_besieged = true;
        }
      }
      if ((z+1) < capitals.length) { is_capital_besieged = false; }
    }

    if (is_capital_besieged == true) { return 0; }
    if (rp[unit.ckey] > 0) { return 1; }
    if (rp["A"] > 0) {
      if (unit.ckey == "ANA" || unit.ckey == "AUS" || unit.ckey == "BE" || unit.ckey == "CND" || unit.ckey == "MN" || unit.ckey == "PT" || unit.ckey == "RO" || unit.ckey == "GR" || unit.ckey == "SB") {
        return 1;
      }
    }
    return 0;
  }




