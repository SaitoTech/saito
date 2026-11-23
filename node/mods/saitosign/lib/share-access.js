function readRecipientSecret(search, hash) {
  const read = (query) => {
    const params = new URLSearchParams(String(query || '').replace(/^\?/, ''));
    return params.get('verify') || '';
  };
  const searched = read(search);
  if (searched) {
    return searched;
  }
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) {
    return '';
  }
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  return read(query);
}

function locationWithoutRecipientSecret(href) {
  const url = new URL(String(href || ''), 'http://localhost');
  url.searchParams.delete('verify');
  const raw = url.hash.replace(/^#/, '');
  if (raw) {
    const splitAt = raw.indexOf('?');
    const prefix = splitAt >= 0 ? raw.slice(0, splitAt) : '';
    const query = splitAt >= 0 ? raw.slice(splitAt + 1) : (raw.includes('=') ? raw : '');
    if (query) {
      const params = new URLSearchParams(query);
      params.delete('verify');
      const nextQuery = params.toString();
      const hashBody = prefix
        ? (nextQuery ? `${prefix}?${nextQuery}` : prefix)
        : nextQuery;
      url.hash = hashBody ? `#${hashBody}` : '';
    }
  }
  const relative = `${url.pathname}${url.search}${url.hash}`;
  if (/^https?:/i.test(String(href || ''))) {
    return `${url.origin}${relative}`;
  }
  return relative;
}

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
  readRecipientSecret,
  locationWithoutRecipientSecret,
  readShareParameters,
  openedThroughShare,
  documentIsEditable,
  awaitingIdentity,
  visibleSignerIndex
};
