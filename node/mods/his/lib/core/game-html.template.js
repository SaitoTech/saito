module.exports = (app, mod) => {
	return `
			<div class="gameboard" id="gameboard">

			<!--- NAVAL SPACES --->
			<div class="navalspace irish" id="irish"></div>
			<div class="navalspace channel" id="channel"></div>
			<div class="navalspace north" id="north"></div>
			<div class="navalspace baltic" id="baltic"></div>
			<div class="navalspace biscay" id="biscay"></div>
			<div class="navalspace atlantic" id="atlantic"></div>
			<div class="navalspace gulflyon" id="gulflyon"></div>
			<div class="navalspace barbary" id="barbary"></div>
			<div class="navalspace tyrrhenian" id="tyrrhenian"></div>
			<div class="navalspace africa" id="africa"></div>
			<div class="navalspace adriatic" id="adriatic"></div>
			<div class="navalspace ionian" id="ionian"></div>
			<div class="navalspace aegean" id="aegean"></div>
			<div class="navalspace black" id="black"></div>

			<!--- PIRACY MARKERS --->
			<div class="piracy_marker irish"></div>
			<div class="piracy_marker channel"></div>
			<div class="piracy_marker north"></div>
			<div class="piracy_marker baltic"></div>
			<div class="piracy_marker biscay"></div>
			<div class="piracy_marker atlantic"></div>
			<div class="piracy_marker gulflyon"></div>
			<div class="piracy_marker barbary"></div>
			<div class="piracy_marker tyrrhenian"></div>
			<div class="piracy_marker africa"></div>
			<div class="piracy_marker adriatic"></div>
			<div class="piracy_marker ionian"></div>
			<div class="piracy_marker aegean"></div>
			<div class="piracy_marker black"></div>

			<!--- FORTRESSES, TOWNS, KEYS etc. --->
			<div class="space stirling" id="stirling"></div>
			<div class="space glasgow" id="glasgow"></div>
			<div class="space edinburgh" id="edinburgh"></div>

			<div class="space berwick" id="berwick"></div>
			<div class="space carlisle" id="carlisle"></div>
			<div class="space york" id="york"></div>
			<div class="space shrewsbury" id="shrewsbury"></div>
			<div class="space lincoln" id="lincoln"></div>
			<div class="space norwich" id="norwich"></div>
			<div class="space wales" id="wales"></div>
			<div class="space bristol" id="bristol"></div>
			<div class="space london" id="london"></div>
			<div class="space plymouth" id="plymouth"></div>
			<div class="space portsmouth" id="portsmouth"></div>
			<div class="space calais" id="calais"></div>
			<div class="space boulogne" id="boulogne"></div>
			<div class="space rouen" id="rouen"></div>
			<div class="space brest" id="brest"></div>
			<div class="space stquentin" id="stquentin"></div>
			<div class="space paris" id="paris"></div>
			<div class="space stdizier" id="stdizier"></div>
			<div class="space dijon" id="dijon"></div>
			<div class="space orleans" id="orleans"></div>
			<div class="space tours" id="tours"></div>
			<div class="space nantes" id="nantes"></div>
			<div class="space limoges" id="limoges"></div>
			<div class="space bordeaux" id="bordeaux"></div>
			<div class="space toulouse" id="toulouse"></div>
			<div class="space avignon" id="avignon"></div>
			<div class="space lyon" id="lyon"></div>
			<div class="space grenoble" id="grenoble"></div>
			<div class="space marseille" id="marseille"></div>
			<div class="space navarre" id="navarre"></div>
			<div class="space bilbao" id="bilbao"></div>
			<div class="space corunna" id="corunna"></div>
			<div class="space valladolid" id="valladolid"></div>
			<div class="space zaragoza" id="zaragoza"></div>
			<div class="space madrid" id="madrid"></div>
			<div class="space cordoba" id="cordoba"></div>
			<div class="space seville" id="seville"></div>
			<div class="space granada" id="granada"></div>
			<div class="space gibraltar" id="gibraltar"></div>
			<div class="space cartagena" id="cartagena"></div>
			<div class="space valencia" id="valencia"></div>
			<div class="space barcelona" id="barcelona"></div>
			<div class="space palma" id="palma"></div>
			<div class="space oran" id="oran"></div>
			<div class="space algiers" id="algiers"></div>
			<div class="space cagliari" id="cagliari"></div>
			<div class="space tunis" id="tunis"></div>
			<div class="space cerignola" id="cerignola"></div>
			<div class="space naples" id="naples"></div>
			<div class="space taranto" id="taranto"></div>
			<div class="space messina" id="messina"></div>
			<div class="space palermo" id="palermo"></div>
			<div class="space malta" id="malta"></div>
			<div class="space tripoli" id="tripoli"></div>
			<div class="space candia" id="candia"></div>
			<div class="space rhodes" id="rhodes"></div>
			<div class="space corfu" id="corfu"></div>
			<div class="space ragusa" id="ragusa"></div>
			<div class="space zara" id="zara"></div>
			<div class="space venice" id="venice"></div>
			<div class="space rome" id="rome"></div>
			<div class="space ancona" id="ancona"></div>
			<div class="space ravenna" id="ravenna"></div>
			<div class="space siena" id="siena"></div>
			<div class="space florence" id="florence"></div>
			<div class="space modena" id="modena"></div>
			<div class="space trent" id="trent"></div>
			<div class="space zurich" id="zurich"></div>
			<div class="space basel" id="basel"></div>
			<div class="space geneva" id="geneva"></div>
			<div class="space turin" id="turin"></div>
			<div class="space nice" id="nice"></div>
			<div class="space bastia" id="bastia"></div>
			<div class="space genoa" id="genoa"></div>
			<div class="space pavia" id="pavia"></div>
			<div class="space milan" id="milan"></div>
			<div class="space innsbruck" id="innsbruck"></div>
			<div class="space trieste" id="trieste"></div>
			<div class="space graz" id="graz"></div>
			<div class="space linz" id="linz"></div>
			<div class="space vienna" id="vienna"></div>
			<div class="space besancon" id="besancon"></div>
			<div class="space metz" id="metz"></div>
			<div class="space liege" id="liege"></div>
			<div class="space brussels" id="brussels"></div>
			<div class="space antwerp" id="antwerp"></div>
			<div class="space amsterdam" id="amsterdam"></div>
			<div class="space lubeck" id="lubeck"></div>
			<div class="space stettin" id="stettin"></div>
			<div class="space hamburg" id="hamburg"></div>
			<div class="space bremen" id="bremen"></div>
			<div class="space munster" id="munster"></div>
			<div class="space brunswick" id="brunswick"></div>
			<div class="space magdeburg" id="magdeburg"></div>
			<div class="space brandenburg" id="brandenburg"></div>
			<div class="space wittenberg" id="wittenberg"></div>
			<div class="space leipzig" id="leipzig"></div>
			<div class="space erfurt" id="erfurt"></div>
			<div class="space kassel" id="kassel"></div>
			<div class="space cologne" id="cologne"></div>
			<div class="space trier" id="trier"></div>
			<div class="space mainz" id="mainz"></div>
			<div class="space nuremberg" id="nuremberg"></div>
			<div class="space strasburg" id="strasburg"></div>
			<div class="space worms" id="worms"></div>
			<div class="space augsburg" id="augsburg"></div>
			<div class="space regensburg" id="regensburg"></div>
			<div class="space salzburg" id="salzburg"></div>
			<div class="space prague" id="prague"></div>
			<div class="space breslau" id="breslau"></div>
			<div class="space brunn" id="brunn"></div>
			<div class="space pressburg" id="pressburg"></div>
			<div class="space buda" id="buda"></div>
			<div class="space szegedin" id="szegedin"></div>
			<div class="space agram" id="agram"></div>
			<div class="space mohacs" id="mohacs"></div>
			<div class="space belgrade" id="belgrade"></div>
			<div class="space istanbul" id="istanbul"></div>
			<div class="space varna" id="varna"></div>
			<div class="space edirne" id="edirne"></div>
			<div class="space bucharest" id="bucharest"></div>
			<div class="space nicopolis" id="nicopolis"></div>
			<div class="space sofia" id="sofia"></div>
			<div class="space nezh" id="nezh"></div>
			<div class="space scutari" id="scutari"></div>
			<div class="space durazzo" id="durazzo"></div>
			<div class="space salonika" id="salonika"></div>
			<div class="space larissa" id="larissa"></div>
			<div class="space lepanto" id="lepanto"></div>
			<div class="space coron" id="coron"></div>
			<div class="space athens" id="athens"></div>

			<!--- FOREIGN WAR CARDS --->
			<div class="revolt_in_egypt egypt" id="egypt"></div>
			<div class="revolt_in_ireland ireland" id="ireland"></div>
			<div class="war_in_persia persia" id="persia"></div>

			<!--- CROSSING ATLANTIC --->
			<div class="crossing_atlantic" id="crossing_atlantic"></div>

			<!--- COLONY BONUSES --->
			<div class="colony england_colony1_bonus"  id="colony1"></div>
			<div class="colony england_colony2_bonus"  id="colony2"></div>
			<div class="colony france_colony1_bonus"   id="colony3"></div>
			<div class="colony france_colony2_bonus"   id="colony4"></div>
			<div class="colony hapsburg_colony1_bonus" id="colony5"></div>
			<div class="colony hapsburg_colony2_bonus" id="colony6"></div>
			<div class="colony hapsburg_colony3_bonus" id="colony7"></div>

			<!--- COLONIES --->
			<div class="colony england_colony1" id="colony1"></div>
			<div class="colony england_colony2" id="colony2"></div>
			<div class="colony france_colony1" id="colony3"></div>
			<div class="colony france_colony2" id="colony4"></div>
			<div class="colony hapsburg_colony1" id="colony5"></div>
			<div class="colony hapsburg_colony2" id="colony6"></div>
			<div class="colony hapsburg_colony3" id="colony7"></div>

			<!--- CONQUESTS --->
			<div class="conquest england_conquest1" id="conquest1"></div>
			<div class="conquest england_conquest2" id="conquest2"></div>
			<div class="conquest france_conquest1" id="conquest3"></div>
			<div class="conquest france_conquest2" id="conquest4"></div>
			<div class="conquest hapsburg_conquest1" id="conquest5"></div>
			<div class="conquest hapsburg_conquest2" id="conquest6"></div>
			<div class="conquest hapsburg_conquest3" id="conquest7"></div>

			<!--- ELECTORATE DISPLAY --->
			<div class="electorate_display" id="ed_augsburg"></div>
			<div class="electorate_display" id="ed_trier"></div>
			<div class="electorate_display" id="ed_cologne"></div>
			<div class="electorate_display" id="ed_wittenberg"></div>
			<div class="electorate_display" id="ed_mainz"></div>
			<div class="electorate_display" id="ed_brandenburg"></div>

			<!--- NEW WORLD BONUSES --->
			<div class="new-world-bonus greatlakes" id="greatlakes"></div>
			<div class="new-world-bonus stlawrence" id="stlawrence"></div>
			<div class="new-world-bonus mississippi" id="mississippi"></div>
			<div class="new-world-bonus aztec" id="aztec"></div>
			<div class="new-world-bonus maya" id="maya"></div>
			<div class="new-world-bonus amazon" id="amazon"></div>
			<div class="new-world-bonus inca" id="inca"></div>
			<div class="new-world-bonus circumnavigation" id="circumnavigation"></div>
			<div class="new-world-bonus pacificstrait" id="pacificstrait"></div>

			<!--- WAR TABLE --->
			<div class="warbox" id="ottoman_hapsburg"></div>
			<div class="warbox" id="ottoman_england"></div>
			<div class="warbox" id="ottoman_france"></div>
			<div class="warbox" id="ottoman_papacy"></div>
			<div class="warbox" id="ottoman_protestant"></div>
			<div class="warbox" id="ottoman_genoa"></div>
			<div class="warbox" id="ottoman_hungary"></div>
			<div class="warbox" id="ottoman_scotland"></div>
			<div class="warbox" id="ottoman_venice"></div>

			<div class="warbox" id="hapsburg_ottoman"></div>
			<div class="warbox" id="hapsburg_england"></div>
			<div class="warbox" id="hapsburg_france"></div>
			<div class="warbox" id="hapsburg_papacy"></div>
			<div class="warbox" id="hapsburg_protestant"></div>
			<div class="warbox" id="hapsburg_genoa"></div>
			<div class="warbox" id="hapsburg_hungary"></div>
			<div class="warbox" id="hapsburg_scotland"></div>
			<div class="warbox" id="hapsburg_venice"></div>

			<div class="warbox" id="england_ottoman"></div>
			<div class="warbox" id="england_hapsburg"></div>
			<div class="warbox" id="england_france"></div>
			<div class="warbox" id="england_papacy"></div>
			<div class="warbox" id="england_protestant"></div>
			<div class="warbox" id="england_genoa"></div>
			<div class="warbox" id="england_hungary"></div>
			<div class="warbox" id="england_scotland"></div>
			<div class="warbox" id="england_venice"></div>

			<div class="warbox" id="france_ottoman"></div>
			<div class="warbox" id="france_hapsburg"></div>
			<div class="warbox" id="france_england"></div>
			<div class="warbox" id="france_papacy"></div>
			<div class="warbox" id="france_protestant"></div>
			<div class="warbox" id="france_genoa"></div>
			<div class="warbox" id="france_hungary"></div>
			<div class="warbox" id="france_scotland"></div>
			<div class="warbox" id="france_venice"></div>

			<div class="warbox" id="papacy_ottoman"></div>
			<div class="warbox" id="papacy_hapsburg"></div>
			<div class="warbox" id="papacy_england"></div>
			<div class="warbox" id="papacy_france"></div>
			<div class="warbox" id="papacy_protestant"></div>
			<div class="warbox" id="papacy_genoa"></div>
			<div class="warbox" id="papacy_scotland"></div>
			<div class="warbox" id="papacy_hungary"></div>
			<div class="warbox" id="papacy_venice"></div>

			<div class="warbox" id="protestant_ottoman"></div>
			<div class="warbox" id="protestant_hapsburg"></div>
			<div class="warbox" id="protestant_england"></div>
			<div class="warbox" id="protestant_france"></div>
			<div class="warbox" id="protestant_papacy"></div>
			<div class="warbox" id="protestant_genoa"></div>
			<div class="warbox" id="protestant_scotland"></div>
			<div class="warbox" id="protestant_hungary"></div>
			<div class="warbox" id="protestant_venice"></div>

			<!--- PREGNANCY CHART --->
			<div class="pregnancy" id="pregnancy1"></div>
			<div class="pregnancy" id="pregnancy2"></div>
			<div class="pregnancy" id="pregnancy3"></div>
			<div class="pregnancy" id="pregnancy4"></div>
			<div class="pregnancy" id="pregnancy5"></div>
			<div class="pregnancy" id="pregnancy6"></div>

			<!--- VICTORY POINTS --->
			<div class="vp" id="vp1"></div>
			<div class="vp" id="vp2"></div>
			<div class="vp" id="vp3"></div>
			<div class="vp" id="vp4"></div>
			<div class="vp" id="vp5"></div>
			<div class="vp" id="vp6"></div>
			<div class="vp" id="vp7"></div>
			<div class="vp" id="vp8"></div>
			<div class="vp" id="vp9"></div>
			<div class="vp" id="vp10"></div>
			<div class="vp" id="vp11"></div>
			<div class="vp" id="vp12"></div>
			<div class="vp" id="vp13"></div>
			<div class="vp" id="vp14"></div>
			<div class="vp" id="vp15"></div>
			<div class="vp" id="vp16"></div>
			<div class="vp" id="vp17"></div>
			<div class="vp" id="vp18"></div>
			<div class="vp" id="vp19"></div>
			<div class="vp" id="vp20"></div>
			<div class="vp" id="vp21"></div>
			<div class="vp" id="vp22"></div>
			<div class="vp" id="vp23"></div>
			<div class="vp" id="vp24"></div>
			<div class="vp" id="vp25"></div>
			<div class="vp" id="vp26"></div>
			<div class="vp" id="vp27"></div>
			<div class="vp" id="vp28"></div>
			<div class="vp" id="vp29"></div>

			<div class="vp_tile" id="hapsburg_vp_tile" alt="Hapsburg"></div>
			<div class="vp_tile" id="ottoman_vp_tile" alt="Ottoman"></div>
			<div class="vp_tile" id="england_vp_tile" alt="England"></div>
			<div class="vp_tile" id="france_vp_tile" alt="France"></div>
			<div class="vp_tile" id="papacy_vp_tile" alt="Papacy"></div>
			<div class="vp_tile" id="protestant_vp_tile" alt="Protestant"></div>

			<!--- TURN TRACK --->
			<div class="turntrack turntrack1" id="turntrack"></div>
		</div>
`;
}
