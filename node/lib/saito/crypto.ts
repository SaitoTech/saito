import Saito from 'saito-js/saito';
import node_cryptojs from 'node-cryptojs-aes';
import crypto from 'crypto-browserify';
import * as Base58 from 'base-58';
import secp256k1 from 'secp256k1';
const bip39 = require('bip39');

const CryptoJS = node_cryptojs.CryptoJS;
const JsonFormatter = node_cryptojs.JsonFormatter;

export default class Crypto {
  public hash(buffer: Uint8Array | string): string {
    // buffer = buffer || "";
    if (typeof buffer === 'string') {
      return Saito.getInstance().hash(Buffer.from(buffer));
    }
    // 64-bit hash
    return Saito.getInstance().hash(buffer);
  }

  public signBuffer(buffer: Uint8Array, privateKey: string): string {
    return Saito.getInstance().signBuffer(buffer, privateKey);
  }

  public verifySignature(buffer: Uint8Array, sig: string, publicKey: string): boolean {
    return Saito.getInstance().verifySignature(buffer, sig, publicKey);
  }

  public signMessage(msg: string, privateKey: string): string {
    return this.signBuffer(Buffer.from(msg, 'utf-8'), privateKey);
  }

  public verifyMessage(msg: string, sig: string, publicKey: string): boolean {
    return this.verifySignature(Buffer.from(msg, 'utf-8'), sig, publicKey);
  }

  ////////////////////////////////
  // AES SYMMETRICAL ENCRYPTION //
  ////////////////////////////////
  //
  // once we have a shared secret (possibly generated through the
  // Diffie-Hellman method above), we can use it to encrypt and
  // decrypt communications using a symmetrical encryption method
  // like AES.
  //

  /**
   * Encrypts with AES
   * @param {string} msg msg to encrypt
   * @param {string} secret shared secret
   * @returns {string} json object
   */
  aesEncrypt(msg, secret) {
    const rp = secret.toString('hex');
    const en = CryptoJS.AES.encrypt(msg, rp, { format: JsonFormatter });
    return en.toString();
  }

  /**
   * Decrypt with AES
   * @param {string} msg encrypted json object from aesEncrypt
   * @param {string} secret shared secret
   * @returns {string} unencrypted string
   */
  aesDecrypt(msg, secret) {
    const rp = secret.toString('hex');
    const de = CryptoJS.AES.decrypt(msg, rp, { format: JsonFormatter });
    return CryptoJS.enc.Utf8.stringify(de);
  }

  ////////////////////
  // DIFFIE HELLMAN //
  ////////////////////
  //
  // The DiffieHellman process allows two people to generate a shared
  // secret in an environment where all information exchanged between
  // the two can be observed by others.
  //
  // It is used by our encryption module to generate shared secrets,
  // but is generally useful enough that we include it in our core
  // cryptography class
  //
  // see the "encryption" module for an example of how to generate
  // a shared secret using these functions
  //

  /**
   * Creates DiffieHellman object
   * @param {string} pubkey public key
   * @param {string} privkey private key
   * @returns {DiffieHellman object} ecdh
   */
  createDiffieHellman(pubkey = '', privkey = '') {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    if (pubkey != '') {
      ecdh.setPublicKey(pubkey);
    }
    if (privkey != '') {
      ecdh.setPrivateKey(privkey);
    }
    return ecdh;
  }

  generateKeys(): string {
    return Saito.getInstance().generatePrivateKey();
  }

  generatePublicKey(privateKey: string): string {
    return Saito.getInstance().generatePublicKey(privateKey);
  }

  /**
   * Creates a random number, but not a privatekey. used for
   * XOR encryption in the game engine among other uses. public/private keypair. returns the string
   * @returns {string} private key
   */
  generateRandomNumber() {
    const randomNumber = crypto.randomBytes(32);
    return randomNumber.toString('hex');
  }

  ///////////////////////////////////
  // ELLIPTICAL CURVE CRYPTOGRAPHY //
  ///////////////////////////////////
  /**
   * Compresses public key
   *
   * @param {string} pubkey
   * @returns {string} compressed publickey
   */
  compressPublicKey(pubkey) {
    // prettier-ignore
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.toBase58(secp256k1.publicKeyConvert(Buffer.from(pubkey, "hex"), true).toString("hex"));
  }

  /**
   * Converts base58 string to hex string
   *
   * @param {string} t string to convertches
   * @returns {string} converted string
   */
  fromBase58(t: string): string {
    return Buffer.from(Base58.decode(t)).toString('hex');
  }

  /**
   * Converts hex string to base58 string
   *
   * @param {string} t string to convert
   * @returns {string} converted string
   */
  toBase58(t: string): string {
    return Base58.encode(Buffer.from(t, 'hex'));
  }

