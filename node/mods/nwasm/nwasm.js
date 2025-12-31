const saito = require('./../../lib/saito/saito');
const OnePlayerGameTemplate = require('../../lib/templates/oneplayer-gametemplate');
const PeerService = require('saito-js/lib/peer_service').default;
const NwasmGameOptionsTemplate = require('./lib/nwasm-game-options.template');
const UploadRom = require('./lib/upload-rom');
const ControlsOverlay = require('./lib/controls');
const NwasmUI = require('./lib/ui/main');
const SaveGameOverlay = require('./lib/save-games');
const JSON = require('json-bigint');
const xorInplace = require('buffer-xor/inplace');
const Transaction = require('../../lib/saito/transaction').default;
const SaitoNFT = require('../../lib/saito/ui/saito-nft/saito-nft');

//
// NWasm Library
//
// the library module is used to index ROMS I have saved in my own transaction
// archives for curation, personal use and lending as legally permitted. It queries
// my peers for items they have indexed in the same collections, and fetches those
// records on load.
//
// the library abstracts away the storage and ownership of the content, assigning
// control across the distributed network to whichever publickey is in possession
// of the rights to use.
//
// The Nwasm components abstract away the saving and loading of the ROMs themselves
// and initialization of the webpage.
//
// 	ROMS -- saved as 'Nwasm' modules
// 	SAVEGAMES --- saved as 'NwasmGAMESIG' (hash of title)
//
class Nwasm extends OnePlayerGameTemplate {

	constructor(app) {

		super(app);

		this.app = app;
		this.name = 'Nwasm';
		this.slug = 'nwasm';
		this.gamename = 'Nintendo 64';
		this.description = `The Saito Nintendo 64 emulator provides a user-friendly in-browser N64 emulator that allows archiving and playing the N64 games you own directly in your browser. Game files are encrypted so only you can access them and archived in your private transaction store.`;
		this.categories = 'Games Videogame Classic';

		this.uploader = null;
		this.ui = new NwasmUI(this.app, this);
		this.library = {};

		//
		// any games we can play or potentially borrow should be listed in the library object
		// we are going to maintain.
		//
		// this.library['publickey'] = [
		//    {
		//      id              : "id" ,
		//      title           : "title" ,
		//      description     : "description" ,
		//      key             : "" ,                          // random key that encrypts content
		//      sig             : "sig"                         // sig of transaction with content
		//   }
		// ]         
		//

		this.load();

		this.active_rom = null;
		this.active_rom_name = '';
		this.active_rom_sig = '';
		this.active_game = new ArrayBuffer(8);
		this.active_game_img = '';
		this.active_game_saves = [];

		this.active_game_time_played = 0;
		this.active_game_load_ts = 0;
		this.active_game_save_ts = 0;

		this.uploaded_rom = false;

		// opt out of index.js
		this.default_html = 0;

	}


	
	//
	// Library Management Functions
	//
        returnServices() {
                let services = [];
                if (this.app.BROWSER == 0) {
                        services.push(new PeerService(null, 'nwasm', 'Nwasm'));
                }
                return services;
        }      


        /////////////////////////////////
        // inter-module communications //
        /////////////////////////////////
        respondTo(type = '', obj) {
          let this_mod = this;

          if (type === 'saito-create-nft') {
            return {
              title : "N64 ROM" ,
              class : ["nwasm-nft-mod"] ,
	      createObject : async (modfile) => {
		let name = prompt("What is the name of this N64 ROM?");
		let obj = {};
		obj.module = "Nwasm";
		obj.name = name;
		obj.file = modfile;
		try { alert("Uploading ROM, please be patient..."); } catch (err) {}
		return obj;
	      } ,
            };
          }

	  return super.respondTo(type, obj);

        }



        //
        // when we connect to a peer that supports the "Nwasm" service, we contact
        // them with a request for information on any library that they have in case
	// we can access it.
        //
        async onPeerServiceUp(app, peer, service = {}) {

                //
                // remote peer runs a library
                //
                if (service.service === 'vault') {
			let vault_mod = app.modules.returnModule("Vault");
			if (vault_mod) {
				vault_mod.peer = peer;
				vault_mod.peer_connected = true;
			}
                }
        }

