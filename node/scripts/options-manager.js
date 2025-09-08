#!/usr/bin/env node

/**
 * Saito Options File Manager
 * 
 * A command-line tool for managing encrypted Saito options files.
 * Supports decryption, pretty printing, and re-encryption with new passwords.
 * 
 * Usage:
 *   node options-manager.js [command] [options]
 *   npm run options-manager [command] [options]
 * 
 * Commands:
 *   decrypt    - Decrypt and display the options file
 *   encrypt    - Encrypt the options file with a new password
 *   status     - Check if the options file is encrypted
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

class OptionsManager {
  constructor() {
    this.defaultOptionsPath = path.resolve(__dirname, '../config', 'options');
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
   * Get password from various sources
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

    return await this.readPasswordFromPrompt(prompt);
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
      const isEncrypted = this.isAesEncrypted(content);
      
      console.log(`Status: ${isEncrypted ? 'Encrypted' : 'Not encrypted'}`);
      console.log(`Size: ${content.length} bytes`);
      
      if (!isEncrypted) {
        try {
          const parsed = JSON.parse(content);
          console.log(`JSON structure: ${Object.keys(parsed).length} top-level keys`);
        } catch (err) {
          console.log('Warning: File content is not valid JSON');
        }
      }
    } catch (err) {
      console.error(`Error checking status: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Decrypt and display options file
   */
  async decrypt(options) {
    const filepath = options.file || this.defaultOptionsPath;
    
    try {
      const content = this.readOptionsFile(filepath);
      
      if (!this.isAesEncrypted(content)) {
        console.log('File is not encrypted. Displaying content:');
        console.log();
        
        if (options.pretty) {
          try {
            const parsed = JSON.parse(content);
            console.log(this.formatJsonOnePerLine(parsed));
          } catch (err) {
            console.log(content);
          }
        } else {
          console.log(content);
        }
        return;
      }

      const password = await this.getPassword(options, 'Enter decryption password: ');
      const decrypted = this.decryptOptionsString(content, password);
      
      if (!decrypted) {
        throw new Error('Decryption failed - invalid password or corrupted data');
      }

      console.log('Successfully decrypted options file:');
      console.log();
      
      if (options.pretty) {
        try {
          const parsed = JSON.parse(decrypted);
          console.log(this.formatJsonOnePerLine(parsed));
        } catch (err) {
          console.log(decrypted);
        }
      } else {
        console.log(decrypted);
      }

    } catch (err) {
      console.error(`Decryption error: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Encrypt options file with new password
   */
  async encrypt(options) {
    const filepath = options.file || this.defaultOptionsPath;
    const outputPath = options.output || filepath;
    
    try {
      const content = this.readOptionsFile(filepath);
      let plaintextContent = content;
      
      // If file is already encrypted, decrypt it first
      if (this.isAesEncrypted(content)) {
        console.log('File is already encrypted. Decrypting first...');
        const oldPassword = await this.getPassword(options, 'Enter current password: ');
        plaintextContent = this.decryptOptionsString(content, oldPassword);
        
        if (!plaintextContent) {
          throw new Error('Failed to decrypt existing file - invalid password');
        }
      }

      // Validate JSON
      try {
        JSON.parse(plaintextContent);
      } catch (err) {
        throw new Error('File content is not valid JSON');
      }

      // Get new password
      const newPassword = await this.getPassword(
        { password: options.newPassword, secret: options.newSecret },
        'Enter new encryption password: '
      );

      if (!newPassword) {
        throw new Error('Password is required for encryption');
      }

      // Encrypt with new password
      const encrypted = this.encryptOptionsString(plaintextContent, newPassword);
      
      // Write encrypted content
      this.writeOptionsFile(outputPath, encrypted);
      
      console.log(`Successfully encrypted options file to: ${outputPath}`);
      
      // Verify encryption worked
      if (this.isAesEncrypted(encrypted)) {
        console.log('Encryption verified successfully');
      } else {
        console.warn('Warning: Encryption verification failed');
      }

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

Usage:
  node options-manager.js [command] [options]
  npm run options-manager [command] [options]

Commands:
  status     Check if the options file is encrypted
  decrypt    Decrypt and display the options file
  encrypt    Encrypt the options file with a new password

Options:
  --file, -f         Path to options file (default: config/options)
  --password, -p     Password for encryption/decryption
  --secret, -s       Path to file containing password
  --output, -o       Output file path (for encrypt command)
  --new-password     New password for encryption (encrypt command)
  --new-secret       Path to file with new password (encrypt command)
  --pretty           Pretty print JSON output
  --help, -h         Show this help message

Environment Variables:
  SAITO_PASS         Password for encryption/decryption (if not provided via options)

Examples:
  # Check if options file is encrypted
  node options-manager.js status

  # Decrypt and pretty print options file
  node options-manager.js decrypt --pretty

  # Decrypt with password from file
  node options-manager.js decrypt --secret /path/to/password.txt

  # Encrypt options file with new password
  node options-manager.js encrypt --password mypassword

  # Re-encrypt with different password
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
