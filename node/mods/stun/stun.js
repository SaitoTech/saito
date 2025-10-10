const Transaction = require('../../lib/saito/transaction').default;
const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;

/***
 *  A generic utility for creating stun connections that other modules can use
 *  API is a combination of respondTo and event space
 *
 * Will emit (with publicKey of peer):
 *  'stun-new-peer-connection'
 *
 * 	'stun-connection-connected' --- when you have created the basic stun connection (for media streaming)
 *  'stun-connection-failed'
 *  'stun-data-channel-open'
 *  'stun-data-channel-close'
 *  'stun-update-connection-message'
 *
 *  'stun-track-event'
 *
 * 	Your modules can set a listener for these and process accordingly
 */

class Stun extends ModTemplate {
	constructor(app) {
		super(app);
		this.app = app;
		this.name = 'Stun';
		this.slug = 'stun';
		this.description = 'P2P Connection Module';
		this.categories = 'Utilities Communications';
		this.class = 'utility';
		this.servers = [
			{
				urls: 'turn:stun-sf.saito.io:3478',
				username: 'guest',
				credential: 'somepassword'
			},
			{
				urls: 'turn:stun-sg.saito.io:3478',
				username: 'guest',
				credential: 'somepassword'
			},
			{
				urls: 'turn:stun-de.saito.io:3478',
				username: 'guest',
				credential: 'somepassword'
			}

			// Firefox gives a warning if you provide more than two servers and
			// throws an error if you use 5 or more.
			// is it redundant to have both turn and stun on the same server, since
			//
			// " TURN (Traversal Using Relay NAT) is the more advanced solution that incorporates
			// the STUN protocols and most commercial WebRTC based services use a TURN server
			// for establishing connections between peers. "

			/*{
        urls: "stun:stun-sf.saito.io:3478",
      },
      {
        urls: "stun:stun-sg.saito.io:3478",
      },
      {
        urls: "stun:stun-de.saito.io:3478",
      },*/
		];

		this.peers = new Map();

		this.noloop = []; // array of failed/timedout peer publickeys, so we don't repeat ad infinitum

		// app.connection.on("stun-data-channel-open", async (publicKey) => {

		// 	 await this.app.network.addStunPeer(publicKey, this.peers.get(publicKey))

		// });

		app.connection.on('stun-connection-connected', (publicKey) => {
			//await this.app.network.addStunPeer(publicKey, this.peers.get(publicKey))
			siteMessage(`Opened stun connection with ${app.keychain.returnUsername(publicKey)}`, 2000);
		});

		app.connection.on('stun-data-channel-close', (publicKey) => {
			siteMessage(`Closed stun connection with ${app.keychain.returnUsername(publicKey)}`, 2000);
		});

		app.connection.on('stun-connection-failed', async (peerId, callback) => {
			let c = await sconfirm(
				`STUN: connection failed -- ${app.keychain.returnUsername(peerId)}. Keep trying?`
			);
			if (c) {
				this.createPeerConnection(peerId, callback);
			} else {
				// Notify the module UI that we have given up connecting
				app.connection.emit('stun-connection-close', peerId);
				console.error('STUN: failed connections-- ', this.noloop);
			}
		});

		app.connection.on('stun-connection-timeout', async (peerId, delay, callback) => {
			console.warn('STUN: connection timeout', peerId);
			let peerConnection = this.peers.get(peerId);
			let c = null;
			if (peerConnection) {
				c = await sconfirm(
					`STUN: connection timed out -- ${app.keychain.returnUsername(peerId)} might not be online. Keep waiting?`
				);
			}
			if (c) {
				this.createPeerConnection(peerId, callback);
				delay *= 2;
				peerConnection.timer = setTimeout(() => {
					if (!this.hasConnectionWithPeer(peerId)) {
						app.connection.emit('stun-connection-timeout', peerId, delay, callback);
					} else {
						console.warn('Stun: peerConnection timer expired but we have a connection...');
					}
				}, delay);
			} else {
				// Notify the module UI that we have given up connecting
				app.connection.emit('stun-connection-close', peerId);
				console.error('STUN: failed connections-- ', this.noloop);
			}
		});
	}

