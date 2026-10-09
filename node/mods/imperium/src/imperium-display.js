
//
// redraw all sectors
//
displayBoard() {
  for (let i in this.sectors) {
    this.sectors[i].render();
  }
  if (this.minimap) {
    this.minimap.render();
  }
}



//
// flash a sector
//
flashSector(sector) {

  if (sector.indexOf("_") > -1) { sector = this.game.board[sector].tile; }

  let tile = this.game.sectors[sector].tile;

  let qs = "#hex_bg_" + tile + " > img";

  $(qs).addClass("flash-color")
      .delay(500)
      .queue(function () {
        $(this).removeClass("flash-color").dequeue();
      })          
      .delay(500)
      .queue(function () {
        $(this).addClass("flash-color").dequeue();
      })
      .delay(500)
      .queue(function () {
        $(this).removeClass("flash-color").dequeue();
      })
      .delay(500)
      .queue(function () {
        $(this).addClass("flash-color").dequeue();
      })
      .delay(500)
      .queue(function () {
        $(this).removeClass("flash-color").dequeue();
      })
      .delay(500)
      .queue(function () {
        $(this).addClass("flash-color").dequeue();
      })
      .delay(500)
      .queue(function () {
        $(this).removeClass("flash-color").dequeue();
      });

}




returnActivatedSectorsOverlay() {
  let imperium_self = this;
  let html = `
    <div class="activated_sectors_overlay" id="activated_sectors_overlay">

<h2>No Ships Available!</h2>

<p style="margin-bottom:30px"></p>

The only ships that could move into this sector are in activated sectors. 

<p style="margin-bottom:30px"></p>

Once you have "activated" a sector. You cannot move ships into or out of it until next round.

<p style="margin-bottom:30px"></p>

</div>
<style>
.activated_sectors_overlay {
  padding:30px;
  width: 800px;
  max-width: 80vw;
  max-height: 90vh;
  font-family: 'orbitron-medium', helvetica, arial;
  line-height: 1.7em;
  font-size: 1.1em;
  background-image: url('/imperium/img/backgrounds/starscape-background4.jpg');
  background-size: cover;
  color: white;
  overflow-y: scroll;
  font-size:1.4em;
}
</style>
`;

  return html;
}





returnFirstTurnOverlay() {
  let imperium_self = this;
  let html = `
    <div class="how_to_play_overlay" id="how_to_play_overlay">

<h2>Your First Turn:</h2>

<p></p>

<img src="/imperium/img/firstturn.png" style="width:400px;float:left;padding-right:15px;padding-bottom:5px;" />

Your home world is bordered in your color. In Round 1, you can only activate 
sectors you can reach. To see ship movement, click on UNITS in the CARDS menu.
This will also show you build costs and strength in combat.

<p style="margin-bottom:10px"></p>

First turn? Try moving a CARRIER into a sector adjacent to your homeworld. 
Bring INFANTRY so your can INVADE a planet in that sector after your fleet has
moved. The <span class="resources_box">resources</span> and <span class="influence_box">influence</span>
 of the planets you conquer will be available to spend Round 2.

    </div>

    <style type="text/css">
.resources_box {
 background-color:black;padding:4px;border:1px solid #fff;
}
.influence_box {
  background-color:orange;padding:4px;border:1px solid #fff;
}
.how_to_play_overlay {
  padding:30px;
  width: 800px;
  max-width: 80vw;
  max-height: 90vh;
  font-family: 'orbitron-medium', helvetica, arial;
  line-height: 1.7em;
  font-size: 1.1em;
  background-image: url('/imperium/img/backgrounds/starscape-background4.jpg');
  background-size: cover;
  color: white;
  overflow-y: scroll;
  font-size:1.4em;
}
    </style>
  `;

  return html;
}

