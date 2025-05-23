module.exports = (app, mod) => {

return `		<div id="main" class="main">
			<div class="gameboard" id="gameboard">
				<div class="slot tl" title="Triple letter bonus" id="1_1">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
				<div class="slot" id="1_2"></div>
				<div class="slot" id="1_3"></div>
				<div class="slot" id="1_4"></div>
				<div class="slot dl" title="Double letter bonus" id="1_5">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="1_6"></div>
				<div class="slot" id="1_7"></div>
				<div class="slot dw" title="Double word bonus" id="1_8">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="1_9"></div>
				<div class="slot" id="1_10"></div>
				<div class="slot dl" title="Double letter bonus" id="1_11">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="1_12"></div>
				<div class="slot" id="1_13"></div>
				<div class="slot" id="1_14"></div>
				<div class="slot tl" title="Triple letter bonus" id="1_15">
					<div class="tlbk bonus">3X LETTER</div>
				</div>

				<div class="slot" id="2_1"></div>
				<div class="slot tw" title="Triple word bonus" id="2_2">
					<div class="twbk bonus">3X WORD</div>
				</div>
				<div class="slot" id="2_3"></div>
				<div class="slot" id="2_4"></div>
				<div class="slot" id="2_5"></div>
				<div class="slot" id="2_6"></div>
				<div class="slot" id="2_7"></div>
				<div class="slot" id="2_8"></div>
				<div class="slot" id="2_9"></div>
				<div class="slot" id="2_10"></div>
				<div class="slot" id="2_11"></div>
				<div class="slot" id="2_12"></div>
				<div class="slot" id="2_13"></div>
				<div class="slot tw" title="Triple word bonus" id="2_14">
					<div class="twbk bonus">3X WORD</div>
				</div>
				<div class="slot" id="2_15"></div>

				<div class="slot" id="3_1"></div>
				<div class="slot" id="3_2"></div>
				<div class="slot" id="3_3"></div>
				<div class="slot dl" title="Double letter bonus" id="3_4">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="3_5"></div>
				<div class="slot" id="3_6"></div>
				<div class="slot" id="3_7"></div>
				<div class="slot tl" title="Triple letter bonus" id="3_8">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
				<div class="slot" id="3_9"></div>
				<div class="slot" id="3_10"></div>
				<div class="slot" id="3_11"></div>
				<div class="slot dl" title="Double letter bonus" id="3_12">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="3_13"></div>
				<div class="slot" id="3_14"></div>
				<div class="slot" id="3_15"></div>

				<div class="slot" id="4_1"></div>
				<div class="slot" id="4_2"></div>
				<div class="slot dl" title="Double letter bonus" id="4_3">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="4_4"></div>
				<div class="slot" id="4_5"></div>
				<div class="slot dw" title="Double word bonus" id="4_6">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="4_7"></div>
				<div class="slot" id="4_8"></div>
				<div class="slot" id="4_9"></div>
				<div class="slot dw" title="Double word bonus" id="4_10">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="4_11"></div>
				<div class="slot" id="4_12"></div>
				<div class="slot dl" title="Double letter bonus" id="4_13">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="4_14"></div>
				<div class="slot" id="4_15"></div>

				<div class="slot dl" title="Double letter bonus" id="5_1">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="5_2"></div>
				<div class="slot" id="5_3"></div>
				<div class="slot" id="5_4"></div>
				<div class="slot" id="5_5"></div>
				<div class="slot" id="5_6"></div>
				<div class="slot" id="5_7"></div>
				<div class="slot dl" title="Double letter bonus" id="5_8">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="5_9"></div>
				<div class="slot" id="5_10"></div>
				<div class="slot" id="5_11"></div>
				<div class="slot" id="5_12"></div>
				<div class="slot" id="5_13"></div>
				<div class="slot" id="5_14"></div>
				<div class="slot dl" title="Double letter bonus" id="5_15">
					<div class="dlbk bonus">2X LETTER</div>
				</div>

				<div class="slot" id="6_1"></div>
				<div class="slot" id="6_2"></div>
				<div class="slot" id="6_3"></div>
				<div class="slot dw" title="Double word bonus" id="6_4">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="6_5"></div>
				<div class="slot star" id="6_6">
					<div class="starbk bonus">✶</div>
				</div>
				<div class="slot" id="6_7"></div>
				<div class="slot" id="6_8"></div>
				<div class="slot" id="6_9"></div>
				<div class="slot star" id="6_10">
					<div class="starbk bonus">✶</div>
				</div>
				<div class="slot" id="6_11"></div>
				<div class="slot dw" title="Double word bonus" id="6_12">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="6_13"></div>
				<div class="slot" id="6_14"></div>
				<div class="slot" id="6_15"></div>

				<div class="slot" id="7_1"></div>
				<div class="slot" id="7_2"></div>
				<div class="slot" id="7_3"></div>
				<div class="slot" id="7_4"></div>
				<div class="slot" id="7_5"></div>
				<div class="slot" id="7_6"></div>
				<div class="slot" id="7_7"></div>
				<div class="slot" id="7_8"></div>
				<div class="slot" id="7_9"></div>
				<div class="slot" id="7_10"></div>
				<div class="slot" id="7_11"></div>
				<div class="slot" id="7_12"></div>
				<div class="slot" id="7_13"></div>
				<div class="slot" id="7_14"></div>
				<div class="slot" id="7_15"></div>

				<div class="slot dw" title="Double word bonus" id="8_1">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="8_2"></div>
				<div class="slot tl" title="Triple letter bonus" id="8_3">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
				<div class="slot" id="8_4"></div>
				<div class="slot dl" title="Double letter bonus" id="8_5">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="8_6"></div>
				<div class="slot" id="8_7"></div>
				<div class="slot tw" title="Triple word bonus" id="8_8">
					<div class="twbk bonus">3X WORD</div>
				</div>
				<div class="slot" id="8_9"></div>
				<div class="slot" id="8_10"></div>
				<div class="slot dl" title="Double letter bonus" id="8_11">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="8_12"></div>
				<div class="slot tl" title="Triple letter bonus" id="8_13">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
				<div class="slot" id="8_14"></div>
				<div class="slot dw" title="Double word bonus" id="8_15">
					<div class="dwbk bonus">2X WORD</div>
				</div>

				<div class="slot" id="9_1"></div>
				<div class="slot" id="9_2"></div>
				<div class="slot" id="9_3"></div>
				<div class="slot" id="9_4"></div>
				<div class="slot" id="9_5"></div>
				<div class="slot" id="9_6"></div>
				<div class="slot" id="9_7"></div>
				<div class="slot" id="9_8"></div>
				<div class="slot" id="9_9"></div>
				<div class="slot" id="9_10"></div>
				<div class="slot" id="9_11"></div>
				<div class="slot" id="9_12"></div>
				<div class="slot" id="9_13"></div>
				<div class="slot" id="9_14"></div>
				<div class="slot" id="9_15"></div>

				<div class="slot" id="10_1"></div>
				<div class="slot" id="10_2"></div>
				<div class="slot" id="10_3"></div>
				<div class="slot dw" title="Double word bonus" id="10_4">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="10_5"></div>
				<div class="slot star" id="10_6">
					<div class="starbk bonus">✶</div>
				</div>
				<div class="slot" id="10_7"></div>
				<div class="slot" id="10_8"></div>
				<div class="slot" id="10_9"></div>
				<div class="slot star" id="10_10">
					<div class="starbk bonus">✶</div>
				</div>
				<div class="slot" id="10_11"></div>
				<div class="slot dw" title="Double word bonus" id="10_12">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="10_13"></div>
				<div class="slot" id="10_14"></div>
				<div class="slot" id="10_15"></div>

				<div class="slot dl" title="Double letter bonus" id="11_1">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="11_2"></div>
				<div class="slot" id="11_3"></div>
				<div class="slot" id="11_4"></div>
				<div class="slot" id="11_5"></div>
				<div class="slot" id="11_6"></div>
				<div class="slot" id="11_7"></div>
				<div class="slot dl" title="Double letter bonus" id="11_8">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="11_9"></div>
				<div class="slot" id="11_10"></div>
				<div class="slot" id="11_11"></div>
				<div class="slot" id="11_12"></div>
				<div class="slot" id="11_13"></div>
				<div class="slot" id="11_14"></div>
				<div class="slot dl" title="Double letter bonus" id="11_15">
					<div class="dlbk bonus">2X LETTER</div>
				</div>

				<div class="slot" id="12_1"></div>
				<div class="slot" id="12_2"></div>
				<div class="slot dl" title="Double letter bonus" id="12_3">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="12_4"></div>
				<div class="slot" id="12_5"></div>
				<div class="slot dw" title="Double word bonus" id="12_6">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="12_7"></div>
				<div class="slot" id="12_8"></div>
				<div class="slot" id="12_9"></div>
				<div class="slot dw" title="Double word bonus" id="12_10">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="12_11"></div>
				<div class="slot" id="12_12"></div>
				<div class="slot dl" title="Double letter bonus" id="12_13">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="12_14"></div>
				<div class="slot" id="12_15"></div>

				<div class="slot" id="13_1"></div>
				<div class="slot" id="13_2"></div>
				<div class="slot" id="13_3"></div>
				<div class="slot dl" title="Double letter bonus" id="13_4">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="13_5"></div>
				<div class="slot" id="13_6"></div>
				<div class="slot" id="13_7"></div>
				<div class="slot tl" title="Triple letter bonus" id="13_8">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
				<div class="slot" id="13_9"></div>
				<div class="slot" id="13_10"></div>
				<div class="slot" id="13_11"></div>
				<div class="slot dl" title="Double letter bonus" id="13_12">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="13_13"></div>
				<div class="slot" id="13_14"></div>
				<div class="slot" id="13_15"></div>

				<div class="slot" id="14_1"></div>
				<div class="slot tw" title="Triple word bonus" id="14_2">
					<div class="twbk bonus">3X WORD</div>
				</div>
				<div class="slot" id="14_3"></div>
				<div class="slot" id="14_4"></div>
				<div class="slot" id="14_5"></div>
				<div class="slot" id="14_6"></div>
				<div class="slot" id="14_7"></div>
				<div class="slot" id="14_8"></div>
				<div class="slot" id="14_9"></div>
				<div class="slot" id="14_10"></div>
				<div class="slot" id="14_11"></div>
				<div class="slot" id="14_12"></div>
				<div class="slot" id="14_13"></div>
				<div class="slot tw" title="Triple word bonus" id="14_14">
					<div class="twbk bonus">3X WORD</div>
				</div>
				<div class="slot" id="14_15"></div>

				<div class="slot tl" title="Triple letter bonus" id="15_1">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
				<div class="slot" id="15_2"></div>
				<div class="slot" id="15_3"></div>
				<div class="slot" id="15_4"></div>
				<div class="slot dl" title="Double letter bonus" id="15_5">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="15_6"></div>
				<div class="slot" id="15_7"></div>
				<div class="slot dw" title="Double word bonus" id="15_8">
					<div class="dwbk bonus">2X WORD</div>
				</div>
				<div class="slot" id="15_9"></div>
				<div class="slot" id="15_10"></div>
				<div class="slot dl" title="Double letter bonus" id="15_11">
					<div class="dlbk bonus">2X LETTER</div>
				</div>
				<div class="slot" id="15_12"></div>
				<div class="slot" id="15_13"></div>
				<div class="slot" id="15_14"></div>
				<div class="slot tl" title="Triple letter bonus" id="15_15">
					<div class="tlbk bonus">3X LETTER</div>
				</div>
			</div>
		</div>

		<div id="hud" class="hud hud-long">
			<div id="hud-header" class="hud-header"></div>
			<div id="hud-body" class="hud-body">
				<div id="status" class="status"></div>
				<div id="controls" class="controls"></div>
			</div>
		</div>`;
}