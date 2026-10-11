'use strict';

//
// Pure SVG renderer for the gm badge.
//
// Outer object: the locked hex. Inner object + microprint: the Saito
// impossible cube (hex, Y, plus the extra inner fold lines).
// Legendary and Exotic get a living metallic rim.
//

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function poly(pts) {
  return pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

function isoCube(cx, cy, L) {
  const dx = L * Math.cos(Math.PI / 6);
  const dy = L * 0.5;
  const N = [cx, cy - L];
  const TR = [cx + dx, cy - dy];
  const TL = [cx - dx, cy - dy];
  const F = [cx, cy];
  const BF = [cx, cy + L];
  const BR = [cx + dx, cy + dy];
  const BL = [cx - dx, cy + dy];
  return {
    top: poly([N, TR, F, TL]),
    left: poly([TL, F, BF, BL]),
    right: poly([TR, F, BF, BR])
  };
}

function CUBE(cx, cy, r) {
  const dx = r * Math.cos(Math.PI / 6);
  const dy = r * 0.5;
  const f = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const N = [cx, cy - r];
  const NE = [cx + dx, cy - dy];
  const SE = [cx + dx, cy + dy];
  const S = [cx, cy + r];
  const SW = [cx - dx, cy + dy];
  const NW = [cx - dx, cy - dy];
  const C = [cx, cy];
  const L = [cx - dx * 0.5, cy - r * 0.296];
  const T = [cx + dx * 0.458, cy - r * 0.296];
  const B = [cx, cy + r * 0.481];
  return (
    `M${f(N[0], N[1])} L${f(NE[0], NE[1])} L${f(SE[0], SE[1])} L${f(S[0], S[1])} L${f(SW[0], SW[1])} L${f(NW[0], NW[1])} Z ` +
    `M${f(NW[0], NW[1])} L${f(C[0], C[1])} L${f(NE[0], NE[1])} ` +
    `M${f(C[0], C[1])} L${f(S[0], S[1])} ` +
    `M${f(SW[0], SW[1])} L${f(L[0], L[1])} L${f(NW[0], NW[1])} ` +
    `M${f(L[0], L[1])} L${f(C[0], C[1])} ` +
    `M${f(N[0], N[1])} L${f(T[0], T[1])} L${f(NE[0], NE[1])} ` +
    `M${f(T[0], T[1])} L${f(C[0], C[1])} ` +
    `M${f(B[0], B[1])} L${f(SE[0], SE[1])}`
  );
}

const BADGE = hexPoints(50, 50, 40);
const BADGE_POLY = poly(BADGE);
const BADGE_PATH = `M${BADGE.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L ')} Z`;
const INNER = isoCube(50, 51, 16);

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const RANKS = {
  1: { fill: '#111111', stroke: '#d9d4cc', glyph: '#f4f1ea', ink: '#f5f5f4' },
  2: { fill: '#161412', stroke: '#e7d3a8', glyph: '#f6ead2', ink: '#f6ead2' },
  3: { fill: '#c5a028', stroke: '#f4e4a4', glyph: '#111111', ink: '#3a2a08' },
  4: { fill: '#0b1c24', stroke: '#e0f2fe', glyph: '#f0f9ff', ink: '#e0f2fe' },
  5: {
    fill: '#120e08',
    stroke: '#e8c547',
    glyph: '#f6ead2',
    ink: '#f6ead2',
    alive: 'gold'
  },
  6: {
    fill: '#050505',
    stroke: '#fafafa',
    glyph: '#fafafa',
    ink: '#fafafa',
    alive: 'chrome',
    stars: true
  }
};

function sproutMark(color) {
  return (
    `<path d="M50 74 V42" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M50 58 C48 46 36 42 30 48 C34 56 44 60 50 58 Z" fill="${color}"/>` +
    `<path d="M50 54 C52 42 64 38 70 44 C66 52 56 56 50 54 Z" fill="${color}"/>`
  );
}

function saitoCubeMark(ink, width, opacity, r = 21) {
  return `<path d="${CUBE(50, 50, r)}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linejoin="miter" stroke-miterlimit="2.4" opacity="${opacity}"/>`;
}

function cubePattern(id, ink) {
  return (
    `<pattern id="${id}p" width="5.4" height="6.24" patternUnits="userSpaceOnUse">` +
    `<path d="${CUBE(2.7, 3.12, 1.55)}" fill="none" stroke="${ink}" stroke-width="0.28" stroke-linejoin="miter"/>` +
    `</pattern>`
  );
}

function hash32(str) {
  let h = 2166136261;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function serialStars(opts, ink) {
  const h = hash32(`${opts.serial || ''}|${opts.issuer || ''}|${opts.sig || ''}`);
  let dots = '';
  for (let i = 0; i < 6; i++) {
    const a = (((h >>> (i * 5)) & 31) / 31) * Math.PI * 2;
    const r = 11 + ((h >>> (i * 3 + 2)) & 15) * 0.45;
    const x = 50 + r * Math.cos(a);
    const y = 48 + r * Math.sin(a) * 0.86;
    dots += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.85" fill="${ink}" opacity="0.4"/>`;
  }
  return dots;
}

function livingRimDefs(id, kind) {
  if (kind === 'gold') {
    return (
      `<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">` +
      `<stop offset="0" stop-color="#5a3c08"/>` +
      `<stop offset="0.22" stop-color="#e8c547"/>` +
      `<stop offset="0.4" stop-color="#fff4c4"/>` +
      `<stop offset="0.55" stop-color="#c5a028"/>` +
      `<stop offset="0.78" stop-color="#7a5410"/>` +
      `<stop offset="1" stop-color="#e8c547"/>` +
      `<animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3.6s" repeatCount="indefinite"/>` +
      `</linearGradient>`
    );
  }
  return (
    `<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">` +
    `<stop offset="0" stop-color="#52525b"/>` +
    `<stop offset="0.18" stop-color="#fafafa"/>` +
    `<stop offset="0.36" stop-color="#67e8f9"/>` +
    `<stop offset="0.52" stop-color="#e879f9"/>` +
    `<stop offset="0.7" stop-color="#fafafa"/>` +
    `<stop offset="1" stop-color="#27272a"/>` +
    `<animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="4.2s" repeatCount="indefinite"/>` +
    `</linearGradient>`
  );
}

function livingRim(id, size) {
  const w = size < 28 ? 4.4 : 3.4;
  return (
    `<polygon points="${BADGE_POLY}" fill="none" stroke="#09090b" stroke-width="${w + 1.8}" stroke-linejoin="round"/>` +
    `<polygon points="${BADGE_POLY}" fill="none" stroke="url(#${id}rim)" stroke-width="${w}" stroke-linejoin="round"/>` +
    `<polygon points="${BADGE_POLY}" fill="none" stroke="#ffffff" stroke-width="0.55" stroke-linejoin="round" opacity="0.35"/>`
  );
}

function microDetail(id, opts, ink) {
  const serial = opts.serial != null ? String(opts.serial) : '';
  const issuer = String(opts.issuer || '').slice(0, 8) || 'unissued';
  const sig = String(opts.sig || '').slice(0, 8) || 'pending';
  const line = serial ? `gm-${serial}-${issuer}-${sig}` : `gm-${issuer}-${sig}`;
  const field = 'GM SAITO GM FAM GM SAITO GM FAM ';
  const gmField = 'gm gm gm gm gm gm gm gm gm gm gm gm ';
  let rows = '';
  let gmRows = '';
  for (let i = 0; i < 10; i++) {
    rows += `<text x="-22" y="${10 + i * 7}" font-size="2.2" font-weight="600" letter-spacing="0.4">${field}</text>`;
    gmRows += `<text x="-16" y="${12 + i * 7}" font-size="3.1" font-weight="700" letter-spacing="0.9">${gmField}</text>`;
  }
  return (
    `<g clip-path="url(#${id}k)" fill="${ink}" font-family="ui-monospace, Menlo, Consolas, monospace">` +
    `<polygon points="${BADGE_POLY}" fill="url(#${id}p)" opacity="0.22"/>` +
    `<g opacity="0.07" transform="rotate(-24 50 50)">${rows}</g>` +
    `<g opacity="0.05" transform="rotate(-24 50 50)">${gmRows}</g>` +
    `<text x="50" y="84.2" text-anchor="middle" font-size="2.4" opacity="0.38" letter-spacing="0.18">${esc(line)}</text>` +
    `</g>`
  );
}

let uid = 0;

function render(opts = {}) {
  const tierId =
    typeof opts.tier === 'object' && opts.tier ? Number(opts.tier.id) : Number(opts.tier || 0);
  const streak = Number(opts.streak || 0);
  const serial = opts.serial != null ? Number(opts.serial) : null;
  const cracked = !!opts.cracked;
  const dormant = !!opts.dormant;
  const counterfeit = !!opts.counterfeit;
  const size = Number(opts.size || 64);
  const showLabel = opts.label !== false && size >= 40 && streak >= 7;
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

  let defs = `<clipPath id="${id}k"><polygon points="${BADGE_POLY}"/></clipPath>`;
  let body = '';
  let glyph = '';
  let detail = '';

  if (counterfeit) {
    body =
      `<polygon points="${BADGE_POLY}" fill="#171717"/>` +
      `<polygon points="${BADGE_POLY}" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linejoin="round"/>`;
    glyph =
      saitoCubeMark('#737373', 1.4, 0.7) +
      `<path d="M32 32 L68 68 M68 32 L32 68" fill="none" stroke="#ef4444" stroke-width="3.8" stroke-linecap="round"/>` +
      `<g clip-path="url(#${id}k)"><rect x="-16" y="58" width="132" height="10" fill="#ef4444" transform="rotate(-16 50 63)"/>` +
      `<text x="50" y="65.2" text-anchor="middle" font-size="6.5" font-weight="800" fill="#ffffff" font-family="system-ui, sans-serif" letter-spacing="1.2" transform="rotate(-16 50 63)">COUNTERFEIT</text></g>`;
  } else if (cracked) {
    body =
      `<polygon points="${BADGE_POLY}" fill="#1f1f1f"/>` +
      `<polygon points="${BADGE_POLY}" fill="none" stroke="#6b6b6b" stroke-width="1.3" stroke-linejoin="round"/>`;
    if (micro) {
      defs += cubePattern(id, '#d4d4d4');
      detail = microDetail(id, opts, '#d4d4d4');
    }
    glyph =
      saitoCubeMark('#a3a3a3', 1.35, 0.55) +
      `<path d="M58 18 L52 40 L60 52 L46 78" fill="none" stroke="#0a0a0a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M58 18 L52 40 L60 52 L46 78" fill="none" stroke="#a3a3a3" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (effective === 0) {
    body = `<polygon points="${BADGE_POLY}" fill="none" stroke="#525252" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="4 3.2"/>`;
  } else {
    const rank = RANKS[effective] || RANKS[1];
    const edge = size < 28 ? 2.6 : 1.35;
    if (rank.alive) {
      defs += livingRimDefs(id, rank.alive);
      body = `<polygon points="${BADGE_POLY}" fill="${rank.fill}"/>` + livingRim(id, size);
    } else {
      body =
        `<polygon points="${BADGE_POLY}" fill="${rank.fill}"/>` +
        `<polygon points="${BADGE_POLY}" fill="none" stroke="${rank.stroke}" stroke-width="${edge}" stroke-linejoin="round"/>`;
    }
    if (micro) {
      defs += cubePattern(id, rank.ink);
      detail = microDetail(id, opts, rank.ink);
    }
    const cubeW = rank.alive ? 1.7 : 1.35;
    const cubeOp = rank.alive ? 0.72 : 0.28;
    glyph = saitoCubeMark(rank.ink, cubeW, cubeOp) + sproutMark(rank.glyph);
    if (rank.stars && micro) {
      glyph += `<g clip-path="url(#${id}k)">${serialStars(opts, rank.ink)}</g>`;
    }
  }

  const labelStroke = (RANKS[effective] || RANKS[1]).stroke;
  const labelFill = (RANKS[effective] || RANKS[1]).glyph;
  const label = showLabel
    ? `<g><rect x="60" y="72" rx="7" ry="7" width="30" height="18" fill="#09090b" stroke="${labelStroke}" stroke-width="1.6"/>` +
      `<text x="75" y="85" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${streak >= 100 ? 9 : 11}" font-weight="600" fill="${labelFill}">${streak}</text></g>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 92 92" width="${size}" height="${size}" class="gm-badge-svg gm-badge-tier-${effective}${cracked ? ' gm-badge-cracked' : ''}${counterfeit ? ' gm-badge-counterfeit' : ''}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title>` +
    `<defs>${defs}</defs>` +
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

const api = { render, renderDataUri, CUBE, BADGE_PATH, isoCube };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.GMBadgeSVG = api;
}
