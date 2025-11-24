const saito = require('./../../lib/saito/saito');
const Transaction = require('../../lib/saito/transaction').default;
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const ModTemplate = require('./../../lib/templates/modtemplate');
const VaultMain = require('./lib/ui/main');
const VaultHome = require('./index');

class Vault extends ModTemplate {

	constructor(app) {

		super(app);

		this.appname = 'Vault';
		this.name = 'Vault';
		this.slug = 'vault';
		this.description = 'Storage Vault regulated by NFT Keys';
		this.categories = 'Utility Cryptography Programming';

		this.peer_connected = false;
		this.peer = null;

		//
		// vars for users / uploads
		//
		this.file = null;
		this.filename = "";
		this.file_id = null;
		this.mode = "private";

	}

	initialize(app) {

		this.header = new SaitoHeader(this.app, this);
		this.main = new VaultMain(this.app, this, ".saito-container");

		this.load();

	}

	render() {

		this.header.render();
		this.main.render();

	}

        /////////////////////////////////
  	// inter-module communications //
  	/////////////////////////////////
  	respondTo(type = '', obj) {
  	  let this_mod = this;

  	  if (type === 'saito-create-nft') {
  	    return {
	      title : "NFT Access Key" ,
  	      class : ["vault-nft-key"] ,
  	      content: { 
		txsig 	: "YYYYY" ,
		archive : "ZZZZZ" ,
	      }
  	    };
  	  }

	  return null;

        }


  	returnServices() {
    		let services = [];
    		if (!this.app.BROWSER || this.offerService) {
      			services.push(
				this.app.network.createPeerService(null, 'vault', 'Secure File Vault')
      			);
    		}
    		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
    		if (!this.browser_active) {
			return;
		}
    		if (service.service === 'vault') {
			this.peer = peer;
      			this.peer_connected = true;
		}
  	}   

  	async handlePeerTransaction(app, tx = null, peer, mycallback) {

    		if (tx == null) {
      			return 0;
    		}
  
    		let txmsg = tx.returnMessage();

    		if (!txmsg.request || !mycallback) {
      			return 0; 
    		}
    
    		if (txmsg.request === 'vault access file') {
    			console.log("inside txmsg.request = vault access");

			    try {

			    	 console.log('1');

			      //
			      // run CHECKOWN / CHECKOWNNFT script
			      //
			      let scripting_mod = app.modules.returnModule("Scripting");
			      if (!scripting_mod) {
			        mycallback({ status : "err" , err : "scripting_module_missing" });
			        return 0;
			      }

			      console.log('2');

			      //
			      // evaluate(hash, script, witness, vars, tx, blk)
			      // tx => the request transaction, so CHECKOWN sees tx/from/signature
			      //

			      console.log("CHECKOWN: ");
			      console.log("access_hash: ",txmsg.data.access_hash);
			      console.log("access_script: ",txmsg.data.access_script);
			      console.log("access_witness: ",txmsg.data.access_witness);
			      let ok = await scripting_mod.evaluate(
			        txmsg.data.access_hash || "",
			        txmsg.data.access_script || "",
			        txmsg.data.access_witness || "",
			        {},        //
			        tx,        //
			        null       //
			      );

			       console.log('3');

			      console.log("ok: ", ok);

			      if (!ok) {
			        mycallback({ status : "err" , err : "access_denied_script_failed" });
			        return 0;
			      }

			      //
			      // If script passes, proceed to Archive
			      //
			      let archive_mod = app.modules.returnModule("Archive");
			      archive_mod.access_hash = 1; // ownership restricted


			       console.log('4');

			      let data               = {};
			      data.owner             = txmsg.data.access_hash;
			      data.access_hash       = txmsg.data.access_hash;
			      data.access_script     = txmsg.data.access_script;
			      data.access_witness    = txmsg.data.access_witness;
			      data.sig               = txmsg.data.data.file_id;
			      data.request_tx        = tx;

			      this.app.storage.loadTransactions(
			        data,
			        async (txs) => {
			          mycallback({ status : "success" , err : "" , txs : txs });
			        },
			        "localhost",
			        0
			      );

			       console.log('5');

			    } catch (err) {
			      mycallback({ status : "err" , err : JSON.stringify(err) });
			    }

			  }

    		if (txmsg.request === 'vault add file') {

			try {

				let archive_mod = app.modules.returnModule("Archive");
				archive_mod.access_hash = 1; // ownership restricted

				let peer_tx = new Transaction();
				peer_tx.deserialize_from_web(this.app, txmsg.data);
				let peer_txmsg = peer_tx.returnMessage();
				let access_hash = peer_txmsg.access_hash || "";

//console.log("peer TXMSG: " + JSON.stringify(peer_txmsg));
console.log("peer SIG: " + peer_tx.signature);
console.log("peer FROM: " + peer_tx.from[0].publicKey);

				let data = {};
				data.owner = access_hash;

				this.app.storage.saveTransaction(peer_tx, data, 'localhost');
				mycallback({ status : "success" , err : "" });

			} catch (err) {
console.log("ERROR: " + err);
				mycallback({ status : "err" , err : JSON.stringify(err) });
			}

		}
	}


