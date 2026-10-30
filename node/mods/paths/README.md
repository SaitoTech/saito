INTRODUCTION

This is an implement of PATHS OF GLORY written for the open source Saito Game Engine.

This code is released under an open source license for use with teh open source Saito Game Engine. If you are a player or developer who enjoys playing around with this implementation, please respect the goodwill shown by GMT Games and purchase a copy of the game. Likewise, if you make this demo available for play on a public server, please make sure that any players you support can fulfill these conditions by making it easy for them to purchase commercial copies of the game.

GMT GAMES:
https://www.amazon.com/Paths-of-Glory-5th-Printing/dp/B00UKJIEBI

AMAZON:
https://www.amazon.com/Paths-of-Glory-5th-Printing/dp/B00UKJIEBI


NATIVE PLAYER RUNNER

Paths of Glory is available to the Node.js runner as `PathsOfGlory`, using the
original campaign and separate wallets for the Central Powers and Allies. See
[the runner guide](../../apps/runner/README.md) and
[example configuration](../../apps/runner/paths.example.json). Runner-specific
code lives in `apps/runner/games/pathsofglory.js`; game rules remain in this module.

Victory-point wins, the existing supply-source victory, campaign turn 20 and
armistice now enter the standard GameTemplate terminal protocol. Campaign victory
uses the standard thresholds in GMT rules 5.5.2 (including Treaty of Brest-Litovsk),
not tournament bidding or optional historical endgame modifiers. Peace offers
continue to use the existing draw protocol. The turn-end mandated-offensive check
also correctly treats an empty mandate as fulfilled instead of assigning an
undefined variable. Salonika no longer offers corps already in Salonika for
redeployment back to the same space. Army of Islam reinforcements use the existing
unit definition and its declared army type. Siege cancellation uses snapshot undo,
which rebinds supply callbacks before restoring controls. Brusilov and Kerensky
combat bonuses do not replay their operations-granting card events.
Moving out of an intact fort preserves its owner instead of restoring the
scenario's initial neutral status. This keeps siege rolls and deck shuffles
synchronized when countries such as Belgium have already joined a side.
Reinforcement batches preserve stack order across seats, keeping later unit
indices consistent. Passing Landwehr's optional repairs no longer references an
undefined variable.

`paths.js` is assembled from `src/paths-init.js`, `src/units/*`, then the setup,
cards, combat, display, events, spaces, state, gameloop, player, units and end
fragments. Edit the fragments first. The existing `compile` script also removes
the shared browser bundle and launches a full build; a runner-only validation
does not need those side effects.
