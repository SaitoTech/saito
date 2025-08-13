use std::fmt::{Display, Formatter, Write};
use std::io::{BufRead, BufReader};

use log::{debug, info};

use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::defs::{
    BlockId, PrintForLog, SaitoHash, SaitoPublicKey, Timestamp, UTXO_KEY_LENGTH,
};

pub type BalanceFileRowType = (String, String, String, String);

pub struct BalanceSnapshot {
    pub latest_block_id: BlockId,
    pub latest_block_hash: SaitoHash,
    pub timestamp: Timestamp,
    pub slips: Vec<Slip>,
}

impl BalanceSnapshot {
    /// Converts the internal data into text format
    ///
    /// Following is the file format
    ///
    /// | Public Key | Block Id | Transaction Id | Slip Id | Amount |
    ///
    /// Following is the file name format
    ///
    /// <timestamp>-<latest_block_id>-<latest_block_hash>.snap
    ///
    /// # Parameters
    /// None.
    ///
    /// # Returns
    /// This function returns a tuple containing:
    ///
    /// - A `String`: File name
    /// - A `Vec<String>`: Rows of the file
    ///
    pub fn get_data(&self) -> (String, Vec<String>) {
        let file_name: String = self.get_file_name();
        let entries: Vec<String> = self.get_rows();

        (file_name, entries)
    }

    pub fn get_file_name(&self) -> String {
        self.timestamp.to_string()
            + "-"
            + self.latest_block_id.to_string().as_str()
            + "-"
            + self.latest_block_hash.to_hex().as_str()
            + ".snap"
    }
    pub fn get_rows(&self) -> Vec<String> {
        self.slips
            .iter()
            .map(|slip| {
                let key = slip.public_key.to_base58();
                let entry = format!(
                    "{} {:?} {:?} {:?} {:?}",
                    key, slip.block_id, slip.tx_ordinal, slip.slip_index, slip.amount
                );
                entry
            })
            .collect()
    }

    pub fn new(file_name: String, rows: Vec<String>) -> Result<BalanceSnapshot, String> {
        debug!(
            "creating new balance snapshot from file : {:?} with {:?} rows",
            file_name,
            rows.len()
        );
        let mut tokens: Vec<&str> = file_name.split('.').collect();
        let file_name = tokens.remove(0);
        let tokens: Vec<&str> = file_name.split('-').collect();
        if tokens.len() != 3 {
            return Err(format!(
                "file name : {:?} is invalid for balance snapshot file",
                file_name
            ));
        }
        let timestamp = tokens.get(0).unwrap();
        let block_id = tokens.get(1).unwrap();
        let block_hash = tokens.get(2).unwrap();

        let timestamp: Timestamp = timestamp
            .parse()
            .map_err(|err| format!("failed parsing timestamp : {:?}. {:?}", timestamp, err))?;
        let block_id: u64 = block_id
            .parse()
            .map_err(|err| format!("failed parsing block id : {:?}. {:?}", block_id, err))?;
        let block_hash = SaitoHash::from_hex(block_hash)
            .map_err(|err| format!("failed parsing block hash : {:?}. {:?}", block_hash, err))?;

        let mut snapshot = BalanceSnapshot {
            latest_block_id: block_id,
            latest_block_hash: block_hash,
            timestamp,
            slips: vec![],
        };

        rows.iter().try_for_each(|row| {
            let cols: Vec<&str> = row.split(' ').collect();
            if cols.len() != 5 {
                return Err(format!(
                    "row is invalid. number of columns is {:?}. but should be 5",
                    cols.len()
                ));
            }
            let key = cols.get(0).ok_or("cannot find key in row".to_string())?;
            let block_id = cols
                .get(1)
                .ok_or("cannot find block id in row".to_string())?;
            let tx_id = cols.get(2).ok_or("cannot find tx id in row".to_string())?;
            let slip_id = cols
                .get(3)
                .ok_or("cannot find slip id in row".to_string())?;
            let amount = cols.get(4).ok_or("cannot find amount in row".to_string())?;

            let key: SaitoPublicKey = SaitoPublicKey::from_base58(key)
                .or(Err(format!("failed parsing key : {:?}", key)))?;
            let block_id = block_id
                .parse()
                .or(Err(format!("failed parsing block id : {:?}", block_id)))?;
            let tx_id = tx_id
                .parse()
                .or(Err(format!("failed parsing tx id : {:?}", tx_id)))?;
            let slip_id = slip_id
                .parse()
                .or(Err(format!("failed parsing slip id : {:?}", slip_id)))?;
            let amount = amount
                .parse()
                .or(Err(format!("failed parsing amount : {:?}", amount)))?;

            let mut slip = Slip {
                public_key: key,
                amount,
                slip_index: slip_id,
                block_id,
                tx_ordinal: tx_id,
                slip_type: SlipType::Normal,
                utxoset_key: [0; UTXO_KEY_LENGTH],
                is_utxoset_key_set: false,
            };
            slip.generate_utxoset_key();
            snapshot.slips.push(slip);

            Ok(())
        })?;

        Ok(snapshot)
    }
}

impl Display for BalanceSnapshot {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let (file_name, rows) = self.get_data();
        writeln!(f, "{}", file_name).unwrap();
        rows.iter().for_each(|row| {
            writeln!(f, "{}", row).unwrap();
        });

        std::fmt::Result::Ok(())
    }
}

impl TryFrom<String> for BalanceSnapshot {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let mut reader = BufReader::new(value.as_bytes());

