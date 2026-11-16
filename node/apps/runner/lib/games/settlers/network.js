// Read-only graph analysis. Never invoke checkLongestRoad(), which updates awards
// and enqueues game commands. Unknown results stay unknown when search is capped.
function longestRoad(m, player, extraEdge) {
  const edges = m.game.state.roads.filter(r => r.player === player).map(r => r.slot.slice(5));
  if (extraEdge && !edges.includes(extraEdge)) edges.push(extraEdge);
  const adjacency = new Map(), owners = new Map(m.game.state.cities.map(c => [c.slot.slice(5), c.player]));
  edges.forEach((edge, index) => {
    const [a, b] = m.hexgrid.verticesFromEdge(edge);
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push({ to, index });
    }
  });
  let length = 0, visits = 0, capped = false;
  const used = new Set();
  function visit(vertex, depth) {
    if (++visits > 30000) { capped = true; return; }
    length = Math.max(length, depth);
    if (depth && owners.has(vertex) && owners.get(vertex) !== player) return;
    for (const { to, index } of adjacency.get(vertex) || []) {
      if (capped) break;
      if (!used.has(index)) { used.add(index); visit(to, depth + 1); used.delete(index); }
    }
  }
  for (const vertex of adjacency.keys()) { if (capped) break; visit(vertex, 0); }
  return { length, exact: !capped };
}
function expansion(m, extraEdge) {
  const p = m.game.player, h = m.hexgrid, s = m.game.state;
  const owners = new Map(s.cities.map(c => [c.slot.slice(5), c.player]));
  const edges = new Map(s.roads.map(r => [r.slot.slice(5), r.player]));
  if (extraEdge) edges.set(extraEdge, p);
  const sources = new Set(s.cities.filter(c => c.player === p).map(c => c.slot.slice(5)));
  for (const [edge, owner] of edges) if (owner === p)
    for (const vertex of h.verticesFromEdge(edge)) if (!owners.has(vertex) || owners.get(vertex) === p) sources.add(vertex);
  const distances = new Map([...sources].map(v => [v, 0])), routes = new Map([...sources].map(v => [v, []]));
  const done = new Set();
  for (;;) {
    const next = [...distances].filter(([v]) => !done.has(v)).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (!next) break;
    const [vertex, distance] = next; done.add(vertex);
    if (owners.has(vertex) && owners.get(vertex) !== p) continue;
    for (const edge of h.edgesFromVertex(vertex)) {
      if (!edge || (edges.has(edge) && edges.get(edge) !== p)) continue;
      const to = h.verticesFromEdge(edge).find(v => v !== vertex);
      const cost = edges.get(edge) === p ? 0 : 1, nextDistance = distance + cost;
      if (!to || nextDistance > 3 || nextDistance >= (distances.get(to) ?? Infinity)) continue;
      distances.set(to, nextDistance);
      routes.set(to, cost ? [...routes.get(vertex), edge] : routes.get(vertex));
    }
  }
  return [...distances].filter(([v]) => !owners.has(v) && !h.adjacentVertices(v).some(n => owners.has(n)))
    .map(([vertex, roadsNeeded]) => ({ vertex, roadsNeeded, route: routes.get(vertex) }));
}
module.exports = { longestRoad, expansion };
