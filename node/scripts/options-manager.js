#!/usr/bin/env node

/**
 * Saito Options File Manager
 *
 * A command-line tool for managing Saito options files.
 *
 * The options file is plaintext JSON. Only the wallet private key is encrypted at rest,
 * and only when a password is set. Options files in the legacy format -- where the whole
 * file was encrypted -- are still readable here, and are migrated to the current format
 * by the encrypt/decrypt commands.
 *
 * Usage:
 *   node options-manager.js [command] [options]
 *   npm run options-manager [command] [options]
 *
 * Commands:
 *   decrypt    - Write out the options file with a plaintext private key
 *   encrypt    - Write out the options file with an encrypted private key
 *   status     - Report the format of the options file
 *
 * Options:
 *   --file, -f     Path to options file (default: config/options)
 *   --password, -p Password for encryption/decryption
 *   --secret, -s   Path to file containing password
 *   --output, -o   Output file path (for encrypt command)
 *   --pretty       Pretty print JSON output
 *   --help, -h     Show this help message
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const node_cryptojs = require('node-cryptojs-aes');
const base58 = require('base-58');

const CryptoJS = node_cryptojs.CryptoJS;
const JsonFormatter = node_cryptojs.JsonFormatter;

// camelCasing is what Saito writes, lowercase is kept for older options files
const PRIVATE_KEY_FIELDS = ['privateKey', 'privatekey'];

class OptionsManager {
  constructor() {
    this.defaultOptionsPath = path.resolve(__dirname, '../config', 'options');
    this.promptedPassword = null;
  }

  /**
   * Check if a string is AES encrypted
   */
  isAesEncrypted(msg) {
    try {
      const parsed = JSON.parse(msg);
      return !!parsed && Object.prototype.hasOwnProperty.call(parsed, 'ct');
    } catch (_e) {
      return false;
    }
  }

  /**
   * Check if a string is a usable wallet private key
   */
  isValidPrivateKey(key) {
    return typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key);
  }

  /**
   * Return the name of the wallet field holding an encrypted private key, or null if the
   * key is already plaintext (or absent)
   */
  returnEncryptedPrivateKeyField(options) {
    if (!options || !options.wallet) {
      return null;
    }
    for (const field of PRIVATE_KEY_FIELDS) {
      const stored = options.wallet[field];
      if (stored && !this.isValidPrivateKey(stored)) {
        return field;
      }
    }
    return null;
  }

  /**
   * Derive secret from password using the same method as Saito core
   */
  deriveSecretFromPassword(password) {
    const saltPrefix = 'BYTHEPRICKINGOFMYTHUMBSSOMETHINGWICKEDTHISWAYCOMES';
    const secretString = saltPrefix + (password || '');
    const hex = Buffer.from(secretString, 'utf-8').toString('hex');
    const encoded = base58.encode(Buffer.from(hex, 'hex'));
    return encoded;
  }

  /**
   * Decrypt options string
   */
  decryptOptionsString(encrypted, password) {
    const secret = this.deriveSecretFromPassword(password);
    try {
      const decrypted = CryptoJS.AES.decrypt(encrypted, secret, { format: JsonFormatter });
      const plaintext = CryptoJS.enc.Utf8.stringify(decrypted);
      return plaintext || null;
    } catch (err) {
      throw new Error(`Decryption failed: ${err.message}`);
    }
  }

  /**
   * Encrypt options string
   */
  encryptOptionsString(plaintextJson, password) {
    const secret = this.deriveSecretFromPassword(password);
    try {
      const encrypted = CryptoJS.AES.encrypt(plaintextJson, secret, { format: JsonFormatter });
      return encrypted.toString();
    } catch (err) {
      throw new Error(`Encryption failed: ${err.message}`);
    }
  }

  /**
   * Read password from user input
   */
  async readPasswordFromPrompt(message = 'Enter password: ') {
    // Check if stdout is a TTY (interactive terminal)
    if (!process.stdout.isTTY) {
      // Non-interactive mode, just read from stdin
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        rl.question(message, (password) => {
          rl.close();
          resolve(password);
        });
      });
    }

    // Interactive mode with hidden password input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Hide password input
    const stdin = process.stdin;
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.pause();
          break;
        default:
          if (process.stdout.clearLine && process.stdout.cursorTo) {
            process.stdout.clearLine();
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(message + '*'.repeat(rl.line.length));
          }
          break;
      }
    };
    
    stdin.on('data', onData);

    return new Promise((resolve) => {
      rl.question(message, (password) => {
        stdin.removeListener('data', onData);
        rl.close();
        console.log(); // New line after password input
        resolve(password);
      });
    });
  }

  /**
   * Read password from file
   */
  readPasswordFromFile(filepath) {
    try {
      return fs.readFileSync(filepath, 'utf8').trim();
    } catch (err) {
      throw new Error(`Failed to read password file: ${err.message}`);
    }
  }

  /**
   * Get password from various sources. A prompted password is remembered for the rest of
   * the command, since one command can need to unlock both the file and the private key.
   */
  async getPassword(options, prompt = 'Enter password: ') {
    if (options.password) {
      return options.password;
    }

    if (options.secret) {
      return this.readPasswordFromFile(options.secret);
    }

    if (process.env.SAITO_PASS) {
      return process.env.SAITO_PASS;
    }

    if (this.promptedPassword === null) {
      this.promptedPassword = await this.readPasswordFromPrompt(prompt);
    }

    return this.promptedPassword;
  }

  /**
   * Get the password to encrypt with. Kept separate from getPassword so it is never
   * satisfied by a password the user typed to unlock the existing file.
   */
  async getNewPassword(args) {
    if (args.newPassword) {
      return args.newPassword;
    }

    if (args.newSecret) {
      return this.readPasswordFromFile(args.newSecret);
    }

    if (process.env.SAITO_PASS) {
      return process.env.SAITO_PASS;
    }

    return await this.readPasswordFromPrompt('Enter new encryption password: ');
  }

  /**
   * Read options file
   */
  readOptionsFile(filepath) {
    if (!fs.existsSync(filepath)) {
      throw new Error(`Options file not found: ${filepath}`);
    }
    
    try {
      return fs.readFileSync(filepath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read options file: ${err.message}`);
    }
  }

  /**
   * Write options file
   */
  writeOptionsFile(filepath, content) {
    try {
      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filepath, content, 'utf8');
    } catch (err) {
      throw new Error(`Failed to write options file: ${err.message}`);
    }
  }

  /**
   * Format JSON with one value per line
   */
  formatJsonOnePerLine(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let result = '';
    
    if (Array.isArray(obj)) {
      result += '[\n';
      obj.forEach((item, index) => {
        result += spaces + '  ';
        if (typeof item === 'object' && item !== null) {
          result += this.formatJsonOnePerLine(item, indent + 1);
        } else {
          result += JSON.stringify(item);
        }
        if (index < obj.length - 1) result += ',';
        result += '\n';
      });
      result += spaces + ']';
    } else if (typeof obj === 'object' && obj !== null) {
      result += '{\n';
      const keys = Object.keys(obj);
      keys.forEach((key, index) => {
        result += spaces + '  ' + JSON.stringify(key) + ': ';
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          result += this.formatJsonOnePerLine(obj[key], indent + 1);
        } else {
          result += JSON.stringify(obj[key]);
        }
        if (index < keys.length - 1) result += ',';
        result += '\n';
      });
      result += spaces + '}';
    } else {
      result = JSON.stringify(obj);
    }
    
    return result;
  }

  /**
   * Read an options file into a plain object with a plaintext private key, handling both
   * the current format and the legacy fully encrypted one.
   */
  async returnPlaintextOptions(filepath, args) {
    const content = this.readOptionsFile(filepath);
    let plaintextContent = content;
    let legacy = false;

    // legacy format : the whole file was encrypted
    if (this.isAesEncrypted(content)) {
      legacy = true;
      const password = await this.getPassword(args, 'Enter current password: ');
      plaintextContent = this.decryptOptionsString(content, password);

      if (!plaintextContent) {
        throw new Error('Failed to decrypt options file - invalid password or corrupted data');
      }
    }

    let options;
    try {
      options = JSON.parse(plaintextContent);
    } catch (err) {
      throw new Error('File content is not valid JSON');
    }

    const field = this.returnEncryptedPrivateKeyField(options);
    if (field) {
      const password = await this.getPassword(args, 'Enter current password: ');
      let decrypted = null;
      try {
        decrypted = this.decryptOptionsString(options.wallet[field], password);
      } catch (err) {
        decrypted = null;
      }

      if (!this.isValidPrivateKey(decrypted)) {
        throw new Error(
          `Failed to decrypt the wallet ${field} - invalid password. The options file has not been modified.`
        );
      }

      options.wallet[field] = decrypted;
    }

    return { options, legacy, wasPrivateKeyEncrypted: !!field };
  }

  /**
   * Return a copy of the options with the wallet private key encrypted
   */
  returnOptionsWithEncryptedPrivateKey(options, password) {
    if (!options.wallet) {
      return options;
    }

    const encrypted = Object.assign({}, options);
    encrypted.wallet = Object.assign({}, options.wallet);

    for (const field of PRIVATE_KEY_FIELDS) {
      if (this.isValidPrivateKey(encrypted.wallet[field])) {
        encrypted.wallet[field] = this.encryptOptionsString(encrypted.wallet[field], password);
      }
    }

    return encrypted;
  }

  /**
   * Check status of options file
   */
  async checkStatus(options) {
    const filepath = options.file || this.defaultOptionsPath;

    console.log(`Options file: ${filepath}`);

    if (!fs.existsSync(filepath)) {
      console.log('Status: File does not exist');
      return;
    }

    try {
      const content = this.readOptionsFile(filepath);
      console.log(`Size: ${content.length} bytes`);

      if (this.isAesEncrypted(content)) {
        console.log('Status: Legacy format - the whole file is encrypted');
        console.log('Run the decrypt or encrypt command to migrate it to the current format');
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        console.log('Status: Unrecognized - file is neither encrypted nor valid JSON');
        return;
      }

      const field = this.returnEncryptedPrivateKeyField(parsed);
      if (field) {
        console.log(`Status: Readable JSON, wallet ${field} is encrypted`);
      } else {
        console.log('Status: Readable JSON, private key is not encrypted');
      }
      console.log(`JSON structure: ${Object.keys(parsed).length} top-level keys`);
    } catch (err) {
      console.error(`Error checking status: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Write out the options file with a plaintext private key, or display it
   */
  async decrypt(args) {
    const filepath = args.file || this.defaultOptionsPath;

    try {
      const { options, legacy, wasPrivateKeyEncrypted } = await this.returnPlaintextOptions(
        filepath,
        args
      );

      if (!legacy && !wasPrivateKeyEncrypted) {
        console.log('Nothing is encrypted. Displaying content:');
      } else {
        console.log('Successfully decrypted options file:');
      }
      console.log();

      const output = args.pretty
        ? this.formatJsonOnePerLine(options)
        : JSON.stringify(options, null, 4);

      if (args.output) {
        this.writeOptionsFile(args.output, output);
        console.log(`Wrote decrypted options file to: ${args.output}`);
      } else {
        console.log(output);
      }
    } catch (err) {
      console.error(`Decryption error: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Write out the options file with the wallet private key encrypted
   */
  async encrypt(args) {
    const filepath = args.file || this.defaultOptionsPath;
    const outputPath = args.output || filepath;

    try {
      const { options, legacy } = await this.returnPlaintextOptions(filepath, args);

      if (legacy) {
        console.log('File is in the legacy fully encrypted format. Migrating...');
      }

      const newPassword = await this.getNewPassword(args);
      if (!newPassword) {
        throw new Error('Password is required for encryption');
      }

      const encrypted = this.returnOptionsWithEncryptedPrivateKey(options, newPassword);

      if (!this.returnEncryptedPrivateKeyField(encrypted)) {
        console.warn(
          'Warning: no wallet private key found to encrypt. The options file has not been modified.'
        );
        return;
      }

      this.writeOptionsFile(outputPath, JSON.stringify(encrypted, null, 4));

      console.log(`Successfully encrypted the wallet private key in: ${outputPath}`);
      console.log('The rest of the options file remains readable JSON.');
    } catch (err) {
      console.error(`Encryption error: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Parse command line arguments
   */
  parseArgs(argv) {
    const args = {
      command: null,
      file: null,
      password: null,
      secret: null,
      output: null,
      newPassword: null,
      newSecret: null,
      pretty: false,
      help: false,
      unknown: []
    };

    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i];
      
      if (arg === '--help' || arg === '-h') {
        args.help = true;
      } else if (arg === '--pretty') {
        args.pretty = true;
      } else if (arg === '--file' || arg === '-f') {
        args.file = argv[++i];
      } else if (arg === '--password' || arg === '-p') {
        args.password = argv[++i];
      } else if (arg === '--secret' || arg === '-s') {
        args.secret = argv[++i];
      } else if (arg === '--output' || arg === '-o') {
        args.output = argv[++i];
      } else if (arg === '--new-password') {
        args.newPassword = argv[++i];
      } else if (arg === '--new-secret') {
        args.newSecret = argv[++i];
      } else if (!args.command && !arg.startsWith('-')) {
        args.command = arg;
      } else {
        args.unknown.push(arg);
      }
    }

    return args;
  }

  /**
   * Show help message
   */
  showHelp() {
    console.log(`
Saito Options File Manager

The options file is plaintext JSON. Only the wallet private key is encrypted at rest.
Options files in the legacy format -- where the whole file was encrypted -- are still
readable, and are migrated to the current format by the encrypt/decrypt commands.

Usage:
  node options-manager.js [command] [options]
  npm run options-manager [command] [options]

Commands:
  status     Report the format of the options file
  decrypt    Write out the options file with a plaintext private key
  encrypt    Write out the options file with an encrypted private key

Options:
  --file, -f         Path to options file (default: config/options)
  --password, -p     Password the file is currently protected with
  --secret, -s       Path to file containing that password
  --output, -o       Output file path (defaults to stdout for decrypt, in place for encrypt)
  --new-password     New password for encryption (encrypt command)
  --new-secret       Path to file with new password (encrypt command)
  --pretty           Pretty print JSON output
  --help, -h         Show this help message

Environment Variables:
  SAITO_PASS         Password for encryption/decryption (if not provided via options)

Examples:
  # Report the format of the options file
  node options-manager.js status

  # Print the options file with a plaintext private key
  node options-manager.js decrypt --pretty

  # Decrypt with password from file
  node options-manager.js decrypt --secret /path/to/password.txt

  # Remove encryption from the private key, in place
  node options-manager.js decrypt --password mypassword --output config/options

  # Encrypt the private key with a new password
  node options-manager.js encrypt --new-password mypassword

  # Re-encrypt the private key with a different password
  node options-manager.js encrypt --password oldpass --new-password newpass
`);
  }

  /**
   * Main entry point
   */
  async run(argv = process.argv) {
    const args = this.parseArgs(argv);

    if (args.help) {
      this.showHelp();
      return;
    }

    if (args.unknown.length > 0) {
      console.error(`Unknown arguments: ${args.unknown.join(', ')}`);
      process.exit(1);
    }

    if (!args.command) {
      console.error('No command specified. Use --help for usage information.');
      process.exit(1);
    }

    try {
      switch (args.command) {
        case 'status':
          await this.checkStatus(args);
          break;
        case 'decrypt':
          await this.decrypt(args);
          break;
        case 'encrypt':
          await this.encrypt(args);
          break;
        default:
          console.error(`Unknown command: ${args.command}`);
          console.error('Valid commands: status, decrypt, encrypt');
          process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const manager = new OptionsManager();
  manager.run().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = OptionsManager;