returnHowToPlayOverlay() {
  let imperium_self = this;
  let html = `

    <div class="how_to_play_overlay" id="how_to_play_overlay">

<h2>Your Goal:</h2>

<img src="/imperium/img/planets/broughton.png" class="demo_planet_card" />

<p></p>

Conquer planets to gain resources and influence:

<p></p>

<div style="padding-left:30px;padding-right:30px;">
<div class="how_to_play_resources_entry">
<b><span class="resources_box">RESOURCES</span></b>
<p></p>
build units and research technology.
</div>

<div class="how_to_play_resources_entry">
<b><span class="influence_box">INFLUENCE</span></b>
<p></p>
buy command tokens and vote on laws.
</div>
</div>


<h2 style="margin-top:30px">On Your Turn:</h2>

<div style="padding-left:30px;font-family:'orbitron-medium', helvetica, arial;line-height:2em;">
  <ol class="demo_ordered_list" style="font-family: 'orbitron-medium', helvetica, arial">
    <li>Spend a command token to activate a sector</li>
      <ul style="margin-left:20px">
        <li style="list-style:none">- to move ships into the sector</li>
        <li style="list-style:none">- to produce in the sector</li>
      </ul>
    <li>Play a strategy card</li>
    <li>Pass</li>
  </ol>
</div>

    </div>
    </style>
  `;

  return html;
}




returnSectorInformationHTML(sector) {

  if (sector.indexOf("_") > -1) { sector = this.game.board[sector].tile; }

  let sys = this.returnSectorAndPlanets(sector);
  let html = `
    <div class="system_summary">
      <div class="system_summary_text">
  `;

  html += '<div class="system_summary_sector">';
  html += sys.s.name;
  html += "</div>";
  let units_html = "";
  for (let i = 0; i < sys.s.units.length; i++) {
    if (sys.s.units[i].length > 0) {
      units_html += this.returnPlayerFleetInSector((i+1), sector);
      i = sys.s.units.length;
    }
  }
  
  if (units_html != "") {
    html += '<div class="system_summary_units">';
    html += units_html;
    html += '</div>';
  }

  let gridcols = '1fr';
  for (let z = 1; z < sys.p.length; z++) {
    gridcols += ' 1fr';
  }

  html += `
    <div class="system_summary_planets_grid" style="grid-template-columns:${gridcols}">
  `;
  for (let i = 0; i < sys.p.length; i++) {
    let planet_owner = "UNCONTROLLED";
    if (sys.p[i].owner != -1) {
      planet_owner = this.returnFactionNickname(sys.p[i].owner);
    }
    html += `
      <div class="system_summary_planet">
        ${planet_owner}
        <div class="system_summary_content">
          ${this.returnInfantryOnPlanet(sys.p[i])} infantry
          <br />
          ${this.returnPDSOnPlanet(sys.p[i])} PDS
          <br />
          ${this.returnSpaceDocksOnPlanet(sys.p[i])} spacedocks
        </div>
        <div class="system_summary_planet_card" style="background-image: url('${sys.p[i].img}');">${this.planetCardStats(sys.p[i])}</div>
      </div>
    `;
  }
  html += `
    </div>
  </div>
  `;

  return html;

}

     

updateCombatLog(cobj) {

  let are_there_rerolls = 0;
  let are_there_modified_rolls = 0;

  for (let i = 0; i < cobj.units_firing.length; i++) {
    if (cobj.reroll[i] == 1) { are_there_rerolls = 1; }
    if (cobj.modified_roll[i] != cobj.unmodified_roll[i]) { are_there_modified_rolls = 1; }
  }

  let html = '';
      html += '<table class="combat_log">';
      html += '<tr>';
      html += `<th class="combat_log_th">${this.returnFactionNickname(cobj.attacker)}</th>`;
      html += '<th class="combat_log_th">HP</th>';
      html += '<th class="combat_log_th">Combat</th>';
      html += '<th class="combat_log_th">Roll</th>';
  if (are_there_modified_rolls) {
      html += '<th class="combat_log_th">Modified</th>';
  }
  if (are_there_rerolls) {
      html += '<th class="combat_log_th">Reroll</th>';
  }
      html += '<th class="combat_log_th">Hit</th>';
      html += '</tr>';
  for (let i = 0; i < cobj.units_firing.length; i++) {
      html += '<tr>';
      html += `<td class="combat_log_td">${cobj.units_firing[i].name}</td>`;
      html += `<td class="combat_log_td">${cobj.units_firing[i].strength}</td>`;
      html += `<td class="combat_log_td">${cobj.hits_on[i]}</td>`;
      html += `<td class="combat_log_td">${cobj.unmodified_roll[i]}</td>`;
  if (are_there_modified_rolls) {
      html += `<td class="combat_log_td">${cobj.modified_roll[i]}</td>`;
  }
  if (are_there_rerolls) {
      html += `<td class="combat_log_td">${cobj.reroll[i]}</td>`;
  }
      html += `<td class="combat_log_td">${cobj.hits_or_misses[i]}</td>`;
      html += '</tr>';
  }
      html += '</table>';

  this.updateLog(html);

}


