const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const DEFAULT_ITERATIONS = 600000;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPackage(plaintext, password, iterations = DEFAULT_ITERATIONS) {
  const secret = String(password || '');
  if (!secret) {
    throw new Error('Choose a password before encrypting this document.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt, iterations);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    textEncoder.encode(String(plaintext))
  ));
  return JSON.stringify({
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext)
  });
}

function readEnvelope(serialized) {
  let envelope;
  try {
    envelope = JSON.parse(String(serialized || ''));
  } catch (err) {
    throw new Error('This encrypted document could not be read.');
  }
  const iterations = Number(envelope?.iterations);
  if (envelope?.v !== 1 || envelope?.kdf !== 'PBKDF2-SHA-256' || !Number.isInteger(iterations) || iterations < 1) {
    throw new Error('This encrypted document uses an unsupported protection format.');
  }
  return {
    iterations,
    salt: base64ToBytes(envelope.salt),
    nonce: base64ToBytes(envelope.nonce),
    ciphertext: base64ToBytes(envelope.ciphertext)
  };
}

async function decryptPackage(serialized, password) {
  const envelope = readEnvelope(serialized);
  const key = await deriveKey(String(password || ''), envelope.salt, envelope.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.nonce },
      key,
      envelope.ciphertext
    );
    return textDecoder.decode(plain);
  } catch (err) {
    const failure = new Error('The password could not unlock this document.');
    failure.code = 'password';
    throw failure;
  }
}

module.exports = {
  DEFAULT_ITERATIONS,
  encryptPackage,
  decryptPackage,
  readEnvelope
};