	async createVaultAddFileTransaction() {

	  let newtx = await this.app.wallet.createUnsignedTransaction();

	  let scripting_mod = this.app.modules.returnModule("Scripting");
	  if (!scripting_mod) { return null; }

	  //
	  // build CHECKOWN script
	  //
	  // NOTE: you need to decide which UTXO proves ownership
	  // e.g. the UTXO key for a specific NFT or deposit slip.
	  //

    let utxokey = prompt("utxokey:");

	  let access_script_obj = {
	    op: "CHECKOWN",
	    utxokey,
	  };

	  //
	  // serialize and hash via Scripting
	  //
	  let access_script = JSON.stringify(access_script_obj);
	  let access_hash   = scripting_mod.hash(access_script);

	  let msg = {
	    request       : "vault add file",
	    access_script : access_script,
	    access_hash   : access_hash,
	    data          : { file : this.file , name : this.filename },
	  };

	  newtx.msg = msg;
	  await newtx.sign();

	  return newtx;
	}


	async sendAccessFileRequest(mycallback) {

	  let scripting_mod = this.app.modules.returnModule("Scripting");
	  if (!scripting_mod) { return null; }

	  //
	  // Same CHECKOWN script as used when storing
	  //
    let utxokey = prompt("utxokey:");

	  let access_script_obj = {
	    op: "CHECKOWN",
	    utxokey,
	  };

	  let access_script   = JSON.stringify(access_script_obj);
	  let access_witness  = JSON.stringify({});   // CHECKOWN has no witness fields
	  let access_hash     = scripting_mod.hash(access_script);

	  let data = {
	    request        : "vault access file",
	    access_witness : access_witness,
	    access_script  : access_script,
	    access_hash    : access_hash,
	    data           : { file_id : this.file_id },
	  };

	  console.log("data: ", data);

	  if (this.peer) {
	    this.app.network.sendRequestAsTransaction(
	      "vault access file",
	      data,
	      (res) => { 

	      	console.log("callback vault access request: ", res);

      		let txs = res.txs;
	      		if (txs.length > 0) {
	          for (let i = 0; i < txs.length; i++) {

						  let tx = new Transaction();
						  tx.deserialize_from_web(this.app, txs[i]);
				                  txmsg = tx.returnMessage();

						  try {
						    let filename = txmsg.data.name;
						    if (!filename) {
						      filename = prompt("Enter filename to save:") || "vault.bin";  
						    }

						    const parts = txmsg.data.file.split(',');
						    const header = parts[0];
						    const base64Data = parts[1];
						    const mime = header.match(/data:(.*);base64/)[1];
						    const binary = atob(base64Data);
						    const len = binary.length;
						    const bytes = new Uint8Array(len);
						    for (let i = 0; i < len; i++) {
						      bytes[i] = binary.charCodeAt(i);
						    }
						    const blob = new Blob([bytes], { type: mime });
						    const url = URL.createObjectURL(blob);
						    const a = document.createElement("a");
						    a.href = url;
						    a.download = filename || "download";
						    a.click();
						    URL.revokeObjectURL(url);
						  } catch (err) {
						    console.log("ERROR: " + JSON.stringify(err));
						  }

						  this.overlay.close();

						}
					}

	      },
	      this.peer.peerIndex,
	      true
	    );
	    siteMessage("Transferring File to Archive...", 3000);
	  }
	}


	async createAccessKeyNFT() {

	

	}


        webServer(app, expressapp, express) {
                let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
                let vault_self = this;

                expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
                        let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

                        let updatedSocial = Object.assign({}, vault_self.social);

                        let html = VaultHome(app, vault_self, app.build_number, updatedSocial);
                        if (!res.finished) {
                                res.setHeader('Content-type', 'text/html');
                                res.charset = 'UTF-8';
                                return res.send(html);
                        }
                        return;
                });

                expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
        }


	load() {
		if (!this.app.options.vault) { this.app.options.vault = {}; }
		if (!this.app.options.vault.files) { this.app.options.vault.files = []; }
	}

	save() {
		if (!this.app.options.vault) { this.app.options.vault = {}; }
		this.app.storage.saveOptions();
	}



	//
	//
	//


}

module.exports = Vault;

