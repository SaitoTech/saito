module.exports = (imperium_self, player, payment) => {
  let cards = imperium_self.returnPlayerPlanetCards(player).slice();
  if (!cards.length && !payment) {
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

  let html = `<div class="fs-planets-panel${payment ? ' is-paying' : ''}"><div class="fs-planets">`;
  for (let i = 0; i < cards.length; i++) {
    let planet = imperium_self.game.planets[cards[i]];
    if (!planet) {
      continue;
    }
    let is_committed = payment && payment.spent && payment.spent[cards[i]];
    let is_exhausted = planet.exhausted == 1;
    let payable = payment && !is_exhausted && !is_committed && paymentValue(planet, payment) > 0;
    let bonus = planet.bonus ? String(planet.bonus) : '';
    let label = planet.name + '. Resources ' + planet.resources + '. Influence ' + planet.influence + '.';
    if (bonus) {
      label += ' ' + bonus + '.';
    }
    if (is_exhausted) {
      label += ' Exhausted.';
    }
    html += `
      <article class="fs-planet${is_exhausted ? ' exhausted' : ''}${payable ? ' is-payable' : ''}${is_committed ? ' is-committed' : ''}" data-planet="${cards[i]}" data-exhausted="${is_exhausted ? 1 : 0}">
        <div class="fs-planet-card" style="background-image:url('${planet.img || ''}')" role="img" aria-label="${label}">${imperium_self.planetCardStats(planet)}</div>
        ${bonus ? `<div class="fs-planet-bonus ${bonus}">${bonus}</div>` : ''}
        ${payable ? `<div class="fs-planet-flag">Spend ${paymentValue(planet, payment)}</div>` : ''}
        ${is_exhausted ? '<div class="fs-planet-banner">Exhausted</div>' : ''}
        ${is_committed ? '<div class="fs-planet-banner is-committed">Selected</div>' : ''}
      </article>
    `;
  }
  html += '</div>';
  if (payment) {
    html += paymentSidebar(imperium_self, payment);
  }
  html += '</div>';
  return html;
};

function paymentValue(planet, payment) {
  if (!planet || !payment) {
    return 0;
  }
  if (payment.currency == 'influence') {
    return Number(planet.influence) || 0;
  }
  return Number(planet.resources) || 0;
}

function paymentSidebar(imperium_self, payment) {
  let ready = payment.paid >= payment.cost;
  let kicker = payment.kicker || 'Production cost';
  let rows = '';
  let spent = payment.spent || {};
  for (let id in spent) {
    let planet = imperium_self.game.planets[id];
    let name = planet && planet.name ? planet.name : id;
    rows += `<li><button type="button" class="fs-pay-drop" data-kind="planet" data-id="${id}"><span>${name}</span><span>${spent[id]}</span></button></li>`;
  }
  if (payment.goods_spent > 0) {
    rows += `<li><button type="button" class="fs-pay-drop" data-kind="goods"><span>Trade goods</span><span>${payment.goods_spent}</span></button></li>`;
  }
  if (!rows) {
    rows = '<li class="fs-pay-none">Nothing committed</li>';
  }
  let goods_left = (payment.goods_available || 0) - (payment.goods_spent || 0);
  let goods = '';
  if (goods_left > 0) {
    goods = `<button type="button" class="fs-pay-goods">Spend a trade good <span>${goods_left} left</span></button>`;
  }
  return `
    <aside class="fs-pay-side">
      <div class="fs-pay-side-body">
        <div class="fs-pay-kicker">${kicker}</div>
        <div class="fs-pay-cost">${payment.cost}</div>
        <div class="fs-pay-kicker">Paid</div>
        <div class="fs-pay-paid-line"><b class="fs-pay-paid">${payment.paid}</b> / ${payment.cost}</div>
        <div class="fs-pay-kicker">Committed</div>
        <ul class="fs-pay-list">${rows}</ul>
        ${goods}
      </div>
      <div class="fs-pay-side-action">
        <button type="button" class="fs-pay-submit${ready ? ' is-ready' : ''}"${ready ? '' : ' disabled'}>Submit</button>
      </div>
    </aside>
  `;
}
