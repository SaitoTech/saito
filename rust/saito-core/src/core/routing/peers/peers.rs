use super::peerv2::PeerV2;
use crate::core::defs::{PrintForLog, SaitoPublicKey, Timestamp};
use crate::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::routing::peers::congestion_controller::{
    CongestionType, PeerCongestionControls, PeerCongestionStatus,
};
use crate::core::routing::peers::peer::Peer;
use crate::core::routing::peers::peer_service::PeerService;
use ahash::HashMap;
use log::{debug, error, info, trace, warn};
use std::io::Error;
use std::time::Duration;

const PEER_REMOVAL_WINDOW: Timestamp = Duration::from_secs(600).as_millis() as Timestamp;
const PEER_STALE_PERIOD: Timestamp = Duration::from_secs(30).as_millis() as Timestamp;

// #[derive(Clone, Debug, Default)]
// pub struct PeerCounter {
//     counter: PeerIndex,
// }
//
// impl PeerCounter {
//     pub fn get_next_index(&mut self) -> PeerIndex {
//         self.counter += 1;
//         self.counter
//     }
// }

#[derive(Debug, Default)]
pub struct Peers {
    // pub index_to_peers: HashMap<PeerIndex, Peer>,
    // #[serde(skip)]
    pub peers: HashMap<SaitoPublicKey, Peer>,
    // #[serde(skip)]
    // pub peer_counter: PeerCounter,
    /// Stores congestion control information for each peer, mapping their public key to their respective
    /// `PeerCongestionControls` instance. This allows tracking and managing network congestion status
    /// and related metrics on a per-peer basis. We have to store this here instead of in `Peer` because
    /// `Peer` is indexed using `PeerIndex`, which does not persist after a reconnection.
    // #[serde(skip)]
    pub congestion_controls_by_key: HashMap<SaitoPublicKey, PeerCongestionControls>,
    // #[serde(skip)]
    pub congestion_controls_by_ip: HashMap<String, PeerCongestionControls>,
    // #[serde(skip)]
    // if a peer connects with the same key as an existing peer, we store the received handshake here and then check if the old peer is still connected. if the old peer is unresponsive, we continue with the new peer.
    // if the old peer is still there, we discard the new peer
    // pub pending_handshake_responses: Vec<(PeerIndex, PeerIndex, HandshakeResponse, Timestamp)>,
    // PEER V2 REFACTOR
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
    //
    // LEGACY FUNCTIONS BELOW
    //
    //
    //
    //
    //
    //
    pub async fn process_peer_services(
        &mut self,
        services: Vec<PeerService>,
        public_key: SaitoPublicKey,
    ) {
        if let Some(peer_v2) = self.get_peer_by_public_key_mut(&public_key) {
            peer_v2.services = services;
        } else {
            warn!(
                "peer {:?} not found to update services",
                public_key.to_base58()
            );
        }
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use std::io::{Error, ErrorKind};
    use std::sync::{Arc, Mutex};

    #[derive(Debug, Default)]
    struct DisconnectIoState {
        disconnected_peers: Vec<SaitoPublicKey>,
        fail_disconnect: bool,
    }

    #[derive(Debug, Clone)]
    struct DisconnectIo {
        state: Arc<Mutex<DisconnectIoState>>,
    }

    impl DisconnectIo {
        fn new(state: Arc<Mutex<DisconnectIoState>>) -> Self {
            Self { state }
        }
    }

    #[async_trait]
    impl InterfaceIO for DisconnectIo {
        async fn send_message(
            &self,
            _public_key: SaitoPublicKey,
            _buffer: &[u8],
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn send_message_to_all(
            &self,
            _buffer: &[u8],
            _excluded_peers: Vec<SaitoPublicKey>,
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn connect_to_peer(&mut self, _url: String) -> Result<(), Error> {
            Ok(())
        }

        async fn disconnect_from_peer(&self, public_key: SaitoPublicKey) -> Result<(), Error> {
            let mut state = self.state.lock().unwrap();
            state.disconnected_peers.push(public_key);
            if state.fail_disconnect {
                return Err(Error::new(ErrorKind::BrokenPipe, "disconnect failed"));
            }
            Ok(())
        }

        async fn fetch_block_from_peer(
            &self,
            _block_hash: crate::core::defs::SaitoHash,
            _public_key: SaitoPublicKey,
            _url: &str,
            _block_id: u64,
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn write_value(&self, _key: &str, _value: &[u8]) -> Result<(), Error> {
            Ok(())
        }

        async fn append_value(&mut self, _key: &str, _value: &[u8]) -> Result<(), Error> {
            Ok(())
        }

        async fn flush_data(&mut self, _key: &str) -> Result<(), Error> {
            Ok(())
        }

        async fn read_value(&self, _key: &str) -> Result<Vec<u8>, Error> {
            Err(Error::new(ErrorKind::NotFound, "not found"))
        }

        async fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
            Ok(vec![])
        }

        async fn is_existing_file(&self, _key: &str) -> bool {
            false
        }

        async fn remove_value(&self, _key: &str) -> Result<(), Error> {
            Ok(())
        }

        fn get_block_dir(&self) -> String {
            String::new()
        }

        fn get_checkpoint_dir(&self) -> String {
            String::new()
        }

        fn ensure_directory_exists(&self, _block_dir: &str) -> Result<(), Error> {
            Ok(())
        }

        async fn process_api_call(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: SaitoPublicKey,
        ) {
        }

        async fn process_api_success(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: SaitoPublicKey,
        ) {
        }

        async fn process_api_error(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: SaitoPublicKey,
        ) {
        }

        fn send_interface_event(&self, _event: InterfaceEvent) {}

        async fn save_wallet(
            &self,
            _wallet: &mut crate::core::consensus::wallet::Wallet,
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn load_wallet(
            &self,
            _wallet: &mut crate::core::consensus::wallet::Wallet,
        ) -> Result<(), Error> {
            Ok(())
        }

        fn get_my_services(&self) -> Vec<PeerService> {
            vec![]
        }
    }

    #[tokio::test]
    async fn disconnect_stale_peers_marks_peer_disconnected_when_io_fails() {
        let public_key = [5; 33];
        let mut collection = Peers::default();
        let mut peer = Peer::new(public_key);
        peer.peer_status = PeerStatus::Connected;
        peer.last_msg_received_at = 0;
        collection.peers.insert(public_key, peer);

        let io_state = Arc::new(Mutex::new(DisconnectIoState {
            fail_disconnect: true,
            ..Default::default()
        }));
        let io = DisconnectIo::new(io_state.clone());

        collection
            .disconnect_stale_peers(PEER_STALE_PERIOD + 1, &io)
            .await;

        let peer = collection.peers.get(&public_key).unwrap();
        assert!(matches!(peer.peer_status, PeerStatus::Disconnected(_, _)));
        assert_eq!(
            io_state.lock().unwrap().disconnected_peers,
            vec![public_key]
        );
    }

    #[test]
    fn remove_disconnected_peers_removes_old_dynamic_peers() {
        let public_key = [9; 33];
        let mut collection = Peers::default();
        let mut peer = Peer::new(public_key);
        peer.disconnected_at = 1;
        collection.peers.insert(public_key, peer);

        collection.remove_disconnected_peers(PEER_REMOVAL_WINDOW + 2);

        assert!(!collection.peers.contains_key(&public_key));
    }
}
