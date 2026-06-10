use std::fmt::Debug;
use std::io::{Error, ErrorKind};

use crate::core::consensus::block::{Block, BlockType};
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::SaitoPublicKey;
use crate::core::network::msg::api_message::ApiMessage;
use crate::core::network::msg::block::{BlockReference, RequestBlockReference};
use crate::core::network::msg::blockchain::{Blockchain, RequestBlockchain};
use crate::core::network::msg::handshake::{Handshake, RequestHandshake};
use crate::core::network::msg::services::{RequestServices, Services};
use crate::core::util::configuration::Endpoint;
use crate::core::util::serialize::Serialize;
use log::{error, warn};

#[derive(Debug)]
pub enum Message {
    RequestHandshake(RequestHandshake),
    Handshake(Handshake),
    Block(Block),
    Transaction(Transaction),
    RequestBlockchain(RequestBlockchain),
    Blockchain(Blockchain),
    BlockReference(BlockReference),
    RequestBlockReference(RequestBlockReference),
    Ping(),
    Pong(),
    RequestServices(RequestServices),
    Services(Services),
    ApplicationMessage(ApiMessage),
    Result(ApiMessage),
    Error(ApiMessage),
    KeyList(Vec<SaitoPublicKey>),
    RequestGenesisBlockReference(),
    GenesisBlockReference(BlockReference),
    Disconnect(String),
    RequestEndpoint(),
    Endpoint(String),
}

impl Message {
    pub fn serialize(&self) -> Vec<u8> {
        let message_type: u8 = self.get_type_value();
        let mut buffer: Vec<u8> = vec![];
        buffer.extend(&message_type.to_be_bytes());
        buffer.append(&mut match self {
            Message::RequestHandshake(data) => data.serialize(),
            Message::Handshake(data) => data.serialize(),
            Message::ApplicationMessage(data) => data.serialize(),
            Message::Block(data) => data.serialize_for_net(BlockType::Full),
            Message::Transaction(data) => data.serialize_for_net(),
            Message::RequestBlockchain(data) => data.serialize(),
            Message::Blockchain(data) => data.serialize(),
            Message::BlockReference(data) => data.serialize(),
            Message::RequestBlockReference(data) => data.serialize(),
            Message::Ping() => vec![],
            Message::Pong() => vec![],
            Message::Services(data) => data.serialize(),
            Message::RequestServices(data) => data.serialize(),
            Message::Result(data) => data.serialize(),
            Message::Error(data) => data.serialize(),
            Message::KeyList(data) => data.as_slice().concat(),
            Message::RequestGenesisBlockReference() => vec![],
            Message::GenesisBlockReference(data) => data.serialize(),
            Message::Disconnect(message) => message.as_bytes().to_vec(),
            Message::RequestEndpoint() => {
                vec![]
            }
            Message::Endpoint(endpoint) => endpoint.as_bytes().to_vec(),
        });

        buffer
    }

    pub fn deserialize(buffer: Vec<u8>) -> Result<Message, Error> {
        if buffer.is_empty() {
            warn!("empty buffer is not valid for message deserialization",);
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let message_type: u8 =
            u8::from_be_bytes(buffer[0..1].try_into().or(Err(ErrorKind::InvalidData))?);
        let buffer = buffer[1..].to_vec();

        match message_type {
            1 => {
                let result = RequestHandshake::deserialize(&buffer)?;
                Ok(Message::RequestHandshake(result))
            }
            2 => {
                let result = Handshake::deserialize(&buffer)?;
                Ok(Message::Handshake(result))
            }
            3 => {
                let block = Block::deserialize_from_net(&buffer)?;
                Ok(Message::Block(block))
            }
            4 => {
                let tx = Transaction::deserialize_from_net(&buffer)?;
                Ok(Message::Transaction(tx))
            }
            // 5 = legacy RequestBlockchain (block_request); removed from protocol surface.
            5 => {
                warn!("rejecting deprecated message type 5 (legacy RequestBlockchain wire)");
                Err(Error::from(ErrorKind::InvalidData))
            }
            6 => Ok(Message::BlockReference(BlockReference::deserialize(
                &buffer,
            )?)),
            7 => Ok(Message::Ping()),
            // 8 = SPVChain; removed.
            8 => {
                warn!("rejecting deprecated message type 8 (SPVChain)");
                Err(Error::from(ErrorKind::InvalidData))
            }
            20 => Ok(Message::RequestServices(RequestServices::deserialize(
                &buffer,
            )?)),
            9 => Ok(Message::Services(Services::deserialize(&buffer)?)),
            // 10 = GhostChain; removed.
            10 => {
                warn!("rejecting deprecated message type 10 (GhostChain)");
                Err(Error::from(ErrorKind::InvalidData))
            }
            // 11 = RequestGhostChain; removed.
            11 => {
                warn!("rejecting deprecated message type 11 (RequestGhostChain)");
                Err(Error::from(ErrorKind::InvalidData))
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
                let result = ApiMessage::deserialize(&buffer)?;
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
                let result = ApiMessage::deserialize(&buffer)?;
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
                let result = ApiMessage::deserialize(&buffer)?;
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
                    let key: SaitoPublicKey = slice[i * 33..(i + 1) * 33]
                        .to_vec()
                        .try_into()
                        .or(Err(ErrorKind::InvalidData))?;

                    keylist.push(key);
                }
                Ok(Message::KeyList(keylist))
            }
            16 => Ok(Message::Pong()),
            17 => Ok(Message::RequestGenesisBlockReference()),
            18 => Ok(Message::GenesisBlockReference(BlockReference::deserialize(
                &buffer,
            )?)),
            19 => {
                let str = String::from_utf8(buffer.to_vec()).or(Err(ErrorKind::InvalidData))?;
                Ok(Message::Disconnect(str))
            }
            21 => Ok(Message::RequestBlockchain(RequestBlockchain::deserialize(
                &buffer,
            )?)),
            22 => Ok(Message::Blockchain(Blockchain::deserialize(&buffer)?)),
            23 => Ok(Message::RequestBlockReference(
                RequestBlockReference::deserialize(&buffer)?,
            )),
            24 => Ok(Message::RequestEndpoint()),
            25 => Ok(Message::Endpoint(
                String::from_utf8(buffer).or(Err(ErrorKind::InvalidData))?,
            )),
            _ => {
                error!("message type : {:?} not valid", message_type);
                Err(Error::from(ErrorKind::InvalidData))
            }
        }
    }

    pub fn get_type_value(&self) -> u8 {
        match self {
            Message::RequestHandshake(_) => 1,
            Message::Handshake(_) => 2,
            Message::Block(_) => 3,
            Message::Transaction(_) => 4,
            Message::BlockReference(_) => 6,
            Message::Ping() => 7,
            Message::ApplicationMessage(_) => 12,
            Message::Result(_) => 13,
            Message::Error(_) => 14,
            Message::KeyList(_) => 15,
            Message::Pong() => 16,
            Message::RequestGenesisBlockReference() => 17,
            Message::GenesisBlockReference(_) => 18,
            Message::Disconnect(_) => 19,
            Message::RequestServices(_) => 20,
            Message::Services(_) => 9,
            Message::RequestBlockchain(_) => 21,
            Message::Blockchain(_) => 22,
            Message::RequestBlockReference(_) => 23,
            Message::RequestEndpoint() => 24,
            Message::Endpoint(_) => 25,
        }
    }
}
