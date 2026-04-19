use crate::core::defs::{PrintForLog, SaitoPublicKey, Timestamp};
use crate::core::network::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::network::peer::Peer;
use ahash::HashMap;
use log::{debug, error, info, trace};
use std::io::Error;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

static PEER_ID_GENERATOR: AtomicU64 = AtomicU64::new(1);
const PEER_REMOVAL_WINDOW: Timestamp = Duration::from_secs(600).as_millis() as Timestamp;
const PEER_STALE_PERIOD: Timestamp = Duration::from_secs(30).as_millis() as Timestamp;

pub fn generate_peer_id() -> u64 {
    PEER_ID_GENERATOR.fetch_add(1, Ordering::Relaxed)
}

#[derive(Debug, Default)]
pub struct Peers {
    pub peers: HashMap<u64, Peer>,
}

impl<'a> IntoIterator for &'a Peers {
    type Item = &'a Peer;
    type IntoIter = std::collections::hash_map::Values<'a, u64, Peer>;

    fn into_iter(self) -> Self::IntoIter {
        self.peers.values()
    }
}
impl<'a> IntoIterator for &'a mut Peers {
    type Item = &'a mut Peer;
    type IntoIter = std::collections::hash_map::ValuesMut<'a, u64, Peer>;

    fn into_iter(self) -> Self::IntoIter {
        self.peers.values_mut()
    }
}
impl IntoIterator for Peers {
    type Item = Peer;
    type IntoIter = std::collections::hash_map::IntoValues<u64, Peer>;

    fn into_iter(self) -> Self::IntoIter {
        self.peers.into_values()
    }
}

impl Peers {
    //
    // Peer API
    //
    pub fn get_peer_by_id_mut(&mut self, peer_id: u64) -> Option<&mut Peer> {
        self.peers.get_mut(&peer_id)
    }

    pub fn get_peer_by_id(&self, peer_id: u64) -> Option<&Peer> {
        self.peers.get(&peer_id)
    }

    pub fn get_peer_by_public_key(&self, public_key: &SaitoPublicKey) -> Option<&Peer> {
        self.peers
            .values()
            .find(|p| p.public_key.as_ref() == Some(public_key))
    }

    pub fn iter(&self) -> impl Iterator<Item = &Peer> {
        self.peers.values()
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut Peer> {
        self.peers.values_mut()
    }

    pub async fn add_stun_peer(
        &mut self,
        peer_id: u64,
        public_key: SaitoPublicKey,
        current_time: Timestamp,
        io_handler: &Box<dyn InterfaceIO + Send + Sync>,
    ) {
        debug!(
            "Registering STUN transport for peer_id={} public_key={}",
            peer_id,
            public_key.to_base58()
        );

        let Some(peer) = self.get_peer_by_id_mut(peer_id) else {
            error!(
                "Failed to register STUN transport: unknown peer_id={} public_key={}",
                peer_id,
                public_key.to_base58()
            );
            return;
        };

        if let Some(existing_key) = peer.public_key {
            if existing_key != public_key {
                error!(
                    "peer_id={} already bound to different key {} (incoming {})",
                    peer_id,
                    existing_key.to_base58(),
                    public_key.to_base58()
                );
                return;
            }
        }

        peer.on_stun_connect(public_key, current_time);
        io_handler.send_interface_event(InterfaceEvent::StunPeerConnected(public_key));
    }

    pub async fn remove_stun_peer(
        &mut self,
        peer_id: u64,
        public_key: SaitoPublicKey,
        io_handler: &Box<dyn InterfaceIO + Send + Sync>,
    ) {
        debug!(
            "Removing STUN transport binding for peer_id={} public_key={}",
            peer_id,
            public_key.to_base58()
        );

        let Some(peer) = self.get_peer_by_id_mut(peer_id) else {
            error!(
                "Failed to remove STUN transport: unknown peer_id={} public_key={}",
                peer_id,
                public_key.to_base58()
            );
            return;
        };

        // Safety check only; do not remove the peer object.
        if let Some(existing_key) = peer.public_key {
            if existing_key != public_key {
                error!(
                    "peer_id={} key mismatch on STUN remove: existing={} incoming={}",
                    peer_id,
                    existing_key.to_base58(),
                    public_key.to_base58()
                );
                return;
            }
        }

        io_handler.send_interface_event(InterfaceEvent::StunPeerDisconnected(public_key));
    }

    //
    // LEGACY FUNCTIONS BELOW
    //
    pub async fn set_peer_key_list(
        &mut self,
        peer_id: u64,
        key_list: Vec<SaitoPublicKey>,
    ) -> Result<(), Error> {
        trace!(
            "handler received key list of length : {:?} from peer : {:?}",
            key_list.len(),
            peer_id
        );

        if let Some(peer) = self.get_peer_by_id_mut(peer_id) {
            peer.key_list = key_list;
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn remove_disconnected_peers(&mut self, current_time: Timestamp) {
        let peer_ids: Vec<u64> = self
            .peers
            .iter()
            .filter_map(|(id, peer)| {
                if peer.is_connected {
                    return None;
                }

                // Skip static peers (have URL)
                if peer.url.is_some() {
                    return None;
                }

                // Remove peers inactive beyond window
                if peer.last_activity_at + PEER_REMOVAL_WINDOW < current_time {
                    return Some(*id);
                }

                None
            })
            .collect();

        for peer_id in peer_ids {
            self.peers.remove(&peer_id);
        }
    }

    pub async fn disconnect_stale_peers(
        &mut self,
        current_time: Timestamp,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) {
        trace!(
            "disconnecting stale peers out of {:?} peers",
            self.peers.len()
        );
        // --- Phase 1: collect stale peer_ids ---
        let mut stale_peer_ids: Vec<u64> = Vec::new();
        for peer in self.peers.values() {
            if peer.is_connected && peer.last_message_at + PEER_STALE_PERIOD < current_time {
                if let Some(pk) = peer.public_key {
                    trace!(
                        "peer {:?} (id={}) is stale (last_message_at = {:?}, now = {:?})",
                        pk.to_base58(),
                        peer.id,
                        peer.last_message_at,
                        current_time
                    );
                } else {
                    trace!(
                        "peer id={} is stale (last_message_at = {:?}, now = {:?})",
                        peer.id,
                        peer.last_message_at,
                        current_time
                    );
                }
                stale_peer_ids.push(peer.id);
            }
        }
        // --- Phase 2: apply disconnect ---
        for peer_id in stale_peer_ids {
            info!("disconnecting stale peer_id : {:?}", peer_id);
            // update peer state
            if let Some(peer) = self.get_peer_by_id_mut(peer_id) {
                peer.on_disconnect(current_time);
            }
            // IO disconnect by peer_id
            if let Err(err) = io_handler.disconnect_from_peer(peer_id).await {
                error!(
                    "failed disconnecting stale peer_id {:?}: {:?}",
                    peer_id, err
                );
            }
        }
    }

    pub fn print_current_peers(&self) {
        self.peers.values().for_each(|peer| {
            if let Some(pk) = peer.public_key {
                debug!(
                    "peer : {:?} endpoint : {:?} connected : {:?}",
                    pk.to_base58(),
                    peer.endpoint,
                    peer.is_connected
                );
            }
        });
    }
}
