use rayon::prelude::*;
use std::fs::File;
use std::io::{Error, ErrorKind, Write};
use std::sync::Arc;

use ahash::AHashMap;
use bs58;
use log::{debug, error, info, warn};
use tokio::sync::RwLock;

use crate::core::consensus::block::{Block, BlockType};
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::defs::{
    BlockId, PrintForLog, SaitoHash, SaitoPublicKey, SaitoUTXOSetKey, PROJECT_PUBLIC_KEY,
};
use crate::core::io::interface_io::InterfaceIO;

#[derive(Debug)]
pub struct Storage {
    pub io_interface: Box<dyn InterfaceIO + Send + Sync>,
}

pub const ISSUANCE_FILE_PATH: &'static str = "./data/issuance/issuance";
pub const EARLYBIRDS_FILE_PATH: &'static str = "./data/issuance/earlybirds";
pub const DEFAULT_FILE_PATH: &'static str = "./data/issuance/default";
pub const UTXOSTATE_FILE_PATH: &'static str = "./data/issuance/utxodata";

pub struct StorageConfigurer {}

pub fn configure_storage() -> String {
    if cfg!(test) {
        String::from("./data/test/blocks/")
    } else {
        String::from("./data/blocks/")
    }
}

impl Storage {
    pub fn new(io_interface: Box<dyn InterfaceIO + Send + Sync>) -> Storage {
        Storage { io_interface }
    }
    // TODO : remove if not used
    /// read from a path to a Vec<u8>
    pub async fn read(&self, path: &str) -> std::io::Result<Vec<u8>> {
        let buffer = self.io_interface.read_value(path).await;
        if buffer.is_err() {
            let err = buffer.err().unwrap();
            error!("reading failed : {:?}", err);
            return Err(err);
        }
        let buffer = buffer.unwrap();
        Ok(buffer)
    }

    // TODO : remove if not used
    pub async fn write(&mut self, data: &[u8], filename: &str) {
        self.io_interface
            .write_value(filename, data)
            .await
            .expect("writing to storage failed");
    }

    pub async fn file_exists(&self, filename: &str) -> bool {
        self.io_interface.is_existing_file(filename).await
    }

    pub fn generate_block_filepath(&self, block: &Block) -> String {
        self.io_interface.get_block_dir() + block.get_file_name().as_str()
    }
    pub async fn write_block_to_disk(&mut self, block: &Block) -> String {
        let buffer = block.serialize_for_net(BlockType::Full);
        let filename = self.generate_block_filepath(block);

        let result = self
            .io_interface
            .write_value(filename.as_str(), buffer.as_slice())
            .await;
        if result.is_err() {
            let err = result.err().unwrap();
            // TODO : panicking currently to make sure we can serve any blocks for which we have propagated the header for
            panic!("failed writing block to disk. {:?}", err);
        }
        filename
    }

    pub async fn load_block_name_list(&self) -> Result<Vec<String>, Error> {
        let block_dir_path = self.io_interface.get_block_dir();

        match self
            .io_interface
            .ensure_block_directory_exists(block_dir_path.as_str())
        {
            Ok(()) => debug!("Block directory created"),
            Err(err) => {
                error!("Error creating block directory {:?}", err);
                return Err(err);
            }
        }

        let mut list = self
            .io_interface
            .load_block_file_list()
            .await
            .map_err(|err| {
                error!("failed loading block list from disk : {:?}", err);
                Error::from(ErrorKind::InvalidData)
            })?;

        list.sort();
        Ok(list)
    }

    pub async fn load_blocks_from_disk(
        &mut self,
        file_names: &[String],
        mempool_lock: Arc<RwLock<Mempool>>,
    ) {
        debug!("loading  {:?} blocks from disk", file_names.len());

        let mut mempool = mempool_lock.write().await;
        for file_name in file_names.iter() {
            let file_name = file_name.clone();
            let result = self
                .io_interface
                .read_value((self.io_interface.get_block_dir() + file_name.as_str()).as_str())
                .await;
            if result.is_err() {
                error!(
                    "failed loading block from disk : {:?}",
                    result.err().unwrap()
                );
                return;
            }
            debug!("file : {:?} loaded", file_name);
            let buffer: Vec<u8> = result.unwrap();
            let buffer_len = buffer.len();
            let result = Block::deserialize_from_net(&buffer);
            if result.is_err() {
                // ideally this shouldn't happen since we only write blocks which are valid to disk
                warn!(
                    "failed deserializing block with buffer length : {:?}",
                    buffer_len
                );
                return;
            }
            let mut block: Block = result.unwrap();
            block.force_loaded = true;
            block.generate().unwrap();
            debug!("block : {:?} loaded from disk", block.hash.to_hex());
            mempool.add_block(block);
        }
        // mempool.blocks_queue.shrink_to_fit();
        // mempool.transactions.shrink_to_fit();
        // mempool.golden_tickets.shrink_to_fit();

        debug!("blocks loaded to mempool");
    }

