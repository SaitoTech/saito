module.exports = (imperium_self, player, payment) => {
  let cards = imperium_self.returnPlayerPlanetCards(player).slice();
  if (!cards.length && !(payment && payment.goods_left > 0)) {
    return `<div class="fs-empty">This faction does not currently control any planets.</div>`;
  }

  cards.sort((a, b) => {
    let pa = imperium_self.game.planets[a] || {};
    let pb = imperium_self.game.planets[b] || {};
    let sa = (Number(pa.resources) || 0) + (Number(pa.influence) || 0);
    let sb = (Number(pb.resources) || 0) + (Number(pb.influence) || 0);
    if (sa !== sb) {
      return sb - sa;
    }
    return String(pa.name || '').localeCompare(String(pb.name || ''));
  });

  let pay = '';
  if (payment) {
    pay = `<div class="fs-pay-status"><span>Production cost ${payment.cost}</span><span>Paid <b class="fs-pay-paid">${payment.paid}</b> / ${payment.cost}</span></div>`;
  }

  let html = `<div class="fs-planets-panel">${pay}<div class="fs-planets">`;
  if (payment && payment.goods_left > 0) {
    html += `<button type="button" class="fs-pay-goods"><span class="fs-pay-goods-label">Trade goods</span><span class="fs-pay-goods-count">${payment.goods_left}</span></button>`;
  }
  for (let i = 0; i < cards.length; i++) {
    let planet = imperium_self.game.planets[cards[i]];
    if (!planet) {
      continue;
    }
    let is_spent = payment && payment.spent && payment.spent[cards[i]];
    let is_exhausted = planet.exhausted == 1 || is_spent;
    let payable = payment && !is_exhausted && (Number(planet.resources) || 0) > 0;
    let bonus = planet.bonus ? String(planet.bonus) : '';
    let label = planet.name + '. Resources ' + planet.resources + '. Influence ' + planet.influence + '.';
    if (bonus) {
      label += ' ' + bonus + '.';
    }
    if (is_exhausted) {
      label += ' Exhausted.';
    }
    html += `
      <article class="fs-planet${is_exhausted ? ' exhausted' : ''}${payable ? ' is-payable' : ''}" data-planet="${cards[i]}" data-exhausted="${is_exhausted ? 1 : 0}">
        <div class="fs-planet-card" style="background-image:url('${planet.img || ''}')" role="img" aria-label="${label}"></div>
        ${bonus ? `<div class="fs-planet-bonus ${bonus}">${bonus}</div>` : ''}
        ${is_exhausted ? '<div class="fs-planet-banner">Exhausted</div>' : ''}
      </article>
    `;
  }
  html += '</div></div>';
  return html;
};
