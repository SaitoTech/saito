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

#[cfg(test)]
mod tests {
    use super::ApiMessage;

    // Item 25: buffer shorter than 4 bytes is rejected.
    #[test]
    fn deserialize_rejects_empty_buffer() {
        assert!(ApiMessage::deserialize(&vec![]).is_err());
    }

    #[test]
    fn deserialize_rejects_short_buffer() {
        assert!(ApiMessage::deserialize(&vec![0u8; 3]).is_err());
    }

    // Item 25: exactly 4 bytes (index only, empty data) is accepted.
    #[test]
    fn deserialize_accepts_four_byte_buffer() {
        let result = ApiMessage::deserialize(&vec![0u8; 4]);
        assert!(result.is_ok());
        let msg = result.unwrap();
        assert_eq!(msg.msg_index, 0);
        assert!(msg.data.is_empty());
    }

    // Item 25: round-trip serialize/deserialize preserves fields.
    #[test]
    fn serialize_deserialize_roundtrip() {
        let original = ApiMessage {
            msg_index: 42,
            data: vec![1, 2, 3],
        };
        let buf = original.serialize();
        let decoded = ApiMessage::deserialize(&buf).unwrap();
        assert_eq!(decoded.msg_index, 42);
        assert_eq!(decoded.data, vec![1, 2, 3]);
    }
}
