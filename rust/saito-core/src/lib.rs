//! This module implements the core logic layer for saito. Every node which hopes to run the
//! saito consensus should be implemented with this library.

pub mod core;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
