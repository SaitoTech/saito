/* The established Settlers hex topology, expressed in world coordinates. */
(function (root, factory) {
  const geometry = factory();
  if (typeof module === 'object' && module.exports) module.exports = geometry;
  else root.SettlersXGeometry = geometry;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const hexes = ['1_1','1_2','1_3','2_1','2_2','2_3','2_4','3_1','3_2','3_3','3_4','3_5','4_2','4_3','4_4','4_5','5_3','5_4','5_5'];
  const exists = (r,c) => hexes.includes(`${r}_${c}`);
  const clean = id => String(id).replace(/^(?:city|road|hex_bg|sector_value|hex)_/, '');
  function center(id) {
    const [r,c] = clean(id).split('_').map(Number);
    return { x: Math.sqrt(3)*(c-r/2-1.5), y: 0.24, z: 1.5*(r-3) };
  }
  function vertex(id) {
    const [v,r,c] = clean(id).split('_').map(Number), p = center(`${r}_${c}`), a = (v-1)*Math.PI/3;
    return { x: p.x + Math.sin(a), y: 0.26, z: p.z - Math.cos(a) };
  }
  function edge(id) {
    const [e,r,c] = clean(id).split('_').map(Number);
    const a = vertex(`${e}_${r}_${c}`), b = vertex(`${e%6+1}_${r}_${c}`);
    return { x:(a.x+b.x)/2, y:0.27, z:(a.z+b.z)/2, a,b };
  }
  function verifyEdge(e,r,c) {
    if (e===2 && exists(r,c+1)) return `5_${r}_${c+1}`;
    if (e===3 && exists(r+1,c+1)) return `6_${r+1}_${c+1}`;
    if (e===4 && exists(r+1,c)) return `1_${r+1}_${c}`;
    return exists(r,c) ? `${e}_${r}_${c}` : false;
  }
  function verifyVertex(v,r,c) {
    if (v>6) v-=6;
    if (v===2 && exists(r,c+1)) return `6_${r}_${c+1}`;
    if (v===4) {
      if (exists(r+1,c+1)) return `6_${r+1}_${c+1}`;
      if (exists(r+1,c)) return `2_${r+1}_${c}`;
    }
    if (v===5 && exists(r+1,c)) return `1_${r+1}_${c}`;
    if (v===3) {
      if (exists(r+1,c+1)) return `1_${r+1}_${c+1}`;
      if (exists(r,c+1)) return `5_${r}_${c+1}`;
    }
    return `${v}_${r}_${c}`;
  }
  function verticesFromEdge(id) {
    const [e,r,c] = clean(id).split('_').map(Number);
    return [verifyVertex(e,r,c), verifyVertex(e+1,r,c)];
  }
  const vertexIds = [...new Set(hexes.flatMap(h => { const [r,c]=h.split('_').map(Number); return [1,2,3,4,5,6].map(v=>verifyVertex(v,r,c)); }))];
  const edgeIds = [...new Set(hexes.flatMap(h => { const [r,c]=h.split('_').map(Number); return [1,2,3,4,5,6].map(e=>verifyEdge(e,r,c)); }))];
  function edgesFromVertex(id) { const canonical=clean(id); return edgeIds.filter(e=>verticesFromEdge(e).includes(canonical)); }
  function adjacentVertices(id) { return [...new Set(edgesFromVertex(id).flatMap(verticesFromEdge))].filter(v=>v!==clean(id)); }
  function hexesFromVertex(id) { const p=vertex(id); return hexes.filter(h=> { const [r,c]=h.split('_').map(Number); return [1,2,3,4,5,6].some(v=> { const q=vertex(`${v}_${r}_${c}`); return Math.hypot(p.x-q.x,p.z-q.z)<1e-6; }); }); }
  return {hexes,center,vertex,edge,exists,verifyEdge,verifyVertex,verticesFromEdge,edgesFromVertex,adjacentVertices,hexesFromVertex,vertexIds,edgeIds};
});
