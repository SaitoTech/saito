/**
 * Local documentation stub until remote docs hosting is available.
 * DocsClient can swap this for a fetched remote index without UI changes.
 */

module.exports = {
  baseUrl: null,
  entries: [
    {
      id: 'overview',
      title: 'Programmable cards',
      summary: 'How Twilight Struggle NFT card code runs in a game.',
      externalUrl: null,
      body: `
        <p>Card code is stored as text in the NFT and executed when the card is evented in Twilight Struggle.</p>
        <p>Scripts receive two injected objects:</p>
        <ul>
          <li><code>api</code> — callable game methods</li>
          <li><code>context</code> — read-only game snapshot and permitted commands</li>
        </ul>
        <p>The script runs on every client. Wrap choices and board actions in <code>api.asEventingPlayer</code> so only the player who evented the card performs them. That helper returns <code>0</code> on the other clients, which pauses their queue until the eventing client's moves arrive.</p>
        <p>Call <code>await api.endTurn()</code> inside that callback to submit. The first <code>endTurn</code> after a player action also resolves the event.</p>
        <p>Scripts cannot access <code>game.queue</code>, <code>app</code>, wallets, or payment commands.</p>
      `
    },
    {
      id: 'api-addToQueue',
      title: 'api.addToQueue',
      summary: 'Validate and enqueue a permitted tab-delimited game instruction.',
      externalUrl: null,
      body: `
        <p><code>api.addToQueue(instructionString)</code></p>
        <p>Host-side validation against <code>context.commands</code> / the NFT queue policy. Unknown or blocked commands throw.</p>
        <p>Use <code>api.playerPlaceInfluence</code>, <code>api.playerRemoveInfluence</code>, and <code>api.playerRealign</code> for those board actions. They update the eventing client and queue the matching instruction for everyone else.</p>
        <p><code>api.addToQueue("place\\t...")</code> does not place influence on the client that queues it. The <code>place</code> instruction is skipped by the origin faction when the queue runs.</p>
        <p>Also permitted (engine baseline + Twilight): <code>NOTIFY</code>, <code>RESOLVE</code>, <code>ACKNOWLEDGE</code>, <code>resolve</code>.</p>
      `
    },
    {
      id: 'api-endTurn',
      title: 'api.endTurn',
      summary: 'Submit the queued moves and end the current turn.',
      externalUrl: null,
      body: `
        <p><code>await api.endTurn()</code></p>
        <p>Call this inside <code>api.asEventingPlayer</code> after the player actions that implement your card event.</p>
        <p>The first <code>endTurn</code> after <code>playerPlaceInfluence</code>, <code>playerRemoveInfluence</code>, or <code>playerRealign</code> prepends <code>resolve</code> for the event and orders realignment moves so peers replay them in roll order.</p>
      `
    },
    {
      id: 'api-asEventingPlayer',
      title: 'api.asEventingPlayer',
      summary: 'Run board actions on the client that evented the card.',
      externalUrl: null,
      body: `
        <p><code>return await api.asEventingPlayer(async () =&gt; {</code></p>
        <p><code>const country = await api.playerSelectCountry(["egypt", "libya"]);</code></p>
        <p><code>await api.playerPlaceInfluence(country, 1);</code></p>
        <p><code>await api.playerRemoveInfluence("israel", 1, "ussr");</code></p>
        <p><code>await api.playerRealign("egypt");</code></p>
        <p><code>await api.endTurn();</code></p>
        <p><code>})</code></p>
        <p>The callback runs only when this seat is the eventing faction. Other clients get <code>0</code> and their event waits.</p>
        <p>On a live game, a callback that returns nothing also yields <code>0</code>, so the event stays queued until <code>api.endTurn()</code> sends <code>resolve</code>. A card-studio test continues instead, so the preview can restore the board.</p>
      `
    },
    {
      id: 'api-playerPlaceInfluence',
      title: 'api.playerPlaceInfluence',
      summary: 'Place influence and sync it to the other clients.',
      externalUrl: null,
      body: `
        <p><code>await api.playerPlaceInfluence(country, amount, faction?)</code></p>
        <p><code>amount</code> is how much influence to add. <code>faction</code> is whose influence increases and defaults to the eventing player.</p>
        <p>Add 2 influence in Egypt for the eventing player:</p>
        <pre><code>return await api.asEventingPlayer(async () =&gt; {
  await api.playerPlaceInfluence("egypt", 2);
  await api.endTurn();
});</code></pre>
        <p>Add 3 Soviet influence in France:</p>
        <pre><code>await api.playerPlaceInfluence("france", 3, "ussr");</code></pre>
        <p>Returns <code>{ country, faction, amount }</code>.</p>
      `
    },
    {
      id: 'api-playerRemoveInfluence',
      title: 'api.playerRemoveInfluence',
      summary: 'Remove influence and sync it to the other clients.',
      externalUrl: null,
      body: `
        <p><code>await api.playerRemoveInfluence(country, amount, faction?)</code></p>
        <p><code>amount</code> is how much influence to remove. <code>faction</code> is whose influence is removed and defaults to the eventing player. Removal stops at zero. <code>removed</code> in the result is the amount actually taken.</p>
        <p>Remove 2 influence in Egypt from the eventing player:</p>
        <pre><code>return await api.asEventingPlayer(async () =&gt; {
  await api.playerRemoveInfluence("egypt", 2);
  await api.endTurn();
});</code></pre>
        <p>Remove 4 American influence from West Germany:</p>
        <pre><code>await api.playerRemoveInfluence("westgermany", 4, "us");</code></pre>
        <p>Returns <code>{ country, faction, amount, removed }</code>.</p>
      `
    },
    {
      id: 'api-playerRealign',
      title: 'api.playerRealign',
      summary: 'Roll a realignment and sync it to the other clients.',
      externalUrl: null,
      body: `
        <p><code>await api.playerRealign(country)</code></p>
        <p>Each call is one roll. The eventing client rolls and applies the result. Peers replay that roll from the queued <code>realign</code> instruction. Call <code>endTurn</code> once after the loop so the rolls stay in order.</p>
        <p>Realign Italy 3 times:</p>
        <pre><code>return await api.asEventingPlayer(async () =&gt; {
  for (let n = 0; n &lt; 3; n++) {
    await api.playerRealign("italy");
  }
  await api.endTurn();
});</code></pre>
        <p><code>usRoll</code> and <code>ussrRoll</code> are the raw dice. Bonuses are separate. <code>winner</code> is <code>"us"</code>, <code>"ussr"</code>, or <code>"draw"</code>.</p>
        <p>Returns <code>{ country, usRoll, ussrRoll, usBonus, ussrBonus, winner, removed, removedFaction }</code>.</p>
      `
    },
    {
      id: 'api-playerSelectOption',
      title: 'api.playerSelectOption',
      summary: 'Await a GameHUD menu choice without modifying the queue.',
      externalUrl: null,
      body: `
        <p><code>const id = await api.playerSelectOption(options)</code></p>
        <p>Does not enqueue moves or change game state.</p>
      `
    },
    {
      id: 'api-playerSelectCountry',
      title: 'api.playerSelectCountry',
      summary: 'Await a country selection via GameHUD (and board highlights).',
      externalUrl: null,
      body: `
        <p><code>const country = await api.playerSelectCountry(["india", "pakistan"])</code></p>
      `
    },
    {
      id: 'api-returnActivePlayer',
      title: 'api.returnActivePlayer',
      summary: 'Faction that triggered the current event: "us" or "ussr".',
      externalUrl: null,
      body: `
        <p><code>api.returnActivePlayer()</code> — <code>"us"</code> or <code>"ussr"</code>.</p>
        <p>Use this when a card needs to know <strong>who played / evented</strong> the card (for example Junta placing influence for that faction).</p>
        <p>Prefer this over <code>context.game.player</code> seat checks when the question is “who triggered the event?”, not “which seat is this client?”.</p>
      `
    },
    {
      id: 'api-isControlled',
      title: 'api.isControlled',
      summary: 'Whether a faction controls a country.',
      externalUrl: null,
      body: `
        <p><code>api.isControlled(faction, country)</code> — returns <code>1</code> or <code>0</code>.</p>
      `
    },
    {
      id: 'api-whoControls',
      title: 'api.whoControls',
      summary: 'Which faction controls a country.',
      externalUrl: null,
      body: `
        <p><code>api.whoControls(country)</code> — <code>"us"</code>, <code>"ussr"</code>, or <code>""</code>.</p>
      `
    },
    {
      id: 'api-isEventActive',
      title: 'api.isEventActive',
      summary: 'Whether an ongoing event flag is active.',
      externalUrl: null,
      body: `
        <p><code>api.isEventActive(event)</code> when <code>game.state.events[event] == 1</code>.</p>
      `
    },
    {
      id: 'context-game',
      title: 'context.game',
      summary: 'Read-only JSON snapshot of the current game.',
      externalUrl: null,
      body: `
        <p><code>context.game</code> is a deep JSON clone. Mutating it does not change the live game.</p>
      `
    },
    {
      id: 'context-commands',
      title: 'context.commands',
      summary: 'Permitted command names for api.addToQueue.',
      externalUrl: null,
      body: `
        <p>Lists instruction names allowed by the NFT queue policy. Payment and wallet commands are never included.</p>
      `
    }
  ]
};
