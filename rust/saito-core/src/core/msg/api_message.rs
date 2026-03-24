use std::io::{Error, ErrorKind};

#[derive(Clone, Debug)]
pub struct ApiMessage {
    pub msg_index: u32,
    pub data: Vec<u8>,
}

impl ApiMessage {
    pub fn serialize(&self) -> Vec<u8> {
        [
            self.msg_index.to_be_bytes().as_slice(),
            self.data.as_slice(),
        ]
        .concat()
    }
    pub fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() < 4 {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let index = u32::from_be_bytes(
            buffer[0..4]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let data = buffer[4..].to_vec();
        Ok(ApiMessage {
            msg_index: index,
            data,
        })
    }
}
