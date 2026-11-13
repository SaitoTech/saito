const assert = require('node:assert/strict');
const test = require('node:test');
const {
  readShareParameters,
  openedThroughShare,
  documentIsEditable,
  awaitingIdentity,
  visibleSignerIndex
} = require('../../../mods/saitosign/lib/share-access');

function source(overrides) {
  return {
    receivedBy: '',
    shareId: '',
    hasShareParameters: false,
    finalized: false,
    isCreator: false,
    hasCreatorProof: true,
    viewerVerified: false,
    eligibleSigner: true,
    recognizedSigner: 0,
    ...overrides
  };
}

const link = { receivedBy: 'link', shareId: 'doc', finalized: true };

test('share parameters are read from the query or the hash', () => {
  assert.deepEqual(readShareParameters('?share=abc&token=def', ''), { id: 'abc', token: 'def' });
  assert.deepEqual(readShareParameters('', '#saitosign?share=abc&token=def'), { id: 'abc', token: 'def' });
});

test('a share link is not editable, including when the creator opens it', () => {
  assert.equal(documentIsEditable(source({ isCreator: true, finalized: false })), true);
  assert.equal(documentIsEditable(source({ ...link, isCreator: true })), false);
  assert.equal(openedThroughShare(source(link)), true);
  const creatorLink = source({ ...link, isCreator: true, viewerVerified: false });
  assert.equal(documentIsEditable(creatorLink), false);
  assert.equal(awaitingIdentity(creatorLink), true);
});

test('signature fields stay hidden until the recipient is verified', () => {
  const unverified = source({ ...link, isCreator: false, viewerVerified: false, eligibleSigner: true });
  assert.equal(awaitingIdentity(unverified), true);
  assert.equal(visibleSignerIndex(unverified), null);

  const verified = source({ ...link, viewerVerified: true, recognizedSigner: 1 });
  assert.equal(awaitingIdentity(verified), false);
  assert.equal(visibleSignerIndex(verified), 1);
});

test('a completed signer can see assigned fields without editing', () => {
  const completed = source({ ...link, viewerVerified: true, recognizedSigner: 0 });
  assert.equal(documentIsEditable(completed), false);
  assert.equal(visibleSignerIndex(completed), 0);
});

test('reloading a share keeps the session and the assigned signer', () => {
  const reloaded = source({
    receivedBy: 'link',
    finalized: true,
    viewerVerified: true,
    recognizedSigner: 2,
    hasShareParameters: true
  });
  assert.equal(openedThroughShare(reloaded), true);
  assert.equal(documentIsEditable(reloaded), false);
  assert.equal(visibleSignerIndex(reloaded), 2);
});
