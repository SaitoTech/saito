const MainTemplate = require('./main.template');
const Tweets = require('./tweets');

class NotificationsMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.container = '';
		this.tweets = null;
	}

	render() {
		const selector_main = '.saito-center .main';

		if (document.querySelector(selector_main)) {
			this.app.browser.replaceElementBySelector(MainTemplate(this), selector_main);
		} else {
			this.app.browser.addElementToSelector(MainTemplate(this), '.saito-center');
		}

		if (this.tweets === null) {
			this.tweets = new Tweets(this.app, this.mod, '.saito-center');
		}

		this.tweets.render();
	}
}

module.exports = NotificationsMain;
