use crate::core::consensus::peers::congestion_controller::{
    CongestionType, PeerCongestionControls, PeerCongestionStatus,
};
use crate::core::consensus::peers::peer::{Peer, PeerStatus};
use crate::core::consensus::peers::peer_state_writer::PeerStateWriter;
use crate::core::defs::{PeerIndex, PrintForLog, SaitoPublicKey, Timestamp};
use ahash::HashMap;
use log::{debug, info};
use serde::Serialize;
use std::time::Duration;

const PEER_REMOVAL_WINDOW: Timestamp = Duration::from_secs(600).as_millis() as Timestamp;

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
    #[serde(skip)]
    pub(crate) peer_state_writer: PeerStateWriter,
    /// Stores congestion control information for each peer, mapping their public key to their respective
    /// `PeerCongestionControls` instance. This allows tracking and managing network congestion status
    /// and related metrics on a per-peer basis. We have to store this here instead of in `Peer` because
    /// `Peer` is indexed using `PeerIndex`, which does not persist after a reconnection.
    #[serde(skip)]
    pub congestion_controls_by_key: HashMap<SaitoPublicKey, PeerCongestionControls>,
    #[serde(skip)]
    pub congestion_controls_by_ip: HashMap<String, PeerCongestionControls>,
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

    pub fn remove_reconnected_peer(&mut self, public_key: &SaitoPublicKey) -> Option<Peer> {
        let mut peer_index = None;
        {
            for (index, peer) in self.index_to_peers.iter() {
                if let Some(key) = &peer.public_key {
                    if *key == *public_key {
                        if let PeerStatus::Connected = peer.peer_status {
                            debug!(
                                "peer : {:?} with key : {:?} is already connected",
                                peer.index,
                                public_key.to_base58()
                            );
                            // since peer is already connected
                            continue;
                        }
                        debug!("old peer found for key : {:?}", public_key.to_base58());
                        peer_index = Some(*index);
                        break;
                    }
                }
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
        &mut self,
        peer_index: PeerIndex,
        current_time: Timestamp,
    ) -> Vec<PeerCongestionStatus> {
        let mut statuses = Vec::new();
        if let Some(peer) = self.index_to_peers.get(&peer_index) {
            if let Some(public_key) = peer.get_public_key() {
                if let Some(controls) = self.congestion_controls_by_key.get_mut(&public_key) {
                    let result = controls.get_congestion_status(current_time);
                    statuses.push(result);
                }
            }

            if let Some(ip) = &peer.ip_address {
                if let Some(controls) = self.congestion_controls_by_ip.get_mut(ip) {
                    let result = controls.get_congestion_status(current_time);
                    statuses.push(result);
                }
            }
        }
        statuses
    }
}