setPlayerActive(player) {
  let divclass = ".dash-faction-status-"+player;
  $(divclass).css('background-color', 'green');
}
setPlayerInactive(player) {
  let divclass = ".dash-faction-status-"+player;
  $(divclass).css('background-color', 'red');
}
setPlayerActiveOnly(player) {
  for (let i = 1; i <= this.game.state.players_info.length; i++) {
    if (player == i) { this.setPlayerActive(i); } else { this.setPlayerInactive(i); }  
  }
}


returnPlanetInformationHTML(planet) {

  let p = planet;
  if (this.game.planets[planet]) { p = this.game.planets[planet]; }
  let ionp = this.returnInfantryOnPlanet(p);
  let ponp = this.returnPDSOnPlanet(p);
  let sonp = this.returnSpaceDocksOnPlanet(p);
  let powner = '';

  if(this.game.planets[planet].owner > 0) {
    powner = "p" + this.game.planets[planet].owner;
  } else {
    powner = "nowner";
  }

  let html = '';

  if (ionp > 0) {
    html += '<div class="planet_infantry_count_label">Infantry</div><div class="planet_infantry_count">'+ionp+'</div>';
  }

  if (ponp > 0) {
    html += '<div class="planet_pds_count_label">PDS</div><div class="planet_pds_count">'+ponp+'</div>';
  }

  if (sonp > 0) {
    html += '<div class="planet_spacedock_count_label">Spacedock</div><div class="planet_spacedock_count">'+sonp+'</div>';
  }

//  if (this.game.planets[planet].bonus != "") {
//    html += '<div class="planet_tech_label tech_'+this.game.planets[planet].bonus+' bold">'+this.game.planets[planet].bonus+' TECH</div><div></div>';
//  }

  if (ponp+sonp+ionp > 0) {
    html = `<div class="sector_information_planetname ${powner}">${p.name}</div><div class="sector_information_planet_content">` + html + `</div>`;
  } else {
    html = `<div class="sector_information_planetname ${powner}">${p.name}</div>`;
  }

  return html;

}


returnUnitPopup(unittype) {

  let html = `

    <div class="unit_details_popup">
      ${this.returnUnitPopupEntry(unittype)}}
    </div

  `;

  return html;

}
returnUnitPopupEntry(unittype) {

  let obj = this.units[unittype];
  if (!obj) { return ""; }

  let html = `
      <div class="unit-element" style="background:#333c;width:100%;padding:5%;border-radius:5px;font-size:0.7em;">
        <div class="unit-box-ship unit-box-ship-${unittype}" style="width:100%"></div>
        <div class="unit-box" style="width:24.5%;height:auto;padding-bottom:10px;">
	  <div class="unit-box-num" style="font-size:2.8em">${obj.cost}</div>
	  <div class="unit-box-desc" style="font-size:1.4em;padding-top:5px;">cost</div>
	</div>
        <div class="unit-box" style="width:24.5%;height:auto;padding-bottom:10px;">
	  <div class="unit-box-num" style="font-size:2.8em">${obj.move}</div>
	  <div class="unit-box-desc" style="font-size:1.4em;padding-top:5px;">move</div>
	</div>
        <div class="unit-box" style="width:24.5%;height:auto;padding-bottom:10px;">
	  <div class="unit-box-num" style="font-size:2.8em">${obj.combat}</div>
	  <div class="unit-box-desc" style="font-size:1.4em;padding-top:5px;">combat</div>
	</div>
        <div class="unit-box" style="width:24.5%;height:auto;padding-bottom:10px;">
	  <div class="unit-box-num" style="font-size:2.8em">${obj.capacity}</div>
	  <div class="unit-box-desc" style="font-size:1.4em;padding-top:5px;">carry</div>
	</div>
        <div class="unit-description" style="font-size:1.1em">${obj.description}.</div>
      </div>
    `;

  return html;

}



