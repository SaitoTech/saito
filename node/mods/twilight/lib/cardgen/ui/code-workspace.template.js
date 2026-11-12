module.exports = () => `
  <section class="ts-code-workspace">
    <div class="ts-event-tabs" data-role="event-tabs" aria-label="Code events"></div>
    <div class="ts-code-editor" aria-label="Card code editor"></div>
    <footer class="ts-form-footer">
      <button type="button" class="saito-button-secondary" data-action="download-png">
        Generate Image
      </button>
      <button type="button" class="saito-button-primary" data-action="create-nft">
        Generate Card
      </button>
    </footer>
  </section>
`;
