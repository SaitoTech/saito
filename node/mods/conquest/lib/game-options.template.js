module.exports = () => `
  <div class="overlay-input">
    <label for="conquest-setup">Opening deployment</label>
    <select id="conquest-setup" name="conquest_setup" class="saito-form-select">
      <option value="classic" selected>Classic — choose and deploy in turn</option>
      <option value="quick">Quick start — automatically deal and deploy</option>
    </select>
    <p>Classic world conquest for 2–6 players. Two players adds a neutral army.
    Defense automatically uses the maximum dice. Cards are private; all players
    should remain connected to help with encrypted card deals.</p>
  </div>`;
