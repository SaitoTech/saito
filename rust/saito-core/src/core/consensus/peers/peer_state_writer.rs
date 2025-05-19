use crate::core::defs::{PeerIndex, PrintForLog, SaitoPublicKey, Timestamp};
use crate::core::io::interface_io::InterfaceIO;
use std::io::Error;
use std::time::Duration;

const PEER_STATE_FILENAME: &str = "./data/peer_state.txt";

pub(crate) const PEER_STATE_WRITE_PERIOD: Timestamp =
    Duration::from_secs(5).as_millis() as Timestamp;

#[derive(Debug, Clone)]
pub(crate) struct PeerStateEntry {
    pub peer_index: PeerIndex,
    pub public_key: SaitoPublicKey,
    pub msg_limit_exceeded: bool,
    pub invalid_blocks_received: bool,
    pub same_depth_blocks_received: bool,
    pub too_far_blocks_received: bool,
    pub handshake_limit_exceeded: bool,
    pub keylist_limit_exceeded: bool,
    pub limited_till: Option<Timestamp>,
    pub current_time: Timestamp,
    pub peer_address: String,
}

impl Default for PeerStateEntry {
    fn default() -> Self {
        Self {
            peer_index: 0,
            public_key: [0; 33],
            msg_limit_exceeded: false,
            invalid_blocks_received: false,
            same_depth_blocks_received: false,
            too_far_blocks_received: false,
            handshake_limit_exceeded: false,
            keylist_limit_exceeded: false,
            limited_till: None,
            current_time: 0,
            peer_address: "".to_string(),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub(crate) struct PeerStateWriter {}

impl PeerStateWriter {
    /// Writes peer state data to the file and clears collected state
    ///
    /// # Arguments
    ///
    /// * `io_handler`:
    ///
    /// returns: Result<(), Error>
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub(crate) async fn write_state(
        &self,
        data: Vec<PeerStateEntry>,
        io_handler: &mut Box<dyn InterfaceIO + Send + Sync>,
    ) -> Result<(), Error> {
        if !io_handler.is_existing_file(PEER_STATE_FILENAME).await {
            let line =
                "current_time,peer_index,ip,public_key,limited_till,msg_limit,invalid_blocks_limit,same_depth_limit,too_far_block_limit,handshake_limit,keylist_limit\r\n"
                    .to_string();
            io_handler
                .write_value(PEER_STATE_FILENAME, line.as_bytes())
                .await?;
        }

        for data in data.iter() {
            let line = format!(
                "{:?},{:?},{:?},{:?},{:?},{:?},{:?},{:?},{:?},{:?},{:?}\r\n",
                data.current_time,
                data.peer_index,
                data.peer_address,
                data.public_key.to_base58(),
                data.limited_till.unwrap_or(0),
                data.msg_limit_exceeded,
                data.invalid_blocks_received,
                data.same_depth_blocks_received,
                data.too_far_blocks_received,
                data.handshake_limit_exceeded,
                data.keylist_limit_exceeded,
            );
            io_handler
                .append_value(PEER_STATE_FILENAME, line.as_bytes())
                .await?
        }

        if !data.is_empty() {
            io_handler.flush_data(PEER_STATE_FILENAME).await?;
        }

        Ok(())
    }
}
