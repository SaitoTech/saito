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
        <p>Only the acting player's client runs the script. Queue writes go through <code>api.addToQueue()</code> only. Call <code>await api.endTurn()</code> to submit.</p>
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
        <p>Place influence (applies locally for the acting player, then enqueues native <code>place</code>):</p>
        <p><code>api.addToQueue("place\\tus\\tus\\tegypt\\t2")</code></p>
        <p>Format: <code>place\\t{origin}\\t{faction}\\t{country}\\t{amount}</code>. Origin is forced to the acting faction so peers apply once and the originator does not double-apply.</p>
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
        <p>Call this after queueing the moves that implement your card event.</p>
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
