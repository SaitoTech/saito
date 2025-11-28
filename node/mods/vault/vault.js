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
  	      json: { 
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

			      //
			      // run CHECKOWN / CHECKOWNNFT script
			      //
			      let scripting_mod = app.modules.returnModule("Scripting");
			      if (!scripting_mod) {
			        mycallback({ status : "err" , err : "scripting_module_missing" });
			        return 0;
			      }

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

			      if (!ok) {
			        mycallback({ status : "err" , err : "access_denied_script_failed" });
			        return 0;
			      }

			      //
			      // If script passes, proceed to Archive
			      //
			      let archive_mod = app.modules.returnModule("Archive");
			      archive_mod.access_hash = 1; // ownership restricted

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

    			console.log("INSIDE vault add file //////");

			try {

				let archive_mod = app.modules.returnModule("Archive");
				archive_mod.access_hash = 1; // ownership restricted

				let peer_tx = new Transaction();
				peer_tx.deserialize_from_web(this.app, txmsg.data);
				let peer_txmsg = peer_tx.returnMessage();

				console.log("peer_txmsg:", peer_txmsg);
				let access_hash = peer_txmsg.access_hash || "";

//console.log("peer TXMSG: " + JSON.stringify(peer_txmsg));
console.log("peer SIG: " + peer_tx.signature);
console.log("peer FROM: " + peer_tx.from[0].publicKey);

				let data = {};
				data.owner = access_hash;

				console.log("data:", data);

				this.app.storage.saveTransaction(peer_tx, data, 'localhost');
				mycallback({ status : "success" , err : "" });

			} catch (err) {
console.log("ERROR: " + err);
				mycallback({ status : "err" , err : JSON.stringify(err) });
			}

		}
	}


	async createVaultAddFileTransaction(nftid=null) {

	  let newtx = await this.app.wallet.createUnsignedTransaction();

	  let scripting_mod = this.app.modules.returnModule("Scripting");
	  if (!scripting_mod) { return null; }

	  if (!nftid) {
	    console.log("Vault :: createVaultAddFileTransaction missing nftid");
	    return null;
	  }

	  let access_script_obj = {
	    op: "CHECKOWNNFT",
	    nftid,
	  };

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

	
	async sendAccessFileRequest(vault_data = null, mycallback) {

    console.log("VAULT: sendAccessFileRequest called");
    console.log("VAULT: vault_data:", vault_data);
    console.log("VAULT: mycallback:", mycallback);

    //
    // get scripting module
    //
    let scripting_mod = this.app.modules.returnModule("Scripting");
    console.log("VAULT: scripting_mod:", scripting_mod);

    if (!scripting_mod) {
      console.warn("VAULT: Scripting module not found, aborting");
      return null;
    }

    //
    // script: CHECKOWNNFT + nftid
    // witness: three utxokeys proving ownership
    //
    let nftid     = null;
    let utxokey1  = null;
    let utxokey2  = null;
    let utxokey3  = null;
    let file_id   = null;

    //
    // if called from UI (LoadNfts click) use provided values
    //
    if (vault_data) {
      console.log("VAULT: using values from vault_data");
      nftid     = vault_data.nft_id;
      utxokey1  = vault_data.slip1_utxokey;
      utxokey2  = vault_data.slip2_utxokey;
      utxokey3  = vault_data.slip3_utxokey;
      file_id   = vault_data.file_id;
    } else {
      console.log("VAULT: vault_data missing, falling back to prompt() flow");
      nftid    = prompt("NFT ID (nftid):");
      utxokey1 = prompt("NFT utxokey1:");
      utxokey2 = prompt("NFT utxokey2:");
      utxokey3 = prompt("NFT utxokey3:");
      file_id  = this.file_id;
    }

    console.log("VAULT: nftid:", nftid);
    console.log("VAULT: utxokey1:", utxokey1);
    console.log("VAULT: utxokey2:", utxokey2);
    console.log("VAULT: utxokey3:", utxokey3);
    console.log("VAULT: file_id (before fallback):", file_id);

    if (!nftid || !utxokey1 || !utxokey2 || !utxokey3) {
      console.warn("VAULT: Missing nftid or one of the utxokeys, aborting");
      alert("Missing nftid or one of the utxokeys");
      return null;
    }

    let access_script_obj = {
      op   : "CHECKOWNNFT",
      nftid
    };

    console.log("VAULT: access_script_obj:", access_script_obj);

    let access_script = JSON.stringify(access_script_obj);
    console.log("VAULT: access_script (stringified):", access_script);

    let access_witness_obj = {
      utxokey1,
      utxokey2,
      utxokey3
    };

    console.log("VAULT: access_witness_obj:", access_witness_obj);

    let access_witness = JSON.stringify(access_witness_obj);
    console.log("VAULT: access_witness (stringified):", access_witness);

    let access_hash = scripting_mod.hash(access_script);
    console.log("VAULT: access_hash:", access_hash);

    //
    // if file_id still not set, fall back to this.file_id
    //
    if (!file_id) {
      console.log("VAULT: file_id not set from vault_data, using this.file_id");
      file_id = this.file_id;
    }

    console.log("VAULT: final file_id:", file_id);

    let data = {
      request        : "vault access file",
      access_witness : access_witness,
      access_script  : access_script,
      access_hash    : access_hash,
      data           : { file_id }
    };

    console.log("VAULT: vault access data to send: ", data);

    if (this.peer) {
      console.log("VAULT: peer found, sending request as transaction");
      console.log("VAULT: peerIndex:", this.peer.peerIndex);

      this.app.network.sendRequestAsTransaction(
        "vault access file",
        data,
        (res) => {

          console.log("VAULT: callback vault access request (res): ", res);

          let txs = res.txs || [];
          console.log("VAULT: number of txs returned:", txs.length);

          if (txs.length > 0) {
            for (let i = 0; i < txs.length; i++) {

              console.log(`VAULT: processing tx index ${i}`);
              let tx = new Transaction();
              tx.deserialize_from_web(this.app, txs[i]);
              txmsg = tx.returnMessage();
              console.log("VAULT: txmsg:", txmsg);

              try {
                let filename = txmsg.data.name;
                console.log("VAULT: filename from txmsg:", filename);

                if (!filename) {
                  console.log("VAULT: filename missing, asking user via prompt");
                  filename = prompt("Enter filename to save:") || "vault.bin";
                }

                console.log("VAULT: final filename:", filename);

                const parts = txmsg.data.file.split(',');
                console.log("VAULT: file data parts:", parts.length);

                const header = parts[0];
                const base64Data = parts[1];
                const mime = header.match(/data:(.*);base64/)[1];

                console.log("VAULT: mime type:", mime);

                const binary = atob(base64Data);
                const len = binary.length;
                console.log("VAULT: binary length:", len);

                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = binary.charCodeAt(i);
                }

                console.log("VAULT: bytes array created, constructing Blob");

                const blob = new Blob([bytes], { type: mime });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename || "download";

                console.log("VAULT: triggering download");
                a.click();

                URL.revokeObjectURL(url);
                console.log("VAULT: URL revoked, download should be complete");
              } catch (err) {
                console.log("VAULT: ERROR while handling downloaded file: " + JSON.stringify(err));
              }

              console.log("VAULT: closing overlay after download");
              this.overlay.close();

            }
          } else {
            console.log("VAULT: no txs returned from vault access request");
          }

        },
        this.peer.peerIndex,
        true
      );

      console.log("VAULT: sendRequestAsTransaction called, showing siteMessage");
      siteMessage("Transferring File to Archive...", 3000);
    } else {
      console.warn("VAULT: no peer found, cannot send vault access request");
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

