function readShareParameters(search, hash) {
  const read = (query) => {
    const params = new URLSearchParams(String(query || '').replace(/^\?/, ''));
    return {
      id: params.get('share') || '',
      token: params.get('token') || ''
    };
  };
  const searched = read(search);
  if (searched.id && searched.token) {
    return searched;
  }
  const raw = String(hash || '');
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return read(query);
}

function openedThroughShare(source) {
  return source?.receivedBy === 'link' || Boolean(source?.shareId) || source?.hasShareParameters === true;
}

function documentIsEditable(source) {
  if (openedThroughShare(source)) {
    return false;
  }
  return source?.finalized !== true && source?.isCreator === true && source?.hasCreatorProof === true;
}

function awaitingIdentity(source) {
  if (source?.viewerVerified === true || source?.eligibleSigner !== true) {
    return false;
  }
  if (openedThroughShare(source)) {
    return true;
  }
  return source?.finalized === true && source?.isCreator !== true;
}

function visibleSignerIndex(source) {
  if (!openedThroughShare(source) || awaitingIdentity(source)) {
    return null;
  }
  return Number.isInteger(source?.recognizedSigner) ? source.recognizedSigner : null;
}

module.exports = {
  readShareParameters,
  openedThroughShare,
  documentIsEditable,
  awaitingIdentity,
  visibleSignerIndex
};