    pub async fn load_block_from_disk(&self, file_name: &str) -> Result<Block, std::io::Error> {
        debug!("loading block {:?} from disk", file_name);
        let result = self.io_interface.read_value(file_name).await;
        if result.is_err() {
            error!(
                "failed loading block from disk : {:?}",
                result.err().unwrap()
            );
            return Err(Error::from(ErrorKind::NotFound));
        }
        let buffer = result.unwrap();
        Block::deserialize_from_net(&buffer)
    }

    pub async fn delete_block_from_disk(&self, filename: &str) -> bool {
        info!("deleting block from disk : {:?}", filename);
        self.io_interface.remove_value(filename).await.is_ok()
    }

    /// Asynchronously retrieves token issuance slips from the provided file path.
    ///
    /// This function reads a file from disk that contains the token issuance slips
    /// and returns these slips as a vector.
    pub async fn get_token_supply_slips_from_disk_path(&self, issuance_file: &str) -> Vec<Slip> {
        let mut v: Vec<Slip> = vec![];
        let mut tokens_issued = 0;
        //
        if self.file_exists(issuance_file).await {
            if let Ok(lines) = self.io_interface.read_value(issuance_file).await {
                let mut contents = String::from_utf8(lines).unwrap();
                contents = contents.trim_end_matches('\r').to_string();
                let lines: Vec<&str> = contents.split('\n').collect();

                for line in lines {
                    let line = line.trim_end_matches('\r');
                    if !line.is_empty() {
                        if let Some(mut slip) = self.convert_issuance_into_slip(line) {
                            slip.generate_utxoset_key();
                            v.push(slip);
                        }
                    }
                }

                for i in 0..v.len() {
                    tokens_issued += v[i].amount;
                }

                info!("{:?} tokens issued", tokens_issued);
                return v;
            }
        } else {
            error!("issuance file does not exist");
        }

        vec![]
    }

    /// get issuance slips from the standard file
    pub async fn get_token_supply_slips_from_disk(&self) -> Vec<Slip> {
        return self
            .get_token_supply_slips_from_disk_path(ISSUANCE_FILE_PATH)
            .await;
    }

    /// convert an issuance expression to slip
    fn convert_issuance_into_slip(&self, line: &str) -> Option<Slip> {
        let entries: Vec<&str> = line.split_whitespace().collect();

        let result = entries[0].parse::<u64>();

        if result.is_err() {
            error!("couldn't parse line : {:?}", line);
            error!("{:?}", result.err().unwrap());
            return None;
        }

        let amount = result.unwrap();

        // Check if amount is less than 25000 and set public key if so

        let publickey_str = if amount < 25000 {
            PROJECT_PUBLIC_KEY
        } else {
            entries[1]
        };

        let publickey_result = Self::decode_str(publickey_str);

        match publickey_result {
            Ok(val) => {
                let mut publickey_array: SaitoPublicKey = [0u8; 33];
                publickey_array.copy_from_slice(&val);

                // VipOutput is deprecated on mainnet
                let slip_type = match entries[2].trim_end_matches('\r') {
                    "VipOutput" => SlipType::Normal,
                    "Normal" => SlipType::Normal,
                    _ => panic!("Invalid slip type"),
                };

                let mut slip = Slip::default();
                slip.amount = amount;
                slip.public_key = publickey_array;
                slip.slip_type = slip_type;

                Some(slip)
            }
            Err(err) => {
                debug!("error reading issuance line {:?}", err);
                None
            }
        }
    }

    pub fn decode_str(string: &str) -> Result<Vec<u8>, bs58::decode::Error> {
        return bs58::decode(string).into_vec();
    }

    /// store the state of utxo balances given that map of balances and a treshold
    pub async fn write_utxoset_to_disk_path(
        &self,
        balance_map: AHashMap<SaitoPublicKey, u64>,
        threshold: u64,
        path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        debug!("store to {}", path);
        let file_path = format!("{}", path);
        let mut file = File::create(&file_path)?;

        //assume normal txtype
        let txtype = "Normal";

        for (key, value) in &balance_map {
            if value > &threshold {
                let key_base58 = key.to_base58();
                let _ = writeln!(file, "{}\t{}\t{}", value, key_base58, txtype);
            }
        }
        debug!("written {} records", balance_map.len());
        Ok(())
    }