displayFactionDashboard(agenda_phase=0) {

  let imperium_self = this;

  try {

    this.roundbox.render();
    this.dashboard.render(agenda_phase);

    let pl = "";
    let fo = "";
    for (let i = 0; i < this.game.state.players_info.length; i++) {

      pl = "p" + (i+1);
      fo = ".dash-faction."+pl;

      let total_resources = this.returnTotalResources((i+1)) - this.game.state.players_info[i].goods;
      let available_resources = this.returnAvailableResources((i+1)) - this.game.state.players_info[i].goods;
      let total_influence = this.returnTotalInfluence((i+1)) - this.game.state.players_info[i].goods;
      let available_influence = this.returnAvailableInfluence((i+1)) - this.game.state.players_info[i].goods;

      document.querySelector(`.${pl} .dash-faction-name`).innerHTML = this.returnFaction(i+1);
      document.querySelector(`.${pl} .dash-item-strategy`).innerHTML = this.game.state.players_info[i].strategy_tokens;
      document.querySelector(`.${pl} .dash-item-command`).innerHTML = this.game.state.players_info[i].command_tokens;
      document.querySelector(`.${pl} .dash-item-fleet`).innerHTML = this.game.state.players_info[i].fleet_supply;
      try {
// availableinfluence first as rest will error-out on agenda overlay
      document.querySelector(`.${pl} .influence .avail`).innerHTML = available_influence;
      document.querySelector(`.${pl} .influence .total`).innerHTML = total_influence;
      document.querySelector(`.${pl} .resources .avail`).innerHTML = available_resources;
      document.querySelector(`.${pl} .resources .total`).innerHTML = total_resources;
      document.querySelector(`.${pl} .dash-item-goods`).innerHTML = this.game.state.players_info[i].goods;
      document.querySelector(`.${pl} .dash-item-commodities`).innerHTML = this.game.state.players_info[i].commodities;
      document.querySelector(`.${pl} .dash-item-commodity-limit`).innerHTML = this.game.state.players_info[i].commodity_limit;
      document.querySelector(`.${pl} .dash-item-vp`).innerHTML = this.game.state.players_info[i].vp;
      } catch (err) {}

      document.querySelector(fo).onclick = (e) => {
        imperium_self.faction_sheet_overlay.render((i+1));
      }

    }

  } catch (err) {
console.log("ERROR: " + err);
  }
}



addUIEvents() {

  var imperium_self = this;

  if (this.browser_active == 0) { return; }

  $('#hexGrid').draggable();
  this.ensureBoardVisible();
  this.frameHomeworld();

  //set player highlight color
  document.documentElement.style.setProperty('--my-color', `var(--p${this.game.player})`);
  this.displayFactionDashboard();

}







getBoardBackdrop() {
  return '/imperium/img/backgrounds/starscape_background3.jpg';
}

returnDefaultBoardScale() {
  let hex = 250;
  let target = window.innerWidth * 0.3;
  let scale = Math.round((100 * target) / hex);
  return Math.max(90, Math.min(200, scale));
}

