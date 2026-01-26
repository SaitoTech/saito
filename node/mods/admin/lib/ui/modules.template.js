module.exports = (mod) => {

  if (!mod?.server_info?.module_config) { 
console.log("why is MOD not set here?");
    return "";
  }

  let html = `<div id="admin-modules-config">`;
  let lite = [];
  let core = [];

  html += `
    <div class="module-config-header">
      <div id="show-modules" class="arrow-toggle">&#x25B6;</div>
      <h3>Modules</h3>
      <button id="modconfig-button" disabled>Save Changes</button>
    </div>
    <div class="mod-config-table minimize">
  `;

  if (mod?.server_info?.module_config?.lite) {
    lite = mod.server_info.module_config.lite.join(" ");
  }
  if (mod?.server_info?.module_config?.core) {
    core = mod.server_info.module_config.core.join(" ");
  }

  for (let m of mod.server_info.available_modules) {
    const enabled =
      lite.includes(`${m}/${m}`) || core.includes(`${m}/${m}`);
    html += `
      <input type="checkbox" name="${m}" ${enabled ? "checked" : ""}/>
      <label for="${m}">${m}</label>
    `;
  }

  html += `</div></div>`;
  return html;
};

