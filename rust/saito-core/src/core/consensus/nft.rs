use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::defs::{PrintForLog, SaitoPublicKey, SaitoUTXOSetKey};
use crate::core::util::crypto::{hash, verify_signature};

// Bound (slip1) – Normal|ATR (slip2) – Bound (slip3); slip3.amount == 0.
#[derive(Clone, Debug, PartialEq)]
pub struct NFTTuple {
    pub slip1: Slip,
    pub slip2: Slip,
    pub slip3: Slip,
}

pub fn tuple_from_utxo_hex_keys(
    utxokey1: &str,
    utxokey2: &str,
    utxokey3: &str,
    blockchain: &Blockchain,
) -> Option<NFTTuple> {
    let key1 = SaitoUTXOSetKey::from_hex(utxokey1).ok()?;
    let key2 = SaitoUTXOSetKey::from_hex(utxokey2).ok()?;
    let key3 = SaitoUTXOSetKey::from_hex(utxokey3).ok()?;

    if !blockchain.is_slip_unlocked(&key1)
        || !blockchain.is_slip_unlocked(&key2)
        || !blockchain.is_slip_unlocked(&key3)
    {
        return None;
    }

    let slip1 = Slip::parse_slip_from_utxokey(&key1).ok()?;
    let slip2 = Slip::parse_slip_from_utxokey(&key2).ok()?;
    let slip3 = Slip::parse_slip_from_utxokey(&key3).ok()?;

    from_slips(&slip1, &slip2, &slip3)
}

pub fn verify_owner_tx_signature(tx: &Transaction, owner_public_key: &SaitoPublicKey) -> bool {
    let hash_for_signature: Option<[u8; 32]> = if let Some(h) = tx.hash_for_signature {
        Some(h)
    } else if matches!(tx.transaction_type, TransactionType::SPV) {
        tx.signature
            .get(0..32)
            .and_then(|slice| slice.try_into().ok())
    } else {
        Some(hash(&tx.serialize_for_signature()))
    };

    if let Some(hash_for_signature) = hash_for_signature {
        if !hash_for_signature.iter().all(|&b| b == 0)
            && verify_signature(&hash_for_signature, &tx.signature, owner_public_key)
        {
            return true;
        }
    }

    false
}

pub fn from_slips(slip1: &Slip, slip2: &Slip, slip3: &Slip) -> Option<NFTTuple> {
    if slip1.slip_type != SlipType::Bound
        || slip3.slip_type != SlipType::Bound
        || !(slip2.slip_type == SlipType::Normal || slip2.slip_type == SlipType::ATR)
    {
        return None;
    }
    if slip1.amount == 0 || slip3.amount != 0 {
        return None;
    }
    Some(NFTTuple {
        slip1: slip1.clone(),
        slip2: slip2.clone(),
        slip3: slip3.clone(),
    })
}

pub fn get_tuples(tx: &Transaction) -> (Vec<NFTTuple>, Vec<NFTTuple>) {
    if tx.transaction_type != TransactionType::Bound {
        return (Vec::new(), Vec::new());
    }
    (collect_tuples(&tx.from, tx), collect_tuples(&tx.to, tx))
}

pub fn get_id(tuple: &NFTTuple) -> String {
    tuple.slip3.public_key.to_hex().to_ascii_lowercase()
}

pub fn get_type(tuple: &NFTTuple) -> String {
    let type_bytes = &tuple.slip3.public_key[17..33];
    let end = type_bytes
        .iter()
        .rposition(|&b| b != 0)
        .map(|i| i + 1)
        .unwrap_or(0);
    String::from_utf8_lossy(&type_bytes[..end]).into_owned()
}

pub fn get_creator(tuple: &NFTTuple) -> String {
    tuple.slip1.public_key.to_base58()
}

pub fn get_owner(tuple: &NFTTuple) -> String {
    tuple.slip2.public_key.to_base58()
}

pub fn get_amount(tuple: &NFTTuple) -> u64 {
    tuple.slip1.amount
}

pub fn get_deposit(tuple: &NFTTuple) -> u64 {
    tuple.slip2.amount
}

fn collect_tuples(slips: &[Slip], tx: &Transaction) -> Vec<NFTTuple> {
    let mut tuples = Vec::new();
    let mut idx = 0;

    while idx + 2 < slips.len() {
        if tx.is_nft(slips, idx) {
            if let Some(tuple) = from_slips(&slips[idx], &slips[idx + 1], &slips[idx + 2]) {
                tuples.push(tuple);
            }
            idx += 3;
        } else {
            idx += 1;
        }
    }

    tuples
}
