use crate::core::defs::{PrintForLog, SaitoHash, SaitoPrivateKey, SaitoPublicKey, SaitoSignature};
use blake3::Hasher;
use block_modes::BlockMode;
pub use merkle::MerkleTree;
use rand::{thread_rng, Rng, SeedableRng};
use secp256k1::ecdsa;
pub use secp256k1::{Message, PublicKey, SecretKey, SECP256K1};

// type Aes128Cbc = Cbc<Aes128, Pkcs7>;

pub const PARALLEL_HASH_BYTE_THRESHOLD: usize = 128_000;

// pub fn encrypt_with_password(msg: &[u8], password: &[u8]) -> Vec<u8> {
//     let hash = hash(password);
//     let mut key: [u8; 16] = [0; 16];
//     let mut iv: [u8; 16] = [0; 16];
//     key.clone_from_slice(&hash[0..16]);
//     iv.clone_from_slice(&hash[16..32]);
//
//     let cipher = Aes128Cbc::new_from_slices(&key, &iv).unwrap();
//     let encrypt_msg = cipher.encrypt_vec(msg);
//
//     return encrypt_msg;
// }

// pub fn decrypt_with_password(msg: &[u8], password: &str) -> Vec<u8> {
//     let hash = hash(password.as_bytes());
//     let mut key: [u8; 16] = [0; 16];
//     let mut iv: [u8; 16] = [0; 16];
//     key.clone_from_slice(&hash[0..16]);
//     iv.clone_from_slice(&hash[16..32]);
//
//     let cipher = Aes128Cbc::new_from_slices(&key, &iv).unwrap();
//     let decrypt_msg = cipher.decrypt_vec(msg).unwrap();
//
//     return decrypt_msg;
// }

pub fn generate_keys() -> (SaitoPublicKey, SaitoPrivateKey) {
    let (mut secret_key, mut public_key) =
        SECP256K1.generate_keypair(&mut secp256k1::rand::thread_rng());
    while public_key.serialize().to_base58().len() != 44 {
        // sometimes secp256k1 address is too big to store in 44 base-58 digits
        let keypair_tuple = SECP256K1.generate_keypair(&mut secp256k1::rand::thread_rng());
        secret_key = keypair_tuple.0;
        public_key = keypair_tuple.1;
    }
    let mut secret_bytes = [0u8; 32];
    for i in 0..32 {
        secret_bytes[i] = secret_key[i];
    }
    (public_key.serialize(), secret_bytes)
}

/// Create and return a keypair with  the given hex u8 array as the private key
pub fn generate_keypair_from_private_key(slice: &[u8]) -> (SaitoPublicKey, SaitoPrivateKey) {
    let secret_key = SecretKey::from_slice(slice).unwrap();
    let public_key = PublicKey::from_secret_key(SECP256K1, &secret_key);
    let mut secret_bytes = [0u8; 32];
    for i in 0..32 {
        secret_bytes[i] = secret_key[i];
    }
    (public_key.serialize(), secret_bytes)
}

pub fn sign_blob<'a>(vbytes: &'a mut Vec<u8>, private_key: &SaitoPrivateKey) -> &'a mut Vec<u8> {
    let sig = sign(&hash(vbytes.as_ref()), private_key);
    vbytes.extend(&sig);
    vbytes
}
#[cfg(test)]
lazy_static::lazy_static! {
    pub static ref TEST_RNG: tokio::sync::Mutex<rand::rngs::StdRng>  = tokio::sync::Mutex::new(create_test_rng());
}

fn create_test_rng() -> rand::rngs::StdRng {
    rand::rngs::StdRng::from_seed([0; 32])
}

pub async fn generate_random_bytes(len: u64) -> Vec<u8> {
    if len == 0 {
        let x: Vec<u8> = vec![];
        return x;
    }
    // Don't have to be cryptographically secure, since we only need a random hash and only check the signature of that in return

    #[cfg(not(test))]
    {
        let mut rng = thread_rng();
        (0..len).map(|_| rng.gen::<u8>()).collect()
    }
    #[cfg(test)]
    {
        // let mut rng = TEST_RNG.clone();
        let mut rng = TEST_RNG.lock().await;
        (0..len).map(|_| rng.gen::<u8>()).collect()
    }
}

pub fn hash(data: &[u8]) -> SaitoHash {
    let mut hasher = Hasher::new();
    // Hashing in parallel can be faster if large enough
    // TODO: Blake3 has benchmarked 128 kb as the cutoff,
    //  the benchmark should be redone for Saito's needs

    #[cfg(feature = "with-rayon")]
    {
        if data.len() > PARALLEL_HASH_BYTE_THRESHOLD {
            hasher.update_rayon(data);
        } else {
            hasher.update(data);
        }
    }
    #[cfg(not(feature = "with-rayon"))]
    {
        hasher.update(data);
    }

    hasher.finalize().into()
}

