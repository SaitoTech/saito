module.exports = () => {

  return `
    <div class="node-setup">

      <div class="node-setup-options">

        <div class="node-setup-card" data-choice="production">
          <h2>I want to run a production machine</h2>
        </div>

        <div class="node-setup-card" data-choice="development">
          <h2>I want to run a local dev machine</h2>
        </div>

      </div>

      <div class="node-setup-explainer">
        <p>
          Select what type of node you wish to run.
          For local development, your machine will be customized to produce
          blocks on demand and you will be provided with the private key needed
          to spend or move funds around the network.
          For production machines, we will configure your node to join the
          network.
        </p>
      </div>

      <div class="node-setup-working" style="display:none;">
        <div class="node-setup-spinner"></div>
      </div>

      <div class="node-setup-dev-info" style="display:none;">

	Your configuration files have been updated for local development.

	<p></p>

	Please shutdown your server and run the following command:

	<p></p>

	npm run setuplocal

	<p></p>

	This will recompile your Saito install for local development with pre-allocated
	Saito that you can use for development. Once your server restarts, you can connect
	here to continue with module setup and configuration.

      </div>

    </div>
  `;
};

