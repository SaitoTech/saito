const font = require('../pixel-font');
const { dataURI, background } = require('../art');
// Bundled CSS is deliberate: .saito installs must not fetch /robots/style.css.
module.exports = `
@font-face { font-family: RobotsPixel; src: url(data:font/woff2;base64,${font}) format('woff2'); font-display: swap; }
body:has(.robots-game) { margin: 0; background: #080e1b; overflow: auto; }
.robots-game, .robots-rules { --robots-ink: #f2eddf; --robots-muted: #8fa7bb; color: var(--robots-ink); font-family: RobotsPixel, monospace; font-size: 12px; line-height: 1.7; }
.robots-game { min-height: 100dvh; padding: 70px 32px 24px; background: linear-gradient(#080e1bf5, #080e1bf2), url('${dataURI(background())}') center / cover fixed; }
.robots-game *, .robots-rules * { box-sizing: border-box; }
.robots-game .scoreboard, .robots-game .game-layout, .robots-game footer { max-width: 1120px; margin: 0 auto; }
.robots-game p, .robots-game h1, .robots-game h2 { margin: 0; }
.robots-game h1, .robots-game h2, .robots-rules h1, .robots-rules h2 { font-family: inherit; }
.robots-game h1 { color: #ff4555; font-size: clamp(22px, 2.4vw, 30px); line-height: 1.5; letter-spacing: 1px; white-space: nowrap; text-shadow: 3px 3px #671f32; }
.robots-game .subtitle { font-size: 10px; letter-spacing: 2px; }
.robots-game .scoreboard { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 32px; padding: 16px 22px; background: #101c2b; border-top: 2px solid #496277; border-bottom: 2px solid #283b50; }
.robots-game .scoreboard-stats { display: grid; grid-template-columns: 1.4fr 1.4fr 1fr 1fr 1fr; gap: 16px; text-align: right; }
.robots-game .scoreboard span { display: block; color: #91a9b9; font-size: 10px; }
.robots-game .scoreboard strong { display: block; color: #f2eddf; font-size: clamp(16px, 2vw, 22px); letter-spacing: 1px; }
.robots-game .scoreboard [data-stat="score"] { color: #58d8c1; }
.robots-game .scoreboard [data-stat="robots"] { color: #ff6070; }
.robots-game .scoreboard [data-stat="fires"] { color: #ffc46d; }
.robots-game .game-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 24px; padding-top: 24px; align-items: start; }
.robots-game .arena-panel { width: min(100%, max(400px, calc((100dvh - 400px) * 25 / 19))); justify-self: center; min-width: 0; border: 1px solid #2b4054; background: #0a1421; }
.robots-game .panel-label, .robots-game .arena-caption { display: flex; flex-wrap: wrap; justify-content: space-between; padding: 12px; color: #819caf; font-size: 11px; gap: 10px; }
.robots-game .signal { color: #58d8c1; }
.robots-game .arena { position: relative; border-top: 1px solid #2b4054; border-bottom: 1px solid #2b4054; touch-action: manipulation; }
.robots-game .arena > svg { display: block; width: 100%; height: auto; image-rendering: pixelated; }
.robots-game .arena:focus-visible { outline: 2px solid #58d8c1; outline-offset: 2px; }
.robots-game .robots-death-sarah { animation: robots-death-fade 1.4s steps(5, end) forwards; }
.robots-game .robots-death-flames { transform-box: fill-box; transform-origin: center bottom; animation: robots-death-burn .32s steps(2, end) infinite alternate; }
.robots-game .robots-death-embers { animation: robots-death-embers .8s steps(4, end) infinite; }
@keyframes robots-death-fade { to { opacity: .15; } }
@keyframes robots-death-burn { from { transform: scale(.85, .8); opacity: .8; } to { transform: scale(1.1, 1.2); opacity: 1; } }
@keyframes robots-death-embers { from { transform: translateY(4px); opacity: 1; } to { transform: translateY(-20px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .robots-game .robots-death-sarah, .robots-game .robots-death-flames, .robots-game .robots-death-embers { animation: none; }
}
.robots-game .legend { display: flex; justify-content: center; flex-wrap: wrap; gap: 22px; padding: 6px 10px 16px; font-size: 11px; color: #b0c3d0; }
.robots-game .legend span { display: flex; align-items: center; gap: 8px; }
.robots-game .legend svg { width: 24px; height: 24px; }
.robots-game .command-panel { display: grid; gap: 16px; }
.robots-game .robots-player .game-playerbox-manager { display: block; position: static; padding: 0; width: auto; }
.robots-game .robots-player .game-playerbox { position: static; width: 100%; min-width: 0; margin: 0; padding: 12px; background: #132530; border: 1px solid #36595e; border-radius: 0; box-shadow: none; }
.robots-game .robots-player .game-playerbox-head { padding: 0; }
.robots-game .robots-player .saito-user { padding: 0; gap: 10px; grid-template-columns: 36px minmax(0,1fr); min-width: 0; }
.robots-game .robots-player .saito-identicon { width: 36px; height: 36px; border-radius: 0; object-fit: contain; image-rendering: pixelated; }
.robots-game .robots-player .saito-address { color: #58d8c1; font: 11px RobotsPixel, monospace; }
.robots-game .robots-player .saito-userline { color: #91a9b9; font: 10px RobotsPixel, monospace; }
.robots-game .robots-player .game-playerbox-body { padding: 10px 0 0; }
.robots-game .pilot-stats { display: grid; gap: 4px; font-size: 11px; color: #91a9b9; }
.robots-game .robots-hud #game-hud2 { position: static; width: 100%; min-width: 0; max-width: none; transform: none; margin: 0; color: #ffc46d; background: transparent; border: 0; box-shadow: none; font: 12px/1.8 RobotsPixel, monospace; }
.robots-game .robots-hud .hud-status { padding: 8px 0; font: inherit; text-align: left; color: #ffc46d; background: transparent; box-shadow: none; }
.robots-game .controls h2, .robots-game .bonus-table h2 { color: #91a9b9; font-size: 12px; margin-bottom: 12px; }
.robots-game button { color: #e5ece9; font: 14px/1.6 RobotsPixel, monospace; background: #1b2c40; border: 1px solid #456079; border-bottom: 3px solid #456079; border-radius: 0; padding: 10px; cursor: pointer; touch-action: manipulation; min-height: 44px; margin: 0; height: auto; width: auto; text-transform: none; }
.robots-game button:hover { background: #2a465d; color: #fff; }
.robots-game button:active { transform: translateY(1px); border-bottom-width: 1px; }
.robots-game button:focus-visible { outline: 2px solid #58d8c1; outline-offset: 3px; }
.robots-game button:disabled { opacity: .35; cursor: default; }
.robots-game .direction-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.robots-game .direction-pad [data-dx="0"][data-dy="0"] { color: #58d8c1; border-color: #388c83; background: #143533; font-size: 12px; }
.robots-game .jump-controls { display: grid; gap: 7px; margin-top: 12px; }
.robots-game .jump-controls button { font-size: 11px; gap: 8px; flex-wrap: wrap; display: flex; justify-content: space-between; text-align: left; }
.robots-game .jump-controls span { color: #839db2; }
.robots-game .control-hint { font-size: 10px; color: #91a9b9; line-height: 2; margin-top: 10px; }
.robots-game .bonus-table { border-top: 1px solid #2b4054; padding-top: 16px; }
.robots-game .bonus-table > div { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 5px; }
.robots-game .bonus-table b { color: #ffc46d; }
.robots-game .bonus-table p { font-size: 10px; color: #91a9b9; margin-top: 10px; line-height: 2; }
.robots-game .utility-controls { display: flex; gap: 8px; }
.robots-game .utility-controls button { font-size: 11px; flex: 1; background: transparent; }
.robots-game .wave-result { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 20px; padding: 20px; background: #080e1bdf; text-align: center; }
.robots-game .wave-result p { color: #91a9b9; font-size: 10px; }
.robots-game .wave-result h2 { color: #ff4555; font-size: clamp(18px, 3vw, 32px); }
.robots-game .wave-result button { color: #58d8c1; padding: 14px 24px; }
.robots-game footer { padding-top: 28px; display: flex; justify-content: space-between; gap: 12px; color: #6c879d; font-size: 10px; }
.robots-rules { box-sizing: border-box; width: min(900px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 28px; background: #0a1421; border: 2px solid #456079; font-size: 12px; line-height: 2; }
.robots-rules h1 { font-size: 24px; color: #ff4555; }
.robots-rules h2 { margin-top: 20px; font-size: 14px; color: #58d8c1; }
.robots-rules p { overflow-wrap: anywhere; margin: 12px 0; }
.robots-rules a { color: #58d8c1; }
/* Overlay and native menu overrides belong to this game, including installed .saito apps. */
.robots-payment { box-sizing: border-box; width: min(600px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; padding: 28px; gap: 22px; color: #f2eddf; background: #0a1421; border: 2px solid #456079; border-radius: 0; box-shadow: 6px 6px 0 #03070d; font: 12px/1.9 RobotsPixel, monospace; }
.robots-payment * { box-sizing: border-box; }
.robots-payment h2 { margin: 0; color: #ff4555; font: 22px/1.5 RobotsPixel, monospace; text-shadow: 2px 2px #671f32; }
.robots-payment p { margin: 0; overflow-wrap: anywhere; font: inherit; color: #b0c3d0; }
.robots-payment label { display: flex; align-items: center; gap: 12px; color: #58d8c1; font: 11px/1.8 RobotsPixel, monospace; cursor: pointer; }
.robots-payment input.saito-checkbox[type='checkbox'] { flex: 0 0 22px; width: 22px; height: 22px; margin: 0; border: 2px solid #456079; border-radius: 0; background: #132530; }
.robots-payment input.saito-checkbox[type='checkbox']:checked { background: #58d8c1; border-color: #58d8c1; }
.robots-payment input.saito-checkbox[type='checkbox']:checked::after { content: ''; position: absolute; inset: 4px; width: auto; height: auto; background: #0a1421; }
.robots-payment .payment-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.robots-payment button { flex: 1 1 180px; min-height: 48px; padding: 12px; border: 1px solid #456079; border-bottom: 3px solid #456079; border-radius: 0; background: #1b2c40; color: #f2eddf; font: 12px/1.6 RobotsPixel, monospace; text-transform: none; cursor: pointer; }
.robots-payment [data-payment-confirm] { background: #143533; color: #58d8c1; border-color: #388c83; }
.robots-payment button:hover { background: #2a465d; color: #fff; }
.robots-payment button:focus-visible, .robots-payment input:focus-visible { outline: 2px solid #58d8c1; outline-offset: 3px; }
body:has(.robots-game) #saito-header.game { background: transparent; border: 0; box-shadow: none; }
body:has(.robots-game) .game-menu { --game-menu-background: transparent; --saito-foreground: #f2eddf; color: #f2eddf; font-family: RobotsPixel, monospace; font-size: 11px; }
body:has(.robots-game) .game-menu > ul,
body:has(.robots-game) .game-menu-mobile-toggle,
body:has(.robots-game) #saito-header.game .hamburger-container { background: transparent; border: 0; box-shadow: none; color: #f2eddf; }
body:has(.robots-game) .game-menu-sub-options,
body:has(.robots-game) .game-menu-sub-sub-options { background: #0a1421f2; border: 1px solid #456079; border-radius: 0; color: #f2eddf; }
.robots-game .leaderboard-status { border-top: 1px solid #2b4054; padding-top: 16px; }
.robots-game .leaderboard-status h2 { color: #58d8c1; font-size: 12px; margin-bottom: 12px; }
.robots-game .leaderboard-status > div { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; margin-bottom: 5px; }
.robots-game .leaderboard-status b { overflow-wrap: anywhere; min-width: 0; color: #ffc46d; }
.robots-game .leaderboard-status p { font-size: 9px; color: #91a9b9; margin: 10px 0; }
.robots-game .leaderboard-status button { width: 100%; font-size: 10px; }
@media (max-width: 760px) {
  .robots-game { padding: 62px 12px 20px; }
  .robots-game .subtitle { font-size: 10px; letter-spacing: 1px; }
  .robots-game .scoreboard { grid-template-columns: 1fr; padding: 12px; gap: 14px; }
  .robots-game .scoreboard-stats { gap: 8px; }
  .robots-game .scoreboard span { font-size: 8px; }
  .robots-game .scoreboard strong { font-size: clamp(11px, 3vw, 18px); letter-spacing: 0; }
  .robots-game .game-layout { grid-template-columns: 1fr; gap: 16px; padding-top: 16px; }
  .robots-game .command-panel { grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  .robots-game .robots-player { grid-column: 1; grid-row: 1; }
  .robots-game .robots-hud { grid-column: 1; grid-row: 2; }
  .robots-game .controls { grid-column: 2; grid-row: 1 / 5; }
  .robots-game .bonus-table, .robots-game .utility-controls, .robots-game .leaderboard-status { grid-column: 1; }
  .robots-game .arena-caption { font-size: 9px; padding: 8px; flex-wrap: wrap; }
  .robots-game .panel-label { font-size: 8px; }
  .robots-game .legend { font-size: 9px; gap: 8px; padding-bottom: 8px; }
  .robots-game .direction-pad button { padding: 8px 2px; font-size: 11px; }
  .robots-game .jump-controls button { font-size: 10px; padding: 8px 5px; }
  .robots-game .control-hint { font-size: 9px; }
  .robots-game .utility-controls { flex-direction: column; }
  .robots-game footer { flex-direction: column; }
  .robots-game .robots-player .saito-user { grid-template-columns: 28px minmax(0, 1fr); gap: 6px; }
  .robots-game .robots-player .saito-address { font-size: 10px; }
  .robots-game .robots-player .saito-userline { font-size: 8px; }
  .robots-game .robots-player .saito-identicon { width: 28px; height: 28px; }
  .robots-rules { padding: 18px; font-size: 10px; }
  .robots-payment { padding: 20px; font-size: 10px; gap: 18px; }
  .robots-payment h2 { font-size: 18px; }
}
`;
