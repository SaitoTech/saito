(function (root) {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  root.ConquestStatisticsTemplate = (state, name, scope = 'total') => {
    const stats = state.statistics;
    const campaign = root.ConquestEngine.campaignNumber(state);
    const campaigns = [...new Set([String(campaign), ...Object.keys(stats?.campaigns || {})])].sort((a,b) => Number(b)-Number(a));
    const group = scope === 'total' ? stats?.totals : stats?.campaigns[scope];
    const players = state.players.map(p => p.id);
    if (stats?.totals[0] || Object.values(state.territories).some(t => t.owner === 0)) players.push(0);
    const peak = Math.max(1, ...players.flatMap(id => group?.[id]?.dice || []));
    return `<label class="conquest-statistics-filter">Show <select data-stats-campaign aria-label="Statistics campaign"><option value="total" ${scope==='total'?'selected':''}>All campaigns</option>${campaigns.map(n => `<option value="${n}" ${scope===n?'selected':''}>Campaign ${n}</option>`).join('')}</select></label>
      <details class="conquest-statistics-help"><summary>How totals are counted</summary><p>Attack and defense dice combined, including every Blitz roll. Each attack order is one battle: capturing wins; otherwise the defender wins. Armies earned includes turn reinforcements and card bonuses, excluding starting armies. Territories count captures, excluding initial placement.</p></details>
      ${!stats || stats.partial ? '<p class="conquest-small-note">Earlier battles in this saved game were not recorded. These totals include battles recorded since this update.</p>' : ''}
      ${stats && (stats.version!==2 || stats.extendedPartial) ? '<p class="conquest-small-note">Battle outcomes, armies earned and territory totals are recorded from this update onward; earlier dice and casualty records are preserved.</p>' : ''}
      <div class="conquest-statistics-players">${players.map(id => {
        const data = group?.[id] || {dice:[0,0,0,0,0,0],lost:0,defeated:0};
        const rolls = data.dice.reduce((sum,n) => sum+n,0);
        return `<section class="conquest-statistics-player" style="--player:${id ? `var(--conquest-player-${id})` : 'var(--conquest-muted)'}"><h3>${escape(name(id))}</h3>
          <div class="conquest-histogram" role="img" aria-label="${escape(name(id))} dice: ${data.dice.map((n,i) => `${i+1}: ${n}`).join(', ')}">${data.dice.map((count,i) => `<div class="conquest-histogram-bin"><b>${count}</b><div class="conquest-histogram-track"><i style="height:${count/peak*100}%"></i></div><span>${i+1}</span></div>`).join('')}</div>
          <p>${rolls} dice rolled${rolls ? ` · mean ${(data.dice.reduce((sum,n,i)=>sum+n*(i+1),0)/rolls).toFixed(2)}` : ' · no battles recorded'}</p>
          <dl>${[['lost','Armies lost'],['defeated','Armies defeated'],['wins','Battles won'],['losses','Battles lost'],['territoriesWon','Territories won'],['territoriesLost','Territories lost'],['earned','Armies earned']].map(([key,label])=>`<div><dt>${label}</dt><dd data-stat="${key}">${data[key]||0}</dd></div>`).join('')}</dl>
        </section>`;
      }).join('')}</div>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