frameHomeworld() {
  if (this.homeworld_framed) {
    return;
  }
  if (!this.game || !this.game.player || !this.game.state || !this.game.state.players_info) {
    return;
  }
  let info = this.game.state.players_info[this.game.player - 1];
  if (!info || !info.homeworld) {
    return;
  }
  let el = this.getBoardElement();
  let sector = document.getElementById(info.homeworld);
  if (!el || !sector || !el.offsetWidth || !sector.offsetWidth) {
    return;
  }

  this.homeworld_framed = 1;
  this.default_board_scale = this.returnDefaultBoardScale();
  let current = el.getBoundingClientRect().width / el.offsetWidth;
  if (Math.abs(current - this.default_board_scale / 100) > 0.05) {
    this.setBoardScale(this.default_board_scale, false);
  }

  let board = el.getBoundingClientRect();
  let box = sector.getBoundingClientRect();
  let scale = el.offsetWidth ? board.width / el.offsetWidth : 1;
  let local_x = (box.left + box.width / 2 - board.left) / scale;
  let local_y = (box.top + box.height / 2 - board.top) / scale;

  let left_bound = 16;
  let dash = document.querySelector('.dashboard');
  if (dash) {
    let d = dash.getBoundingClientRect();
    if (d.width > 40 && d.left < window.innerWidth * 0.4) {
      left_bound = d.right + 24;
    }
  }
  let cx = (left_bound + window.innerWidth) / 2;
  let cy = window.innerHeight * 0.42;
  this.moveBoardTo(el, cx - local_x * scale, cy - local_y * scale);
  if (this.minimap) {
    this.minimap.render();
  }
}

showSector(pid) {

  let sector_name = this.game.board[pid].tile;
  this.showSectorHighlight(sector_name);

}
hideSector(pid) {

  let sector_name = this.game.board[pid].tile;
  this.hideSectorHighlight(sector_name);

  let hex_space = ".sector_graphics_space_" + pid;
  $(hex_space).fadeIn();

}



updateTokenDisplay() {

}


updateRound() {
    this.roundbox.render();
}

