use std::fmt::Debug;
use std::io::Error;

use async_trait::async_trait;

use crate::core::consensus::peers::peer_service::PeerService;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockId, PeerIndex, SaitoHash, SaitoPublicKey};
use crate::core::process::version::Version;

pub enum InterfaceEvent {
    PeerHandshakeComplete(PeerIndex),
    PeerConnectionDropped(PeerIndex, SaitoPublicKey),
    PeerConnected(PeerIndex),
    BlockAddSuccess(SaitoHash, u64),
    WalletUpdate(),
    NewVersionDetected(PeerIndex, Version),
    StunPeerConnected(PeerIndex),
    StunPeerDisconnected(PeerIndex, SaitoPublicKey),
    BlockFetchStatus(BlockId),
}

/// An interface is provided to access the IO functionalities in a platform (Rust/WASM) agnostic way
#[async_trait]
pub trait InterfaceIO: Debug {
    async fn send_message(&self, peer_index: u64, buffer: &[u8]) -> Result<(), Error>;

    /// Sends the given message buffer to all the peers except the ones specified
    ///
    /// # Arguments
    ///
    /// * `message_name`:
    /// * `buffer`:
    /// * `peer_exceptions`: Peer indices for which this message should not be sent
    ///
    /// returns: Result<(), Error>
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn send_message_to_all(
        &self,
        buffer: &[u8],
        excluded_peers: Vec<u64>,
    ) -> Result<(), Error>;
    /// Connects to the peer with given configuration
    ///
    /// # Arguments
    ///
    /// * `peer`:
    ///
    /// returns: Result<(), Error>
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn connect_to_peer(&mut self, url: String, peer_index: PeerIndex) -> Result<(), Error>;
    async fn disconnect_from_peer(&self, peer_index: u64) -> Result<(), Error>;

    /// Fetches a block with given hash from a specific peer
    ///
    /// # Arguments
    ///
    /// * `block_hash`:
    /// * `peer_index`:
    /// * `url`:
    ///
    /// returns: Result<(), Error>
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn fetch_block_from_peer(
        &self,
        block_hash: SaitoHash,
        peer_index: u64,
        url: &str,
        block_id: BlockId,
    ) -> Result<(), Error>;

    /// Writes a value to a persistent storage with the given key
    ///
    /// # Arguments
    ///
    /// * `key`:
    /// * `value`:
    ///
    /// returns: Result<(), Error>
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error>;
    async fn append_value(&mut self, key: &str, value: &[u8]) -> Result<(), Error>;
    async fn flush_data(&mut self, key: &str) -> Result<(), Error>;

    /// Reads a value with the given key from a persistent storage
    ///
    /// # Arguments
    ///
    /// * `key`:
    ///
    /// returns: Result<Vec<u8, Global>, Error>
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn read_value(&self, key: &str) -> Result<Vec<u8>, Error>;

    /// Loads the block path list from the persistent storage
    async fn load_block_file_list(&self) -> Result<Vec<String>, Error>;
    async fn is_existing_file(&self, key: &str) -> bool;
    /// Removes the value with the given key from the persistent storage
    async fn remove_value(&self, key: &str) -> Result<(), Error>;
    /// Retrieve the prefix for all the keys for blocks
    fn get_block_dir(&self) -> String;
    fn get_checkpoint_dir(&self) -> String;

    fn ensure_block_directory_exists(&self, block_dir: &str) -> Result<(), Error>;

    async fn process_api_call(&self, buffer: Vec<u8>, msg_index: u32, peer_index: PeerIndex);
    async fn process_api_success(&self, buffer: Vec<u8>, msg_index: u32, peer_index: PeerIndex);
    async fn process_api_error(&self, buffer: Vec<u8>, msg_index: u32, peer_index: PeerIndex);

    fn send_interface_event(&self, event: InterfaceEvent);

    async fn save_wallet(&self, wallet: &mut Wallet) -> Result<(), Error>;
    async fn load_wallet(&self, wallet: &mut Wallet) -> Result<(), Error>;

    // async fn save_blockchain(&self) -> Result<(), Error>;
    // async fn load_blockchain(&self) -> Result<(), Error>;

    fn get_my_services(&self) -> Vec<PeerService>;
}

// impl Debug for dyn InterfaceIO {
//     fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
//         f.debug_struct("IoInterface").finish()
//     }
// }
//
