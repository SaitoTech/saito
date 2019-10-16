//
// IF THIS FILE CHANGES, BE SURE TO UPDATE THE
// COPY OF THE FILE IN THE APPSTORE MODULE DIR
//
// it uses a copy of this file to generate the
// browser.js file needed by the chrome exts
//
function Modules(app, mods) {

  if (!(this instanceof Modules)) {
    return new Modules(app, mods);
  }

  this.app          = app;
  this.mods         = [];
  this.mods_list    = mods;

  this.lowest_sync_bid = -1;

  return this;

}
module.exports = Modules



/**
 * Iniitialize Modules
 */
Modules.prototype.pre_initialize = function pre_initialize() {

  //this.mods.push(require('./mods/permanentledger/permanentledger')(this.app));
  //this.mods.push(require('../../mods/spammer/spammer')(this.app));
  this.mods.push(require('../../mods/init/init')(this.app));


  this.mods.push(require('../../mods/welcome/welcome')(this.app));
  this.mods.push(require('../../mods/wordblocks/wordblocks')(this.app));
  this.mods.push(require('../../mods/twilight/twilight')(this.app));
  this.mods.push(require('../../mods/solitrio/solitrio')(this.app));
  this.mods.push(require('../../mods/poker/poker')(this.app));
  // this.mods.push(require('../../mods/dhb/dhb')(this.app));
  //this.mods.push(require('../../mods/pandemic/pandemic')(this.app));
  // this.mods.push(require('../../mods/catan/catan')(this.app));




  this.mods.push(require('../../mods/timeclock/timeclock')(this.app));
  this.mods.push(require('../../mods/hospital/hospital')(this.app));

  this.mods.push(require('../../mods/imperium/imperium')(this.app));
  this.mods.push(require('../../mods/chess/chess')(this.app));
  //this.mods.push(require('../../mods/profile/profile')(this.app));
  this.mods.push(require('../../mods/proxymod/proxymod')(this.app));
  // this.mods.push(require('../../mods/citysim/citysim')(this.app));


  const Observer = require('../../mods/observer/observer');
  this.mods.push(new Observer(this.app));


  const Arcade = require('../../mods/arcade/arcade');
  this.mods.push(new Arcade(this.app));



  this.mods.push(require('../../mods/settings/settings')(this.app));
  //this.mods.push(require('./mods/raw/raw')(this.app));
  this.mods.push(require('../../mods/advert/advert')(this.app));
// uses msig

//  this.mods.push(require('../../mods/appstore/appstore')(this.app));
//  this.mods.push(require('./mods/auth/auth')(this.app));
//  this.mods.push(require('./mods/bank/bank')(this.app));
// uses msig
  const Chat = require('../../mods/chat/chat');
  this.mods.push(new Chat(this.app));

  // const Countdown_MODULE = require('../../mods/countdown/countdown');
  // this.mods.push(new Countdown_MODULE(this.app));

//  const Notifer = require('../../mods/fcm-notification/notifier');
//  this.mods.push(new Notifer(this.app));

  this.mods.push(require('../../mods/email/email')(this.app));
  this.mods.push(require('../../mods/encrypt/encrypt')(this.app));

  //this.mods.push(require('./mods/ethchannels/ethchannels')(this.app));

  this.mods.push(require('../../mods/explorer/explorer')(this.app));
// uses msig
//  this.mods.push(require('../../mods/facebook/facebook')(this.app));
  this.mods.push(require('../../mods/faucet/faucet')(this.app));
 this.mods.push(require('../../mods/registry/registry')(this.app));

  this.mods.push(require('../../mods/reddit/reddit')(this.app));
  this.mods.push(require('../../mods/remix/remix')(this.app));
  this.mods.push(require('../../mods/money/money')(this.app));
  this.mods.push(require('../../mods/debug/debug')(this.app));

  if (this.app.options.modules == null) {
    this.app.options.modules = [];
    for (let i = 0; i < this.mods.length; i++) {
      mi = 0;
      for (let j = 0; j < this.app.options.modules.length; j++) { if (this.mods[i].name == this.app.options.modules[j]) { mi = 1; }}
      if (mi == 0) {
        if (this.app.BROWSER == 0) {
          this.mods[i].installModule(this.app);
        }
        this.app.options.modules.push(this.mods[i].name);
      };
    }
    this.app.storage.saveOptions();
  }

}

/**
 *
 */
Modules.prototype.affixCallbacks = function affixCallbacks(txindex, message, callbackArray, callbackIndexArray) {
  for (let i = 0; i < this.mods.length; i++) {
    if (message.module != undefined) {
      if (this.mods[i].shouldAffixCallbackToModule(message.module) == 1) {
        callbackArray.push(this.mods[i].onConfirmation);
        callbackIndexArray.push(txindex);
      }
    }
  }
}

/**
 *
 */
Modules.prototype.initialize = function initialize() {
  for (let i = 0; i < this.mods.length; i++) {
    this.mods[i].initialize(this.app);
  }
}

/**
 *
 */
