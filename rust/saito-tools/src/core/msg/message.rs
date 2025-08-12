use std::fmt::Debug;
use std::io::{Error, ErrorKind};

use log::{error, warn};

use crate::core::consensus::block::{Block, BlockType};
use crate::core::consensus::peers::peer_service::PeerService;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{BlockHash, BlockId, ForkId, SaitoPublicKey};
use crate::core::msg::api_message::ApiMessage;
use crate::core::msg::block_request::BlockchainRequest;
use crate::core::msg::ghost_chain_sync::GhostChainSync;
use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
use crate::core::util::serialize::Serialize;

#[derive(Debug)]
pub enum Message {
    HandshakeChallenge(HandshakeChallenge),
    HandshakeResponse(HandshakeResponse),
    Block(Block),
    Transaction(Transaction),
    BlockchainRequest(BlockchainRequest),
    BlockHeaderHash(BlockHash, BlockId),
    Ping(),
    SPVChain(),
    Services(Vec<PeerService>),
    GhostChain(GhostChainSync),
    GhostChainRequest(BlockId, BlockHash, ForkId),
    ApplicationMessage(ApiMessage),
    Result(ApiMessage),
    Error(ApiMessage),
    KeyListUpdate(Vec<SaitoPublicKey>),
}

impl Message {
    pub fn serialize(&self) -> Vec<u8> {
        let message_type: u8 = self.get_type_value();
        let mut buffer: Vec<u8> = vec![];
        buffer.extend(&message_type.to_be_bytes());
        buffer.append(&mut match self {
            Message::HandshakeChallenge(data) => data.serialize(),
            Message::HandshakeResponse(data) => data.serialize(),
            Message::ApplicationMessage(data) => data.serialize(),
            // Message::ApplicationTransaction(data) => data.clone(),
            Message::Block(data) => data.serialize_for_net(BlockType::Full),
            Message::Transaction(data) => data.serialize_for_net(),
            Message::BlockchainRequest(data) => data.serialize(),
            Message::BlockHeaderHash(block_hash, block_id) => {
                [block_hash.as_slice(), block_id.to_be_bytes().as_slice()].concat()
            }
            Message::GhostChain(chain) => chain.serialize(),
            Message::GhostChainRequest(block_id, block_hash, fork_id) => [
                block_id.to_be_bytes().as_slice(),
                block_hash.as_slice(),
                fork_id.as_slice(),
            ]
            .concat(),
            Message::Ping() => {
                vec![]
            }
            Message::Services(services) => PeerService::serialize_services(services),
            Message::Result(data) => data.serialize(),
            Message::Error(data) => data.serialize(),
            Message::KeyListUpdate(data) => data.as_slice().concat(),
            _ => {
                error!("unhandled type : {:?}", message_type);
                vec![]
            }
        });

        buffer
    }
    pub fn deserialize(buffer: Vec<u8>) -> Result<Message, Error> {
        if buffer.is_empty() {
            warn!("empty buffer is not valid for message deserialization",);
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let message_type: u8 = u8::from_be_bytes(buffer[0..1].try_into().unwrap());
        let buffer = buffer[1..].to_vec();

        match message_type {
            1 => {
                let result = HandshakeChallenge::deserialize(&buffer)?;
                Ok(Message::HandshakeChallenge(result))
            }
            2 => {
                let result = HandshakeResponse::deserialize(&buffer)?;
                Ok(Message::HandshakeResponse(result))
            }
            3 => {
                let block = Block::deserialize_from_net(&buffer)?;
                Ok(Message::Block(block))
            }
            4 => {
                let tx = Transaction::deserialize_from_net(&buffer)?;
                Ok(Message::Transaction(tx))
            }
            5 => {
                let result = BlockchainRequest::deserialize(&buffer)?;
                Ok(Message::BlockchainRequest(result))
            }
            6 => {
                if buffer.len() != 40 {
                    warn!(
                        "buffer size : {:?} is not valid for type : {:?}",
                        buffer.len(),
                        message_type
                    );
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let block_hash = buffer[0..32].to_vec().try_into().unwrap();
                let block_id = u64::from_be_bytes(buffer[32..40].to_vec().try_into().unwrap());
                Ok(Message::BlockHeaderHash(block_hash, block_id))
            }
            7 => Ok(Message::Ping()),
            8 => Ok(Message::SPVChain()),
            9 => {
                let services = PeerService::deserialize_services(buffer);
                if services.is_err() {
                    warn!("couldn't parse peer service from buffer");
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let services = services.unwrap();
                Ok(Message::Services(services))
            }
            10 => Ok(Message::GhostChain(GhostChainSync::deserialize(buffer))),
            11 => {
                if buffer.len() != 72 {
                    warn!(
                        "buffer size : {:?} is not valid for type : {:?}",
                        buffer.len(),
                        message_type
                    );
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let block_id = u64::from_be_bytes(buffer[0..8].try_into().unwrap());
                let block_hash = buffer[8..40].to_vec().try_into().unwrap();
                let fork_id = buffer[40..72].to_vec().try_into().unwrap();
                return Ok(Message::GhostChainRequest(block_id, block_hash, fork_id));
            }
            12 => {
                if buffer.len() < 4 {
                    warn!(
                        "buffer size : {:?} is not valid for type : {:?}",
                        buffer.len(),
                        message_type
                    );
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let result = ApiMessage::deserialize(&buffer);
                Ok(Message::ApplicationMessage(result))
            }
            13 => {
                if buffer.len() < 4 {
                    warn!(
                        "buffer size : {:?} is not valid for type : {:?}",
                        buffer.len(),
                        message_type
                    );
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let result = ApiMessage::deserialize(&buffer);
                Ok(Message::Result(result))
            }
            14 => {
                if buffer.len() < 4 {
                    warn!(
                        "buffer size : {:?} is not valid for type : {:?}",
                        buffer.len(),
                        message_type
                    );
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let result = ApiMessage::deserialize(&buffer);
                Ok(Message::Error(result))
            }
            15 => {
                if buffer.len() % 33 != 0 {
                    warn!(
                        "key list have invalid keys. total length : {:?}",
                        buffer.len()
                    );
                    return Err(Error::from(ErrorKind::InvalidData));
                }
                let key_count = buffer.len() / 33;
                let mut keylist: Vec<SaitoPublicKey> = vec![];
                let slice = buffer.as_slice();

                for i in 0..key_count {
                    let key: SaitoPublicKey =
                        slice[i * 33..(i + 1) * 33].to_vec().try_into().unwrap();

                    keylist.push(key);
                }
                Ok(Message::KeyListUpdate(keylist))
            }
            _ => {
                warn!("message type : {:?} not valid", message_type);
                Err(Error::from(ErrorKind::InvalidData))
            }
        }
    }
    pub fn get_type_value(&self) -> u8 {
        match self {
            Message::HandshakeChallenge(_) => 1,
            Message::HandshakeResponse(_) => 2,
            Message::Block(_) => 3,
            Message::Transaction(_) => 4,
            Message::BlockchainRequest(_) => 5,
            Message::BlockHeaderHash(_, _) => 6,
            Message::Ping() => 7,
            Message::SPVChain() => 8,
            Message::Services(_) => 9,
            Message::GhostChain(_) => 10,
            Message::GhostChainRequest(..) => 11,
            Message::ApplicationMessage(_) => 12,
            Message::Result(_) => 13,
            Message::Error(_) => 14,
            Message::KeyListUpdate(_) => 15,
        }
    }
}
