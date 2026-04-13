use crate::core::defs::{PrintForLog, SaitoPublicKey, Timestamp};
use crate::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::routing::peers::congestion_controller::{
    CongestionType, PeerCongestionControls, PeerCongestionStatus,
};
use crate::core::routing::peers::peerv2::PeerV2;
use crate::core::routing::peers::service::Service;
use ahash::HashMap;
use log::{debug, error, info, trace, warn};
use std::io::Error;
use std::time::Duration;

const PEER_REMOVAL_WINDOW: Timestamp = Duration::from_secs(600).as_millis() as Timestamp;
const PEER_STALE_PERIOD: Timestamp = Duration::from_secs(30).as_millis() as Timestamp;

#[derive(Debug, Default)]
pub struct Peers {
    pub congestion_controls_by_key: HashMap<SaitoPublicKey, PeerCongestionControls>,
    pub congestion_controls_by_ip: HashMap<String, PeerCongestionControls>,
    pub peers_v2: HashMap<u64, PeerV2>,
}

impl<'a> IntoIterator for &'a Peers {
    type Item = &'a PeerV2;
    type IntoIter = std::collections::hash_map::Values<'a, u64, PeerV2>;

    fn into_iter(self) -> Self::IntoIter {
        self.peers_v2.values()
    }
}
impl<'a> IntoIterator for &'a mut Peers {
    type Item = &'a mut PeerV2;
    type IntoIter = std::collections::hash_map::ValuesMut<'a, u64, PeerV2>;

    fn into_iter(self) -> Self::IntoIter {
        self.peers_v2.values_mut()
    }
}
impl IntoIterator for Peers {
    type Item = PeerV2;
    type IntoIter = std::collections::hash_map::IntoValues<u64, PeerV2>;

    fn into_iter(self) -> Self::IntoIter {
        self.peers_v2.into_values()
    }
}

impl Peers {
    //
    // PEER V2 REFACTOR API
    //
    pub fn get_peer_by_public_key_mut(
        &mut self,
        public_key: &SaitoPublicKey,
    ) -> Option<&mut PeerV2> {
        self.peers_v2
            .values_mut()
            .find(|p| p.public_key.as_ref() == Some(public_key))
    }

    pub fn get_peer_by_id_mut(&mut self, peer_id: u64) -> Option<&mut PeerV2> {
        self.peers_v2.get_mut(&peer_id)
    }

    pub fn get_peer_by_public_key(&self, public_key: &SaitoPublicKey) -> Option<&PeerV2> {
        self.peers_v2
            .values()
            .find(|p| p.public_key.as_ref() == Some(public_key))
    }

    pub fn get_peer_by_id(&self, peer_id: u64) -> Option<&PeerV2> {
        self.peers_v2.get(&peer_id)
    }

