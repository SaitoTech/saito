module.exports = (publicKey) => {
  return `
    <div class="admin-first-run">
      <div class="admin-key-setup">
        <h1>Set Admin Access Key</h1>
        <p>
          This is the Saito address in your browser. Please confirm you wish to use
          it to admin this server. Your computer will download/backup the wallet
          automatically once you click to confirm.
        </p>

        <input
          type="text"
          class="admin-input"
          id="admin-public-key"
          value="${publicKey}"
        />

        <button id="submit-admin-key" type="button" class="admin-button">
          Yes, Let's Get Started!
        </button>
      </div>

      <div class="admin-wiki">For manual setup instructions, please see our install instructions in the <a target="_blank" href="https://wiki.saito.io">Saito Wiki</a>.</div>
    </div>
  `;
};
