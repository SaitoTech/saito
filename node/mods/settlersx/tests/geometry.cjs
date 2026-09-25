'use strict';

// These assertions protect the bridge between the unchanged game rules and 3D
// hit targets. A mirrored or differently indexed board would place legal moves
// at the wrong junction despite looking correct.
const assert = require('node:assert/strict');
const Geometry = require('../web/js/geometry');
const GameHexGrid = require('../../../lib/saito/ui/game-hexgrid/game-hexgrid');
const original = new GameHexGrid();
let checks = 0;

assert.deepEqual(Geometry.hexes, original.hexes);
assert.equal(Geometry.vertexIds.length, 54);
assert.equal(Geometry.edgeIds.length, 72);
for (const id of Geometry.hexes) {
  const [row, col] = id.split('_').map(Number);
  for (let component = 1; component <= 6; component++) {
    for (const method of ['verifyVertex', 'verifyEdge']) {
      assert.equal(Geometry[method](component, row, col), original[method](component, row, col));
      checks++;
    }
    const raw = Geometry.vertex(`${component}_${id}`);
    const canonical = Geometry.vertex(Geometry.verifyVertex(component, row, col));
    assert.ok(Math.hypot(raw.x - canonical.x, raw.z - canonical.z) < 1e-10);
  }
}
for (const id of Geometry.vertexIds) {
  for (const method of ['hexesFromVertex', 'edgesFromVertex', 'adjacentVertices']) {
    assert.deepEqual(Geometry[method](id).sort(), original[method](id).sort());
    checks++;
  }
  assert.deepEqual(Geometry.vertex(`city_${id}`), Geometry.vertex(id));
}
for (const id of Geometry.edgeIds) {
  assert.deepEqual(Geometry.verticesFromEdge(id), original.verticesFromEdge(id));
  assert.deepEqual(Geometry.edge(`road_${id}`), Geometry.edge(id));
  const edge = Geometry.edge(id);
  assert.ok(Math.abs(Math.hypot(edge.a.x-edge.b.x, edge.a.z-edge.b.z)-1) < 1e-10);
  checks++;
}
for (const id of Geometry.hexes) {
  assert.deepEqual(Geometry.center(`sector_value_${id}`), Geometry.center(id));
  assert.deepEqual(Geometry.center(`hex_bg_${id}`), Geometry.center(id));
}
console.log(`Settlers X geometry: ${checks} topology parity checks passed (19 hexes, 54 vertices, 72 edges).`);
