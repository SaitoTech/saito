import Transaction from './transaction';
import Peer from './peer';
import S from 'saito-js/saito';
import { Saito } from '../../apps/core';
import PeerService from 'saito-js/lib/peer_service';

export default class Network {
  callbacks = [];
  app: Saito;

  constructor(app: Saito) {
    this.app = app;
  }

  initialize() {
    console.debug('[DEBUG] initialize network');
  }

  public async propagateTransaction(tx: Transaction) {
    return S.getInstance().propagateTransaction(tx);
  }

  public async getPeers(): Promise<Array<Peer>> {
    return S.getInstance().getPeers();
  }

  public async getPeer(index: bigint): Promise<Peer> {
    return S.getInstance().getPeer(index);
  }

  public async sendRequest(
    message: string,
    data: any = '',
    callback: null,
    peer: Peer = null,
    signature_required = false
  ) {
    let buffer = Buffer.from(JSON.stringify(data), 'utf-8');
    return S.getInstance().sendRequest(
      message,
      data,
      callback,
      peer ? peer.peerIndex : undefined,
      signature_required
    );
  }

  /**
   * Data you provide to callback is put inside the msg field of a transaction
   */
  public async sendTransactionWithCallback(
    transaction: Transaction,
    callback?: any,
    peerIndex?: bigint
  ) {
    return S.getInstance().sendTransactionWithCallback(transaction, callback, peerIndex);
  }

  /*
  You don't need to await this function, but it will pass back any return value
  from the callback you provide (hopefully)
  */
  public async sendRequestAsTransaction(
    message: string,
    data: any = '',
    callback?: any,
    peerIndex?: bigint,
    signature_required?: boolean
  ) {
    return S.getInstance().sendRequest(message, data, callback, peerIndex, signature_required);
  }

  public close() {}

  async addStunPeer(public_key, peerConnection) {
    await S.getInstance().addStunPeer(public_key, peerConnection);
  }

  initializeStun() {
    throw new Error('not implemented');
  }

  returnPeersWithService() {}

  createPeerService(data, service, name, domain) {
    let ps = new PeerService(data, service, name, domain);
    return ps;
  }

  public getServices(): PeerService[] {
    let my_services = [];
    for (let i = 0; i < this.app.modules.mods.length; i++) {
      let module = this.app.modules.mods[i];
      let modservices: PeerService[] = module.returnServices();
      for (let k = 0; k < modservices.length; k++) {
        my_services.push(modservices[k]);
      }
    }
    return my_services;
  }
}
