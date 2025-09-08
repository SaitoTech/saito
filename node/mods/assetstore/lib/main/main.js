const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const List = require('./list');
const Transaction = require('../../../../lib/saito/transaction').default;
const Nft = require('./auction-nft-extended'); // use the subclass here

class AssetStoreMain {

	constructor(app, mod, container = 'body') {

		this.app = app;
		this.mod = mod;
		this.container = container;
		this.list = new List(app, mod);
		this.auction_nfts = [];

		this.app.connection.on('assetstore-render-auction-list-request', async () => {
			await this.render();
		});

		this.app.connection.on('assetstore-update-auction-list-request', async () => {
			await this.updateAuctionList();
		});
	}

	async render() {
		let this_self = this;
	    	
    	if (!document.querySelector('.saito-container')) {
  		  this.app.browser.addElementToDom(AssetStoreMainTemplate(this.app, this.mod, this));
		}

		await this.buildAuctionList();

		this.attachEvents();
	}

	async buildAuctionList() {
		// empty list
		document.querySelector(".assetstore-table-list").innerHTML = ``;
		let empty_msg = document.querySelector("#assetstore-empty");
		let title = document.querySelector("#assetstore-table-title");

		console.log("this.mod.auction_list: ", this.mod.auction_list);

		if (this.mod.auction_list.length > 0) {
			empty_msg.style.display = 'none';
			title.style.display = 'block';
	

			for(let i=0; i<this.mod.auction_list.length; i++){
				let record = this.mod.auction_list[i];

				let nfttx = new Transaction();
				nfttx.deserialize_from_web(this.app, record.nft_tx);

				console.log("buildAuctionList nfttx: ", nfttx);

		        const nft = new Nft(this.app, this.mod, '.assetstore-table-list');
				await nft.createFromTx(nfttx);
				await nft.render();

				this.auction_nfts.push(nft);
			}
		} else {
			empty_msg.style.display = 'block';
			title.style.display = 'none';
		}
	}


	async updateAuctionList() {
		let this_self = this;
		let peers = await this.app.network.getPeers();
		if (peers.length == 0) {
			console.warn('No peers');
			return;
		}

		await this.mod.sendRetreiveRecordsTransaction(peers[0].peerIndex, async function(records){
			await this_self.buildAuctionList();
		});
	}


	attachEvents() {
		let this_self = this;
		let list_asset_btn = document.querySelector(".list-asset");
		if (list_asset_btn) {
			list_asset_btn.onclick = async (e) => {
				
				this.list.render();

				// let newtx = await this.mod.createListAssetTransaction();
				// alert("TX Created!");
				// console.log(JSON.stringify(newtx.returnMessage()));
				// this.app.network.propagateTransaction(newtx);

			}
		}

	}

}

module.exports = AssetStoreMain;