  stringToBase64(str: string): string {
    return Buffer.from(str, 'utf-8').toString('base64');
  }

  base64ToString(str: string): string {
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  stringToHex(str) {
    return Buffer.from(str, 'utf-8').toString('hex');
  }

  hexToString(hex) {
    return Buffer.from(hex, 'hex').toString('utf-8');
  }

  //////////////////////////
  // XOR - used in gaming //
  //////////////////////////
  //
  // XOR encrypt and decrypt code taken from
  //
  // https://www.npmjs.com/package/bitwise-xor
  //
  // this needs to be replaced by a more secure commutive encryption algorithm
  //
  xor(a, b) {
    let i;
    if (!Buffer.isBuffer(a)) a = new Buffer(a);
    if (!Buffer.isBuffer(b)) b = new Buffer(b);
    const res = [];
    if (a.length > b.length) {
      for (i = 0; i < b.length; i++) {
        res.push(a[i] ^ b[i]);
      }
    } else {
      for (i = 0; i < a.length; i++) {
        res.push(a[i] ^ b[i]);
      }
    }
    return new Buffer(res);
  }

  //
  // TODO - don't pad key this way as it creates attack vectors
  //
  encodeXOR(plaintext, key) {
    while (plaintext.length > key.length) {
      key = key + key;
    }
    return this.xor(Buffer.from(plaintext, 'hex'), Buffer.from(key, 'hex')).toString('hex');
  }

  //
  // TODO - don't pad key this way as it creates attack vectors
  //
  decodeXOR(str, key) {
    while (str.length > key.length) {
      key = key + key;
    }
    return this.xor(Buffer.from(str, 'hex'), Buffer.from(key, 'hex')).toString('hex');
  }

  /**
   * returns true if this is an AES encrypted message as opposed to
   * a plaintext-containing javascript object.
   **/
  isAesEncrypted(msg) {
    try {
      let msg2 = JSON.parse(msg);
      if (msg2.ct) {
        return true;
      }
    } catch (err) {
      return false;
    }
    return false;
  }

  //////////////////////////
  // Faster Serialization //
  //////////////////////////
  //
  // Yes, this isn't a cryptographic function, but we can put it here
  // until it makes sense to create a dedicated helper class.
  //
  fastSerialize(jsobj) {
    return JSON.stringify(jsobj);
    //    return stringify(jsobj);
  }

  // used in games
  convertStringToDecimalPrecision(stringx, p = 8) {
    stringx = parseFloat(stringx);
    return stringx.toFixed(p).replace(/0+$/, '').replace(/\.$/, '.0').replace(/\.0$/, '');
  }
  // used in games
  convertFloatToSmartPrecision(num, max_precision = 8, min_precision = 0) {
    let stringx = num
      .toFixed(max_precision)
      .replace(/0+$/, '')
      .replace(/\.$/, '.0')
      .replace(/\.0$/, '');
    if (min_precision) {
      let split_string = stringx.split('.');
      let fraction = split_string[1] || '';
      if (fraction.length < min_precision) {
        fraction = fraction.padEnd(min_precision, '0');
      }
      stringx = split_string[0] + '.' + fraction;
    }

    return stringx;
  }

  isValidPublicKey(key) {
    if (typeof key !== 'string') {
      return false;
    }

    if (key.length !== 44) {
      return false;
    }

    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    return base58Regex.test(key);
  }

  isPublicKey(publicKey: string) {
    if (publicKey) {
      if (publicKey.indexOf('@') <= 0) {
        if (this.isBase58(publicKey)) {
          return 1;
        }
      }
    }
    return 0;
  }

  isBase58(t: string) {
    return /^[A-HJ-NP-Za-km-z1-9]*$/.test(t);
  }

  //Restoring these functions ...

  generateSeedFromPrivateKey(existingPrivateKey: String) {
    // Create a seed that will deterministically generate your key first
    let seed = Buffer.from(existingPrivateKey, 'hex');

    // Generate mnemonic from this seed
    const mnemonic = bip39.entropyToMnemonic(seed);

    return mnemonic;
  }

  getPrivateKeyFromSeed(mnemonic: string) {
    try {
      // Validate the mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic');
      }

      // Convert mnemonic back to entropy
      const privateKey = bip39.mnemonicToEntropy(mnemonic);

      // Verify if this is a valid secp256k1 private key
      if (!secp256k1.privateKeyVerify(Buffer.from(privateKey, 'hex'))) {
        throw new Error('Generated private key is not valid for secp256k1');
      }

      return privateKey;
    } catch (error) {
      console.error('Error getting private key from seed:', error);
      return null;
    }
  }

  //////////////////////////////////////
  // ECIES ENCRYPTION/DECRYPTION FUNCTIONS //
  // AI generated -- Daniel edited
  //////////////////////////////////////

