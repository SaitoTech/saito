// @ts-nocheck

const CryptoModule = require('../../../lib/templates/cryptomodule');
const MixinModule = require('../../../mods/mixin/lib/mixinmodule');

describe('Mixin migration payment matching', () => {
  test('keeps strict sender matching as the CryptoModule default', () => {
    const crypto = Object.create(CryptoModule.prototype);

    expect(crypto.paymentsHaveSameSender('sender', 'sender')).toBe(true);
    expect(
      crypto.paymentsHaveSameSender(
        '0xabc|79797026-5fdb-3e46-8732-019ac109f17e|mixin',
        '79797026-5fdb-3e46-8732-019ac109f17e'
      )
    ).toBe(false);
  });

  test('matches a packed Mixin address with the UUID reported by Safe snapshots', () => {
    const crypto = Object.create(MixinModule.prototype);
    const packed = '0xabc|79797026-5fdb-3e46-8732-019ac109f17e|mixin';

    expect(crypto.paymentsHaveSameSender(packed, '79797026-5fdb-3e46-8732-019ac109f17e')).toBe(
      true
    );
    expect(crypto.paymentsHaveSameSender(packed, '2a3083de-2480-3b90-a3d6-ea38a6b4a84f')).toBe(
      false
    );
  });

  test('leaves inbound snapshot lookup to the caller', () => {
    expect(MixinModule.prototype.findInboundPaymentBySignature).toBeUndefined();
  });
});