	respondTo(type, obj) {
		let stun_self = this;

		if (type === 'peer-manager') {
			return {
				hasConnection: (peerId, any_status = false) => {
					if (any_status) {
						if (this.peers.has(peerId)) {
							let pc = this.peers.get(peerId);
							if (pc.connectionState == 'failed' || pc.connectionState == 'disconnected') {
								return false;
							}
							return true;
						}
					} else {
						return this.hasConnection(peerId);
					}
					return false;
				},
				sendTransaction: (peerId, tx) => {
					this.sendTransaction(peerId, tx);
				},

				// For the API, it isn't enough for one party to create a peer connection, so if you don't
				// provide a callback, it uses the sendJoinTransaction to message your peer and have them
				// create a peer connection on their end, it is akin to texting your friend to say call me.
				// This is good for most data channel set ups, but if you need more control over who messages
				// who when you can get around this by setting the callback deliberately to false. (i.e. my friend
				// has texted me and it is on me to call them)
				createPeerConnection: (peerId, callback = null) => {
					//
					// send ready message to peer, so if they want to create the channel, we are receptive
					//
					if (callback == null) {
						console.debug('STUN API: Create dummy callback for joinTransaction');
						callback = (peerId) => {
							this.sendJoinTransaction(peerId);
						};
					} else if (!callback) {
						console.debug(
							'STUN API: We are intentionally not setting a callback in the stun connection API'
						);
					}

					if (Array.isArray(peerId)) {
						peerId.forEach((peer) => this.createPeerConnection(peer, callback));
					} else {
						this.createPeerConnection(peerId, callback);
					}
				},
				removePeerConnection: (peerId) => {
					this.removePeerConnection(peerId);
				},
				peers: this.peers
			};
		}

		if (type === 'user-menu') {
			if (!obj?.publicKey || obj.publicKey == this.publicKey) {
				return null;
			}

			if (!this.hasConnectionWithPeer(obj.publicKey)) {
				return {
					text: 'Upgrade Connection',
					icon: 'fa-solid fa-bolt-lightning',
					callback: function (app, public_key) {
						stun_self.createPeerConnection(public_key, () => {
							stun_self.sendJoinTransaction(public_key);
						});
					}
				};
			} else {
				return {
					text: 'Downgrade Connection',
					icon: 'fa-solid fa-shield-cat',
					callback: async function (app, public_key) {
						let newtx = await app.wallet.createUnsignedTransactionWithDefaultFee(public_key);

						newtx.msg = {
							module: 'Stun',
							request: 'peer-left'
						};

						await newtx.sign();

						app.connection.emit('relay-transaction', newtx);

						setTimeout(() => {
							stun_self.removePeerConnection(public_key);
						}, 500);
					}
				};
			}
		}

		return null;
	}