    pub fn remove_peer_by_public_key(&mut self, public_key: &SaitoPublicKey) {
        if let Some(peer_id) = self.peers_v2.iter().find_map(|(id, p)| {
            if p.public_key.as_ref() == Some(public_key) {
                Some(*id)
            } else {
                None
            }
        }) {
            self.peers_v2.remove(&peer_id);
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = &PeerV2> {
        self.peers_v2.values()
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut PeerV2> {
        self.peers_v2.values_mut()
    }




    //
    // LEGACY FUNCTIONS BELOW
    //
    pub async fn handle_new_stun_peer(
        &mut self,
        public_key: SaitoPublicKey,
        current_time: Timestamp,
        io_handler: &Box<dyn InterfaceIO + Send + Sync>,
    ) {
        debug!(
            "Adding STUN peer with public key: {}",
            public_key.to_base58()
        );

        if self.get_peer_by_public_key(&public_key).is_some() {
            error!(
                "Failed to add STUN peer: Peer with key {} already exists",
                public_key.to_base58()
            );
            return;
        }

        let peer_id = current_time;
        let mut peer_v2 = PeerV2::new(peer_id);
        peer_v2.on_stun_connect(public_key, current_time);

        self.peers_v2.insert(peer_id, peer_v2);

        debug!("STUN peer added successfully");

        io_handler.send_interface_event(InterfaceEvent::StunPeerConnected(public_key));
    }

    pub async fn update_peer_timer(&mut self, public_key: SaitoPublicKey, current_time: Timestamp) {
        if let Some(peer_v2) = self.get_peer_by_public_key_mut(&public_key) {
            peer_v2.last_message_at = current_time;
        }
    }
    pub async fn handle_received_key_list(
        &mut self,
        public_key: SaitoPublicKey,
        key_list: Vec<SaitoPublicKey>,
        current_time: Timestamp,
    ) -> Result<(), Error> {
        trace!(
            "handler received key list of length : {:?} from peer : {:?}",
            key_list.len(),
            public_key.to_base58()
        );

        // Lock peers to write
        self.add_congestion_event(public_key, CongestionType::ReceivedKeyLists, current_time);

        if let Some(peer_v2) = self.get_peer_by_public_key_mut(&public_key) {
            peer_v2.key_list = key_list;
            Ok(())
        } else {
            Ok(())
        }
    }

    pub async fn remove_stun_peer(
        &mut self,
        public_key: SaitoPublicKey,
        io_handler: &Box<dyn InterfaceIO + Send + Sync>,
    ) {
        debug!("Removing STUN peer with key: {}", public_key.to_base58());

        if self.get_peer_by_public_key(&public_key).is_some() {
            self.remove_peer_by_public_key(&public_key);

            debug!("STUN peer removed from network successfully");

            io_handler.send_interface_event(InterfaceEvent::StunPeerDisconnected(public_key));
        } else {
            error!(
                "Failed to remove STUN peer: Peer with key {} not found",
                public_key.to_base58()
            );
        }
    }

    pub fn remove_disconnected_peers(&mut self, current_time: Timestamp) {
        let peer_ids: Vec<u64> = self
            .peers_v2
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
            self.peers_v2.remove(&peer_id);
        }
    }

    pub async fn disconnect_stale_peers(
        &mut self,
        current_time: Timestamp,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) {
        trace!(
            "disconnecting stale peers out of {:?} peers",
            self.peers_v2.len()
        );

        // --- Phase 1: collect stale peers ---
        let mut stale_peers: Vec<SaitoPublicKey> = Vec::new();

        for peer in self.peers_v2.values() {
            let Some(pk) = peer.public_key else {
                continue;
            };

            if peer.is_connected && peer.last_message_at + PEER_STALE_PERIOD < current_time {
                trace!(
                    "peer {:?} is stale (last_message_at = {:?}, now = {:?})",
                    pk.to_base58(),
                    peer.last_message_at,
                    current_time
                );

                stale_peers.push(pk);
            }
        }

        // --- Phase 2: apply disconnect ---
        for public_key in stale_peers {
            info!("disconnecting stale peer : {:?}", public_key.to_base58());

            // update PeerV2 state
            if let Some(peer_v2) = self.get_peer_by_public_key_mut(&public_key) {
                peer_v2.on_disconnect(current_time);
            }

            // IO disconnect
            if let Err(err) = io_handler.disconnect_from_peer(public_key).await {
                error!(
                    "failed disconnecting stale peer {:?}: {:?}",
                    public_key.to_base58(),
                    err
                );
            }
        }
    }

    pub fn add_congestion_event(
        &mut self,
        public_key: SaitoPublicKey,
        congestion_type: CongestionType,
        current_time: Timestamp,
    ) {
        // --- extract IP from PeerV2 ---
        let ip_opt = self
            .get_peer_by_public_key(&public_key)
            .and_then(|p| p.ip.clone());

        // If peer does not exist at all, do nothing (preserves prior behavior)
        if self.get_peer_by_public_key(&public_key).is_none() {
            return;
        }

        // --- update key-based congestion ---
        let controls = self
            .congestion_controls_by_key
            .entry(public_key)
            .or_default();

        controls.increase(congestion_type, current_time);

        // --- update IP-based congestion ---
        if let Some(ip) = ip_opt {
            let controls = self.congestion_controls_by_ip.entry(ip).or_default();
            controls.increase(congestion_type, current_time);
        }
    }

    pub fn get_congestion_status(
        &self,
        public_key: SaitoPublicKey,
        current_time: Timestamp,
    ) -> Vec<PeerCongestionStatus> {
        let mut statuses = Vec::new();

        let peer_v2 = self.get_peer_by_public_key(&public_key);

        // If peer does not exist, return empty (same as before)
        if peer_v2.is_none() {
            return statuses;
        }

        // --- key-based congestion ---
        if let Some(controls) = self.congestion_controls_by_key.get(&public_key) {
            let result = controls.get_congestion_status(current_time);
            statuses.push(result);
        }

        // --- IP-based congestion ---
        let ip = peer_v2.and_then(|p| p.ip.as_ref());

        if let Some(ip) = ip {
            if let Some(controls) = self.congestion_controls_by_ip.get(ip) {
                let result = controls.get_congestion_status(current_time);
                statuses.push(result);
            }
        }

        statuses
    }

    pub fn is_peer_blacklisted(&self, public_key: SaitoPublicKey, current_time: Timestamp) -> bool {
        let statuses = self.get_congestion_status(public_key, current_time);

        for status in statuses {
            if matches!(status, PeerCongestionStatus::Blacklist(_)) {
                return true;
            }
        }

        false
    }

    pub fn get_congested_peers(&self, current_time: Timestamp) -> Vec<SaitoPublicKey> {
        let mut result = Vec::new();

        for peer in self.peers_v2.values() {
            let Some(pk) = peer.public_key else {
                continue;
            };

            let statuses = self.get_congestion_status(pk, current_time);

            if statuses
                .iter()
                .any(|status| matches!(status, PeerCongestionStatus::Blacklist(_)))
            {
                result.push(pk);
            }
        }

        result
    }

    pub fn print_current_peers(&self) {
        self.peers_v2.values().for_each(|peer| {
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