        isItemInLibrary(item, peer = 'localhost') {

                if (peer === 'localhost') {
                        peer = this.publicKey;
                }
                if (this.library[peer]) {
                        let idx = -1;
                        let contains_item = false;
                        for (
                                let i = 0;
                                i < this.library[peer].length;
                                i++
                        ) {
                                if (
                                        item.id == this.library[peer][i].id
                                ) {
                                        return true;
                                }
                        }
                }

                return false;
        }

	


	createItem(tx = null, secret_key = "") {

		if (tx == null) { return null; }

		let txmsg = tx.returnMessage();
                  
		let item = {};

		//
		// NFT
		//
		if (tx.type == 8) {
                	item.module = "Nwasm";
                        item.title = txmsg.data?.title || "";
                        item.id = this.app.crypto.hash(item.title);
                        item.key = "";
                        item.sig = tx.signature;
		}
                      
		//          
		// Normal          
		//          
		if (tx.type == 0) {
			item.module = "Nwasm";
			item.id = txmsg.id;
			item.title = txmsg.title;
			item.key = secret_key;
			item.sig = tx.signature;
		}
		
		return item;

	}


        addItemToLibrary(item, peer = 'localhost') {

                if (peer === 'localhost') {
                        peer = this.publicKey;
                }

		let does_item_exist_in_collection = false;
		if (!this.library[peer]) { this.library[peer] = []; }

		//
		// preventing unwitting duplication
		//
                for (
                        let i = 0;
                        i < this.library[peer].length;
                        i++
                ) {
                        if (
                                this.library[peer][i].title === item.title &&
                                this.library[peer][i].sig == item.sig
                        ) {
                                does_item_exist_in_collection = true;
                        }
                }

		//
		// and push into library
		//
                if (!does_item_exist_in_collection) {
			if (!this.library[peer]) { this.library[peer] = []; }
                        this.library[peer].push(item);
			this.save();
                } else {
			if (!this.library[peer]) { this.library[peer] = []; }
			for (let z = 0; z < this.library[peer].length; z++) {
				if (this.library[peer][z].sig == item.sig) {
					this.library[peer][z] = item;
				}
			}
		}

        }



        //
        //
        //
        async handlePeerTransaction(app, tx = null, peer, mycallback) {
                if (tx == null) {
                        return;
                }
                let message = tx.returnMessage();

                //
                // respond to requests for our local collection
                //
                if (message.request === 'nwasm collection') {
                        if (!message.data) {
                                return;
                        }
                        if (!message.data.collection) {
                                return;
                        }
                        if (!this.library[this.publicKey]) {
                                return;
                        }
                        if (mycallback) {
                                let x = JSON.parse(JSON.stringify(this.library[this.publicKey]));
                                // Remove decryption keys before sharing
                                for (let i = 0; i < x.length; i++) {
                                        if (x[i].key) { x[i].key = ""; }
                                }
                                mycallback( x );
                                return 1;
                        }
                        return;
                }

                return super.handlePeerTransaction(app, tx, peer, mycallback);
        }



	//
	// when this game initializes it begins to monitor the console log. this is 
	// used to provide feedback into the Saito module when the game has loaded 
	// and when it is saving or loading files, etc.
	//
	async initialize(app) {

		await super.initialize(app);

		//
		// non-browsers don't monitor the log
		//
		if (app.BROWSER == 0) {
			return;
		}

		//
		// monitor log if browser
		//
		if (this.browser_active == 1) {
			{
				const log = console.log.bind(console);
				console.log = (...args) => {
					if (args.length > 0) {
						if (typeof args[0] === 'string') {
							this.processNwasmLog(args[0], log);
						}
						log(...args);
					}
				};
			}
		}


		//
		// Monitor NFTs for additional 
		//
	        if (this.app.options.wallet.nfts) {
        	  	for (let z = 0; z < this.app.options.wallet.nfts.length; z++) {
          	  		let nft_sig = this.app.options?.wallet?.nfts[z]?.tx_sig;
          	  		let nft_type = this.app.wallet.extractNFTType(this.app.options?.wallet?.nfts[z]?.slip3.utxo_key);
		    		if (nft_type === "nwasm-nft-mod") {
					this.app.storage.loadTransactions({ sig: nft_sig }, async (txs) => {
						if (txs.length < 1) { return; }
						let tx = txs[0];
						let item = this.createItem(tx);
						this.addItemToLibrary(item, 'localhost');
						await this.ui.render();

					}, 'localhost');
		    		}
		    		if (nft_type === "vault") {
					this.app.storage.loadTransactions({ sig: nft_sig }, async (txs) => {
						if (txs.length < 1) { return; }
						let tx = txs[0];
						let item = {};
                        			item.module = "NWASM";
 			                	item.title = "Unknown NFT-Protected ROM";
                        			item.sig = nft_sig;
                        			item.id = nft_sig;
                        			item.tx = tx.serialize_to_web(this.app);
                        			item.vault = 1;
						this.addItemToLibrary(item, 'localhost');
						await this.ui.render();
					}, 'localhost');
		    		}
	        	}
		}
          


	}




