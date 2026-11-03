const AdvancedOptionsTemplate = require('../../../mods/arcade/lib/ui/overlays/advanced-options.template.js');

describe('Arcade AdvancedOptionsTemplate', () => {
  it('wraps game content with shared header, scroll body, and one Submit button', () => {
    const html = AdvancedOptionsTemplate(
      '<div class="overlay-input"><select name="board_size"><option>13</option></select></div>'
    );

    expect(html).toContain('id="advanced-options-overlay-container"');
    expect(html).toContain('saito-overlay-form');
    expect(html).toContain('saito-overlay-form-header-title');
    expect(html).toContain('Advanced Options');
    expect(html).toContain('class="advanced-options-body"');
    expect(html).toContain('name="board_size"');
    expect(html).toContain('id="game-wizard-advanced-return-btn"');
    expect(html).toMatch(/Submit/);
    expect(html.match(/game-wizard-advanced-return-btn/g)?.length).toBe(2);
    expect(html).not.toContain('Accept');
  });

  it('keeps content-only markup free of overlay chrome so NFT sections can be appended later', () => {
    const content = '<div class="overlay-input"><input name="foo" value="1" /></div>';
    const html = AdvancedOptionsTemplate(content);

    const bodyMatch = html.match(
      /<div class="advanced-options-body">([\s\S]*)<\/div>\s*<div class="saito-button-row">/
    );
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch?.[1]).toContain(content.trim());
  });
});

describe('migrated Advanced Options game templates', () => {
  const cases = [
    ['chess', () => require('../../../mods/chess/lib/chess-game-options.template.js')({}, {})],
    ['his', () => require('../../../mods/his/lib/core/advanced-options.template.js')()],
    ['paths', () => require('../../../mods/paths/lib/core/advanced-options.template.js')()],
    ['settlers', () => require('../../../mods/settlers/lib/ui/settlers-game-options.template.js')({}, {})],
    ['conquest', () => require('../../../mods/conquest/lib/game-options.template.js')()],
    ['poker', () => require('../../../mods/poker/lib/core/game-options.template.js')({}, {})],
    ['wuziqi', () => require('../../../mods/wuziqi/lib/wuziqi-game-options.template.js')({}, {})],
    ['nwasm', () => require('../../../mods/nwasm/lib/nwasm-game-options.template.js')({}, {})],
    [
      'pandemic',
      () => require('../../../mods/pandemic/lib/pandemic-game-options.template.js')({}, { name: 'Pandemic' })
    ],
    ['twilight', () => require('../../../mods/twilight/lib/core/advanced-options.template.js')()]
  ];

  test.each(cases)('%s uses shared markup without legacy chrome', (_name, load) => {
    const html = load();
    expect(html).not.toMatch(/<style|style=/);
    expect(html).not.toMatch(
      /overlay-title|game-wizard-advanced|twilight-advanced|removecards|list-header|options_notice/
    );
  });

  it('poker keeps blind_explainer for attachAdvancedOptionsEventListeners', () => {
    const html = require('../../../mods/poker/lib/core/game-options.template.js')({}, {});
    expect(html).toContain('id="blind_explainer"');
  });
});