  /**
   * Encrypts binary data using ECIES (Elliptic Curve Integrated Encryption Scheme)
   * with a Saito public key. This allows encrypting files or any binary data.
   *
   * @param {string} str - plain text to encrypt
   * @param {string} recipientPublicKey - The Saito public key (base58) to encrypt for
   * @returns {Promise<Buffer>} The encrypted data as a buffer
   * @throws {Error} If encryption fails or invalid public key

    Hint --  data = Buffer.from(str, 'utf8');
   */
  encryptWithPublicKey(data: Buffer, recipientPublicKey: string): Buffer {
    try {
      // Convert base58 public key to hex format for secp256k1
      const publicKeyHex = this.fromBase58(recipientPublicKey);
      const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');

      // Generate ephemeral key pair
      let ephemeralPrivateKey: Buffer;
      let ephemeralPublicKey: Buffer;

      do {
        ephemeralPrivateKey = crypto.randomBytes(32);
      } while (!secp256k1.privateKeyVerify(ephemeralPrivateKey));

      ephemeralPublicKey = Buffer.from(secp256k1.publicKeyCreate(ephemeralPrivateKey, false));

      // Compute shared secret using ECDH
      const sharedPoint = Buffer.from(
        secp256k1.publicKeyTweakMul(publicKeyBuffer, ephemeralPrivateKey)
      );

      // Derive encryption key from shared secret (using x-coordinate)
      const sharedSecret = sharedPoint.slice(1, 33); // Extract x-coordinate (32 bytes)

      // Encrypt the data using AES with the shared secret
      const encryptedData = this.aesEncrypt(data.toString('base64'), sharedSecret);

      // Create the final encrypted package: ephemeral public key + encrypted data
      const ephemeralPublicKeyCompressed = Buffer.from(
        secp256k1.publicKeyConvert(ephemeralPublicKey, true)
      );
      const encryptedBuffer = Buffer.from(encryptedData, 'utf8');

      // Package: [33 bytes ephemeral pubkey] + [encrypted data]
      const result = Buffer.concat([ephemeralPublicKeyCompressed, encryptedBuffer]);

      return result;
    } catch (error) {
      console.error('Error encrypting with public key:', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts binary data using ECIES with this wallet's private key.
   *
   * @param {Buffer} encryptedData - The encrypted data buffer (ephemeral pubkey + encrypted data)
   * @param {string} privateKeyHex - our base58 encoded private key provided by the wallet via the module
   * @returns {string} The decrypted data as a readable string (or stringified JSON object)
   * @throws {Error} If decryption fails or invalid data format
   *
   * HINT -- returnValue.toString('utf8') --> readable text
   */
  decryptWithPrivateKey(encryptedData: Buffer, privateKeyHex: string): Buffer {
    try {
      if (encryptedData.length < 33) {
        throw new Error('Invalid encrypted data format: too short');
      }

      // Extract ephemeral public key (first 33 bytes) and encrypted payload
      const ephemeralPublicKey = encryptedData.slice(0, 33);
      const encryptedPayload = encryptedData.slice(33);

      // Get our private key
      const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');

      // Verify the ephemeral public key is valid
      if (!secp256k1.publicKeyVerify(ephemeralPublicKey)) {
        throw new Error('Invalid ephemeral public key in encrypted data');
      }

      // Convert ephemeral public key to uncompressed format for ECDH
      const ephemeralPublicKeyUncompressed = Buffer.from(
        secp256k1.publicKeyConvert(ephemeralPublicKey, false)
      );

      // Compute shared secret using ECDH
      const sharedPoint = Buffer.from(
        secp256k1.publicKeyTweakMul(ephemeralPublicKeyUncompressed, privateKeyBuffer)
      );

      // Derive decryption key from shared secret (using x-coordinate)
      const sharedSecret = sharedPoint.slice(1, 33); // Extract x-coordinate (32 bytes)

      // Decrypt the data using AES
      const encryptedString = encryptedPayload.toString('utf8');
      const decryptedBase64 = this.aesDecrypt(encryptedString, sharedSecret);

      if (!decryptedBase64) {
        throw new Error('Failed to decrypt data - invalid shared secret or corrupted data');
      }

      // Convert back from base64 to binary
      const decryptedData = Buffer.from(decryptedBase64, 'base64');

      return decryptedData;
    } catch (error) {
      console.error('Error decrypting with private key:', error);
    }
  }

  ////////////////////////
  // Encryption Example!
  ////////////////////////
  /*
  let a = this.app.crypto.encryptWithPublicKey(
    Buffer.from(JSON.stringify(this.mixin), 'utf8'),
    this.publicKey
  );
  a = a.toString('base64');
  a = Buffer.from(a, 'base64');
  let b = this.app.crypto.decryptWithPrivateKey(a, await this.app.wallet.getPrivateKey());
  */
}
