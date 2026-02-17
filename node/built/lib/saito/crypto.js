"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const saito_1 = __importDefault(require("saito-js/saito"));
const node_cryptojs_aes_1 = __importDefault(require("node-cryptojs-aes"));
const crypto_browserify_1 = __importDefault(require("crypto-browserify"));
const Base58 = __importStar(require("base-58"));
const secp256k1_1 = __importDefault(require("secp256k1"));
const bip39 = require('bip39');
const CryptoJS = node_cryptojs_aes_1.default.CryptoJS;
const JsonFormatter = node_cryptojs_aes_1.default.JsonFormatter;
class Crypto {
    hash(buffer) {
        // buffer = buffer || "";
        if (typeof buffer === 'string') {
            return saito_1.default.getInstance().hash(Buffer.from(buffer));
        }
        // 64-bit hash
        return saito_1.default.getInstance().hash(buffer);
    }
    signBuffer(buffer, privateKey) {
        return saito_1.default.getInstance().signBuffer(buffer, privateKey);
    }
    verifySignature(buffer, sig, publicKey) {
        return saito_1.default.getInstance().verifySignature(buffer, sig, publicKey);
    }
    signMessage(msg, privateKey) {
        return this.signBuffer(Buffer.from(msg, 'utf-8'), privateKey);
    }
    verifyMessage(msg, sig, publicKey) {
        return this.verifySignature(Buffer.from(msg, 'utf-8'), sig, publicKey);
    }
    /**
     * Verify a routing capability path.
     *
     * @param path            Array of routing hops
     *  - to: <publickey>
     *  - value: base64 of JSON object
     *  - sig: signature
     * @param publickey       Public key expected to have signed hop 0
     * @param hash            Optional canonical hash to combine each hop (e.g. nft.id)
     *
     * @returns true if the routing path is cryptographically valid
     **/
    verifyRoutingPath(path, publickey, binding_hash = '') {
        // Basic structural checks
        if (!Array.isArray(path) || path.length === 0) {
            return false;
        }
        if (!publickey || typeof publickey !== 'string') {
            return false;
        }
        let expected_signer = publickey;
        for (let i = 0; i < path.length; i++) {
            const hop = path[i];
            if (!hop ||
                typeof hop.to !== 'string' ||
                typeof hop.value !== 'string' ||
                typeof hop.sig !== 'string') {
                return false;
            }
            const to = hop.to || '';
            const value = hop.value || '';
            const sig = hop.sig || '';
            const canonical_string = `${to}|${value}|${binding_hash}`;
            const digest = this.hash(canonical_string);
            console.log('verifying hop ' + i + ' against digest ' + digest);
            console.log('expected signer: ' + expected_signer);
            console.log('sig: ' + sig);
            const valid = this.verifyMessage(digest, sig, expected_signer);
            if (!valid) {
                console.log('this sig is invalid...');
                return false;
            }
            console.log('this sig is valid...');
            // Authority advances to the recipient of this hop
            expected_signer = to;
        }
        return true;
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
        const ecdh = crypto_browserify_1.default.createECDH('secp256k1');
        ecdh.generateKeys();
        if (pubkey != '') {
            ecdh.setPublicKey(pubkey);
        }
        if (privkey != '') {
            ecdh.setPrivateKey(privkey);
        }
        return ecdh;
    }
    generateKeys() {
        return saito_1.default.getInstance().generatePrivateKey();
    }
    generatePublicKey(privateKey) {
        return saito_1.default.getInstance().generatePublicKey(privateKey);
    }
    /**
     * Creates a random number, but not a privatekey. used for
     * XOR encryption in the game engine among other uses. public/private keypair. returns the string
     * @returns {string} private key
     */
    generateRandomNumber() {
        const randomNumber = crypto_browserify_1.default.randomBytes(32);
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
        return this.toBase58(secp256k1_1.default.publicKeyConvert(Buffer.from(pubkey, "hex"), true).toString("hex"));
    }
    /**
     * Converts base58 string to hex string
     *
     * @param {string} t string to convertches
     * @returns {string} converted string
     */
    fromBase58(t) {
        return Buffer.from(Base58.decode(t)).toString('hex');
    }
    /**
     * Converts hex string to base58 string
     *
     * @param {string} t string to convert
     * @returns {string} converted string
     */
    toBase58(t) {
        return Base58.encode(Buffer.from(t, 'hex'));
    }
    stringToBase64(str) {
        return Buffer.from(str, 'utf-8').toString('base64');
    }
    base64ToString(str) {
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
        if (!Buffer.isBuffer(a))
            a = new Buffer(a);
        if (!Buffer.isBuffer(b))
            b = new Buffer(b);
        const res = [];
        if (a.length > b.length) {
            for (i = 0; i < b.length; i++) {
                res.push(a[i] ^ b[i]);
            }
        }
        else {
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
        }
        catch (err) {
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
        let stringx = Number(num)
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
    isPublicKey(publicKey) {
        if (publicKey) {
            if (publicKey.indexOf('@') <= 0) {
                if (this.isBase58(publicKey)) {
                    return 1;
                }
            }
        }
        return 0;
    }
    isBase58(t) {
        return /^[A-HJ-NP-Za-km-z1-9]*$/.test(t);
    }
    //Restoring these functions ...
    generateSeedFromPrivateKey(existingPrivateKey) {
        // Create a seed that will deterministically generate your key first
        let seed = Buffer.from(existingPrivateKey, 'hex');
        // Generate mnemonic from this seed
        const mnemonic = bip39.entropyToMnemonic(seed);
        return mnemonic;
    }
    getPrivateKeyFromSeed(mnemonic) {
        try {
            // Validate the mnemonic
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid mnemonic');
            }
            // Convert mnemonic back to entropy
            const privateKey = bip39.mnemonicToEntropy(mnemonic);
            // Verify if this is a valid secp256k1 private key
            if (!secp256k1_1.default.privateKeyVerify(Buffer.from(privateKey, 'hex'))) {
                throw new Error('Generated private key is not valid for secp256k1');
            }
            return privateKey;
        }
        catch (error) {
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
    encryptWithPublicKey(data, recipientPublicKey) {
        try {
            // Convert base58 public key to hex format for secp256k1
            const publicKeyHex = this.fromBase58(recipientPublicKey);
            const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
            // Generate ephemeral key pair
            let ephemeralPrivateKey;
            let ephemeralPublicKey;
            do {
                ephemeralPrivateKey = crypto_browserify_1.default.randomBytes(32);
            } while (!secp256k1_1.default.privateKeyVerify(ephemeralPrivateKey));
            ephemeralPublicKey = Buffer.from(secp256k1_1.default.publicKeyCreate(ephemeralPrivateKey, false));
            // Compute shared secret using ECDH
            const sharedPoint = Buffer.from(secp256k1_1.default.publicKeyTweakMul(publicKeyBuffer, ephemeralPrivateKey));
            // Derive encryption key from shared secret (using x-coordinate)
            const sharedSecret = sharedPoint.slice(1, 33); // Extract x-coordinate (32 bytes)
            // Encrypt the data using AES with the shared secret
            const encryptedData = this.aesEncrypt(data.toString('base64'), sharedSecret);
            // Create the final encrypted package: ephemeral public key + encrypted data
            const ephemeralPublicKeyCompressed = Buffer.from(secp256k1_1.default.publicKeyConvert(ephemeralPublicKey, true));
            const encryptedBuffer = Buffer.from(encryptedData, 'utf8');
            // Package: [33 bytes ephemeral pubkey] + [encrypted data]
            const result = Buffer.concat([ephemeralPublicKeyCompressed, encryptedBuffer]);
            return result;
        }
        catch (error) {
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
    decryptWithPrivateKey(encryptedData, privateKeyHex) {
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
            if (!secp256k1_1.default.publicKeyVerify(ephemeralPublicKey)) {
                throw new Error('Invalid ephemeral public key in encrypted data');
            }
            // Convert ephemeral public key to uncompressed format for ECDH
            const ephemeralPublicKeyUncompressed = Buffer.from(secp256k1_1.default.publicKeyConvert(ephemeralPublicKey, false));
            // Compute shared secret using ECDH
            const sharedPoint = Buffer.from(secp256k1_1.default.publicKeyTweakMul(ephemeralPublicKeyUncompressed, privateKeyBuffer));
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
        }
        catch (error) {
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
    ////////////////////////
    // NFT UTILITES
    ////////////////////////
    hexToBytes(hex) {
        let clean = hex.startsWith('0x') ? hex.slice(2) : hex;
        let out = new Uint8Array(clean.length / 2);
        for (let i = 0; i < out.length; i++) {
            out[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return out;
    }
    base58ToBytes(str) {
        // Bitcoin Base58 alphabet
        let B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let B58_MAP = (() => {
            let m = new Map();
            for (let i = 0; i < B58_ALPHABET.length; i++)
                m.set(B58_ALPHABET[i], i);
            return m;
        })();
        // Count leading zeros
        let zeros = 0;
        while (zeros < str.length && str[zeros] === '1')
            zeros++;
        // Base58 decode to a big integer in bytes (base256)
        let bytes = [];
        for (let i = zeros; i < str.length; i++) {
            let val = B58_MAP.get(str[i]);
            if (val == null)
                throw new Error('Invalid Base58 character');
            let carry = val;
            for (let j = 0; j < bytes.length; j++) {
                let x = bytes[j] * 58 + carry;
                bytes[j] = x & 0xff;
                carry = x >> 8;
            }
            while (carry > 0) {
                bytes.push(carry & 0xff);
                carry >>= 8;
            }
        }
        // Add leading zeros
        for (let k = 0; k < zeros; k++)
            bytes.push(0);
        // Output is little-endian; reverse to big-endian
        bytes.reverse();
        return new Uint8Array(bytes);
    }
}
exports.default = Crypto;
//# sourceMappingURL=crypto.js.map