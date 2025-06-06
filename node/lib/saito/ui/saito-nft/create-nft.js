const NftTemplate = require('./create-nft.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');

class Nft {

    constructor(app, mod, container = '') {
        this.app = app;
        this.mod = mod;
        this.overlay = new SaitoOverlay(this.app, this.mod);

        this.editing_mode = "image"; // "data" shows textarea

        this.nft = {};
        this.nft.num     = 1;
        this.nft.deposit = 0;
        this.nft.change  = 0;
        this.nft.fee     = 0;
        this.nft.slip    = "";
        this.nft.id      = "";

        this.nft.bid     = 0;
        this.nft.tid     = 0;
        this.nft.sid     = 0;
        this.nft.amt     = 0;
        this.nft.type    = 0;
        this.nft.image   = "";

           this.callback    = {};
        this.utxo = [];

        this.app.connection.on('saito-create-nft-render-request', () => {
            this.render();
        });

    }

    async render() {
        let nft_self = this;
        this.callback.imageUploadCallback = async (file) => {
            if (this.nft.image != "") { 
            alert("NFT Image Editing not allowed, refresh to restart...");
            return;
            }
            this.nft.image = file;

            this.addImage(file);
        };

        this.overlay.show(NftTemplate(this.app, this.mod, this));

        if (this.nft.image != "") { this.addImage(this.nft.image); }

        // makes sure DOM is loaded before attaching events
        setTimeout(() => this.attachEvents(), 0);
    }

    createObject() {
        let obj = {};        
        let nftType = document.querySelector('#create-nft-type-dropdown').value;
        console.log("nftType:", nftType);

        if (nftType == 'text') {
            let data = document.querySelector("#create-nft-textarea").value;
            obj.data = JSON.parse(data);
        } else {
            obj.image = this.nft.image;
        }

        return obj;
    }

    attachEvents() {
       let nft_self = this;


        if (document.querySelector('#nft-link')) {
            
            console.log("nft-link found");

            document.querySelector('#nft-link').onclick = async (e) => {
                // send nft overlay
                console.log("clicked on nft-link");
                nft_self.nft.image = "";
                nft_self.overlay.close();
                nft_self.app.connection.emit('saito-send-nft-render-request', {});
            };
        }

        nft_self.app.browser.addDragAndDropFileUploadToElement(
            "nft-image-upload",
            this.callback.imageUploadCallback,
            true
        );

        document.querySelector('#create-nft-amount').onclick = async (e) => {
            let input, num;
            do {
              input = prompt("Number of nfts (enter whole number only)");
              if (input === null) return null;              // user cancelled
              input = input.trim();
              // only allow optional +/– sign followed by digits
            } while (!/^[+-]?\d+$/.test(input));

            let depositAmt = parseInt(input, 10);
            document.querySelector("#create-nft-amount").innerHTML = depositAmt;
        };

        document.querySelector('#create-nft-type-dropdown').onchange = async (e) => {
            let element = e.target;
            let nftType = element.value;

            const data = { id: "", message: "" };
            const textarea = document.querySelector("#create-nft-textarea");
            textarea.value = JSON.stringify(data, null, 2);

            this.nft.image = "";

            if (document.querySelector(".nft-file-transfer")) {
                document.querySelector(".nft-file-transfer").remove();
            }

            if (document.querySelector(".nft-image-preview")) {
                document.querySelector(".nft-image-preview").remove();
            }

            if (nftType == 'text') {
                document.querySelector("#nft-image-upload").style.display = 'none';
                document.querySelector("#create-nft-textarea").style.display = 'block';   
            } else if (nftType == 'image'){
                document.querySelector("#nft-image-upload").style.display = 'block';
                document.querySelector("#nft-image-upload").innerHTML = `drag-and-drop NFT image`;
                document.querySelector("#create-nft-textarea").style.display = 'none';            
            } else if (nftType == 'file') {
                document.querySelector("#nft-image-upload").style.display = 'block';
                document.querySelector("#nft-image-upload").innerHTML = `drag-and-drop NFT file`;
                document.querySelector("#create-nft-textarea").style.display = 'none';
            }
        };


        document.querySelector('#create_nft').onclick = async (e) => {
            let obj = this.createObject();
            console.log("obj: ", obj);

            // value of nft (nolan)
            let depositAmt = BigInt(this.app.wallet.convertSaitoToNolan(1));

            //
            // this value is not either nolan/saito
            // this represents the number of nft to mint
            //
            let numNft = BigInt(parseInt(document.querySelector('#create-nft-amount').innerHTML));
            console.log("numNft: ", numNft);

            let balance = await this.app.wallet.getBalance();
            let balanceSaito = this.app.wallet.convertNolanToSaito(balance);
            console.log("balance: ", balance);
            console.log("balanceSaito: ", balanceSaito);

            if (balanceSaito < 1) {
                salert(`Need atleast 1 SAITO to create NFT`);
                return;
            }
 
            if (nft_self.nft.image == "") {
                salert(`Attach an image/file to create nft`);
                return;
            }

            let fee = BigInt(0n);

            console.log("SUBMIT NFT: ");
            console.log('create-nft numNftAmt:', numNft);
            console.log(depositAmt);
            console.log(JSON.stringify(obj));
            console.log(fee);
            console.log(nft_self.mod.publicKey);

            let newtx = await nft_self.app.wallet.createBoundTransaction(
                numNft,
                depositAmt,
                JSON.stringify(obj),
                fee,
                nft_self.mod.publicKey
            );
            console.log("createBoundTransaction:", newtx);
            await newtx.sign();
            await nft_self.app.network.propagateTransaction(newtx);
            console.log("propagateTransaction:", newtx);
            

            setTimeout(async function(){
                let nft_list = await nft_self.app.wallet.getNftList();            
                console.log("Fetched NFT list: ", nft_list);

                const nftArray    = JSON.parse(nft_list); 
                await nft_self.app.wallet.saveNftList(nftArray);

                console.log("Updated wallet nft list: ", nft_self.app.options.wallet.nft);

                salert("NFT created successfully!");
            }, 2000);

            nft_self.nft.image = "";
            nft_self.overlay.close();

        };



    }


