/*
  Saito Options Tool

  Features:
  - Prompts for password or accepts -pf/--passfile to read password from a file
  - Attempts to decrypt options from config/options or ./options
    * Errors if no options file found
    * Errors if password does not decrypt the options
    * Prints pretty JSON of decrypted options on success
  - --reset / -r: after successful decryption, prompts twice for a new password
    * If they match, backs up the existing encrypted options to options.enc.<timestamp>
      and writes a newly encrypted options using the new password
  - -h / --help: prints usage
*/

const fs = require('fs');
const path = require('path');
const base58 = require('base-58');
const nodeCryptoJs = require('node-cryptojs-aes');
const readline = require('readline');

const CryptoJS = nodeCryptoJs.CryptoJS;
const JsonFormatter = nodeCryptoJs.JsonFormatter;

function printHelp() {
  console.log(`
Usage: node options-tool.js [--reset|-r] [--passfile|-pf <path>] [--help|-h]

Actions:
  - (default) Decrypt and pretty-print the options file
  - --reset, -r   Re-encrypt options with a new password (after verifying old password)

Password:
  - If not provided via -pf/--passfile, you'll be prompted to enter it.

Options search order:
  1) config/options  (relative to this script directory)
  2) ./options       (current working directory)
`);
}

function parseArgs(argv) {
  const args = {
    reset: false,
    passfile: null,
    help: false,
    unknown: []
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '-r' || a === '--reset') {
      args.reset = true;
    } else if (a === '-pf' || a === '--passfile') {
      if (i + 1 >= argv.length) {
        args.unknown.push(a);
      } else {
        args.passfile = argv[++i];
      }
    } else {
      args.unknown.push(a);
    }
  }
  return args;
}

function isAesEncrypted(msg) {
  try {
    const parsed = JSON.parse(msg);
    return !!parsed && Object.prototype.hasOwnProperty.call(parsed, 'ct');
  } catch (_e) {
    return false;
  }
}

function deriveSecretFromPassword(password) {
  const saltPrefix = 'BYTHEPRICKINGOFMYTHUMBSSOMETHINGWICKEDTHISWAYCOMES';
  const secretString = saltPrefix + (password || '');
  const hex = Buffer.from(secretString, 'utf-8').toString('hex');
  const encoded = base58.encode(Buffer.from(hex, 'hex'));
  return encoded; // matches usage in node/lib/saito/crypto.ts
}

function decryptOptionsString(encrypted, password) {
  const rp = deriveSecretFromPassword(password);
  const decrypted = CryptoJS.AES.decrypt(encrypted, rp, { format: JsonFormatter });
  const plaintext = CryptoJS.enc.Utf8.stringify(decrypted);
  return plaintext || null;
}

function encryptOptionsString(plaintextJson, password) {
  const rp = deriveSecretFromPassword(password);
  const encrypted = CryptoJS.AES.encrypt(plaintextJson, rp, { format: JsonFormatter });
  return encrypted.toString();
}

function findOptionsPath() {
  const p1 = path.resolve(__dirname, 'config', 'options');
  const p2 = path.resolve(process.cwd(), 'options');
  if (fs.existsSync(p1)) return p1;
  if (fs.existsSync(p2)) return p2;
  return null;
}

function readPasswordFromFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').toString().trim();
  } catch (e) {
    console.error(`Failed reading password file: ${filePath}`);
    console.error(e.message);
    process.exit(1);
  }
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const mutableStdout = new (require('stream').Writable)({
      write(chunk, encoding, callback) {
        // suppress actual input echo
        if (!this.muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      }
    });
    mutableStdout.muted = false;
    const rl2 = readline.createInterface({ input: process.stdin, output: mutableStdout, terminal: true });
    mutableStdout.muted = true;
    rl2.question(question, (answer) => {
      console.log('');
      rl.close();
      rl2.close();
      resolve(answer);
    });
  });
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.unknown.length > 0) {
    printHelp();
    if (args.unknown.length > 0) process.exit(1);
    return;
  }

  const optionsPath = findOptionsPath();
  if (!optionsPath) {
    console.error('Error: options file not found in either "config/options" or "./options"');
    process.exit(1);
  }

  const encrypted = fs.readFileSync(optionsPath, 'utf8').toString();

  if (!isAesEncrypted(encrypted)) {
    console.error('Error: options file does not appear to be AES-encrypted.');
    process.exit(1);
  }

  let password = null;
  if (args.passfile) {
    password = readPasswordFromFile(args.passfile);
  } else {
    password = await promptHidden('Enter password: ');
  }

  const plaintext = decryptOptionsString(encrypted, password);
  if (!plaintext) {
    console.error('Error: failed to decrypt options. Is the password correct?');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch (e) {
    console.error('Error: decrypted content is not valid JSON (wrong password?)');
    process.exit(1);
  }

  if (!args.reset) {
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  const newPass1 = await promptHidden('Enter NEW password: ');
  const newPass2 = await promptHidden('Confirm NEW password: ');
  if (newPass1 !== newPass2) {
    console.error('Error: passwords do not match.');
    process.exit(1);
  }

  const backupPath = optionsPath + '.enc.' + timestamp();
  try {
    fs.writeFileSync(backupPath, encrypted, { encoding: 'utf8', flag: 'wx' });
  } catch (e) {
    console.error('Error: failed to create backup file:', backupPath);
    console.error(e.message);
    process.exit(1);
  }

  try {
    const reencrypted = encryptOptionsString(JSON.stringify(parsed), newPass1);
    fs.writeFileSync(optionsPath, reencrypted, 'utf8');
    console.log('Success: options file re-encrypted with new password.');
    console.log('Backup saved to:', backupPath);
  } catch (e) {
    console.error('Error: failed to re-encrypt and save options file.');
    console.error(e.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


