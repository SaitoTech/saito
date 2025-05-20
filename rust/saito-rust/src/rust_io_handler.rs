use ahash::HashMap;
use std::fmt::{Debug, Formatter};
use std::fs;
use std::io::{Error, ErrorKind};
use std::path::Path;

use async_trait::async_trait;
use lazy_static::lazy_static;
use log::{debug, error, trace};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc::Sender;

use saito_core::core::consensus::peers::peer_service::PeerService;
use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::defs::{BlockId, PeerIndex, SaitoHash, BLOCK_FILE_EXTENSION};
use saito_core::core::io::interface_io::{InterfaceEvent, InterfaceIO};
use saito_core::core::io::network_event::NetworkEvent;

use crate::io_event::IoEvent;

lazy_static! {
    pub static ref BLOCKS_DIR_PATH: String = configure_storage();
    pub static ref WALLET_DIR_PATH: String = String::from("./data/wallet");
    pub static ref CHECKPOINT_DIR_PATH: String = String::from("./data/checkpoints/");
}
pub fn configure_storage() -> String {
    if cfg!(test) {
        String::from("./data/test/blocks/")
    } else {
        String::from("./data/blocks/")
    }
}

pub struct RustIOHandler {
    sender: Sender<IoEvent>,
    handler_id: u8,
    open_files: HashMap<String, File>,
}

impl RustIOHandler {
    pub fn new(sender: Sender<IoEvent>, handler_id: u8) -> RustIOHandler {
        RustIOHandler {
            sender,
            handler_id,
            open_files: Default::default(),
        }
    }
}

impl Debug for RustIOHandler {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RustIoHandler")
            .field("handler_id", &self.handler_id)
            .finish()
    }
}

#[async_trait]
impl InterfaceIO for RustIOHandler {
    async fn send_message(&self, peer_index: u64, buffer: &[u8]) -> Result<(), Error> {
        // TODO : refactor to combine event and the future
        let event = IoEvent::new(NetworkEvent::OutgoingNetworkMessage {
            peer_index,
            buffer: buffer.to_vec(),
        });

        self.sender.send(event).await.unwrap();

        Ok(())
    }

    async fn send_message_to_all(
        &self,
        buffer: &[u8],
        peer_exceptions: Vec<u64>,
    ) -> Result<(), Error> {
        // debug!("send message to all");

        let event = IoEvent::new(NetworkEvent::OutgoingNetworkMessageForAll {
            buffer: buffer.to_vec(),
            exceptions: peer_exceptions,
        });

        self.sender.send(event).await.unwrap();

        Ok(())
    }

    async fn connect_to_peer(&mut self, url: String, peer_index: PeerIndex) -> Result<(), Error> {
        debug!("connecting to peer : {:?} with url : {:?}", peer_index, url);
        let event = IoEvent::new(NetworkEvent::ConnectToPeer { url, peer_index });

        self.sender.send(event).await.unwrap();

        Ok(())
    }

    async fn disconnect_from_peer(&self, peer_index: u64) -> Result<(), Error> {
        self.sender
            .send(IoEvent::new(NetworkEvent::DisconnectFromPeer {
                peer_index,
            }))
            .await
            .unwrap();
        Ok(())
    }

    async fn fetch_block_from_peer(
        &self,
        block_hash: SaitoHash,
        peer_index: u64,
        url: &str,
        block_id: BlockId,
    ) -> Result<(), Error> {
        if block_hash == [0; 32] {
            return Ok(());
        }

        debug!("fetching block : {:?} from peer : {:?}", block_id, url);
        let event = IoEvent::new(NetworkEvent::BlockFetchRequest {
            block_hash,
            peer_index,
            block_id,
            url: url.to_string(),
        });

        self.sender
            .send(event)
            .await
            .expect("failed sending to io controller");

        Ok(())
    }

    async fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
        // trace!("writing value to disk : {:?}", key);
        let filename = key;
        let path = Path::new(filename);
        if path.parent().is_some() {
            tokio::fs::create_dir_all(path.parent().unwrap())
                .await
                .expect("creating directory structure failed");
        }
        let mut file = File::create(filename).await?;

        file.write_all(value).await?;

        // TODO : write the file to a temp file and move to avoid file corruptions

