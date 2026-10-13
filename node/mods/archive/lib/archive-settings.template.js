module.exports = (app, mod) => {
  let days = mod.returnPrunePublicDays();

  return `
    <fieldset class="saito-grid archive-settings">
      <legend class="settings-label">Storage Settings</legend>
      <input class="saito-input" type="number" id="archive-prune-public-days" min="1" step="1" value="${days}">
      <label for="archive-prune-public-days">days to save local copies of non-financial transactions / data</label>
    </fieldset>
  `;
};
