use crate::core::consensus::peers::congestion_controller::{
    CongestionType, PeerCongestionControls, PeerCongestionStatus,
};
use crate::core::consensus::peers::peer::{Peer, PeerStatus};
use crate::core::defs::{PeerIndex, PrintForLog, SaitoPublicKey, Timestamp};
use crate::core::io::interface_io::InterfaceIO;
use crate::core::msg::handshake::HandshakeResponse;
use crate::core::util::configuration::Endpoint;
use ahash::HashMap;
use log::{debug, info, trace};
use serde::Serialize;
use std::time::Duration;

const PEER_REMOVAL_WINDOW: Timestamp = Duration::from_secs(600).as_millis() as Timestamp;
const PEER_STALE_PERIOD: Timestamp = Duration::from_secs(30).as_millis() as Timestamp;

#[derive(Clone, Debug, Default)]
pub struct PeerCounter {
    counter: PeerIndex,
}

impl PeerCounter {
    pub fn get_next_index(&mut self) -> PeerIndex {
        self.counter += 1;
        self.counter
    }
}

#[derive(Debug, Default, Serialize)]
pub struct PeerCollection {
    pub index_to_peers: HashMap<PeerIndex, Peer>,
    #[serde(skip)]
    pub address_to_peers: HashMap<SaitoPublicKey, PeerIndex>,
    #[serde(skip)]
    pub peer_counter: PeerCounter,
    /// Stores congestion control information for each peer, mapping their public key to their respective
    /// `PeerCongestionControls` instance. This allows tracking and managing network congestion status
    /// and related metrics on a per-peer basis. We have to store this here instead of in `Peer` because
    /// `Peer` is indexed using `PeerIndex`, which does not persist after a reconnection.
    #[serde(skip)]
    pub congestion_controls_by_key: HashMap<SaitoPublicKey, PeerCongestionControls>,
    #[serde(skip)]
    pub congestion_controls_by_ip: HashMap<String, PeerCongestionControls>,
    #[serde(skip)]
    /// if a peer connects with the same key as an existing peer, we store the received handshake here and then check if the old peer is still connected. if the old peer is unresponsive, we continue with the new peer.
    /// if the old peer is still there, we discard the new peer
    pub pending_handshake_responses: Vec<(PeerIndex, PeerIndex, HandshakeResponse, Timestamp)>,
}

impl PeerCollection {
    pub fn find_peer_by_address(&self, address: &SaitoPublicKey) -> Option<&Peer> {
        let result = self.address_to_peers.get(address)?;

        self.find_peer_by_index(*result)
    }
    pub fn find_peer_by_address_mut(&mut self, address: &SaitoPublicKey) -> Option<&mut Peer> {
        let result = self.address_to_peers.get(address)?;

        self.find_peer_by_index_mut(*result)
    }
    pub fn find_peer_by_index(&self, peer_index: u64) -> Option<&Peer> {
        self.index_to_peers.get(&peer_index)
    }
    pub fn find_peer_by_index_mut(&mut self, peer_index: u64) -> Option<&mut Peer> {
        self.index_to_peers.get_mut(&peer_index)
    }

    pub fn remove_reconnected_peer(
        &mut self,
        public_key: &SaitoPublicKey,
        current_peer_index: PeerIndex,
        endpoint: &Endpoint,
    ) -> Option<Peer> {
        let mut peer_index = None;
        {
            for (index, peer) in self.index_to_peers.iter() {
                if *index == current_peer_index {
                    continue;
                }
                if let Some(key) = &peer.public_key {
                    if *key == *public_key {
                        debug!("old peer found for key : {:?}", public_key.to_base58());
                        peer_index = Some(*index);
                        break;
                    }
                }
                // if peer.endpoint == *endpoint
                //     && matches!(peer.peer_status, PeerStatus::Disconnected(_, _))
                // {
                //     debug!("old peer found for endpoint : {:?}", endpoint);
                //     peer_index = Some(*index);
                //     break;
                // }
            }
            if peer_index.is_none() {
                debug!("peer with key : {:?} not found", public_key.to_base58());
                return None;
            }
        }

        let peer = self.index_to_peers.remove(&peer_index.unwrap())?;
        self.address_to_peers.remove(&peer.public_key?);
        debug!(
            "removed reconnected peer : {:?} with key : {:?}. current peer count : {:?}",
            peer_index,
            peer.public_key.unwrap().to_base58(),
            self.index_to_peers.len()
        );

        Some(peer)
    }

