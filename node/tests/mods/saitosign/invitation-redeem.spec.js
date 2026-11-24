const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assignRecipientSecrets,
  recipientForSecret,
  redeemEmail
} = require('../../../mods/saitosign/lib/share-server');
const { UNSIGNED_UPLOAD } = require('../../../mods/saitosign/lib/signature-merge');
const { emailVerificationMessage } = require('../../../mods/saitosign/lib/auth');

function app() {
  return {
    crypto: {
      signMessage(message, privateKey) {
        return `sig:${privateKey}:${message}`;
      },
      verifyMessage(message, signature, publicKey) {
        return signature === `sig:${publicKey}:${message}`;
      },
      verifySignature(buffer, signature, publicKey) {
        return signature === `tx:${publicKey}:${Buffer.from(buffer).toString('hex')}`;
      }
    },
    wallet: {
      getPrivateKey: async () => 'server-key',
      getPublicKey: async () => 'server-key'
    }
  };
}

function txFor(key) {
  const hash = new Uint8Array([4, 5, 6]);
  return {
    signature: `tx:${key}:${Buffer.from(hash).toString('hex')}`,
    from: [{ publicKey: key }],
    generateHashForSignature() {},
    getHashForSignature() {
      return hash;
    }
  };
}

function shareMod(recipients, options = {}) {
  return {
    app: app(),
    publicKey: 'server-key',
    database: {
      async readShare() {
        return {
          document_id: 'doc-1',
          token: 'share-token',
          recipients
        };
      },
      async getDocument() {
        if (options.expired) {
          return { expired: true };
        }
        return { expired: false };
      }
    }
  };
}

test('two recipients receive different secrets for the same document', () => {
  const recipients = assignRecipientSecrets([
    { email: 'ada@example.com', signerIndex: 0 },
    { email: 'bea@example.com', signerIndex: 1 }
  ]);
  assert.notEqual(recipients[0].verify_secret, recipients[1].verify_secret);
  assert.equal(recipientForSecret(recipients, recipients[0].verify_secret).email, 'ada@example.com');
  assert.equal(recipientForSecret(recipients, recipients[1].verify_secret).email, 'bea@example.com');
  assert.equal(recipientForSecret(recipients, 'someone-elses-secret'), null);
  assert.equal(recipientForSecret([{ email: 'ada@example.com', signerIndex: 0 }], 'legacy-link'), null);
  const again = assignRecipientSecrets(recipients);
  assert.equal(again[0].verify_secret, recipients[0].verify_secret);
  assert.equal(again[1].verify_secret, recipients[1].verify_secret);
});

test('redemption signs the stored email and the transaction public key', async () => {
  const recipients = assignRecipientSecrets([
    { email: 'ada@example.com', signerIndex: 0 },
    { email: 'bea@example.com', signerIndex: 1 }
  ]);
  const mod = shareMod(recipients);
  const result = await redeemEmail(mod, {
    document_id: 'doc-1',
    token: 'share-token',
    verify_secret: recipients[0].verify_secret,
    email: 'bea@example.com',
    publickey: 'attacker-key'
  }, txFor('ada-key'));
  assert.equal(result.success, true);
  assert.equal(result.email, 'ada@example.com');
  assert.equal(result.signer_publickey, 'ada-key');
  assert.equal(result.publickey, 'server-key');
  assert.equal(result.message, emailVerificationMessage('ada@example.com', 'ada-key'));
  assert.equal(result.signature, `sig:server-key:${result.message}`);

  const forwarded = await redeemEmail(mod, {
    document_id: 'doc-1',
    token: 'share-token',
    verify_secret: recipients[0].verify_secret
  }, txFor('other-wallet'));
  assert.equal(forwarded.success, true);
  assert.equal(forwarded.email, 'ada@example.com');
  assert.equal(forwarded.signer_publickey, 'other-wallet');
  assert.equal(forwarded.message, emailVerificationMessage('ada@example.com', 'other-wallet'));
});

test('a secret from another document, an expired share, and an unsigned request do not redeem', async () => {
  const recipients = assignRecipientSecrets([{ email: 'ada@example.com', signerIndex: 0 }]);
  const other = assignRecipientSecrets([{ email: 'ada@example.com', signerIndex: 0 }]);
  const mod = shareMod(recipients);
  const wrongSecret = await redeemEmail(mod, {
    document_id: 'doc-1',
    token: 'share-token',
    verify_secret: other[0].verify_secret
  }, txFor('ada-key'));
  assert.equal(wrongSecret.success, false);

  const wrongToken = await redeemEmail(mod, {
    document_id: 'doc-1',
    token: 'other-token',
    verify_secret: recipients[0].verify_secret
  }, txFor('ada-key'));
  assert.equal(wrongToken.success, false);

  const expired = await redeemEmail(shareMod(recipients, { expired: true }), {
    document_id: 'doc-1',
    token: 'share-token',
    verify_secret: recipients[0].verify_secret
  }, txFor('ada-key'));
  assert.equal(expired.success, false);
  assert.match(expired.error, /expired/);

  const unsigned = await redeemEmail(mod, {
    document_id: 'doc-1',
    token: 'share-token',
    verify_secret: recipients[0].verify_secret
  }, { signature: '', from: [{ publicKey: 'ada-key' }] });
  assert.equal(unsigned.success, false);
  assert.equal(unsigned.error, UNSIGNED_UPLOAD);
});
