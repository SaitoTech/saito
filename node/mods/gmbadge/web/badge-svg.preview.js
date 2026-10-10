// generated from lib/badge-svg.js for web/preview.html
(function(){ 'use strict';

//
// Pure SVG renderer for the gm badge.
//
// Shape and finish follow the classic green verification seal: an 8-lobe
// badge, teal-to-green gradient, dark check. Security microdetail is baked
// into the art the way the Twetch badge did it:
//   - micro matrix: a flower-of-life pattern over the body
//   - micro text: a ring of tiny repeating text, and a diagonal field under the check
//   - micro-printed serial: "gm-<serial>-<issuer8>-<sig8>" along the bottom lobe
// These are drawn only at size >= 48 (they are invisible inline anyway).
//
// Progression from plain to 3D:
//   tier 1 sprout    flat pale seal, sprout glyph
//   tier 2 green     flat gradient seal + dark check (the classic look)
//   tier 3 gold      metallic gold outer seal, shaded body, drop shadow
//   tier 4 diamond   glass body, specular highlight, facet lines, glow
//   tier 5 flame     embossed ember body, flame behind the check, glow
//   cracked          desaturated seal, crack line, faded check
//   none / dormant   flat grey dashed outline
//   counterfeit      red-barred seal with COUNTERFEIT band (issuer key mismatch)
//

const CHECK = 'M30 52 L44 66 L72 36';
const SPROUT =
  'M50 72 V50 M50 58 C50 46 40 42 32 44 C34 54 42 58 50 58 Z M50 52 C50 40 60 36 68 38 C66 48 58 52 50 52 Z';
const FLAME =
  'M50 14 C59 28 72 36 70 56 C69 70 60 79 50 81 C40 79 31 70 30 56 C29 44 37 40 40 30 C44 39 48 41 50 32 C52 39 57 41 59 34 C62 43 61 48 57 54 C64 46 56 28 50 14 Z';

const INK = '#0b1324';

//
// Isometric Saito-style cube: hexagon outline plus the three inner edges.
//
function CUBE(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const hex = `M${f(pts[0])} L${f(pts[1])} L${f(pts[2])} L${f(pts[3])} L${f(pts[4])} L${f(pts[5])} Z`;
  const inner = `M${f(pts[1])} L${cx.toFixed(2)} ${cy.toFixed(2)} L${f(pts[5])} M${cx.toFixed(2)} ${cy.toFixed(2)} L${f(pts[3])}`;
  return `${hex} ${inner}`;
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

//
// 8-lobe seal centred at 50,50. Lobes are cubic bulges between points on
// an inner circle, which gives the soft rounded-flower silhouette.
//
function lobedPath(n = 8, inner = 37, bulge = 51) {
  let d = '';
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = i * step - Math.PI / 2;
    const a2 = a0 + step;
    const c1 = a0 + step * 0.22;
    const c2 = a2 - step * 0.22;
    const x0 = 50 + inner * Math.cos(a0);
    const y0 = 50 + inner * Math.sin(a0);
    const x1 = 50 + bulge * Math.cos(c1);
    const y1 = 50 + bulge * Math.sin(c1);
    const x2 = 50 + bulge * Math.cos(c2);
    const y2 = 50 + bulge * Math.sin(c2);
    const x3 = 50 + inner * Math.cos(a2);
    const y3 = 50 + inner * Math.sin(a2);
    if (i === 0) {
      d += `M${x0.toFixed(2)} ${y0.toFixed(2)} `;
    }
    d += `C${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)} ${x3.toFixed(2)} ${y3.toFixed(2)} `;
  }
  return d + 'Z';
}

const SEAL = lobedPath();
const INNER = `translate(50 50) scale(0.84) translate(-50 -50)`;

let uid = 0;

function checkGlyph(color, width = 9.5, opacity = 1, extra = '') {
  return `<path d="${CHECK}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${extra}/>`;
}

//
// Security microdetail. Clipped to the seal.
//
function microDetail(id, opts, ink) {
  const serial = opts.serial != null ? String(opts.serial) : '0';
  const issuer = String(opts.issuer || '').slice(0, 8) || 'unissued';
  const sig = String(opts.sig || '').slice(0, 8) || 'pending';
  const ring = `GM BADGE · SAITO · #${serial} · ${issuer} · `;
  const field = 'GM FAM SAITO GM FAM SAITO GM FAM SAITO GM FAM SAITO ';
  let lines = '';
  for (let i = 0; i < 9; i++) {
    lines += `<text x="-20" y="${8 + i * 7}" font-size="2.6" font-weight="700" letter-spacing="0.3">${field}${field}</text>`;
  }
  return (
    `<g clip-path="url(#${id}k)" fill="${ink}" font-family="ui-monospace, Menlo, Consolas, monospace">` +
    `<path d="M50 50 m0 -31 a31 31 0 1 1 -0.01 0" fill="url(#${id}p)" stroke="none"/>` +
    `<path d="${CUBE(50, 50, 27)}" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round" opacity="0.13"/>` +
    `<g opacity="0.16" transform="rotate(-32 50 50)">${lines}</g>` +
    `<text font-size="3.1" letter-spacing="0.5" opacity="0.42"><textPath href="#${id}c">${esc(ring + ring + ring)}</textPath></text>` +
    `<text x="50" y="89.5" text-anchor="middle" font-size="2.7" opacity="0.72" letter-spacing="0.2">${esc(`gm-${serial}-${issuer}-${sig}`)}</text>` +
    `</g>`
  );
}

function microDefs(id) {
  return (
    `<clipPath id="${id}k"><path d="${SEAL}"/></clipPath>` +
    `<path id="${id}c" d="M50 50 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0"/>` +
    `<pattern id="${id}p" width="10" height="11.55" patternUnits="userSpaceOnUse">` +
    `<g fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.34" stroke-linejoin="round">` +
    `<path d="${CUBE(5, 5.77, 3.6)}"/><path d="${CUBE(0, 0, 3.6)}"/><path d="${CUBE(10, 0, 3.6)}"/><path d="${CUBE(0, 11.55, 3.6)}"/><path d="${CUBE(10, 11.55, 3.6)}"/>` +
    `</g></pattern>`
  );
}

//
// opts: { tier, streak, serial, issuer, sig, cracked, dormant, counterfeit, size, label, title }
//
function render(opts = {}) {
  const tierId =
    typeof opts.tier === 'object' && opts.tier ? Number(opts.tier.id) : Number(opts.tier || 0);
  const streak = Number(opts.streak || 0);
  const serial = opts.serial != null ? Number(opts.serial) : null;
  const cracked = !!opts.cracked;
  const dormant = !!opts.dormant;
  const counterfeit = !!opts.counterfeit;
  const size = Number(opts.size || 64);
  const showLabel = opts.label !== false && size >= 40 && streak > 0;
  const micro = opts.micro !== false && size >= 48;
  const id = `gm${++uid}`;

  const effective = dormant ? 0 : tierId;
  const title =
    opts.title ||
    (counterfeit
      ? 'COUNTERFEIT gm badge: issuer key does not match'
      : cracked
        ? `gm streak broken${serial != null ? ` · badge #${serial}` : ''}`
        : streak > 0
          ? `gm streak: ${streak} day${streak === 1 ? '' : 's'}${serial != null ? ` · badge #${serial}` : ''}`
          : serial != null
            ? `gm badge #${serial}`
            : 'gm badge');

  const shadowFilter = `<filter id="${id}s" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2.4" stdDeviation="2.2" flood-color="#000" flood-opacity="0.45"/></filter>`;
  const bevelFilter = `<filter id="${id}b" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="blur"/><feSpecularLighting in="blur" surfaceScale="5" specularConstant="0.85" specularExponent="16" lighting-color="#ffffff" result="spec"><fePointLight x="28" y="18" z="70"/></feSpecularLighting><feComposite in="spec" in2="SourceAlpha" operator="in" result="spec2"/><feComposite in="SourceGraphic" in2="spec2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/><feDropShadow dx="0" dy="2.6" stdDeviation="2.4" flood-color="#000" flood-opacity="0.5"/></filter>`;
  const glowFilter = (color, blur) =>
    `<filter id="${id}g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="blur"/><feFlood flood-color="${color}" flood-opacity="0.85"/><feComposite in2="blur" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const glyphShadowFilter = `<filter id="${id}t" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.1" flood-color="#000" flood-opacity="0.4"/></filter>`;
  const glyphShadow = ` filter="url(#${id}t)"`;
  const greenGradient = `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14b8a6"/><stop offset="0.55" stop-color="#34d399"/><stop offset="1" stop-color="#86efac"/></linearGradient>`;

  let defs = '';
  let body = '';
  let glyph = '';
  let detail = '';
  let ink = INK;

  if (counterfeit) {
    defs = `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b5563"/><stop offset="1" stop-color="#1f2937"/></linearGradient>${shadowFilter}${microDefs(id)}`;
    body =
      `<path d="${SEAL}" fill="url(#${id}r)" filter="url(#${id}s)"/>` +
      `<path d="${SEAL}" fill="none" stroke="#ef4444" stroke-width="2.5"/>`;
    glyph =
      checkGlyph('#9ca3af', 9, 0.25) +
      `<path d="M28 28 L72 72 M72 28 L28 72" fill="none" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/>` +
      `<g clip-path="url(#${id}k)"><rect x="-10" y="60" width="120" height="12" fill="#ef4444" transform="rotate(-18 50 66)"/><text x="50" y="68.5" text-anchor="middle" font-size="7.5" font-weight="800" fill="#ffffff" font-family="system-ui, sans-serif" letter-spacing="1" transform="rotate(-18 50 66)">COUNTERFEIT</text></g>`;
  } else if (cracked) {
    defs = `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b7280"/><stop offset="1" stop-color="#1f2937"/></linearGradient>${shadowFilter}${microDefs(id)}`;
    body =
      `<path d="${SEAL}" fill="url(#${id}r)" filter="url(#${id}s)"/>` +
      `<path d="${SEAL}" fill="none" stroke="#4b5563" stroke-width="2"/>`;
    ink = '#e5e7eb';
    detail = micro ? microDetail(id, opts, ink) : '';
    glyph =
      checkGlyph('#e5e7eb', 9, 0.3) +
      `<path d="M46 8 L54 34 L42 47 L57 61 L47 92" fill="none" stroke="#0b0f14" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M46 8 L54 34 L42 47 L57 61 L47 92" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`;
  } else if (effective === 0) {
    body =
      `<path d="${SEAL}" fill="#2b3139"/>` +
      `<path d="${SEAL}" fill="none" stroke="#6b7280" stroke-width="3.5" stroke-dasharray="5 4"/>`;
    glyph = `<circle cx="50" cy="50" r="9" fill="#9aa3ad" opacity="0.45"/>`;
  } else if (effective === 1) {
    //
    // sprout: plain, flat, pale
    //
    defs = `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a7f3d0"/><stop offset="1" stop-color="#d9f99d"/></linearGradient>${microDefs(id)}`;
    body = `<path d="${SEAL}" fill="url(#${id}r)"/>`;
    ink = '#065f46';
    detail = micro ? microDetail(id, opts, ink) : '';
    glyph = `<path d="${SPROUT}" fill="${ink}" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" fill-opacity="0.95"/>`;
  } else if (effective === 2) {
    //
    // green check: plain, flat gradient, dark check. the classic.
    //
    defs = greenGradient + microDefs(id);
    body = `<path d="${SEAL}" fill="url(#${id}r)"/>`;
    detail = micro ? microDetail(id, opts, ink) : '';
    glyph = checkGlyph(ink, 9.5);
  } else if (effective === 3) {
    //
    // gold ring: first step into 3D
    //
    defs =
      greenGradient +
      `<linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="0.35" stop-color="#f5b700"/><stop offset="0.6" stop-color="#b8860b"/><stop offset="0.8" stop-color="#ffd84d"/><stop offset="1" stop-color="#8a6508"/></linearGradient>` +
      shadowFilter +
      glyphShadowFilter +
      microDefs(id);
    body =
      `<path d="${SEAL}" fill="url(#${id}m)" filter="url(#${id}s)"/>` +
      `<path d="${SEAL}" fill="url(#${id}r)" transform="${INNER}"/>` +
      `<ellipse cx="41" cy="33" rx="17" ry="9" fill="#ffffff" opacity="0.22"/>`;
    detail = micro ? microDetail(id, opts, ink) : '';
    glyph = checkGlyph(ink, 9.5, 1, glyphShadow);
  } else if (effective === 4) {
    //
    // diamond: glass
    //
    defs =
      `<radialGradient id="${id}r" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="#e0f7ff"/><stop offset="0.35" stop-color="#38bdf8"/><stop offset="0.75" stop-color="#0369a1"/><stop offset="1" stop-color="#082f49"/></radialGradient>` +
      `<linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#bae6fd"/><stop offset="1" stop-color="#7dd3fc"/></linearGradient>` +
      bevelFilter +
      glowFilter('#38bdf8', 3) +
      glyphShadowFilter +
      microDefs(id);
    body =
      `<g filter="url(#${id}g)"><path d="${SEAL}" fill="url(#${id}m)" filter="url(#${id}b)"/></g>` +
      `<path d="${SEAL}" fill="url(#${id}r)" transform="${INNER}"/>` +
      `<path d="M50 16 L82 50 L50 84 L18 50 Z" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.5"/>` +
      `<path d="M50 16 L50 84 M18 50 L82 50" stroke="#ffffff" stroke-width="0.8" opacity="0.3"/>` +
      `<ellipse cx="40" cy="30" rx="15" ry="7.5" fill="#ffffff" opacity="0.55"/>`;
    ink = '#f0f9ff';
    detail = micro ? microDetail(id, opts, ink) : '';
    glyph = checkGlyph('#ffffff', 9.5, 1, glyphShadow);
  } else {
    //
    // flame: embossed ember
    //
    defs =
      `<radialGradient id="${id}r" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#fde68a"/><stop offset="0.4" stop-color="#f97316"/><stop offset="0.8" stop-color="#b91c1c"/><stop offset="1" stop-color="#450a0a"/></radialGradient>` +
      `<linearGradient id="${id}f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#7f1d1d"/><stop offset="0.45" stop-color="#f97316"/><stop offset="0.8" stop-color="#fde047"/><stop offset="1" stop-color="#fff7ed"/></linearGradient>` +
      `<linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c2"/><stop offset="0.4" stop-color="#fb923c"/><stop offset="0.7" stop-color="#9a3412"/><stop offset="1" stop-color="#fdba74"/></linearGradient>` +
      bevelFilter +
      glowFilter('#f97316', 4) +
      glyphShadowFilter +
      microDefs(id);
    body =
      `<g filter="url(#${id}g)"><path d="${SEAL}" fill="url(#${id}m)" filter="url(#${id}b)"/></g>` +
      `<path d="${SEAL}" fill="url(#${id}r)" transform="${INNER}"/>` +
      `<path d="${FLAME}" fill="url(#${id}f)" opacity="0.95"/>` +
      `<ellipse cx="41" cy="31" rx="14" ry="7" fill="#ffffff" opacity="0.35"/>`;
    ink = '#fff7ed';
    detail = micro ? microDetail(id, opts, ink) : '';
    glyph = checkGlyph('#fff7ed', 9.5, 1, glyphShadow);
  }

  const label = showLabel
    ? `<g><rect x="56" y="66" rx="14" ry="14" width="40" height="28" fill="#111827" stroke="#ffffff" stroke-width="3"/>` +
      `<text x="76" y="86" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${streak >= 100 ? 15 : 18}" font-weight="700" fill="#ffffff">${streak}</text></g>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112" width="${size}" height="${size}" class="gm-badge-svg gm-badge-tier-${effective}${cracked ? ' gm-badge-cracked' : ''}${counterfeit ? ' gm-badge-counterfeit' : ''}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title>` +
    (defs ? `<defs>${defs}</defs>` : '') +
    body +
    detail +
    glyph +
    label +
    `</svg>`
  );
}

function renderDataUri(opts = {}) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(render(opts));
}

window.GMBadgeSVG = { render, renderDataUri, SEAL, lobedPath, CUBE };
})();
