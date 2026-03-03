export default (app, mod) => {
	return `<div id="main" class="main" style="display: all">
			<div class="gameboard" id="gameboard">
				<div class="china_card_status" id="china_card_status"></div>

				<div class="active_events" style="float: right">
					<img
						src=""
						id="eventtile_warsaw"
						class="event_tile eventtile_warsaw"
					/>
					<img
						src="/twilight/img/Event17.svg"
						id="eventtile_degaulle"
						class="event_tile eventtile_degaulle"
					/>
					<img
						src="/twilight/img/Event21.svg"
						id="eventtile_nato"
						class="event_tile eventtile_nato"
					/>
					<img
						src="/twilight/img/Event23.svg"
						id="eventtile_marshall"
						class="event_tile eventtile_marshall"
					/>
					<img
						src="/twilight/img/Event27.svg"
						id="eventtile_usjapan"
						class="event_tile eventtile_usjapan"
					/>
					<img
						src="/twilight/img/Event35.svg"
						id="eventtile_formosan"
						class="event_tile eventtile_formosan"
					/>
					<img
						src="/twilight/img/Event42.svg"
						id="eventtile_quagmire"
						class="event_tile eventtile_quagmire"
					/>
					<img
						src="/twilight/img/Event44.svg"
						id="eventtile_beartrap"
						class="event_tile eventtile_beartrap"
					/>
					<img
						src="/twilight/img/Event55.svg"
						id="eventtile_willybrandt"
						class="event_tile eventtile_willybrandt"
					/>
					<img
						src="/twilight/img/Event59.svg"
						id="eventtile_flowerpower"
						class="event_tile eventtile_flowerpower"
					/>
					<img
						src="/twilight/img/Event65.svg"
						id="eventtile_campdavid"
						class="event_tile eventtile_campdavid"
					/>
					<img
						src=""
						id="eventtile_shuttlediplomacy"
						class="event_tile eventtile_shuttlediplomacy"
					/>
					<img
						src="/twilight/img/Event68.svg"
						id="eventtile_johnpaul"
						class="event_tile eventtile_johnpaul"
					/>
					<img
						src="/twilight/img/Event82.svg"
						id="eventtile_iranianhostagecrisis"
						class="event_tile eventtile_iranianhostagecrisis"
					/>
					<img
						src="/twilight/img/Event83.svg"
						id="eventtile_ironlady"
						class="event_tile eventtile_ironlady"
					/>
					<img
						src="/twilight/img/Event86.svg"
						id="eventtile_northseaoil"
						class="event_tile eventtile_northseaoil"
					/>
					<img
						src="/twilight/img/Event87.svg"
						id="eventtile_reformer"
						class="event_tile eventtile_reformer"
					/>
					<img
						src="/twilight/img/Event96.svg"
						id="eventtile_teardown"
						class="event_tile eventtile_teardown"
					/>
					<img
						src="/twilight/img/Event97.svg"
						id="eventtile_evilempire"
						class="event_tile eventtile_evilempire"
					/>
					<img
						src="/twilight/img/Event106.svg"
						id="eventtile_norad"
						class="event_tile eventtile_norad"
					/>
					<img
						src="/twilight/img/Event110.svg"
						id="eventtile_awacs"
						class="event_tile eventtile_awacs"
					/>
					<img
						src="/twilight/img/Event218.png"
						id="eventtile_kissinger"
						class="event_tile eventtile_kissinger"
					/>
					<img
						src="/twilight/img/Event208.png"
						id="eventtile_tsarbomba"
						class="event_tile eventtile_tsarbomba"
					/>
					<img
						src="/twilight/img/Event210.png"
						id="eventtile_carterdoctrine"
						class="event_tile eventtile_carterdoctrine"
					/>
					<img
						src="/twilight/img/Event212.png"
						id="eventtile_nixonshock"
						class="event_tile eventtile_nixonshock"
					/>
					<img
						src="/twilight/img/Event213.png"
						id="eventtile_berlinagreement"
						class="event_tile eventtile_berlinagreement"
					/>
					<img
						src="/twilight/img/Event219.png"
						id="eventtile_sudan"
						class="event_tile eventtile_sudan"
					/>
					<img
						src="/twilight/img/Event224.png"
						id="eventtile_argo"
						class="event_tile eventtile_argo"
					/>
				</div>

				<div
					class="scoring_card"
					id="europe"
				></div>
				<div
					class="display_card"
					id="europe"
				>
					<div
						class="display_vp"
						id="europe"
					></div>
				</div>

				<div
					class="scoring_card"
					id="mideast"
				></div>
				<div
					class="display_card"
					id="mideast"
				>
					<div
						class="display_vp"
						id="mideast"
					></div>
				</div>

				<div
					class="scoring_card"
					id="asia"
				></div>
				<div
					class="display_card"
					id="asia"
				>
					<div
						class="display_vp"
						id="asia"
					></div>
				</div>

				<div
					class="scoring_card"
					id="seasia"
				></div>
				<div
					class="display_card"
					id="seasia"
				>
					<div
						class="display_vp"
						id="seasia"
					></div>
				</div>

				<div
					class="scoring_card"
					id="camerica"
				></div>
				<div
					class="display_card"
					id="camerica"
				>
					<div
						class="display_vp"
						id="camerica"
					></div>
				</div>

				<div
					class="scoring_card"
					id="samerica"
				></div>
				<div
					class="display_card"
					id="samerica"
				>
					<div
						class="display_vp"
						id="samerica"
					></div>
				</div>

				<div
					class="scoring_card"
					id="africa"
				></div>
				<div
					class="display_card"
					id="africa"
				>
					<div
						class="display_vp"
						id="africa"
					></div>
				</div>

				<div class="formosan_resolution" id="formosan_resolution"></div>
				<div class="kissinger_colombia" id="kissinger_colombia"></div>
				<div class="kissinger_guatemala" id="kissinger_guatemala"></div>
				<div
					class="kissinger_elsalvador"
					id="kissinger_elsalvador"
				></div>
				<div class="kissinger_nicaragua" id="kissinger_nicaragua"></div>
				<div class="kissinger_haiti" id="kissinger_haiti"></div>
				<div
					class="kissinger_dominicanrepublic"
					id="kissinger_dominicanrepublic"
				></div>
				<div
					class="kissinger_saharanstates"
					id="kissinger_saharanstates"
				></div>
				<div class="kissinger_sudan" id="kissinger_sudan"></div>
				<div class="civil_war_sudan" id="civil_war_sudan"></div>
				<div class="kissinger_ethiopia" id="kissinger_ethiopia"></div>
				<div class="kissinger_cameroon" id="kissinger_cameroon"></div>
				<div
					class="kissinger_seafricanstates"
					id="kissinger_seafricanstates"
				></div>
				<div class="kissinger_zimbabwe" id="kissinger_zimbabwe"></div>
				<div class="kissinger_lebanon" id="kissinger_lebanon"></div>
				<div class="kissinger_laos" id="kissinger_laos"></div>
				<div class="kissinger_vietnam" id="kissinger_vietnam"></div>
				<div class="kissinger_indonesia" id="kissinger_indonesia"></div>
				<div class="round" id="round"></div>
				<div class="action_round_us" id="action_round_us"></div>
				<div class="action_round_ussr" id="action_round_ussr"></div>
				<div
					class="action_round_cover action_round_8_cover"
					id="action_round_7_cover"
				></div>
				<div
					class="action_round_cover action_round_7_cover"
					id="action_round_8_cover"
				></div>
				<div class="defcon" id="defcon"></div>
				<div
					class="vp"
					id="vp"
					style="top: 2740px, left: 3570px;"
				></div>
				<div class="space_race_us" id="space_race_us"></div>
				<div class="space_race_ussr" id="space_race_ussr"></div>
				<div class="milops_us" id="milops_us"></div>
				<div class="milops_ussr" id="milops_ussr"></div>
				<div class="country canada" id="canada">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country uk" id="uk">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country france" id="france">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country benelux" id="benelux">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country italy" id="italy">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country westgermany" id="westgermany">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country eastgermany" id="eastgermany">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country poland" id="poland">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country spain" id="spain">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country greece" id="greece">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country turkey" id="turkey">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country yugoslavia" id="yugoslavia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country bulgaria" id="bulgaria">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country hungary" id="hungary">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country romania" id="romania">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country austria" id="austria">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country czechoslovakia" id="czechoslovakia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country denmark" id="denmark">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country norway" id="norway">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country sweden" id="sweden">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country finland" id="finland">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>

				<div class="country libya" id="libya">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country egypt" id="egypt">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country lebanon" id="lebanon">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country syria" id="syria">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country israel" id="israel">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country iraq" id="iraq">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country iran" id="iran">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country jordan" id="jordan">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country gulfstates" id="gulfstates">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country saudiarabia" id="saudiarabia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>

				<div class="country afghanistan" id="afghanistan">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country pakistan" id="pakistan">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country india" id="india">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country burma" id="burma">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country laos" id="laos">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country thailand" id="thailand">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country vietnam" id="vietnam">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country malaysia" id="malaysia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country australia" id="australia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country indonesia" id="indonesia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country philippines" id="philippines">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country taiwan" id="taiwan">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country japan" id="japan">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country southkorea" id="southkorea">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country northkorea" id="northkorea">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>

				<div class="country mexico" id="mexico">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country guatemala" id="guatemala">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country elsalvador" id="elsalvador">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country honduras" id="honduras">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country nicaragua" id="nicaragua">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country costarica" id="costarica">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country panama" id="panama">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country cuba" id="cuba">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country haiti" id="haiti">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country dominicanrepublic" id="dominicanrepublic">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>

				<div class="country venezuela" id="venezuela">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country colombia" id="colombia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country ecuador" id="ecuador">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country peru" id="peru">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country chile" id="chile">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country bolivia" id="bolivia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country argentina" id="argentina">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country paraguay" id="paraguay">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country uruguay" id="uruguay">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country brazil" id="brazil">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>

				<div class="country morocco" id="morocco">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country algeria" id="algeria">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country saharanstates" id="saharanstates">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country tunisia" id="tunisia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country westafricanstates" id="westafricanstates">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country sudan" id="sudan">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country ivorycoast" id="ivorycoast">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country nigeria" id="nigeria">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country ethiopia" id="ethiopia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country somalia" id="somalia">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country cameroon" id="cameroon">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country zaire" id="zaire">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country kenya" id="kenya">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country angola" id="angola">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country seafricanstates" id="seafricanstates">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country zimbabwe" id="zimbabwe">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country botswana" id="botswana">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
				<div class="country southafrica" id="southafrica">
					<div class="us"></div>
					<div class="ussr"></div>
				</div>
			</div>
		</div>`;
};
