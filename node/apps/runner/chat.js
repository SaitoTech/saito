const ModTemplate = require('../../lib/templates/modtemplate');
const Chat = require('../../mods/chat/chat');
const Transaction = require('../../lib/saito/transaction').default;
const secp256k1 = require('secp256k1');

// A Chat client in a native SPV process. Reuse Chat's group IDs, encryption and
// signed sends, but do not initialize its browser UI or advertise a chat server.
class RunnerChat extends ModTemplate {
  constructor(app) {
    super(app);
    this.name = 'Chat';
    this.groups = [];
    this.communityGroupName = 'Saito Community Chat';
    this.communityGroup = null;
    this.messages = [];
    this.seen = new Set();
    this.history = [];
  }

  async onPeerServiceUp(app, peer, service) {
    if (service.service !== 'chat') return;
    this.peer = peer.publicKey;
    this.communityGroup = this.returnOrCreateChatGroupFromMembers([this.peer], this.communityGroupName);
    this.communityGroup.members = [this.peer];
    this.refreshHistory();
  }

  refreshHistory() {
    if (!this.peer) return;
    this.app.network.sendRequestAsTransaction('chat history', {
      request: 'chat history', group_id: this.communityGroup.id, timestamp: 0
    }, rows => {
      if (Array.isArray(rows)) this.history = rows.slice(-1000).filter(r =>
        Array.isArray(r.from) && Number.isFinite(r.timestamp));
      // History rows are server summaries, not signed transactions. They can
      // establish presence in Community Chat, never permission to join a game.
    }, this.peer);
  }

  async handlePeerTransaction(app, tx) {
    if (tx?.returnMessage().request === 'chat relay') {
      await this.receive(new Transaction(undefined, tx.returnMessage().data));
    } else if (tx) await this.receive(tx);
    return 0;
  }

  async onConfirmation(blk, tx, conf) {
    if (Number(conf) === 0) await this.receive(tx);
  }

  async receive(tx) {
    try {
      const sender = tx.from[0]?.publicKey;
      if (!sender || sender === this.publicKey || this.seen.has(tx.signature)) return;
      tx.generateHashForSignature();
      if (!secp256k1.verify(Buffer.from(tx.getHashForSignature()), Buffer.from(tx.signature, 'hex'),
        Buffer.from(this.app.crypto.fromBase58(sender), 'hex'))) return;
      // Read signed bytes, not an unsigned JSON object's cached msg/dmsg fields.
      tx.msg = {}; tx.dmsg = ''; tx.unpackData();
      await tx.decryptMessage(this.app);
      const m = tx.returnMessage();
      if (m.module !== 'Chat' || m.request !== 'chat message' || typeof m.message !== 'string') return;
      const community = m.group_id === this.communityGroup?.id;
      const direct = tx.isTo(this.publicKey) && m.group_id === this.createGroupIdFromMembers([sender, this.publicKey]);
      if (!community && !direct) return;
      this.seen.add(tx.signature);
      if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
      this.messages.push({ sender, channel: community ? 'community' : 'direct',
        text: m.message, timestamp: tx.timestamp, signature: tx.signature });
      if (this.messages.length > 1000) this.messages.shift();
    } catch (_) { /* Malformed or undecryptable remote messages are not consent. */ }
  }

  presentSince(host, timestamp) {
    return this.history.some(r => r.from.includes(host) && r.timestamp >= timestamp) ||
      this.messages.some(m => m.channel === 'community' && m.sender === host && m.timestamp >= timestamp);
  }

  async send(host, channel, text) {
    const group = channel === 'community' ? this.communityGroup :
      this.returnOrCreateChatGroupFromMembers([this.publicKey, host]);
    if (!group) return false;
    const tx = await this.createChatTransaction(group.id, text, channel === 'community' ? [host] : []);
    if (!tx) throw Error('Chat could not create invitation message');
    return true;
  }
}

for (const method of ['createGroupIdFromMembers', 'returnOrCreateChatGroupFromMembers',
  'returnGroup', 'returnMembers', 'createChatTransaction']) {
  RunnerChat.prototype[method] = Chat.prototype[method];
}
module.exports = RunnerChat;