    /// store the state of utxo balances to standard file
    pub async fn write_utxoset_to_disk(
        &self,
        balance_map: AHashMap<SaitoPublicKey, u64>,
        threshold: u64,
    ) {
        let _ = self
            .write_utxoset_to_disk_path(balance_map, threshold, UTXOSTATE_FILE_PATH)
            .await;
    }

    pub async fn load_checkpoint_file(
        &self,
        block_hash: &SaitoHash,
        block_id: BlockId,
    ) -> Option<Vec<SaitoUTXOSetKey>> {
        let file_path = self.io_interface.get_checkpoint_dir()
            + format!("{}-{}.chk", block_id, block_hash.to_hex()).as_str();
        if !self.io_interface.is_existing_file(&file_path).await {
            debug!("no checkpoint file : {} exists for block", file_path,);
            return None;
        }
        if let Ok(result) = self.io_interface.read_value(file_path.as_str()).await {
            let mut contents = String::from_utf8(result).unwrap();
            contents = contents.trim_end_matches('\r').to_string();
            let lines: Vec<&str> = contents.split('\n').collect();
            let mut keys: Vec<SaitoUTXOSetKey> = vec![];
            for line in lines {
                let line = line.trim_end_matches('\r');
                if !line.is_empty() {
                    if let Ok(key) = SaitoUTXOSetKey::from_hex(line) {
                        keys.push(key);
                    }
                }
            }
            return Some(keys);
        }
        None
    }
}

#[cfg(test)]
mod test {
    use log::trace;

    use crate::core::consensus::block::Block;
    use crate::core::defs::{PrintForLog, SaitoHash};
    use crate::core::util::crypto::hash;
    use crate::core::util::test::test_manager::test::{create_timestamp, TestManager};

    // part is relative to it's cargo.toml

    // tests if issuance file can be read
    #[tokio::test]
    #[serial_test::serial]
    async fn read_issuance_file_test() {
        let t = TestManager::default();
        let read_result = t.storage.read(t.issuance_path).await;
        assert!(read_result.is_ok(), "Failed to read issuance file.");
    }

    // test if issuance file utxo is equal to the resultant balance map on created blockchain
    #[tokio::test]
    #[serial_test::serial]
    async fn issuance_hashmap_equals_balance_hashmap_test() {
        let mut t = TestManager::default();

        let issuance_hashmap = t.convert_issuance_to_hashmap(t.issuance_path).await;
        let slips = t
            .storage
            .get_token_supply_slips_from_disk_path(t.issuance_path)
            .await;

        t.initialize_from_slips(slips).await;
        let balance_map = t.balance_map().await;
        assert_eq!(issuance_hashmap, balance_map);
    }

    // // check if issuance occurs on block one
    // #[tokio::test]
    // async fn issuance_occurs_only_on_block_one_test() {
    //     let mut t = TestManager::new();
    //     let issuance_hashmap = t.convert_issuance_to_hashmap(TEST_ISSUANCE_FILEPATH).await;
    //     let slips = t
    //         .storage
    //         .get_token_supply_slips_from_disk_path(TEST_ISSUANCE_FILEPATH)
    //         .await;
    //     t.initialize_from_slips(slips).await;
    //     dbg!();

    //     assert_eq!(t.get_latest_block_id().await, 1);
    // }

    #[tokio::test]
    #[serial_test::serial]
    async fn write_read_block_to_file_test() {
        let mut t = TestManager::default();
        t.initialize(100, 100_000_000).await;

        let current_timestamp = create_timestamp();

        let mut block = Block::new();
        block.timestamp = current_timestamp;

        let filename = t.storage.write_block_to_disk(&mut block).await;
        trace!("block written to file : {}", filename);
        let retrieved_block = t.storage.load_block_from_disk(filename.as_str()).await;
        let mut actual_retrieved_block = retrieved_block.unwrap();
        actual_retrieved_block.generate().unwrap();

        assert_eq!(block.timestamp, actual_retrieved_block.timestamp);
    }

    #[test]
    fn hashing_test() {
        // pretty_env_logger::init();
        let h1: SaitoHash =
            hex::decode("fa761296cdca6b5c0e587e8bdc75f86223072780533a8edeb90fa51aea597128")
                .unwrap()
                .try_into()
                .unwrap();
        let h2: SaitoHash =
            hex::decode("8f1717d0f4a244f805436633897d48952c30cb35b3941e5d36cb371c68289d25")
                .unwrap()
                .try_into()
                .unwrap();
        let mut h3: Vec<u8> = vec![];
        h3.extend(&h1);
        h3.extend(&h2);

        let hash = hash(&h3);
        assert_eq!(
            hash.to_hex(),
            "de0cdde5db8fd4489f2038aca5224c18983f6676aebcb2561f5089e12ea2eedf"
        );
    }
}