        Ok(())
    }

    async fn append_value(&mut self, key: &str, value: &[u8]) -> Result<(), Error> {
        // trace!("appending value to disk : {:?}", key);

        if !self.open_files.contains_key(key) {
            debug!("file is not yet opened to append. opening file : {:?}", key);
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(key)
                .await?;
            self.open_files.insert(key.to_string(), file);
        }

        let file = self.open_files.get_mut(key).unwrap();

        // TODO : write the file to a temp file and move to avoid file corruptions
        let result = file.write_all(value).await;
        if result.is_err() {
            return Err(result.err().unwrap());
        }
        Ok(())
    }

    async fn flush_data(&mut self, key: &str) -> Result<(), Error> {
        trace!("flushing values to disk : {:?}", key);

        if !self.open_files.contains_key(key) {
            debug!("file : {:?} is not yet opened so cannot be flushed.", key);
            return Err(Error::from(ErrorKind::Unsupported));
        }

        let file = self.open_files.get_mut(key).unwrap();

        let result = file.flush().await;
        if result.is_err() {
            return Err(result.err().unwrap());
        }
        Ok(())
    }

    async fn read_value(&self, key: &str) -> Result<Vec<u8>, Error> {
        let result = File::open(key).await;
        if result.is_err() {
            let err = result.err().unwrap();
            error!("couldn't open file for : {:?}. {:?}", key, err);
            return Err(err);
        }
        let mut file = result.unwrap();
        let mut encoded = Vec::<u8>::new();

        let result = file.read_to_end(&mut encoded).await;
        if result.is_err() {
            let err = result.err().unwrap();
            error!("couldn't read file : {:?}. {:?}", key, err);
            return Err(err);
        }
        Ok(encoded)
    }

    async fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
        debug!(
            "loading blocks from dir : {:?}",
            self.get_block_dir().to_string(),
        );
        let result = fs::read_dir(self.get_block_dir());
        if result.is_err() {
            debug!("no blocks found");
            return Err(result.err().unwrap());
        }
        let mut paths: Vec<_> = result
            .unwrap()
            .map(|r| r.unwrap())
            .filter(|r| {
                r.file_name()
                    .into_string()
                    .unwrap()
                    .contains(BLOCK_FILE_EXTENSION)
            })
            .collect();
        paths.sort_by(|a, b| {
            let a_metadata = fs::metadata(a.path()).unwrap();
            let b_metadata = fs::metadata(b.path()).unwrap();
            a_metadata
                .modified()
                .unwrap()
                .partial_cmp(&b_metadata.modified().unwrap())
                .unwrap()
        });
        let mut filenames = vec![];
        for entry in paths {
            filenames.push(entry.file_name().into_string().unwrap());
        }

        Ok(filenames)
    }

    async fn is_existing_file(&self, key: &str) -> bool {
        return Path::new(&key).exists();
    }

    async fn remove_value(&self, key: &str) -> Result<(), Error> {
        let result = tokio::fs::remove_file(key).await;
        return result;
    }

    fn get_block_dir(&self) -> String {
        BLOCKS_DIR_PATH.to_string()
    }

    fn get_checkpoint_dir(&self) -> String {
        CHECKPOINT_DIR_PATH.to_string()
    }

    fn ensure_block_directory_exists(&self, block_dir_path: &str) -> Result<(), Error> {
        if !Path::new(&block_dir_path).exists() {
            fs::create_dir_all(BLOCKS_DIR_PATH.to_string())?;
        }
        Ok(())
    }

    async fn process_api_call(&self, _buffer: Vec<u8>, _msg_index: u32, _peer_index: PeerIndex) {}

    async fn process_api_success(&self, _buffer: Vec<u8>, _msg_index: u32, _peer_index: PeerIndex) {
    }

    async fn process_api_error(&self, _buffer: Vec<u8>, _msg_index: u32, _peer_index: PeerIndex) {}

    fn send_interface_event(&self, _event: InterfaceEvent) {
        // no one is listening to these events in rust node
    }

    async fn save_wallet(&self, wallet: &mut Wallet) -> Result<(), Error> {
        let buffer = wallet.serialize_for_disk();
        self.write_value(WALLET_DIR_PATH.as_str(), buffer.as_slice())
            .await
    }

    async fn load_wallet(&self, wallet: &mut Wallet) -> Result<(), Error> {
        if !self.is_existing_file(WALLET_DIR_PATH.as_str()).await {
            return Ok(());
        }
        let buffer = self.read_value(WALLET_DIR_PATH.as_str()).await?;
        wallet.deserialize_from_disk(&buffer);
        Ok(())
    }

    fn get_my_services(&self) -> Vec<PeerService> {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use saito_core::core::io::interface_io::InterfaceIO;

    use crate::rust_io_handler::RustIOHandler;

    #[tokio::test]
    #[serial_test::serial]
    async fn test_write_value() {
        let (sender, mut _receiver) = tokio::sync::mpsc::channel(10);
        let io_handler = RustIOHandler::new(sender, 0);

        let result = io_handler
            .write_value("./data/test/KEY", [1, 2, 3, 4].as_slice())
            .await;
        assert!(result.is_ok(), "{:?}", result.err().unwrap().to_string());
        let result = io_handler.read_value("./data/test/KEY").await;
        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result, [1, 2, 3, 4]);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn file_exists_success() {
        let (sender, mut _receiver) = tokio::sync::mpsc::channel(10);
        let io_handler = RustIOHandler::new(sender, 0);
        let path = String::from("src/test/data/config_handler_tests.json");

        let result = io_handler.is_existing_file(path.as_str()).await;
        assert!(result);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn file_exists_fail() {
        let (sender, mut _receiver) = tokio::sync::mpsc::channel(10);
        let io_handler = RustIOHandler::new(sender, 0);
        let path = String::from("badfilename.json");

        let result = io_handler.is_existing_file(path.as_str()).await;
        assert!(!result);
    }
}
