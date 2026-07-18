module.exports = (publicKey) => {
  return `
    <div class="admin-key-setup">
      <h2>Set Admin Access Key</h2>
      <p>
	This is the Saito address in your browser. Please confirm you wish to use 
	it to admin this server. Your computer will download/backup the wallet 
	automatically once you click to confirm.
      </p>

      <input
        type="text"
        class="saito-input" id="admin-public-key"
        value="${publicKey}"
      />

      <button id="submit-admin-key" type="submit" class="saito-button-primary">
        Yes, Let's Get Started!
      </button>
    </div>
  `;
};