pub fn sign(message_bytes: &[u8], private_key: &SaitoPrivateKey) -> SaitoSignature {
    let hash = hash(message_bytes);
    let msg = Message::from_slice(&hash).unwrap();
    let secret = SecretKey::from_slice(private_key).unwrap();
    let sig = SECP256K1.sign_ecdsa(&msg, &secret);
    sig.serialize_compact()
}

pub fn verify(msg: &[u8], sig: &SaitoSignature, public_key: &SaitoPublicKey) -> bool {
    let hash = hash(msg);
    verify_signature(&hash, sig, public_key)
}

pub fn verify_signature(
    hash: &SaitoHash,
    sig: &SaitoSignature,
    public_key: &SaitoPublicKey,
) -> bool {
    let m = Message::from_slice(hash);
    let p = PublicKey::from_slice(public_key);
    let s = ecdsa::Signature::from_compact(sig);
    if m.is_err() || p.is_err() || s.is_err() {
        false
    } else {
        SECP256K1
            .verify_ecdsa(&m.unwrap(), &s.unwrap(), &p.unwrap())
            .is_ok()
    }
}

pub fn is_valid_public_key(key: &SaitoPublicKey) -> bool {
    let result = PublicKey::from_slice(key);
    result.is_ok()
}

#[cfg(test)]
mod tests {

    use crate::core::defs::SaitoPrivateKey;

    use super::*;

    // #[test]
    // //
    // // test symmetrical encryption works properly
    // //
    // fn symmetrical_encryption_test() {
    //     let text = "This is our unencrypted text";
    //     let e = encrypt_with_password(text.as_bytes(), "asdf");
    //     let d = decrypt_with_password(e.as_slice(), "asdf");
    //     let dtext = str::from_utf8(&d).unwrap();
    //     assert_eq!(text, dtext);
    // }

    #[test]
    fn keypair_restoration_from_private_key_test() {
        let (public_key, private_key) = generate_keys();
        let (public_key2, private_key2) = generate_keypair_from_private_key(&private_key);
        assert_eq!(public_key, public_key2);
        assert_eq!(private_key, private_key2);
    }

    #[test]
    fn sign_message_test() {
        let msg = <[u8; 32]>::from_hex(
            "5a16ffa08e5fc440772ee962c1d730041f12c7008a6e5c704d13dfd3d1906e0d",
        )
        .unwrap();

        let hex = hash(msg.as_slice());

        let hex_str = hex.to_hex();
        assert_eq!(
            hex_str,
            "f8b1f22222bdbd2e0bce06707a51f5fffa0753b11483c330e3bfddaf5bacabd6"
        );

        let private_key: SaitoPrivateKey = <[u8; 32]>::from_hex(
            "4a16ffa08e5fc440772ee962c1d730041f12c7008a6e5c704d13dfd3d1905e0d",
        )
        .unwrap();

        let (public, _) = generate_keypair_from_private_key(&private_key);

        let signature = sign(&msg, &private_key);
        assert_eq!(signature.len(), 64);
        let hex_str = signature.to_hex();
        assert_eq!(hex_str, "11c0e19856726c42c8ac3ec8e469057f5f8a882f7206377525db00899835b03f6ec3010d19534a5703dd9b1004b4f0e31d19582cdd5aec794541d0d0f339db7c");

        let result = verify(&msg, &signature, &public);
        assert!(result);
    }

    #[test]
    fn verify_message_test() {
        let msg = <[u8; 32]>::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8b",
        )
        .unwrap();

        let (public_key, private_key) = generate_keys();
        let (public_key2, private_key2) = generate_keys();

        assert_eq!(verify(&msg, &sign(&msg, &private_key), &public_key), true);
        assert_eq!(verify(&msg, &sign(&msg, &private_key2), &public_key2), true);
        assert_eq!(verify(&msg, &sign(&msg, &private_key), &public_key2), false);
        assert_eq!(verify(&msg, &sign(&msg, &private_key2), &public_key), false);
    }

    #[test]
    fn is_valid_public_key_test() {
        let (public_key, _) = generate_keys();
        assert!(is_valid_public_key(&public_key));

        let public_key: SaitoPublicKey = [0; 33];
        assert!(!is_valid_public_key(&public_key));

        let public_key: SaitoPublicKey = [u8::try_from('a').unwrap(); 33];
        assert!(!is_valid_public_key(&public_key));
    }
}
