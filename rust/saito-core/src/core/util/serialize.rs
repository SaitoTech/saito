use std::io::Error;

pub trait Serialize<T> {
    fn serialize(&self) -> Vec<u8>;
    fn deserialize(buffer: &Vec<u8>) -> Result<T, Error>;
}
