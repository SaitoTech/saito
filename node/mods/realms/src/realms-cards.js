
	popup(card) {

    	  let c = null;
    	  if (!c && this.game.deck[0]) { c = this.game.deck[0].cards[card]; }
    	  if (!c && this.game.deck[1]) { c = this.game.deck[1].cards[card]; }
    	  if (!c) {
      	    let x = this.returnDeck(true);
      	    if (x[card]) { c = x[card]; }
    	  }
    	  if (c) {
      	    if (c.name) {
              return `<span class="showcard ${card}" id="${card}">${c.name}</span>`;
      	    }
    	  }
    	  return `<span class="showcard ${card}" id="${card}">${card}</span>`;

	}

	returnCardImage(cardname) {

		let deck = this.returnDeck();
		let can_cast = true;

	  	if (deck[cardname]) {

			let card = deck[cardname];

			if (card.type === "land" && this.game.state.players_info[this.game.player-1].land_played == 1) { can_cast = false; }
			if (card.type === "creature" && !this.canPlayerCastSpell(cardname)) { can_cast = false; }
			if (card.type === "sorcery" && !this.canPlayerCastSpell(cardname)) { can_cast = false; }
			if (card.type === "instant" && !this.canPlayerCastSpell(cardname)) { can_cast = false; }

			if (!can_cast) {
	  			return `<img class="cancel_x" src="/realms/img/cards/${deck[cardname].img}" />`;
			} else {
	  			return `<img class="" src="/realms/img/cards/${deck[cardname].img}" />`;
			}

	  	}
		return '';
	}


        importCard(key, card) {

                let game_self = this;

                let c = {
                        key		:	key,
                        name		: 	"Unnamed",
                        color		: 	"*",
                        cost		: 	[],
                        power		: 	0,
                        toughness	: 	0,
                        text		: 	"This card has not provided text",
                        img		: 	"/img/cards/sample.png",
                };
                c = Object.assign(c, card);


                //
                // add dummy events that return 0 (do nothing)
                //
		if (!c.returnCardImage) {
                	c.returnCardImage = function() {
				return `<div class="card"><img class="card cardimg" src="/realms/img/cards/${c.img}"></div>`;
                	};
	        }
                if (!c.oninstant) {
                	c.oninstant = function (game_self, player, card) {
                        	return 0;
                	};
                }
                if (!c.triggersOnEnterBattlefield) {
                        c.triggersOnEnterBattlefield = function (game_self, player, card) {
                                return 0;
                        };
                }
                if (!c.onEnterBattlefield) {
                        c.onEnterBattlefield = function (game_self, player, card) {
                                return 0;
                        };
                }
                if (!c.triggersOnCostAdjustment) {
                        c.triggersOnCostAdjustment = function (game_self, player, card) {
                                return 0;
                        };
                }
                if (!c.onCostAdjustment) {
                        c.onCostAdjustment = function (game_self, player, card) {
                                return 0;
                        };
                }

console.log("importing: " + c.key);		
                game_self.deck[c.key] = c;

        }




	////////////////////////////////
	/// Cards and Card Functions ///
	////////////////////////////////
	returnDeck(color="") {

		var deck = {};

		//deck['0001'] {
		//	nqme : "" ,
		//	type : "instant" ,
		//	color: "" ,
		//	cost: ['*', '*', 'red'] ,
		//	text : "" ,
		//	lore : "" ,
		//	img : "0001_valkyrie_of_the_endless_battle.png" ,
		//}


deck['0001'] = {
        name : "Valkyrie Of The Endless Battle" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0001_valkyrie_of_the_endless_battle.png" ,
}

deck['0002'] = {
        name : "Valkyrie Of The Healing Gale" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0002_valkyrie_of_the_healing_gale.png" ,
}

deck['0003'] = {
        name : "Celestial Favor" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0003_celestial_favor.png" ,
}

deck['0004'] = {
        name : "Guardian Of The Heights" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', '*', '*', '*', 'white', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0004_guardian_of_the_heights.png" ,
}

deck['0005'] = {
        name : "Zealous Defenders" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0005_zealous_defenders.png" ,
}

deck['0006'] = {
        name : "Cataclysms Chorus" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0006_cataclysms_chorus.png" ,
}

deck['0007'] = {
        name : "Goblins Guile" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0007_goblins_guile.png" ,
}

deck['0008'] = {
        name : "Luminous Repression" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0008_luminous_repression.png" ,
}

deck['0009'] = {
        name : "Perimeter Watchmen" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0009_perimeter_watchmen.png" ,
}

deck['0010'] = {
        name : "Lifeforce Reawakening" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0010_lifeforce_reawakening.png" ,
}

deck['0011'] = {
        name : "Gallant Paladin" ,
        type : "creature" ,
        cost : ['*', '*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0011_gallant_paladin.png" ,
}

deck['0012'] = {
        name : "Zealous Valkyrie" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0012_zealous_valkyrie.png" ,
}

deck['0013'] = {
        name : "Stalwart Defender" ,
        type : "creature" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0013_stalwartd_defender.png" ,
}

deck['0014'] = {
        name : "Consecrated Anchorite" ,
        type : "creature" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0014_consecrated_anchorite.png" ,
}

deck['0015'] = {
        name : "Fervent Recruit" ,
        type : "creature" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0015_fervent_recruit.png" ,
}

deck['0016'] = {
        name : "Illusory Armistice" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0016_illusory_armistice.png" ,
}

deck['0017'] = {
        name : "Reluctant Infantry" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', '*', '*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0017_reclutant_infantry.png" ,
}

deck['0018'] = {
        name : "Sages Counsel" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*', '*', 'white', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0018_sages_ounsel.png" ,
}

deck['0019'] = {
        name : "Wanderer Paladin" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*', 'white'] ,
        text : "" ,
        lore : "" ,
        img : "0019_wanderer_paladin.png" ,
}

deck['0020'] = {
        name : "Faithful Guards" ,
        type : "creature" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0020_faithful_guards.png" ,
}

deck['0021'] = {
        name : "Way Of Serenity" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*','*','*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0021_way_of_serenity.png" ,
}

deck['0022'] = {
        name : "Blessing Ruins" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*','white','white'] ,
        text : "" ,
        lore : "" ,
        img : "0022_blessing_ruins.png" ,
}

deck['0023'] = {
        name : "Celestial Purge" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*','*','*','*','white','white'] ,
        text : "" ,
        lore : "" ,
        img : "0023_celestial_purge.png" ,
}

deck['0024'] = {
        name : "Monarch Eagle" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0024_monarch_eagle.png" ,
}

deck['0025'] = {
        name : "Crowns Sentinel" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*','*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0025_crowns_sentinel.png" ,
}

deck['0026'] = {
        name : "Blessed Draught" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0026_blessed_draught.png" ,
}

deck['0027'] = {
        name : "Perseverance Of The Legion" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0027_perseverance_of_the_legion.png" ,
}

deck['0028'] = {
        name : "Wise Hermit" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*','*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0028_wise_hermit.png" ,
}

deck['0029'] = {
        name : "Karmic Retaliation" ,
        type : "sorcery" ,
        color: "white" ,
        cost: ['*','*','*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0029_karmic_retaliation.png" ,
}

deck['0030'] = {
        name : "Battle Hardened Paladin" ,
        type : "creature" ,
        color: "white" ,
        cost: ['white','white'] ,
        text : "" ,
        lore : "" ,
        img : "0030_battle_hardened_paladin.png" ,
}

deck['0031'] = {
        name : "Untamed Wingbeast" ,
        type : "creature" ,
        color: "white" ,
        cost: ['*','*','white'] ,
        text : "" ,
        lore : "" ,
        img : "0031_untamed_wingbeast.png" ,
}

deck['0032'] = {
        name : "Zephyr Incarnate" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0032_zephyr_incarnate.png" ,
}

deck['0033'] = {
        name : "Reef Serpent" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0033_reef_serpent.png" ,
}

deck['0034'] = {
        name : "Arcane Negation" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0034_arcane_negation.png" ,
}

deck['0035'] = {
        name : "Leviathan Of The Abyss" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','*','*','*','*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0035_leviathan_of_the_abyss.png" ,
}

deck['0036'] = {
        name : "Fatigue Of The Ages" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0036_fatigue_of_the_ages.png" ,
}

deck['0037'] = {
        name : "Incantation Null" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0037_incantation_null.png" ,
}

deck['0038'] = {
        name : "Clairvoyant Gaze" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0038_clairvoyant_gaze.png" ,
}

deck['0039'] = {
        name : "Abyssal Kraken" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0039_abyssal_kraken.png" ,
}

deck['0040'] = {
        name : "Crafty Larcenist" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0040_crafty_larcenist.png" ,
}

deck['0041'] = {
        name : "Oceanic Drifter" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0041_oceanic_drifter.png" ,
}

deck['0042'] = {
        name : "Sirens Of The Coral Blade" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0042_sirens_of_the_coral_blade.png" ,
}

deck['0043'] = {
        name : "Sages Companion" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0043_sages_companion.png" ,
}

deck['0044'] = {
        name : "Ghostly Marauder" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0044_ghostly_marauder.png" ,
}

deck['0045'] = {
        name : "Corsairs Gambit" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0045_corsairs_gambit.png" ,
}

deck['0046'] = {
        name : "Soul Exchange Rite" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','*','*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0046_soul_exchange_rite.png" ,
}

deck['0047'] = {
        name : "Looters Insight" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0047_looters_insight.png" ,
}

deck['0048'] = {
        name : "Mnemonic Restoration" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0048_mnemonic_restoration.png" ,
}

deck['0049'] = {
        name : "Spirit Expulsion" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0049_spirit_expulsion.png" ,
}

deck['0051'] = {
        name : "Magicians Ruse" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0051_magicians_ruse.png" ,
}

deck['0052'] = {
        name : "Azure Talon Drake" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0052_azure_talon_drake.png" ,
}

deck['0053'] = {
        name : "Squall Raven" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0053_squall_raven.png" ,
}

deck['0054'] = {
        name : "Coded Messages" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0054_coded_messages.png" ,
}

deck['0055'] = {
        name : "Chrono Current" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0055_chrono_current.png" ,
}

deck['0056'] = {
        name : "Chrono Distortion" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','*','*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0056_chrono_distortion.png" ,
}


deck['0058'] = {
        name : "Dual Retreat" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0058_dual_retreat.png" ,
}

deck['0059'] = {
        name : "Harefang Leviathan" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','*','*','*','*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0059_harefang_leviathan.png" ,
}

deck['0060'] = {
        name : "Oceans Wrath" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','*','blue','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0060_oceans_wrath.png" ,
}

deck['0061'] = {
        name : "Zephyr Wyrm" ,
        type : "creature" ,
        color: "blue" ,
        cost: ['*','*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0061_zephyr_wyrm.png" ,
}

deck['0062'] = {
        name : "Ethers Wings" ,
        type : "sorcery" ,
        color: "blue" ,
        cost: ['*','blue'] ,
        text : "" ,
        lore : "" ,
        img : "0062_ethers_wings.png" ,
}

deck['0063'] = {
        name : "Gloomwing Terror" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0063_gloomwing_terror.png" ,
}

deck['0064'] = {
        name : "Forbidden Thirst" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0064_forbidden_thirst.png" ,
}

deck['0065'] = {
        name : "Swamp Specter" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0065_swamp_specter.png" ,
}

deck['0066'] = {
        name : "Marsh Marauders" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0066_marsh_marauders.png" ,
}

deck['0067'] = {
        name : "Morass Phantom" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0067_morass_phantom.png" ,
}

deck['0068'] = {
        name : "Requiem Of Ruin" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0068_requiem_of_ruin.png" ,
}

deck['0069'] = {
        name : "Mental Domination" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0069_mental_domination.png" ,
}

deck['0070'] = {
        name : "Morass Revenant" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0070_morass_revenant.png" ,
}

deck['0071'] = {
        name : "Shadowfield Knight" ,
        type : "sreature" ,
        color: "black" ,
        cost: ['*','*','*','*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0071_shadowfield_knight.png" ,
}

deck['0072'] = {
        name : "Marsh Epidemic" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0072_marsh_epidemic.png" ,
}

deck['0073'] = {
        name : "Swampsting Creeper" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0073_swampsting_creeper.png" ,
}

deck['0074'] = {
        name : "Swamp Spellweaver" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0074_swamp_spellweaver.png" ,
}

deck['0075'] = {
        name : "Nocturnal Sacrifice" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0075_nocturnal_sacrifice.png" ,
}

deck['0076'] = {
        name : "Fearborn Demon" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','black','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0076_fearborn_demon.png" ,
}

deck['0077'] = {
        name : "Wild Nightfiend" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0077_wild_nightfiend.png" ,
}

deck['0078'] = {
        name : "Crypt Reclaimer" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0078_crypt_reclaimer.png" ,
}

deck['0080'] = {
        name : "Dire Mentor" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0080_dire_mentor.png" ,
}

deck['0081'] = {
        name : "Dark Grasp" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0081_dark_grasp.png" ,
}

deck['0082'] = {
        name : "Ghastly Packhounds" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0082_ghastly_packhounds.png" ,
}

deck['0083'] = {
        name : "Lupine Rage" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0083_lupine_rage.png" ,
}

deck['0084'] = {
        name : "Cerebral Decay" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0084_cerebral_decay.png" ,
}

deck['0085'] = {
        name : "Gloomtail Vermin" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0085_gloomtail_vermin.png" ,
}

deck['0086'] = {
        name : "Necrotic Revival" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0086_necrotic_revival.png" ,
}

deck['0087'] = {
        name : "Insatiable Rodents" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0087_insatiable_rodents.png" ,
}

deck['0088'] = {
        name : "Graveyard Jesters" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0088_graveyard_jesters.png" ,
}

deck['0089'] = {
        name : "Cobra Combatant" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0089_cobra_combatant.png" ,
}

deck['0090'] = {
        name : "Moaning Apparition" ,
        type : "creature" ,
        color: "black" ,
        cost: ['*','*','*','*','*','black'] ,
        text : "" ,
        lore : "" ,
        img : "0090_moaning_apparition.png" ,
}

deck['0091'] = {
        name : "Essence Banquet" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0091_essence_banquet.png" ,
}

deck['0092'] = {
        name : "Acidic Erosion" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0092_acidic_erosion.png" ,
}

deck['0093'] = {
        name : "Diabolic Agreement" ,
        type : "sorcery" ,
        color: "black" ,
        cost: ['*','black','black'] ,
        text : "" ,
        lore : "" ,
        img : "0093_diabolic_agreement.png" ,
}

deck['0094'] = {
        name : "Pyroclasmic Rain" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','*','*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0094_pyroclasmic_rain.png" ,
}

deck['0095'] = {
        name : "Cataclysmic End" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','*','*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0095_cataclysmic_end.png" ,
}

deck['0096'] = {
        name : "Soil Behemoth" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0096_soil_behemoth.png" ,
}

deck['0097'] = {
        name : "Flamekin Harbinger" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0097_flamekin_harbinger.png" ,
}

deck['0098'] = {
        name : "Infernal Maelstrom" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','*','*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0098_infernal_maelstrom.png" ,
}

deck['0099'] = {
        name : "Goblin Lancers" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0099_goblin_lancers.png" ,
}

deck['0100'] = {
        name : "Goblin Warwagon" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0100_goblin_warwagon.png" ,
}

deck['0101'] = {
        name : "Goblin Strike Team" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0101_goblin_strike_team.png" ,
}

deck['0102'] = {
        name : "Goblin Warchief" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0102_goblin_warchief.png" ,
}

deck['0103'] = {
        name : "Goblin Skyraider" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0103_goblin_skyraider.png" ,
}

deck['0104'] = {
        name : "Orcish Vanguard" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0104_orcish_vanguard.png" ,
}

deck['0105'] = {
        name : "Goblin Chronicles" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0105_goblin_chronicles.png" ,
}

deck['0106'] = {
        name : "Goblin Cliffscaler" ,
        type : "creature" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0106_goblin_cliffscaler.png" ,
}

deck['0107'] = {
        name : "Goblin Demolitionist" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0107_goblin_demolitionist.png" ,
}

deck['0108'] = {
        name : "Bulky Orc Brute" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0108_bulky_orc_brute.png" ,
}

deck['0109'] = {
        name : "Mountainous Ogre" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0109_mountainous_ogre.png" ,
}

deck['0110'] = {
        name : "Twin Thunderstrike" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0110_twin_thunderstrike.png" ,
}

deck['0111'] = {
        name : "Desperate Foresight" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0111_desperate_foresight.png" ,
}

deck['0112'] = {
        name : "Volcanic Cleaver" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0112_volcanic_cleaver.png" ,
}

deck['0113'] = {
        name : "Bok Orc Marauders" ,
        type : "creature" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0113_bok_orc_marauders.png" ,
}

deck['0114'] = {
        name : "Brawler Brute" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0114_brawler_brute.png" ,
}

deck['0115'] = {
        name : "Enraged Imp" ,
        type : "creature" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0115_enraged_imp.png" ,
}

deck['0116'] = {
        name : "Endless Battlecry" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0116_endless_battlecry.png" ,
}

deck['0117'] = {
        name : "Cinder Javelin" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0117_cinder_javelin.png" ,
}

deck['0118'] = {
        name : "Volcanic Spit" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0118_volcanic_spit.png" ,
}

deck['0119'] = {
        name : "Meteor Crash" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0119_meteor_crash.png" ,
}

deck['0120'] = {
        name : "Lightning Drake" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0120_lightning_drake.png" ,
}

deck['0121'] = {
        name : "Disciplined Brute" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','*','*','*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0121_disciplined_brute.png" ,
}

deck['0122'] = {
        name : "Ground Quake" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0122_ground_quake.png" ,
}

deck['0123'] = {
        name : "Magma Wyrm" ,
        type : "creature" ,
        color: "red" ,
        cost: ['*','*','*','*','red','red'] ,
        text : "" ,
        lore : "" ,
        img : "0123_magma_wyrm.png" ,
}

deck['0124'] = {
        name : "Ember Maul" ,
        type : "sorcery" ,
        color: "red" ,
        cost: ['*','red'] ,
        text : "" ,
        lore : "" ,
        img : "0124_ember_maul.png" ,
}

deck['0125'] = {
        name : "Thornhide Wolves" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0125_thornhide_wolves.png" ,
}

deck['0126'] = {
        name : "Rumblehoof Moose" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0126_rumblehoof_moose.png" ,
}

deck['0127'] = {
        name : "Birch Spirit Elf" ,
        type : "creature" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0127_birch_spirit_elf.png" ,
}

deck['0128'] = {
        name : "Lunar Wing Faerie" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0128_lunar_wing_faerie.png" ,
}

deck['0129'] = {
        name : "Behemoths Boon" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0129_behemoths_boon.png" ,
}

deck['0130'] = {
        name : "Irresistible Fragrance" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0130_irresistible_fragance.png" ,
}

deck['0131'] = {
        name : "Bonegrinder Wurm" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0131_bonegrinder_wurm.png" ,
}

deck['0132'] = {
        name : "River Sovereign" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0132_river_sovereign.png" ,
}

deck['0134'] = {
        name : "Singular Predator" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0134_singular_predator.png" ,
}

deck['0135'] = {
        name : "Shadow Pouncer" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0135_shadow_pouncer.png" ,
}

deck['0136'] = {
        name : "Emerald Fountain" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0136_emerald_fountain.png" ,
}

deck['0137'] = {
        name : "Woodland Guise" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0137_woodland_guise.png" ,
}

deck['0138'] = {
        name : "Forests Calling" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0138_forests_calling.png" ,
}

deck['0139'] = {
        name : "Forest Sentinels" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0139_forest_sentinels.png" ,
}

deck['0140'] = {
        name : "Greenwood Scout" ,
        type : "creature" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0140_greenwood_scout.png" ,
}

deck['0141'] = {
        name : "Noble Lion Troop" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0141_noble_lion_troop.png" ,
}

deck['0142'] = {
        name : "Tree Of Rebirth" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0142_tree_of_rebirth.png" ,
}

deck['0143'] = {
        name : "Primordial Primate" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0143_primordial_primate.png" ,
}

deck['0144'] = {
        name : "War Tusked Matriarch" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0144_war_tusked_matriarch.png" ,
}

deck['0145'] = {
        name : "Raptors Gale" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0145_raptors_gale.png" ,
}

deck['0146'] = {
        name : "Flourishing Fields" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0146_flourishing_fields.png" ,
}

deck['0147'] = {
        name : "Forest Petrifier" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0147_forest_petrifier.png" ,
}

deck['0148'] = {
        name : "Forests Hidden Giant" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0148_forests_hidden_giant.png" ,
}

deck['0149'] = {
        name : "Barbed Monarch Treant" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0149_barbed_monarch_treant.png" ,
}

deck['0150'] = {
        name : "Wilderness Reclamation" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0150_wilderness_reclamation.png" ,
}

deck['0151'] = {
        name : "Dervish Dune Wurm" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','*','*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0151_dervish_dune_wurm.png" ,
}

deck['0152'] = {
        name : "Tempests Erasure" ,
        type : "sorcery" ,
        color: "green" ,
        cost: ['*','*','green','green'] ,
        text : "" ,
        lore : "" ,
        img : "0152_tempests_erasure.png" ,
}

deck['0153'] = {
        name : "Mirewalker Ox" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0153_mirewalker_ox.png" ,
}

deck['0154'] = {
        name : "Sylvan Pathfinders" ,
        type : "creature" ,
        color: "green" ,
        cost: ['*','*','green'] ,
        text : "" ,
        lore : "" ,
        img : "0154_sylvan_pathfinders.png" ,
}

deck['0155'] = {
        name : "Black Land" ,
        type : "land" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0155_black_land.png" ,
}

deck['0156'] = {
        name : "Black Land" ,
        type : "land" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0156_black_land.png" ,
}

deck['0157'] = {
        name : "Black Land" ,
        type : "land" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0157_black_land.png" ,
}

deck['0158'] = {
        name : "Black Land" ,
        type : "land" ,
        color: "black" ,
        cost: ['black'] ,
        text : "" ,
        lore : "" ,
        img : "0158_black_land.png" ,
}

deck['0159'] = {
        name : "Blue Land" ,
        type : "land" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0159_blue_land.png" ,
}

deck['0160'] = {
        name : "Blue Land" ,
        type : "land" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0160_blue_land.png" ,
}

deck['0161'] = {
        name : "Blue Land" ,
        type : "land" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0161_blue_land.png" ,
}

deck['0162'] = {
        name : "Blue Land" ,
        type : "land" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0162_blue_land.png" ,
}

deck['0163'] = {
        name : "Blue Land" ,
        type : "land" ,
        color: "blue" ,
        cost: ['blue'] ,
        text : "" ,
        lore : "" ,
        img : "0163_blue_land.png" ,
}

deck['0164'] = {
        name : "Green Land" ,
        type : "land" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0164_green_land.png" ,
}

deck['0165'] = {
        name : "Green Land" ,
        type : "land" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0165_green_land.png" ,
}

deck['0166'] = {
        name : "Green Land" ,
        type : "land" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0166_green_land.png" ,
}

deck['0167'] = {
        name : "Green Land" ,
        type : "land" ,
        color: "green" ,
        cost: ['green'] ,
        text : "" ,
        lore : "" ,
        img : "0167_green_land.png" ,
}

deck['0168'] = {
        name : "Red Land" ,
        type : "land" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0168_red_land.png" ,
}

deck['0169'] = {
        name : "Red Land" ,
        type : "land" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0169_red_land.png" ,
}

deck['0170'] = {
        name : "Red Land" ,
        type : "land" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0170_red_land.png" ,
}

deck['0171'] = {
        name : "Red Land" ,
        type : "land" ,
        color: "red" ,
        cost: ['red'] ,
        text : "" ,
        lore : "" ,
        img : "0171_red_land.png" ,
}

deck['0172'] = {
        name : "White Land" ,
        type : "land" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0172_white_land.png" ,
}

deck['0173'] = {
        name : "White Land" ,
        type : "land" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0173_white_land.png" ,
}

deck['0174'] = {
        name : "White Land" ,
        type : "land" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0174_white_land.png" ,
}

deck['0175'] = {
        name : "White Land" ,
        type : "land" ,
        color: "white" ,
        cost: ['white'] ,
        text : "" ,
        lore : "" ,
        img : "0175_white_land.png" ,
}

	for (let card in deck) {
		if (!deck[card].canEvent) { deck[card].canEvent = () => {}; }
		if (!deck[card].onEvent) { deck[card].onEvent = () => {}; }
		if (color != "") { if (deck[card].color !== color) { delete deck[card]; } }
	}
	
		return deck;
}


	returnWhiteDeck() { return this.returnDeck("white"); }
	returnRedDeck() { return this.returnDeck("red"); }
	returnBlackDeck() { return this.returnDeck("black"); }
	returnGreenDeck() { return this.returnDeck("green"); }
	returnBlueDeck() { return this.returnDeck("blue"); }


