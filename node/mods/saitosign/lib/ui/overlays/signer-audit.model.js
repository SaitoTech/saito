const {
  actionSignatureEvidence,
  emailEvidence,
  imageEvidence,
  verificationSatisfied
} = require('../../auth');

function signerAudit(app, record, userIndex) {
  const users = Array.isArray(record?.users) ? record.users : [];
  const index = Number(userIndex);
  const user = Number.isInteger(index) ? users[index] : null;
  if (!user) {
    return null;
  }

  const actions = (Array.isArray(record?.actions) ? record.actions : [])
    .filter((action) => Number(action?.user) === index && (action?.type === 'signature' || action?.type === 'initial'))
    .sort((left, right) => Number(left.page) - Number(right.page) || Number(left.id) - Number(right.id));
  const signatures = actions.map((action) => actionSignatureEvidence(app, record, user, action));
  const emails = emailEvidence(app, user);
  const images = imageEvidence(app, user);
  const name = String(user.name || '').trim();
  const email = String(user.email || '').trim();
  const publicKey = String(user.publickey || '').trim();
  const emailVerified = emails.some((entry) => entry.valid && entry.returned);
  const signaturesComplete = signatures.length > 0 && signatures.every((entry) => entry.valid);
  const identityComplete = verificationSatisfied(app, record, user) === true;

  return {
    index,
    name,
    email,
    publicKey,
    emailVerified,
    identityComplete,
    signaturesComplete,
    verified: identityComplete && signaturesComplete,
    emails,
    signatures,
    images,
    documentHash: String(record?.hash || '').trim()
  };
}

module.exports = { signerAudit };