Modules.prototype.displayEmailForm = function displayEmailForm(modname) {
  for (let i = 0; i < this.mods.length; i++) {
    if (modname == this.mods[i].name) {
      if (this.mods[i].handlesEmail == 1) {
        this.mods[i].displayEmailForm(this.app);
        for (let ii = 0; ii < this.mods.length; ii++) {
	  if (this.mods[ii].name == "Email") {
            this.mods[ii].active_module = modname;
	  }
	}
      }
    }
  }
  return null;
}

/**
 *
 */
Modules.prototype.displayEmailMessage = function displayEmailMessage(message_id, modname) {
  for (let i = 0; i < this.mods.length; i++) {
    if (modname == this.mods[i].name) {
      if (this.mods[i].handlesEmail == 1) {
        return this.mods[i].displayEmailMessage(message_id, this.app);
      }
    }
  }
  return null;
}

/**
 *
 */
Modules.prototype.attachEvents = function attachEvents() {
  for (imp = 0; imp < this.mods.length; imp++) {
    if (this.mods[imp].browser_active == 1) {
      this.mods[imp].attachEvents(this.app);
    }
  }
  return null;
}

/**
 *
 */
Modules.prototype.attachEmailEvents = function attachEmailEvents() {
  for (let imp = 0; imp < this.mods.length; imp++) {
    this.mods[imp].attachEmailEvents(this.app);
  }
  return null;
}

/**
 *
 */
Modules.prototype.initializeHTML = function initializeHTML() {
  for (let icb = 0; icb < this.mods.length; icb++) {
    if (this.mods[icb].browser_active == 1) {
      this.mods[icb].initializeHTML(this.app);
    }
  }
  return null;
}

/**
 *
 */
Modules.prototype.formatEmailTransaction = function formatEmailTransaction(tx, modname) {
  for (let i = 0; i < this.mods.length; i++) {
    if (modname == this.mods[i].name) {
      return this.mods[i].formatEmailTransaction(tx, this.app);
    }
  }
  return null;
}

/**
 *
 */
Modules.prototype.handleDomainRequest = function handleDomainRequest(message, peer, mycallback) {
  for (let iii = 0; iii < this.mods.length; iii++) {
    if (this.mods[iii].handlesDNS == 1) {
      this.mods[iii].handleDomainRequest(this.app, message, peer, mycallback);
    }
  }
  return;
}

/**
 *
 */
Modules.prototype.handleMultipleDomainRequest = function handleMultipleDomainRequest(message, peer, mycallback) {
  for (let iii = 0; iii < this.mods.length; iii++) {
    if (this.mods[iii].handlesDNS == 1) {
      this.mods[iii].handleMultipleDomainRequest(this.app, message, peer, mycallback);
    }
  }
  return;
}

/**
 *
 */
Modules.prototype.handlePeerRequest = function handlePeerRequest(message, peer, mycallback=null) {
  for (let iii = 0; iii < this.mods.length; iii++) {
    try {
      this.mods[iii].handlePeerRequest(this.app, message, peer, mycallback);
    } catch (err) {
      console.error("MODULE HANDLE PEER REQUEST ERROR: ", err);
    }
  }
  return;
}

/**
 *
 */
Modules.prototype.loadFromArchives = function loadFromArchives(tx) {
  for (let iii = 0; iii < this.mods.length; iii++) {
    this.mods[iii].loadFromArchives(this.app, tx);
  }
  return;
}

/**
 *
 */
Modules.prototype.returnModule = function returnModule(modname) {
  for (let i = 0; i < this.mods.length; i++) {
    if (modname == this.mods[i].name) {
      return this.mods[i];
    }
  }
  return null;
}

/**
 *
 */
Modules.prototype.updateBalance = function updateBalance() {
  for (let i = 0; i < this.mods.length; i++) {
    this.mods[i].updateBalance(this.app);
  }
  return null;
}

/**
 *
 */
Modules.prototype.updateBlockchainSync = function updateBlockchainSync(current, target) {
  if (this.lowest_sync_bid == -1) { this.lowest_sync_bid = current; }
  target = target-(this.lowest_sync_bid-1);
  current = current-(this.lowest_sync_bid-1);
  if (target < 1) { target = 1; }
  if (current < 1) { current = 1; }
  let percent_downloaded = 100;
  if (target > current) {
    percent_downloaded = Math.floor(100*(current/target));
  }
  for (let i = 0; i < this.mods.length; i++) {
    this.mods[i].updateBlockchainSync(this.app, percent_downloaded);
  }
  return null;
}

/**
 *
 */
Modules.prototype.webServer = function webServer(expressapp) {
  for (let i = 0; i < this.mods.length; i++) {
    this.mods[i].webServer(this.app, expressapp);
  }
  return null;
}

/**
 *
 */
Modules.prototype.onNewBlock = function onNewBlock(blk, i_am_the_longest_chain) {
  for (let iii = 0; iii < this.mods.length; iii++) {
    this.mods[iii].onNewBlock(blk, i_am_the_longest_chain);
  }
  return;
}

/**
 *
 */
Modules.prototype.onChainReorganization = function onChainReorganization(block_id, block_hash, lc) {
  for (let imp = 0; imp < this.mods.length; imp++) {
    this.mods[imp].onChainReorganization(block_id, block_hash, lc);
  }
  return null;
}
