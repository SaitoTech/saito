const actionBar = require('./action-bar.template');

module.exports = () => `
  <section class="ts-code-workspace">
    <div class="ts-event-tabs" data-role="event-tabs" aria-label="Code events"></div>
    <div class="ts-code-editor" aria-label="Card code editor"></div>
    ${actionBar(
      `<button type="button" class="ts-action-btn ts-action-primary" data-action="create-nft">
        Generate Digital Card
      </button>`,
      `<button type="button" class="ts-action-btn ts-action-secondary ts-action-test" data-action="test-code" hidden>
        Test Card
      </button>`
    )}
  </section>
`;