	// Dummy functions for testing stun-data-channel upgrade to PEER object
	returnServices() {
		let services = [];
		if (this.app.BROWSER == 1) {
			services.push(new PeerService(null, 'stun-test'));
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (service.service === 'stun-test') {
			if (this.hasConnection(peer.publicKey)) {
				console.info('STUN PEER UPGRADE SUCCESS!!!! ' + peer.publicKey);
				app.keychain.addKey(peer.publicKey, { lastUpdate: Date.now() });
			}
		}
	}

	hasConnection(peerId) {
		if (Array.isArray(peerId)) {
			if (peerId.length == 0) {
				return false;
			}
			let answer = true;
			for (let peer of peerId) {
				if (!this.hasConnectionWithPeer(peer)) {
					return false;
				}
			}
			return answer;
		} else {
			return this.hasConnectionWithPeer(peerId);
		}
	}

	hasConnectionWithPeer(peerId) {
		let peerConnection = this.peers.get(peerId);
		if (peerConnection) {
			if (peerConnection?.dc) {
				if (peerConnection.connectionState == 'connected') {
					if (peerConnection.dc.readyState == 'open') {
						return true;
					}
				}
			}
		}

		return false;
	}

	sendTransaction(peerId, tx) {
		if (!this.hasConnectionWithPeer(peerId)) {
			console.warn('Stun: cannot send transaction over stun');
			return;
		}

		try {
			let peerConnection = this.peers.get(peerId);
			peerConnection.dc.send(tx.serialize_to_web(this.app));
		} catch (err) {
			console.error('Stun sendTransaction ERROR:', err);
		}
	}

	async onConfirmation(blk, tx, conf) {
		if (tx == null) {
			return;
		}

		let message = tx.returnMessage();

		if (Number(conf) == 0) {
			if (message.module === 'Stun') {
				if (this.app.BROWSER === 1) {
					if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
						if (this.hasSeenTransaction(tx, Number(blk.id))) return;
						await this.handleSignalingMessage(tx.from[0].publicKey, message.request, message);
					}

					if (message.request == 'peer-joined') {
						if (tx.isFrom(this.publicKey)) {
							console.log('STUN: onConfirmation', message);
							let peerId = tx.to[0].publicKey;
							let peerConnection = this.peers.get(peerId);
							if (peerConnection) {
								//
								// This handles the renegotiation for adding/droping media streams
								// However, need to further study "perfect negotiation" with polite/impolite peers
								//
								peerConnection.onnegotiationneeded = async () => {
									try {
										if (!peerConnection?.negotiation_counter) {
											peerConnection.negotiation_counter = 0;
										}
										console.log('STUN: Negotation needed, ', peerConnection.negotiation_counter);

										if (peerConnection.negotiation_counter > 10) {
											console.warn(`STUN: Negotation needed, but going to cool off instead`);
											peerConnection.negotiation_timeout = setTimeout(() => {
												peerConnection.negotiation_counter = 0;
											}, 12000);
											return;
										}

										peerConnection.negotiation_counter++;
										peerConnection.makingOffer = true;

										if (peerConnection?.negotiation_timeout) {
											clearTimeout(peerConnection.negotiation_timeout);
										}

										await peerConnection.setLocalDescription();

										await this.sendPeerDescriptionTransaction(
											peerId,
											peerConnection.localDescription
										);
									} catch (err) {
										console.error('STUN offer ERROR:', err);
									} finally {
										peerConnection.makingOffer = false;
									}
								};

								if (peerConnection.connectionState !== 'connected') {
									console.log(
										'STUN: setting connection timer with on chain confirmation that my peer join transaction was sent'
									);
									peerConnection.timer = setTimeout(() => {
										if (!this.hasConnectionWithPeer(peerId)) {
											this.app.connection.emit(
												'stun-connection-timeout',
												peerId,
												5000,
												this.callback
											);
										} else {
											console.warn(
												'Stun: peerConnection timer expired but we have a connection...'
											);
										}
									}, 10000);
								}
							}
						}
					}
				}
			}
		}
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {
		if (tx == null) {
			return;
		}
		let txmsg = tx.returnMessage();

		if (txmsg.module !== this.name) {
			return;
		}

		if (this.app.BROWSER === 1) {
			if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
				if (this.hasSeenTransaction(tx)) return;

				await this.handleSignalingMessage(tx.from[0].publicKey, txmsg.request, txmsg);
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	async handleSignalingMessage(sender, request, data) {
		//
		// Stun metadata messages
		//
		if (request == 'peer-joined') {
			console.debug('Stun: Peer joined (requested a connection)');
			this.createPeerConnection(sender);
			return;
		}

		if (request == 'peer-left') {
			console.debug('Stun: Peer left (close the connection)');
			this.removePeerConnection(sender);
			return;
		}
		if (request == 'peer-kicked') {
			console.debug('Stun: Peer kicked out (close the connection)');
			this.removePeerConnection(sender);
			return;
		}

		let peerConnection = this.peers.get(sender);

		if (!peerConnection) {
			console.warn(
				`Stun: Receiving signalling messages for a non-peer connection [${sender}], peers: `,
				this.peers.keys()
			);
			return;
		}

		// Stun protocol messages
		if (request == 'peer-description') {
			let description = data.description;
			try {
				const readyForOffer =
					!peerConnection?.makingOffer &&
					(peerConnection.signalingState == 'stable' || peerConnection?.answerPending);

				const offerCollision = description.type === 'offer' && !readyForOffer;

				peerConnection.ignoreOffer = offerCollision && peerConnection?.rude;

				if (peerConnection.ignoreOffer) {
					console.debug('STUN: Impolite peer ignores offer collision');
					return;
				}

				peerConnection.answerPending = description.type == 'answer';
				await peerConnection.setRemoteDescription(description);
				peerConnection.answerPending = false;

				if (description.type === 'offer') {
					await peerConnection.setLocalDescription();
					this.sendPeerDescriptionTransaction(sender, peerConnection.localDescription);
				}

				this.peers.set(sender, peerConnection);
			} catch (err) {
				console.error('STUN: failure in peer-offer --- ', err);
				console.debug(
					'STUN: impolite? ',
					peerConnection.rude,
					'signalingState: ',
					peerConnection.signalingState,
					'answerPending: ',
					peerConnection.answerPending,
					'description type: ',
					description.type
				);
			}
			return;
		}

		if (request === 'peer-candidate') {
			try {
				await peerConnection.addIceCandidate(data.iceCandidate);
			} catch (err) {
				if (!peerConnection?.ignoreOffer) {
					console.error('STUN: Error adding remote candidate:', err, data.iceCandidate);
					console.warn(sender, this.publicKey);
				}
			}
			return;
		}

		console.warn('Unknown Stun Peer Transaction!', data);
	}

	//
	// We treat all data channel messages a peer request / peer transaction
	//
	handleDataChannelMessage(data, peerId) {
		let relayed_tx = new Transaction();
		relayed_tx.deserialize_from_web(this.app, data);

		this.app.modules.handlePeerTransaction(relayed_tx);
	}

	async sendJoinTransaction(peer) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

		newtx.msg = {
			module: 'Stun',
			request: 'peer-joined'
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
		this.app.network.propagateTransaction(newtx);
	}

	async sendPeerDescriptionTransaction(peer, description) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

		console.info(
			`STUN: sending offer to ${peer} with peer connection ` + this.peers.get(peer).signalingState,
			description.type
		);

		newtx.msg = {
			module: 'Stun',
			request: 'peer-description',
			description
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
		this.app.network.propagateTransaction(newtx);
	}

	async sendIceCandidateTransaction(peer, candidate) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(peer);

		newtx.msg = {
			module: 'Stun',
			request: 'peer-candidate',
			iceCandidate: candidate
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
		this.app.network.propagateTransaction(newtx);
	}

	restoreConnection(peerId, pathway, callback) {
		this.removePeerConnection(peerId);
		if (!this.noloop.includes(peerId)) {
			if (callback) {
				console.info('Attempt STUN reconnection once');
				setTimeout(() => {
					this.createPeerConnection(peerId, callback);
				}, 500);
				this.noloop.push(peerId);
			}
		} else {
			console.warn('STUN reconnection attempt failed after two tries, give up!');
			this.app.connection.emit(pathway, peerId, callback);

			for (let i = 0; i < this.noloop.length; i++) {
				if (this.noloop[i] == peerId) {
					this.noloop.splice(i, 1);
					break;
				}
			}
		}
	}

	createPeerConnection(peerId, callback = null) {
		console.info(
			'STUN/TALK: Create Peer Connection with ' + peerId + ` and ${callback ? 'a' : 'no'} callback`,
			this.noloop
		);

		if (peerId === this.publicKey) {
			console.warn('STUN/TALK: Attempting to create a peer Connection with myself!');
			console.trace();
			return 0;
		}

		if (this.peers.get(peerId)) {
			let pc = this.peers.get(peerId);

			console.debug(
				`STUN/TALK: ${peerId} already in stun peer list`,
				'Status: ' + pc.connectionState
			);

			if (pc.timer) {
				console.debug('STUN/TALK: cancelling a timeout for new connection round...');
				//cancel timer if any activity on connectionstate
				clearTimeout(pc.timer);
				delete this.callback;
				delete pc.timer;
			}

			//If not a solid connection state..., delete and try again
			if (pc.connectionState == 'failed' || pc.connectionState == 'disconnected') {
				console.warn('STUN/TALK: old peer has broken connection, reestablish...');
				this.restoreConnection(peerId, 'stun-connection-failed', callback);
				return;
			}
			if (pc.connectionState == 'new' || pc.connectionState == 'connecting') {
				console.warn(
					"STUN/TALK: Repeated attempts to create a peer connection... don't do anything else"
				);
				return;
			}

			if (callback) {
				console.debug('STUN/TALK: run peerConnection callback', callback);
				callback(peerId);
			}

			//
			// Assuming you are properly connected, simulate that the connection just came through,
			// so the mods listeners can pick up and do their UI things
			//
			// Todo: this is a mess, should streamline events in stun,
			// the UI components are a little too indebted to the old idiosyncratic logic
			//
			this.app.connection.emit('stun-new-peer-connection', peerId, pc);

			if (pc.connectionState === 'connected') {
				this.app.connection.emit('stun-connection-connected', peerId);
			} else {
				this.app.connection.emit('stun-update-connection-message', peerId, pc.connectionState);
			}

			if (this.hasConnection(peerId)) {
				this.app.connection.emit('stun-data-channel-open', peerId);
			}

			return;
		} else {
			const pc = new RTCPeerConnection({
				iceServers: this.servers
			});

			// use string compare of public keys rather than presence or absence of callback
			// to determine who will be impolite in any pairing because we may be simultnaeously attempting
			// to create connections with callbacks for whatever reason
			if (this.publicKey > peerId) {
				console.debug('STUN: I will be impolite to peer: ', peerId);
				pc.rude = true;
			}

			this.peers.set(peerId, pc);

			this.app.connection.emit('stun-new-peer-connection', peerId, pc);
		}

		const peerConnection = this.peers.get(peerId);

		// Handle ICE candidates
		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				console.debug('STUN: receiving ice candidate for ', peerId /*, event.candidate*/);
				await this.sendIceCandidateTransaction(peerId, event.candidate);
			}
		};

		//Receive Remote media
		peerConnection.addEventListener('track', (event) => {
			console.debug('STUN: new track', peerId, event);
			this.app.connection.emit('stun-track-event', peerId, event);
		});

		peerConnection.onconnectionstatechange = () => {
			console.info(`STUN: ${peerId} connectionstatechange -- ` + peerConnection.connectionState);

			//cancel timer if any activity on connectionstate
			clearTimeout(peerConnection.timer);
			delete peerConnection.timer;
			delete this.callback;

			if (
				peerConnection.connectionState === 'failed' ||
				peerConnection.connectionState === 'disconnected'
			) {
				console.debug('STUN: set reconnection timer...');
				let timerAmt = callback ? 9000 : 5000;
				peerConnection.timer = setTimeout(() => {
					if (
						peerConnection.connectionState === 'failed' ||
						peerConnection.connectionState === 'disconnected'
					) {
						siteMessage(`Stun connection failed with ${peerId}`);
						console.debug(`STUN: connection not restored after ${timerAmt / 1000} seconds...`);
						//this.restoreConnection(peerId, 'stun-connection-failed', callback);
					} else {
						console.debug(
							`STUN: connection okay ${peerConnection.connectionState} after timer, don't do anything`
						);
					}
				}, timerAmt);
			}
			if (peerConnection.connectionState === 'connected') {
				this.app.connection.emit('stun-connection-connected', peerId);
			}

			this.app.connection.emit(
				'stun-update-connection-message',
				peerId,
				peerConnection.connectionState
			);
		};

		peerConnection.oniceconnectionstatechange = () => {
			if (peerConnection.iceConnectionState === 'failed') {
				peerConnection.restartIce();
			}
		};

		const dc = peerConnection.createDataChannel('data-channel', { negotiated: true, id: 42 });
		peerConnection.dc = dc;

		dc.onmessage = (event) => {
			this.handleDataChannelMessage(event.data, peerId);
		};

		dc.onopen = (event) => {
			console.info('STUN: Data channel is open');
			this.app.connection.emit('stun-data-channel-open', peerId);
		};

		dc.onclose = (event) => {
			console.info('STUN: Data channel is closed with ' + peerId);
			this.app.connection.emit('stun-data-channel-close', peerId);
		};

		if (callback) {
			this.callback = callback;
			callback(peerId);
		} else {
			//
			// This handles the renegotiation for adding/droping media streams
			// However, need to further study "perfect negotiation" with polite/impolite peers
			//
			peerConnection.onnegotiationneeded = async () => {
				try {
					if (!peerConnection?.negotiation_counter) {
						peerConnection.negotiation_counter = 0;
					}
					console.log('STUN: Negotation needed, ', peerConnection.negotiation_counter);

					if (peerConnection.negotiation_counter > 10) {
						console.warn(`STUN: Negotation needed, but going to cool off instead`);
						peerConnection.negotiation_timeout = setTimeout(() => {
							peerConnection.negotiation_counter = 0;
						}, 12000);
						return;
					}

					peerConnection.negotiation_counter++;
					peerConnection.makingOffer = true;

					if (peerConnection?.negotiation_timeout) {
						clearTimeout(peerConnection.negotiation_timeout);
					}

					await peerConnection.setLocalDescription();

					await this.sendPeerDescriptionTransaction(peerId, peerConnection.localDescription);
				} catch (err) {
					console.error('STUN offer ERROR:', err);
				} finally {
					peerConnection.makingOffer = false;
				}
			};
		}
	}

	//This can get double processed by PeerTransaction and onConfirmation
	//So need safety checks
	removePeerConnection(peerId) {
		const peerConnection = this.peers.get(peerId);
		if (peerConnection) {
			console.info('Stun remove peer connection! ' + peerConnection.connectionState);
			peerConnection.close();
			this.peers.delete(peerId);
		}
	}
}

module.exports = Stun;