     async findValidUtxo(depositAmt = 1) {
        this.utxo = await this.fetchUtxo();

        console.log("utxos:", this.utxo);

        let html = ``;
        for (let i = 0; i < this.utxo.length; i++) {

            let utxo = this.utxo[i];
            let block_id = utxo[1];
            let tx_ordinal = utxo[2];
            let slip_index = utxo[3];
            let amount = BigInt(utxo[4]);
       

            if (amount >= depositAmt) {
                return {
                    bid: block_id, 
                    tid: tx_ordinal, 
                    sid: slip_index, 
                    amt: amount
                };
            }
        }

        return {};
    }


    async fetchUtxo(){
        let publicKey = this.mod.publicKey;        
        let response = await fetch('/balance/' + publicKey);
        let data = await response.text();

        // slip.public_key = key[0..33].to_vec().try_into().unwrap();
        // slip.block_id = u64::from_be_bytes(key[33..41].try_into().unwrap());
        // slip.tx_ordinal = u64::from_be_bytes(key[41..49].try_into().unwrap());
        // slip.slip_index = key[49];
        // slip.amount

        const parts = data.split('.snap');
        let utxo =  parts[1].trim().split(/\n|\s{2,}/)
                    .filter(line => line.trim() !== '')
                    .map(line => line.split(' '));
        return utxo;
    }


    addImage(data="" ) {
        let fileInfo = this.parseFileInfo(data);

        let nft_self = this;
        let html = ``;
        if (fileInfo.isImage) {
            html = `<div class="nft-image-preview">
                      <img style="max-height: inherit; max-width: inherit; height: inherit; width: inherit" src="${data}"/>
                      <i class="fa fa-times" id="rmv-nft"></i>
                    </div>`;
        } else {
            html = `
                <div class="nft-file-transfer">
                    <div class="file-transfer-progress"></div>
                    <i class="fa-solid fa-file-export"></i>
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-size fixed-width">${(fileInfo.size)/1024} KB</div>
                    <i class="fa fa-times" id="rmv-nft"></i>
                </div>
            `;
        }

                            
        this.app.browser.addElementToSelector(html, ".textarea-container");
        document.querySelector('#nft-image-upload').style.display = 'none';    

        if (document.querySelector('#rmv-nft')) {
            document.querySelector('#rmv-nft').onclick = async (e) => {
                if (document.querySelector(".nft-image-preview")) {
                    document.querySelector(".nft-image-preview").remove();
                } 

                if (document.querySelector(".nft-file-transfer")) {
                    document.querySelector(".nft-file-transfer").remove();
                }

                document.querySelector('#nft-image-upload').style.display = 'block';  
                nft_self.nft.image = "";
            };
        }       
    }


    parseDataUri(dataUri) {
      const [header, data] = dataUri.split(',', 2);
      if (!header.startsWith('data:')) {
        throw new Error('Not a valid data URI');
      }
      // strip leading "data:"
      const parts = header.slice(5).split(';');
      const mediaType = parts[0] || '';
      const params = {};
      for (let i = 1; i < parts.length; i++) {
        const [key, val] = parts[i].split('=');
        // treat bare "base64" as a boolean flag
        params[key] = val === undefined ? '' : val;
      }
      return { mediaType, params, data };
    }

    extractMediaType(dataUri) {
      try {
        return this.parseDataUri(dataUri).mediaType || null;
      } catch {
        return null;
      }
    }

    extractExtension(dataUri) {
      const mediaType = this.extractMediaType(dataUri);
      if (!mediaType) return null;
      const parts = mediaType.split('/');
      if (parts.length !== 2) return null;
      // drop any "+suffix" (e.g. "svg+xml" → "svg")
      return parts[1].split('+')[0].toLowerCase();
    }

    extractFileName(dataUri) {
      try {
        const { params } = this.parseDataUri(dataUri);
        // look for either "name" or "filename"
        const fname = params.name || params.filename;
        if (fname) return fname;
        const ext = this.extractExtension(dataUri) || 'bin';
        return `file.${ext}`;
      } catch {
        return null;
      }
    }

    getFileSizeFromDataUri(dataUri) {
      try {
        const base64 = this.parseDataUri(dataUri).data;
        // count padding characters ("=" at end)
        const paddingMatches = base64.match(/=+$/);
        const padding = paddingMatches ? paddingMatches[0].length : 0;
        // formula: bytes = 3/4 * length_of_base64 - padding
        return Math.round((base64.length * 3) / 4 - padding);
      } catch {
        return null;
      }
    }

    isImageDataUri(dataUri) {
      const mt = this.extractMediaType(dataUri);
      return mt !== null && mt.startsWith('image/');
    }

    parseFileInfo(dataUri) {
      return {
        mediaType: this.extractMediaType(dataUri),
        extension: this.extractExtension(dataUri),
        name: this.extractFileName(dataUri),
        size: this.getFileSizeFromDataUri(dataUri),
        isImage: this.isImageDataUri(dataUri),
      };
    }
}

module.exports = Nft;

