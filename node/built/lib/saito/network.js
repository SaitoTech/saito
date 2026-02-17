"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const saito_1 = __importDefault(require("saito-js/saito"));
const peer_service_1 = __importDefault(require("saito-js/lib/peer_service"));
class Network {
    constructor(app) {
        this.callbacks = [];
        this.app = app;
    }
    initialize() {
        console.debug('[DEBUG] initialize network');
    }
    async propagateTransaction(tx) {
        return saito_1.default.getInstance().propagateTransaction(tx);
    }
    async getPeers() {
        return saito_1.default.getInstance().getPeers();
    }
    async getPeer(index) {
        return saito_1.default.getInstance().getPeer(index);
    }
    async sendRequest(message, data = '', callback, peer = null, signature_required = false) {
        let buffer = Buffer.from(JSON.stringify(data), 'utf-8');
        return saito_1.default.getInstance().sendRequest(message, data, callback, peer ? peer.peerIndex : undefined, signature_required);
    }
    /**
     * Data you provide to callback is put inside the msg field of a transaction
     */
    async sendTransactionWithCallback(transaction, callback, peerIndex) {
        return saito_1.default.getInstance().sendTransactionWithCallback(transaction, callback, peerIndex);
    }
    /*
    You don't need to await this function, but it will pass back any return value
    from the callback you provide (hopefully)
    */
    async sendRequestAsTransaction(message, data = '', callback, peerIndex, signature_required) {
        return saito_1.default.getInstance().sendRequest(message, data, callback, peerIndex, signature_required);
    }
    close() { }
    async addStunPeer(public_key, peerConnection) {
        await saito_1.default.getInstance().addStunPeer(public_key, peerConnection);
    }
    initializeStun() {
        throw new Error('not implemented');
    }
    returnPeersWithService() { }
    createPeerService(data, service, name, domain) {
        let ps = new peer_service_1.default(data, service, name, domain);
        return ps;
    }
    getServices() {
        let my_services = [];
        for (let i = 0; i < this.app.modules.mods.length; i++) {
            let module = this.app.modules.mods[i];
            let modservices = module.returnServices();
            for (let k = 0; k < modservices.length; k++) {
                my_services.push(modservices[k]);
            }
        }
        return my_services;
    }
}
exports.default = Network;
//# sourceMappingURL=network.js.map