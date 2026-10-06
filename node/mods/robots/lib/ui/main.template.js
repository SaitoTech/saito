const Art = require('../art');
module.exports = () => `
<main class="robots-game" aria-label="Terminators (Run Sarah Run)">
  <section class="scoreboard" aria-label="Score">
    <div class="scoreboard-title"><h1>TERMINATORS</h1><p class="subtitle">RUN SARAH RUN</p></div>
    <div class="scoreboard-stats">
    <div><span>1UP SCORE</span><strong data-stat="score">000000</strong></div>
    <div><span>HI SCORE</span><strong data-stat="best">000000</strong></div>
    <div><span>WAVE</span><strong data-stat="wave">01</strong></div>
    <div><span>HOSTILES</span><strong data-stat="robots">10</strong></div>
    <div><span>FIRES</span><strong data-stat="fires">00</strong></div>
    </div>
  </section>
  <div class="game-layout">
    <section class="arena-panel" aria-label="Game board">
      <div class="panel-label"><span>SECTOR 07 / INDUSTRIAL DISTRICT</span><span class="signal">LIVE</span></div>
      <div class="arena" tabindex="0" aria-label="Move Sarah using arrows, QWE ASD ZXC or the keypad. Space holds position."></div>
      <div class="arena-caption"><span>ONE STEP. ONE CHANCE.</span><span>NO FATE BUT WHAT WE MAKE</span></div>
      <div class="legend"><span>${Art.svg(24, 24, Art.sprite('sarah', 0, 0, 2))} YOU</span><span>${Art.svg(24, 24, Art.sprite('robot', 0, 0, 2))} TERMINATOR</span><span>${Art.svg(24, 24, Art.sprite('fire', 0, 0, 2))} WRECKAGE</span></div>
    </section>
    <aside class="command-panel">
      <div class="robots-player"></div>
      <div class="robots-hud" aria-live="polite"></div>
      <div class="controls">
        <h2>EVASIVE MANEUVERS</h2>
        <div class="direction-pad" aria-label="Movement controls">
          ${[
            [-1, -1, 'NW'],
            [0, -1, 'N'],
            [1, -1, 'NE'],
            [-1, 0, 'W'],
            [0, 0, 'HOLD'],
            [1, 0, 'E'],
            [-1, 1, 'SW'],
            [0, 1, 'S'],
            [1, 1, 'SE']
          ]
            .map(
              ([dx, dy, label]) =>
                `<button type="button" data-dx="${dx}" data-dy="${dy}" aria-label="${label === 'HOLD' ? 'Hold position' : 'Move ' + label}" title="${label}">${label}</button>`
            )
            .join('')}
        </div>
        <div class="jump-controls"><button type="button" data-action="safe">SAFE JUMP <span>[F] 1 SAITO</span></button><button type="button" data-action="teleport">RISKY JUMP <span>[T/0] FREE</span></button></div>
        <p class="control-hint">ARROWS / QWE ASD ZXC / NUMPAD<br>SPACE OR 5 TO HOLD. TAP ONCE.</p>
      </div>
      <div class="leaderboard-status"><h2>LEADERBOARD</h2><div><span>THIS RUN</span><b data-stat="leaderboardPoints">0</b></div><div><span>BEST RUN</span><b data-stat="leaderboardBest">0</b></div><div><span>RANK</span><b data-leaderboard-rank>--</b></div><p>LEVEL REWARDS: 1 / 2 / 4 / 8...</p><button type="button" data-action="leaderboard">VIEW LEADERBOARD</button></div>
      <div class="bonus-table"><h2>CONTROL THE BURN</h2><div><span>3 FIRES</span><b>+10</b></div><div><span>2 FIRES</span><b>+20</b></div><div><span>1 FIRE</span><b>+50</b></div><p>BONUS ON WAVE CLEAR<br>STEP -1 / HOLD FREE / KILL +10</p></div>
      <div class="utility-controls"><button type="button" data-action="rules">HOW TO PLAY</button><button type="button" data-action="restart">NEW RUN</button></div>
    </aside>
  </div>
  <footer>LOS ANGELES / 2029 / SAITO ARCADE <span>01 PLAYER / TURN BASED</span></footer>
</main>`;