    pub fn remove_disconnected_peers(&mut self, current_time: Timestamp) {
        let peer_indices: Vec<PeerIndex> = self
            .index_to_peers
            .iter()
            .filter_map(|(peer_index, peer)| {
                if peer.static_peer_config.is_some() {
                    // static peers always remain in memory
                    return None;
                }
                if peer.is_stun_peer() {
                    // stun peers remain unless explicity removed
                    return None;
                }
                if peer.disconnected_at == Timestamp::MAX
                    || peer.disconnected_at + PEER_REMOVAL_WINDOW > current_time
                {
                    return None;
                }
                info!(
                    "removing peer : {:?} as peer hasn't connected for more than {:?} seconds",
                    peer_index,
                    Duration::from_millis(current_time - peer.disconnected_at).as_secs()
                );
                Some(*peer_index)
            })
            .collect();

        for peer_index in peer_indices {
            let peer = self.index_to_peers.remove(&peer_index).unwrap();
            if let Some(public_key) = peer.get_public_key() {
                self.address_to_peers.remove(&public_key);
            }
        }
    }

    pub async fn disconnect_stale_peers(
        &mut self,
        current_time: Timestamp,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) {
        trace!(
            "disconnecting stale peers out of {:?} peers",
            self.index_to_peers.len()
        );
        for peer in self.index_to_peers.values_mut() {
            if let PeerStatus::Connected = peer.peer_status {
                trace!(
                    "checking connected peer for staleness : {:?}-{:?}",
                    peer.index,
                    peer.public_key.unwrap_or([0; 33]).to_base58()
                );
                if peer.last_msg_received_at + PEER_STALE_PERIOD < current_time {
                    info!(
                        "disconnecting stale peer : {:?} - {:?} since we didn't receive msgs for {:?} seconds",
                        peer.index,
                        peer.public_key.unwrap_or([0; 33]).to_base58(),
                        (current_time - peer.last_msg_received_at) / 1000
                        );
                    peer.mark_as_disconnected(current_time);
                    io_handler.disconnect_from_peer(peer.index).await;
                }
            }
        }
    }

    pub fn add_congestion_event(
        &mut self,
        peer_index: PeerIndex,
        congestion_type: CongestionType,
        current_time: Timestamp,
    ) {
        if let Some(peer) = self.index_to_peers.get(&peer_index) {
            if let Some(public_key) = peer.get_public_key() {
                let controls = self
                    .congestion_controls_by_key
                    .entry(public_key)
                    .or_default();
                controls.increase(congestion_type, current_time);
            }
            if let Some(ip) = peer.ip_address.clone() {
                let controls = self.congestion_controls_by_ip.entry(ip).or_default();
                controls.increase(congestion_type, current_time);
            }
        }
    }

    pub fn get_congestion_status(
        &self,
        peer_index: PeerIndex,
        current_time: Timestamp,
    ) -> Vec<PeerCongestionStatus> {
        let mut statuses = Vec::new();
        if let Some(peer) = self.index_to_peers.get(&peer_index) {
            if let Some(public_key) = peer.get_public_key() {
                if let Some(controls) = self.congestion_controls_by_key.get(&public_key) {
                    let result = controls.get_congestion_status(current_time);
                    statuses.push(result);
                }
            }

            if let Some(ip) = &peer.ip_address {
                if let Some(controls) = self.congestion_controls_by_ip.get(ip) {
                    let result = controls.get_congestion_status(current_time);
                    statuses.push(result);
                }
            }
        }
        statuses
    }

    pub fn is_peer_blacklisted(&self, peer_index: PeerIndex, current_time: Timestamp) -> bool {
        let statuses = self.get_congestion_status(peer_index, current_time);
        !statuses.is_empty()
            && statuses.iter().any(|status| {
                matches!(
                    status,
                    PeerCongestionStatus::Blacklist(_) | PeerCongestionStatus::Throttle(_)
                )
            })
    }

    pub fn get_congested_peers(&self, current_time: Timestamp) -> Vec<PeerIndex> {
        self.index_to_peers
            .iter()
            .filter_map(|(index, peer)| {
                let results = self
                    .get_congestion_status(*index, current_time)
                    .iter()
                    .filter_map(|status| {
                        if !matches!(status, PeerCongestionStatus::NoAction) {
                            Some(*status)
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<PeerCongestionStatus>>();
                if !results.is_empty() {
                    Some(*index)
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn print_current_peers(&self) {
        self.index_to_peers.iter().for_each(|(index, peer)| {
            peer.public_key.iter().for_each(|key| {
                debug!(
                    "peer : {:?} with key : {:?} and endpoint : {} is currently connected : {:?}",
                    index,
                    peer.get_public_key().unwrap().to_base58(),
                    peer.endpoint,
                    peer.peer_status
                );
            });
        });
    }
}
