var ModTemplate = require('../../lib/templates/modtemplate');
const Transaction = require('../../lib/saito/transaction').default;

class Tutorial05 extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Tutorial05';
    this.slug = 'tutorial05';
    this.description = 'Connecting UI Components and Modules';
    this.categories = 'Educational Sample';

    app.connection.on('tutorial05-event', (click_source) => {
      console.log('User clicked on me -- ' + click_source);
      alert('User clicked on me -- ' + click_source);
    });
  }

  respondTo(type = '', obj) {
    //
    // Option when you click on a user's identicon or name
    //
    if (type === 'user-menu') {
      return [
        {
          text: `Tutorial05 User Menu`,
          icon: 'fa-solid fa-5',
          callback: function (app, publicKey) {
            app.connection.emit('tutorial05-event', type);
          }
        }
      ];
    }

    //
    // Option when you open the hamburger menu
    //
    if (type === 'saito-header') {
      return [
        {
          text: 'Tutorial05',
          icon: 'fa-solid fa-5',
          rank: 10,
          callback: function (app, id) {
            app.connection.emit('tutorial05-event', type);
          }
        }
      ];
    }

    //
    // Option when you click the Redsquare mobile interface floating menu
    //
    if (type == 'saito-floating-menu') {
      return [
        {
          text: 'Tutorial05',
          icon: 'fa-solid fa-5',
          callback: function (app, id) {
            app.connection.emit('tutorial05-event', type);
          }
        }
      ];
    }

    return null;
  }
}

module.exports = Tutorial05;