	//////////////////////
	// UI and Rendering //
	//////////////////////
	async render(app) {

		let game_mod = this;
		if (!this.browser_active) {
			return;
		}

		super.render(app);

		//
		// ADD MENU
		//
		this.menu.addMenuOption('game-game', 'Game');
		this.menu.addSubMenuOption('game-game', {
			text: 'Upload',
			id: 'game-upload-rom',
			class: 'game-upload-rom',
			callback: function (app, game_mod) {
				game_mod.uploaded_rom = false;
				game_mod.active_rom_name = '';
				game_mod.menu.hideSubMenus();
				game_mod.uploadRom(app, game_mod);
			}
		});
		this.menu.addSubMenuOption('game-game', {
			text: 'Save',
			id: 'game-export',
			class: 'game-export',
			callback: function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				game_mod.exportState();
			}
		});
		this.menu.addSubMenuOption('game-game', {
			text: 'Load',
			id: 'game-import',
			class: 'game-import',
			callback: async function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				let x = new SaveGameOverlay(app, game_mod);
				await x.render();
				//game_mod.importState();
			}
		});

/****
		this.menu.addSubMenuOption('game-game', {
			text: 'Delete',
			id: 'game-rom-delete',
			class: 'game-rom-delete',
			callback: async function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				let c = confirm('Confirm: delete all your ROMS?');
				if (c) {
					await game_mod.deleteRoms();
					game_mod.ui.render();
				}
			}
		});
****/
		this.menu.addChatMenu();
		this.menu.render();
		await this.ui.render();

	}


	/////////////////////////
	// Game Engine Support //
	/////////////////////////
	initializeGame(game_id) {

		let nwasm_self = this;

		if (!this.game.state) {
			this.game.state = {};
			this.game.queue = [];
			this.game.queue.push('round');
			this.game.queue.push('READY');
		}

		//
		// when games are saved in the emulator
		//
		this.app.connection.on('nwasm-export-game-save', (savegame) => {
			nwasm_self.active_game = savegame;
			nwasm_self.saveGameFile(savegame);
		});
	}

	handleGameLoop(msg = null) {
		///////////
		// QUEUE //
		///////////
		if (this.game.queue.length > 0) {
			let qe = this.game.queue.length - 1;
			let mv = this.game.queue[qe].split('\t');
			let shd_continue = 1;
			if (mv[0] === 'round') {
				this.game.queue.splice(this.game.queue.length - 1, 1);
			}
			if (shd_continue == 0) {
				return 0;
			}
		}
		return 1;
	}

	startPlaying(ts = null) {
		if (ts == null) {
			ts = new Date().getTime();
		}
		this.active_game_load_ts = ts;
		this.active_game_save_ts = ts;
		this.ui.hide();
	}

	stopPlaying(ts = null) {
		if (ts == null) {
			ts = new Date().getTime();
		}
		this.active_game_time_played += ts - this.active_game_load_ts;
		this.active_game_load_ts = ts;
	}

	////////////////////
	// ROM Management //
	////////////////////
	//
	// this function is run when the user uploads the ROM into their browser. it
	// encrypts the ROM using a secret key that is only known to this wallet and
	// then puts the encrypted ROM into a transaction which is saved through the
	// normal storage functions.
	//
	// the transaction will be indexed by the Archive module of any users who are
	// providing storage for this user, as well as their own browser possibly. the
	// same Archive module that provides storage can then listen on the network
	// for requests that will transfer ownership/control/rights as needed for
	// legal DRM usage.
	//
	// DO NOT CONSOLE LOG THIS FUNCTION as it is called from the browser when
	// parsing the logs for the NWASM game load condition. any attempt to output
	// a console.log here thus triggers circular loop.
	//
	async saveRomFile(data) {

		let nwasm_self = this;
		let secret_key = this.app.crypto.generateRandomNumber();
		let base64data = this.xorBase64(this.convertByteArrayToBase64(data), secret_key);

		let added_to_library = 0;
		let iobj = document.querySelector('.nwasm-upload-instructions');
		if (iobj) { iobj.innerHTML = 'bundling ROM into archive file...'; }

		//
		// we create a transaction that will have the encrypted ROM data
		// on it. because this transaction has a lot of binary data, we 
		// want to manually handle the save-transaction process
		//
		let newtx = await this.app.wallet.createUnsignedTransaction();
		newtx.msg = {
			module: this.name,
			id: this.app.crypto.hash(this.active_rom_name),
			type: this.app.crypto.hash(this.active_rom_name),
			title: this.active_rom_name.trim(),
			request: 'archive insert',
			data: base64data
		};

		document.querySelector('.loader').classList.add('steptwo');
		if (iobj) {
			iobj.innerHTML = 'cryptographically signing archive file...';
		}

		await newtx.sign();

		if (iobj) {
			let size = Object.keys(newtx).length;
			iobj.innerHTML = 'uploading archive file: ' + size + ' bytes';
		}

		//
		// save the encrypted ROM file
		//
		await this.app.storage.saveTransaction(newtx, {
			owner: this.publicKey,
			field1: this.name,
			field2: this.publicKey,
			field3: this.active_rom_name
		}, 'localhost');

		if (iobj) {
			iobj.innerHTML = 'saving reference to local file';
		}

		//
		// add this to our library
		//
		let item = this.createItem(newtx, secret_key);
		this.addItemToLibrary(item);

	}

	//
	// loads the ROM file from a local archive or -- if it is remotely-hosted --
	// through the remote archive
	//
	loadRomFile(sig, mycallback) {

		if (!this.library[this.publicKey]) { return; }

		//
		//
		//
		let fetch_fnct = null;

		let item = null;
		let idx = 0;
		for (
			let i = 0;
			i < this.library[this.publicKey].length;
			i++
		) {
			if (this.library[this.publicKey][i].sig === sig) {
				if (this.library[this.publicKey][i].vault) {
					idx = i;
					item = this.library[this.publicKey][i];
				}
			}
		}


		if (item?.vault) {
			let vault_mod = this.app.modules.returnModule("Vault");
			let tx = new Transaction();
			tx.deserialize_from_web(this.app, item.tx);
			let txmsg = tx.returnMessage();
			let nft = new SaitoNFT(this.app, this, tx);

 			let vault_data = {};
			vault_data.nft_id = nft.id;
			vault_data.slip1_utxokey = nft.slip1?.utxo_key;
			vault_data.slip2_utxokey = nft.slip2?.utxo_key;
			vault_data.slip3_utxokey = nft.slip3?.utxo_key;
			vault_data.file_id = txmsg.data?.file_id;     
			vault_mod.sendAccessFileRequest(vault_data, (base64) => {
				if (!base64) { console.log("ERROR: cannot load from Vault"); return; }
				let tx = this.packRom(base64, item);
				mycallback([tx]);
			});

			//
			// mycallback expects to be sent [txs] with length = 1
			//
			// but we are fetching the file through an NFT-provided fetch function
			// which means we get the actual base64 module/rom rather than the 
			// transaction specifically, since the module handles the tx-level
			// abstraction.
			//
			// thus we "pack" the result that fetch_fnct pushes into its callback
			// into a transaction before we push that transaction into an array
			// and redirect it to our above callback.
			//
			return;
		}

		//
		// default from my transaction archive
		//
		this.app.storage.loadTransactions({ sig: sig }, mycallback, 'localhost');

	}


	async deleteRoms() {

		let nwasm_mod = this;

		//
		// broadcast message instructing any archive to delete all ROMS or any other content 
		// associated with our publickey. this purges everything that you associated
		// with this collection and our publickey. this purges everything that you own
		// that is in your archive.
		//
		this.app.storage.deleteTransactions(
			{
				owner: this.publicKey,
				field1: this.name
			},

			() => {
				try {
					alert('Transactions deleted');
				} catch (err) {
					console.log(
						'error running alert when transactions deleted'
					);
				}
			},

			null
		);

		//
		// we also manually purge any library if installed locally
		//
		nwasm_mod.library[this.publicKey] = {};
		nwasm_mod.save();
		nwasm_mod.ui.render();

	}

	initializeRom(bytearray) {
		this.active_game_saves = [];
		myApp.initializeRom(bytearray);
	}

	returnAdvancedOptions() {
		return NwasmGameOptionsTemplate(this.app, this);
	}

	//
	// Saito Module gets feedback from the N64 Emulator by monitoring the console log
	// for updates on the state of the program execution (has it initialized? have we	
	// saved? etc.).
	//
	// for the love of God don't add console.logs within this function or you'll throw
	// execution into an infinite loop.
	//
	async processNwasmLog(logline = '', log) {

		let x = logline;
		let nwasm_self = this;

		//
		// emulator started
		//
		if (logline.indexOf('detected emulator started') == 0) {
			if (this.uploader != null) {
				this.ui.hide();
				this.uploader.overlay.hide();
			}
		}

		if (logline.indexOf('mupen64plus: ') == 0) {
			x = logline.substring(13);
			if (x.indexOf('Name: ') == 0) {
				x = x.substring(6);
				if (x.indexOf('muopen') > -1) {
					x = x.substring(0, x.indexOf('muopen'));
				}

				let len = x.trim().length;
				if (len > 6) {
					len = 6;
				}

				if (
					this.active_rom_name.indexOf(x.trim().substring(0, len)) !=
					0
				) {
					this.active_rom_name = x.trim();
					this.active_rom_sig = this.app.crypto.hash(
						this.active_rom_name
					);

					//
					// archive the rom
					//
					if (
						this.uploaded_rom == false &&
						this.active_rom_name !== ''
					) {
						this.uploaded_rom = true;
						let similar_rom_exists = false;

						//
						// save ROM in archives
						//
						similar_rom_exists = this.isItemInLibrary(
								{
									id: this.app.crypto.hash(this.active_rom_name)
								},
								this.publicKey
						);

						if (similar_rom_exists) {
							let c = confirm(
								'Archive: ROM with this name already archived - is this a separate lawful copy?'
							);
							if (c) {
								await this.saveRomFile(this.active_rom);
							}
						} else {
							await this.saveRomFile(this.active_rom);
						}
					}

					//
					// load 5 saved games
					//
					this.app.storage.loadTransactions(
						{ field1: 'Nwasm' + this.active_rom_sig, limit: 5 },
						function (txs) {
							try {
								for (let z = 0; z < txs.length; z++) {
									let newtx = txs[z];
									nwasm_self.active_game_saves.push(newtx);
								}
							} catch (err) {
								log('error loading Nwasm game...: ' + err);
							}
						}
					);
				}
			}
		}
	}


	editControls(app) {
		this.controls = new ControlsOverlay(app, this);
		this.controls.render(app, this);
	}

	uploadRom(app) {
		this.uploader = new UploadRom(app, this);
		this.uploader.render(app, this);
	}


	//////////////////
	// transactions //
	//////////////////
	extractRom(tx) {
	
		let txmsg = tx.returnMessage();
		let secret_key = "";
		for (let peer in this.library) {
		  for (let i = 0; i < this.library[peer].length; i++) {
		    let item = this.library[peer][i];
		    if (txmsg.id == item.id) {
		      if (item.key) { secret_key = item.key; }
		    }
		  }
		}

		let base64 = txmsg.data;
		if (txmsg.data.file) { base64 = txmsg.data.file; }
		let rbase64 = base64.split("base64,")[1] ?? base64;
		let ab = "";
		if (secret_key != "") { 
			ab = this.convertBase64ToByteArray(this.xorBase64(rbase64, secret_key));
		} else {
			ab = this.convertBase64ToByteArray(rbase64);
		}

		//
		// prevents us saving the file, this is an already uploaded rom
		//
		this.uploaded_rom = true;
		this.active_game_saves = [];
		this.startPlaying();

		//
		// initialize ROM gets the ROM the APP and the MOD
		//
		myApp.initializeRom(ab, this.app, this);
	}
	//
	// id and key needs to be the same, rom is base64 inside data.file
	//
	packRom(base64, item) {

		let tx = new Transaction();
		tx.msg = {
			id : item.id , 
			key : item.key , 
			data : { file : base64 }
		}

		return tx;

	}

	loadSaveGame(sig) {
		for (let i = 0; i < this.active_game_saves.length; i++) {
			let newtx = this.active_game_saves[i];
			if (sig === newtx.signature) {
				let txmsg = newtx.returnMessage();
				let byteArray = this.convertBase64ToByteArray(txmsg.data);
				this.active_game = byteArray;
				myApp.loadStateLocal();
			}
		}
	}

	loadGameFile() {
		let nwasm_mod = this;
		let module_type = 'Nwasm' + this.active_rom_sig;

		this.app.storage.loadTransactions(
			{ field1: 'Nwasm' + this.active_rom_sig, limit: 1 },
			(txs) => {
				try {
					if (txs.length <= 0) {
						alert('No Saved Games Available');
					}
					let newtx = txs[0];
					let txmsg = newtx.returnMessage();
					let byteArray = nwasm_mod.convertBase64ToByteArray(
						txmsg.data
					);
					nwasm_mod.active_game = byteArray;
					nwasm_mod.active_game_time_played = txmsg.time_played;
					nwasm_mod.startPlaying();
					myApp.loadStateLocal();
				} catch (err) {
					console.log('error loading Nwasm game...: ' + err);
				}
			}
		);
	}

	async saveGameFile(data) {
		let base64data = this.convertByteArrayToBase64(data);
		let screenshot = await this.app.browser.resizeImg(this.active_game_img);

		let newtx = await this.app.wallet.createUnsignedTransaction();

		this.stopPlaying();

		let obj = {
			module: this.name + this.active_rom_sig,
			request: 'upload savegame',
			name: this.active_rom_name.trim(),
			screenshot: screenshot,
			time_played: this.active_game_time_played,
			data: base64data
		};

		newtx.msg = obj;
		await newtx.sign();
		await this.app.storage.saveTransaction(newtx, {
			field1: 'Nwasm' + this.active_rom_sig
		});
		this.active_game_saves.push(newtx);
	}

	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/////////////////////
	// data conversion //
	/////////////////////
	convertByteArrayToBase64(data) {
		return Buffer.from(data, 'binary').toString('base64');
	}

	convertBase64ToByteArray(data) {
		let b = Buffer.from(data, 'base64');
		let b2 = new Uint8Array(b.length);
		for (let i = 0; i < b.length; ++i) {
			b2[i] = b[i];
		}
		return b2;
	}

	xorBase64(data, secret_key) {
		let b = Buffer.from(data, 'base64');
		let r = Buffer.from(secret_key, 'utf8');
		return xorInplace(b, r).toString('base64');
	}


	////////////////////////
	// saving and loading //
	////////////////////////
	saveState() {
		myApp.saveStateLocal();
	}

	loadState() {
		myApp.loadStateLocal();
	}

	exportState() {
		let nwasm_mod = this;
		this.app.browser.screenshotCanvasElementById('canvas', function (img) {
			nwasm_mod.active_game_img = img;
			myApp.saveStateLocal();
			myApp.exportStateLocal();
		});
	}

	importState() {
		if (this.active_game == null) {
			alert('Load from Transaction not done yet!');
		} else {
			this.loadGameFile();
		}
	}

	save() {
		if (!this.nwasm) { this.nwasm = {}; }
		for (let key in this.library) { if (this.library[key].length == 0) { delete this.library[key]; } }
		this.nwasm.library = this.library;
		this.app.options.nwasm = this.nwasm;
		this.app.storage.saveOptions();
        }

        load() {
		if (!this.nwasm) { this.nwasm = {}; }
                if (this.app.options.nwasm) {
                        this.nwasm = this.app.options.nwasm;
			if (this.nwasm.library) {
                          this.library = this.nwasm.library;
			}
                        return;
                }
                this.nwasm = {};
		this.nwasm.library = {};
                this.save();
	}

}

module.exports = Nwasm;