updateLeaderboard() {
  if (this.browser_active == 0) { return; }
  this.displayFactionDashboard();
  this.updateRound();
}



  updateSectorGraphics(sector) {

    //
    // handle both 'sector41' and '2_1'
    //
    let sys = this.returnSectorAndPlanets(sector);

    if (sys == undefined) { return; }
    if (sys == null) { return; }
    if (sys.s == undefined) { return; }
    if (sys.s == null) { return; }

    this.sectors[sys.s.tile].update();

    return;
  };


  unhighlightSectors() {
    for (let i in this.game.sectors) {
      this.removeSectorHighlight(i);
    }
  }


  showUnit(unittype) {
    let unit_popup = this.returnUnitPopup(unittype);
    this.cardbox.showCardboxHTML("", unit_popup, "", function() {});
  }
  hideUnit(unittype) {
    this.cardbox.hide(1);
  }

  showSectorHighlight(sector) { this.addSectorHighlight(sector); }
  hideSectorHighlight(sector) { this.removeSectorHighlight(sector); }
  addSectorHighlight(sector, zoom_overlay=0) {

    let orig_sector = sector;
    if (sector.indexOf("_") > -1) { sector = this.game.board[sector].tile; }

    let sys = this.returnSectorAndPlanets(sector);

    try {
    if (sector.indexOf("planet") == 0 || sector == 'new-byzantium') {
      sector = this.game.planets[sector].sector;
    }

    let divname = ".sector_graphics_space_" + sys.s.tile;
    $(divname).css('display', 'none');

    // if we got here but the sector has no planets, nope out.
    if (!this.game.sectors[sector].planets) { return;}
    if (this.game.sectors[sector].planets.length == 0) { return;}

    //handle writing for one or two planets
    var info_tile;
    if (zoom_overlay == 0) {
      info_tile = document.querySelector("#hex_info_" + sys.s.tile);
    } else {
      info_tile = document.querySelector(".gameboard-clone .sector_"+orig_sector+" .hexIn .hexLink .hexInfo");
    }

    let html = '';

    if (this.game.sectors[sector].planets.length == 1) {
      html = this.returnPlanetInformationHTML(this.game.sectors[sector].planets[0]);
      info_tile.innerHTML = html;
      info_tile.classList.add('one_planet');
    } else {
      html = '<div class="top_planet">';
      html += this.returnPlanetInformationHTML(this.game.sectors[sector].planets[0]);
      html += '</div><div class="bottom_planet">';
      html += this.returnPlanetInformationHTML(this.game.sectors[sector].planets[1]);
      html += '</div>';
      info_tile.innerHTML = html;
      info_tile.classList.add('two_planet');
    }

    let hex_in = null;
    if (zoom_overlay == 0) {
      hex_in = document.querySelector("#hexIn_" + sys.s.tile);
    } else {
      hex_in = document.querySelector(".gameboard-clone .sector_"+orig_sector+" .hexIn");
    }
    if (hex_in) {
      hex_in.classList.add('bi');
      if (sector !== 'new-byzantium') {
        hex_in.classList.add('spin-in');
      }
    }
    } catch (err) {}
  }

  removeSectorHighlight(sector, zoom_overlay=0) {
    try {
    if (sector.indexOf("planet") == 0 || sector == 'new-byzantium') {
      sector = this.game.planets[sector].sector;
    }
    let sys = this.returnSectorAndPlanets(sector);

    let divname = ".sector_graphics_space_" + sys.s.tile;
    $(divname).css('display', 'all');

    let hex_in = null;
    if (zoom_overlay == 0) {
      hex_in = document.querySelector("#hexIn_" + sys.s.tile);
    } else {
      hex_in = document.querySelector(".gameboard-clone .sector_"+sector+" .hexIn");
    }
    if (hex_in) {
      hex_in.classList.remove('bi');
      hex_in.classList.remove('spin-in');
    }
    } catch (err) {}
  }

  addPlanetHighlight(sector, pid)  {
    if (sector.indexOf("_") > -1) { 
      sector = this.game.board[sector].tile;
    }
    this.showSectorHighlight(sector);
  }
  removePlanetHighlight(sector, pid)  {
    this.hideSectorHighlight(sector);
  }
  showActionCard(c) {
    let thiscard = this.action_cards[c];
    if (!thiscard) {
      return;
    }
    let html = typeof thiscard.returnCardImage === 'function' ? thiscard.returnCardImage() : '';
    if (!html) {
      return;
    }
    this.cardbox.showCardboxHTML(thiscard, html);
  }
  hideActionCard(c) {
    this.cardbox.hide(1);
  }
  showStrategyCard(c) {

    let strategy_cards = this.returnStrategyCards();
    let thiscard = strategy_cards[c];
    this.cardbox.showCardboxHTML(thiscard, thiscard.returnCardImage());
  }

  hideStrategyCard(c) {
    this.cardbox.hide(1);
  }
  showPlanetCard(sector, pid) {
    let planets = this.returnPlanets();
    let systems = this.returnSectors();
    let sector_name = this.game.board[sector].tile;
    let this_planet_name = systems[sector_name].planets[pid];
    let thiscard = planets[this_planet_name];
    this.cardbox.showCardboxHTML(thiscard, '<img src="' + thiscard.img + '" style="width:100%" />');
  }
  hidePlanetCard(sector, pid) {
    this.cardbox.hide(1);
  }
  showAgendaCard(agenda) {
    let thiscard = this.agenda_cards[agenda];
    this.cardbox.showCardboxHTML(thiscard, thiscard.returnCardImage());
  }
  hideAgendaCard(sector, pid) {
    this.cardbox.hide(1);
  }


  returnShortGameOptionsArray(options) {

    let sgoa = super.returnShortGameOptionsArray(options);
    let ngoa = [];

    for (let i in sgoa) {
      if (sgoa[i] != "") {

        let okey = i;
        let oval = options[i];

        let output_me = 1;
        if (i == "game_length") { okey = "VP"; }

        if (output_me == 1) {
          ngoa[okey] = oval;
        }
      }
    }

    return ngoa;
  }



