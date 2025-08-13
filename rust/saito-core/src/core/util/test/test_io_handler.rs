#[cfg(test)]
pub mod test {
    use std::fs;
    use std::io::Error;
    use std::path::Path;

    use async_trait::async_trait;
    use log::{debug, info};
    use tokio::fs::File;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use crate::core::consensus::peers::peer_service::PeerService;
    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::{BlockId, PeerIndex, SaitoHash, BLOCK_FILE_EXTENSION};
    use crate::core::io::interface_io::{InterfaceEvent, InterfaceIO};

    #[derive(Clone, Debug)]
    pub struct TestIOHandler {}

    impl TestIOHandler {
        pub fn new() -> TestIOHandler {
            TestIOHandler {}
        }
    }

    #[async_trait]
    impl InterfaceIO for TestIOHandler {
        async fn send_message(&self, _peer_index: u64, _buffer: &[u8]) -> Result<(), Error> {
            // TODO : implement a way to check sent messages

            Ok(())
        }

        async fn send_message_to_all(
            &self,
            _buffer: &[u8],
            _peer_exceptions: Vec<u64>,
        ) -> Result<(), Error> {
            // debug!("send message to all");

            Ok(())
        }

        async fn connect_to_peer(
            &mut self,
            _url: String,
            peer_index: PeerIndex,
        ) -> Result<(), Error> {
            debug!("connecting to peer : {:?}", peer_index);

            Ok(())
        }

        async fn disconnect_from_peer(&self, _peer_index: u64) -> Result<(), Error> {
            todo!("")
        }

        async fn fetch_block_from_peer(
            &self,
            _block_hash: SaitoHash,
            _peer_index: u64,
            _url: &str,
            _block_id: BlockId,
        ) -> Result<(), Error> {
            todo!()
        }

        async fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
            debug!("writing value to disk : {:?}", key);
            let filename = key;
            let path = Path::new(filename);
            if path.parent().is_some() {
                let _ = tokio::fs::create_dir_all(path.parent().unwrap()).await;
            }
            let result = File::create(filename).await;
            if result.is_err() {
                return Err(result.err().unwrap());
            }
            let mut file = result.unwrap();
            let result = file.write_all(&value).await;
            if result.is_err() {
                return Err(result.err().unwrap());
            }
            file.flush().await.expect("flush failed");
            Ok(())
        }

        async fn append_value(&mut self, _key: &str, _value: &[u8]) -> Result<(), Error> {
            Ok(())
        }

        async fn flush_data(&mut self, _key: &str) -> Result<(), Error> {
            Ok(())
        }

        async fn read_value(&self, key: &str) -> Result<Vec<u8>, Error> {
            let mut file = File::open(key).await?;
            let mut encoded = Vec::<u8>::new();

            let result = file.read_to_end(&mut encoded).await;
            if result.is_err() {
                unreachable!();
            }
            Ok(encoded)
        }
        async fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
            info!("current dir = {:?}", std::env::current_dir()?);
            let mut paths: Vec<_> = fs::read_dir(self.get_block_dir())?
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
            let result = tokio::fs::File::open(key).await;
            if result.is_ok() {
                return true;
            }
            return false;
        }

        async fn remove_value(&self, key: &str) -> Result<(), Error> {
            let result = tokio::fs::remove_file(key).await;
            return result;
        }

        fn get_block_dir(&self) -> String {
            "./data/blocks/".to_string()
        }
        fn get_checkpoint_dir(&self) -> String {
            "data/checkpoints/".to_string()
        }

        fn ensure_block_directory_exists(&self, block_dir_path: &str) -> std::io::Result<()> {
            if !Path::new(&block_dir_path).exists() {
                fs::create_dir_all(block_dir_path.to_string())?;
            }
            Ok(())
        }

        async fn process_api_call(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _peer_index: PeerIndex,
        ) {
            todo!()
        }

        async fn process_api_success(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _peer_index: PeerIndex,
        ) {
            todo!()
        }

        async fn process_api_error(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _peer_index: PeerIndex,
        ) {
            todo!()
        }

        fn send_interface_event(&self, _event: InterfaceEvent) {}

        async fn save_wallet(&self, _wallet: &mut Wallet) -> Result<(), Error> {
            Ok(())
        }

        async fn load_wallet(&self, _wallet: &mut Wallet) -> Result<(), Error> {
            Ok(())
        }

        // async fn save_blockchain(&self) -> Result<(), Error> {
        //     todo!()
        // }
        // async fn load_blockchain(&self) -> Result<(), Error> {
        //     todo!()
        // }

        fn get_my_services(&self) -> Vec<PeerService> {
            todo!()
        }
    }
}
