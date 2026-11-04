/**
 * Starter examples grounded in Twilight NFT api/context.
 * Selection never writes into the editor — copy only.
 */

module.exports = [
  {
    id: 'basic-event',
    label: 'Basic card event',
    summary: 'Resolve the evented card and end the turn.',
    code: `api.addToQueue("resolve\\t" + "your-card-id");
await api.endTurn();
return 0;`
  },
  {
    id: 'place-influence',
    label: 'Place influence',
    summary: 'Place influence locally and sync via native place.',
    code: `// Applies immediately for the acting player; peers process place from the turn.
api.addToQueue("place\\tus\\tus\\tegypt\\t2");
api.addToQueue("resolve\\t" + "your-card-id");
await api.endTurn();
return 0;`
  },
  {
    id: 'menu-choice',
    label: 'Player menu choice',
    summary: 'Await a GameHUD option, then enqueue the chosen branch.',
    code: `const choice = await api.playerSelectOption([
  { id: "india", label: "India" },
  { id: "pakistan", label: "Pakistan" }
]);
api.addToQueue("place\\tus\\tus\\t" + choice + "\\t2");
api.addToQueue("resolve\\t" + "your-card-id");
await api.endTurn();
return 0;`
  },
  {
    id: 'conditional-event',
    label: 'Conditional event',
    summary: 'Branch on control and active events before queueing moves.',
    code: `if (api.isEventActive("reformer") && api.isControlled("us", "canada") == 1) {
  api.addToQueue("NOTIFY\\tReformer path");
} else {
  api.addToQueue("place\\tus\\tus\\tcanada\\t2");
}
api.addToQueue("resolve\\t" + "your-card-id");
await api.endTurn();
return 0;`
  }
];
