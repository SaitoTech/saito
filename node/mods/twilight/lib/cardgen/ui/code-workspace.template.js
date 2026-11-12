module.exports = () => `
  <section class="ts-code-workspace">
    <div class="ts-event-tabs" data-role="event-tabs" aria-label="Code events"></div>
    <div class="ts-code-editor" aria-label="Card code editor"></div>
    <footer class="ts-form-footer">
      <button type="button" class="saito-button-secondary" data-action="download-png">
        Download PNG
      </button>
      <button type="button" class="saito-button-secondary" data-action="test-code">
        Test Code
      </button>
      <button type="button" class="saito-button-primary" data-action="create-nft">
        Create NFT
      </button>
    </footer>
  </section>
`;
