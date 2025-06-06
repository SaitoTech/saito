const ModTemplate = require('../../lib/templates/modtemplate');
const path = require('path');
const StatusHomePage = require('./index');
const React = require('react');
const { createRoot } = require('react-dom/client');
const S = require('saito-js/saito').default;

// Placeholder for the main React component
const App = require('./react-components/App').default;

class Status extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = "status";
    this.description = "Saito Status Module (React Version)";
    this.categories = "Utilities Information";
    this.styles = [`/${this.name}/web/css/main.css`];
    this.scripts = [];
    this.rendered = false;
    return this;
  }

  async initialize(app) {
    await super.initialize(app);
    console.log(`${this.returnName()} Initialized (React rendering handled directly in render())`);
  }

  async render() {
    console.log(`${this.returnName()} render() method called.`);

    try {
      const stats = await S.getLibInstance().get_stats();
      const peerStats = await S.getLibInstance().get_peer_stats();
      window.stats = stats;
      window.peerStats = peerStats;
      window.loading = false;

      await super.render();
      console.log(`${this.returnName()} super.render() completed.`);
    } catch (err) {
      console.error(`${this.returnName()} error during super.render():`, err);
      return;
    }
    if (this.rendered) {
      console.log(`${this.returnName()} render() aborted: Already rendered.`);
      return;
    }
    const rootElement = document.getElementById('saito-react-app');
    if (rootElement) {
      try {
        if (!App) {
          console.error(`${this.returnName()} Error: App component is undefined or null. Check require statement.`);
          return;
        }
        const root = createRoot(rootElement);
        root.render(<App app={this.app} mod={this} />);
        this.rendered = true;
        console.log(`${this.returnName()} React component rendered successfully.`);
      } catch (err) {
        console.error(`${this.returnName()} Error rendering React component in render():`, err);
      }
    } else {
      console.error(`${this.returnName()} Error: Could not find root element #saito-react-app for React rendering in render(). Check HTML shell.`);
    }
  }

  webServer(app, expressapp, express) {
    const status_self = this;
    expressapp.use(`/${status_self.name}/`, express.static(path.join(__dirname, 'web')));
    expressapp.get(`/${status_self.name}/`, (req, res) => {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(StatusHomePage(app, status_self, app.build_number));
    });
    // Add stub API endpoints here as needed
  }

  // Stub functions for future expansion
  async getStatusData() {
    return { status: 'ok' };
  }
}

module.exports = Status; 