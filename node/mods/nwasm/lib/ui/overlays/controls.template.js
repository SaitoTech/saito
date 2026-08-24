const CONTROL_ROWS = [
  { label: 'D-Up', key: 1, joy: 1, mapKey: 'Mapping_Up', mapJoy: 'Joy_Mapping_Up' },
  { label: 'D-Down', key: 2, joy: 2, mapKey: 'Mapping_Down', mapJoy: 'Joy_Mapping_Down' },
  { label: 'D-Left', key: 3, joy: 3, mapKey: 'Mapping_Left', mapJoy: 'Joy_Mapping_Left' },
  { label: 'D-Right', key: 4, joy: 4, mapKey: 'Mapping_Right', mapJoy: 'Joy_Mapping_Right' },
  { label: 'A', key: 5, joy: 5, mapKey: 'Mapping_Action_A', mapJoy: 'Joy_Mapping_Action_A' },
  { label: 'B', key: 6, joy: 6, mapKey: 'Mapping_Action_B', mapJoy: 'Joy_Mapping_Action_B' },
  { label: 'Start', key: 8, joy: 8, mapKey: 'Mapping_Action_Start', mapJoy: 'Joy_Mapping_Action_Start' },
  { label: 'Z', key: 10, joy: 10, mapKey: 'Mapping_Action_Z', mapJoy: 'Joy_Mapping_Action_Z' },
  { label: 'L', key: 11, joy: 11, mapKey: 'Mapping_Action_L', mapJoy: 'Joy_Mapping_Action_L' },
  { label: 'R', key: 12, joy: 12, mapKey: 'Mapping_Action_R', mapJoy: 'Joy_Mapping_Action_R' },
  { label: 'Menu', key: 9, joy: 9, mapKey: 'Mapping_Menu', mapJoy: 'Joy_Mapping_Menu' },
  { label: 'C-Up', key: 13, joy: 0, mapKey: 'Mapping_Action_CUP', mapJoy: '' },
  { label: 'C-Down', key: 14, joy: 0, mapKey: 'Mapping_Action_CDOWN', mapJoy: '' },
  { label: 'C-Left', key: 15, joy: 0, mapKey: 'Mapping_Action_CLEFT', mapJoy: '' },
  { label: 'C-Right', key: 16, joy: 0, mapKey: 'Mapping_Action_CRIGHT', mapJoy: '' },
  { label: 'Analog Up', key: 17, joy: 0, mapKey: 'Mapping_Action_Analog_Up', mapJoy: '' },
  { label: 'Analog Down', key: 18, joy: 0, mapKey: 'Mapping_Action_Analog_Down', mapJoy: '' },
  { label: 'Analog Left', key: 19, joy: 0, mapKey: 'Mapping_Action_Analog_Left', mapJoy: '' },
  { label: 'Analog Right', key: 20, joy: 0, mapKey: 'Mapping_Action_Analog_Right', mapJoy: '' }
];

module.exports = (app, mod, mappings = {}) => {
  let rows = CONTROL_ROWS.map((row) => {
    let keyVal = mappings[row.mapKey] || '';
    let joyVal = row.mapJoy ? mappings[row.mapJoy] || '' : '';
    let joyBtn = row.joy
      ? `<button type="button" class="saito-button-secondary" data-action="remap-joy" data-id="${row.joy}">Joypad</button>`
      : '';

    return `
      <div class="row">
        <div class="label">${row.label}</div>
        <div class="binding" data-map="${row.mapKey}">${keyVal}</div>
        <div class="binding" data-map="${row.mapJoy || ''}">${joyVal}</div>
        <div class="actions">
          <button type="button" class="saito-button-secondary" data-action="remap-key" data-id="${row.key}">Key</button>
          ${joyBtn}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="nwasm-controls saito-overlay-form">
      <div class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Controller Mapping</h2>
      </div>
      <div class="body">
        <div class="wait" hidden>Press a key or joypad button…</div>
        <div class="list">
          <div class="row head">
            <div class="label">Button</div>
            <div class="binding">Keyboard</div>
            <div class="binding">Joypad</div>
            <div class="actions">Remap</div>
          </div>
          ${rows}
        </div>
      </div>
      <div class="saito-button-row">
        <button type="button" class="saito-button-secondary" data-action="defaults">Restore Defaults</button>
        <button type="button" class="saito-button-primary" data-action="save">Save Changes</button>
      </div>
    </div>
  `;
};

module.exports.CONTROL_ROWS = CONTROL_ROWS;
