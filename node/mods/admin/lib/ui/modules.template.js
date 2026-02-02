module.exports = (mod) => {

  if (!mod?.server_info?.module_config) { 
    return "";
  }

  let html = `<div id="admin-modules-config">`;
  let lite = [];
  let core = [];
  const DEFAULT_MODULES = mod.returnDefaultModules();

  if (mod?.server_info?.module_config?.lite) {
    lite = mod.server_info.module_config.lite.join(" ");
  }
  if (mod?.server_info?.module_config?.core) {
    core = mod.server_info.module_config.core.join(" ");
  }

  html += `
    <div class="module-config-header">
      <h1 class="admin-header" id ="admin-header">Update Saito Modules</h1>
      <button id="modconfig-button" disabled>Save</button>
    </div>
    <div class="mod-config-table">
  `;

  for (let m of mod.server_info.available_modules) {
    const enabled = lite.includes(`${m}/${m}`) || core.includes(`${m}/${m}`);
    if (enabled || DEFAULT_MODULES.includes(m)) {
      html += `
        <input type="checkbox" id="mod-${m}" name="${m}" ${enabled ? "checked" : ""}/>
        <label for="mod-${m}">${m}</label>
      `;
    }
  }

  html += `</div>`;
  return html;
};

