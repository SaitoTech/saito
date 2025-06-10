use std::io::Error;

pub trait Serialize<T> {
    fn serialize(&self) -> Vec<u8>;
    // TODO : change this to &[u8] to be more efficient
    fn deserialize(buffer: &Vec<u8>) -> Result<T, Error>;
}