        let mut file_name = "".to_string();
        reader
            .read_line(&mut file_name)
            .map_err(|_err| "failed reading file name from balance snapshot")?;
        file_name.pop();

        let mut rows = vec![];
        loop {
            let mut row = "".to_string();
            if reader.read_line(&mut row).is_ok() {
                info!("row = {}", row);
                if row.is_empty() {
                    break;
                }
                // removing the new line
                row.pop();
                rows.push(row);
            } else {
                break;
            }
        }

        BalanceSnapshot::new(file_name, rows)
    }
}

#[cfg(test)]
mod tests {
    use log::info;

    use crate::core::consensus::slip::{Slip, SlipType};
    use crate::core::defs::{PrintForLog, UTXO_KEY_LENGTH};
    use crate::core::util::balance_snapshot::BalanceSnapshot;

    #[test]
    fn load_save_test() {
        let mut snapshot = BalanceSnapshot {
            latest_block_id: 200,
            latest_block_hash: [1; 32],
            timestamp: 10000,
            slips: vec![],
        };
        snapshot.slips.push(Slip {
            public_key: [1; 33],
            amount: 10,
            slip_index: 1,
            block_id: 1,
            tx_ordinal: 1,
            slip_type: SlipType::Normal,
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        });
        snapshot.slips.push(Slip {
            public_key: [2; 33],
            amount: 20,
            slip_index: 2,
            block_id: 2,
            tx_ordinal: 2,
            slip_type: SlipType::Normal,
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        });
        snapshot.slips.push(Slip {
            public_key: [3; 33],
            amount: 30,
            slip_index: 3,
            block_id: 3,
            tx_ordinal: 3,
            slip_type: SlipType::Normal,
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        });
        let (file_name, rows) = snapshot.get_data();
        assert!(!file_name.is_empty());
        let expected_file_name = snapshot.timestamp.to_string()
            + "-"
            + snapshot.latest_block_id.to_string().as_str()
            + "-"
            + snapshot.latest_block_hash.to_hex().as_str()
            + ".snap";
        assert_eq!(file_name, expected_file_name);

        assert_eq!(rows.len(), 3);
        for (index, row) in rows.iter().enumerate() {
            let slip = snapshot.slips.get(index);
            assert!(slip.is_some());
            let slip = slip.unwrap();
            let key = slip.public_key.to_base58();
            info!("key = {:?}", key);
            let expected_str = format!(
                "{} {:?} {:?} {:?} {:?}",
                key, slip.block_id, slip.tx_ordinal, slip.slip_index, slip.amount
            );
            info!("{:?} row = {:?}", index, expected_str);

            assert_eq!(row.as_str(), expected_str.as_str());
        }
        let file_name = file_name
            .split('.')
            .collect::<Vec<&str>>()
            .first()
            .unwrap()
            .to_string();
        assert!(!file_name.is_empty());
        let snapshot2 = BalanceSnapshot::new(file_name, rows);
        assert!(snapshot2.is_ok(), "error : {:?}", snapshot2.err().unwrap());
        let snapshot2 = snapshot2.unwrap();
        assert_eq!(snapshot.timestamp, snapshot2.timestamp);
        assert_eq!(snapshot.latest_block_id, snapshot2.latest_block_id);
        assert_eq!(snapshot.latest_block_hash, snapshot2.latest_block_hash);

        for (index, slip) in snapshot.slips.iter().enumerate() {
            let slip2 = snapshot2.slips.get(index).unwrap();
            assert_eq!(slip.public_key, slip2.public_key);
            assert_eq!(slip.block_id, slip2.block_id);
            assert_eq!(slip.tx_ordinal, slip2.tx_ordinal);
            assert_eq!(slip.amount, slip2.amount);
        }
    }

    #[test]
    fn to_string_test() {
        // pretty_env_logger::init();
        let mut snapshot = BalanceSnapshot {
            latest_block_id: 200,
            latest_block_hash: [1; 32],
            timestamp: 10000,
            slips: vec![],
        };
        snapshot.slips.push(Slip {
            public_key: [1; 33],
            amount: 10,
            slip_index: 1,
            block_id: 1,
            tx_ordinal: 1,
            slip_type: SlipType::Normal,
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        });
        snapshot.slips.push(Slip {
            public_key: [2; 33],
            amount: 20,
            slip_index: 2,
            block_id: 2,
            tx_ordinal: 2,
            slip_type: SlipType::Normal,
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        });
        snapshot.slips.push(Slip {
            public_key: [3; 33],
            amount: 30,
            slip_index: 3,
            block_id: 3,
            tx_ordinal: 3,
            slip_type: SlipType::Normal,
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        });

        let str = snapshot.to_string();
        assert_ne!(str.len(), 0);

        let result: Result<BalanceSnapshot, String> = str.try_into();
        assert!(result.is_ok(), "{:?}", result.err().unwrap());

        let snapshot2 = result.unwrap();
        assert_eq!(snapshot.timestamp, snapshot2.timestamp);
        assert_eq!(snapshot.latest_block_id, snapshot2.latest_block_id);
        assert_eq!(snapshot.latest_block_hash, snapshot2.latest_block_hash);
        assert_eq!(snapshot2.slips.len(), 3);

        for (index, slip) in snapshot.slips.iter().enumerate() {
            let slip2 = snapshot2.slips.get(index).unwrap();
            assert_eq!(slip.public_key, slip2.public_key);
            assert_eq!(slip.block_id, slip2.block_id);
            assert_eq!(slip.tx_ordinal, slip2.tx_ordinal);
            assert_eq!(slip.amount, slip2.amount);
        }
    }
}
