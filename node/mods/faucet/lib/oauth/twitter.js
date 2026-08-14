/**
 * Twitter/X OAuth 2.0 + PKCE. Authenticates X credentials.
 * Does not touch Faucet records, payments, or peer notify.
 */

const crypto = require('crypto');

const TWITTER_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const TWITTER_USER_URL = 'https://api.x.com/2/users/me';

function authError(code, httpStatus, title, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.httpStatus = httpStatus;
  err.title = title;
  err.popupMessage = message;
  Object.assign(err, extra);
  return err;
}

function isAccountValid(createdAt, now = Date.now()) {
  // Same anti-abuse bar as GitHub: account must be at least six months old.
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }
  const eligibleAt = new Date(created.getTime());
  eligibleAt.setMonth(eligibleAt.getMonth() + 6);
  return now >= eligibleAt.getTime();
}

function base64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createPkce() {
  const code_verifier = base64Url(crypto.randomBytes(32));
  const code_challenge = base64Url(crypto.createHash('sha256').update(code_verifier).digest());
  return { code_verifier, code_challenge };
}

async function exchangeTwitterCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  code_verifier
}) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set('code_verifier', code_verifier);
  body.set('client_id', clientId);

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(clientId + ':' + clientSecret, 'utf8').toString('base64')
    },
    body: body.toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    const msg = data.error_description || data.error || `token_http_${res.status}`;
    const err = new Error(String(msg));
    err.code = 'twitter_token_exchange_failed';
    throw err;
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || 'bearer',
    scope: data.scope || ''
  };
}

async function fetchTwitterUser(accessToken) {
  const url = new URL(TWITTER_USER_URL);
  url.searchParams.set('user.fields', 'created_at,name,username');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await res.json().catch(() => ({}));
  const user = data.data || {};
  if (!res.ok || !user.id) {
    const msg = data.detail || data.title || data.message || `user_http_${res.status}`;
    const err = new Error(String(msg));
    err.code = 'twitter_user_fetch_failed';
    throw err;
  }

  return {
    id: String(user.id),
    username: String(user.username || ''),
    name: String(user.name || ''),
    created_at: String(user.created_at || '')
  };
}

/**
 * Authenticate Twitter/X credentials (authorization code + PKCE).
 * Returns a provider identity. Does not touch Faucet state.
 */
async function authenticateCredentials({
  code,
  clientId,
  clientSecret,
  redirectUri,
  code_verifier
}) {
  const token = await exchangeTwitterCode({
    clientId,
    clientSecret,
    code,
    redirectUri,
    code_verifier
  });

  console.log('[Faucet] OAuth twitter token exchange ok');
  const user = await fetchTwitterUser(token.access_token);
  token.access_token = '';
  console.log(
    '[Faucet] OAuth twitter profile id=' +
      user.id +
      ' username=' +
      user.username +
      ' created_at=' +
      (user.created_at || '(none)')
  );

  if (!user.created_at || !isAccountValid(user.created_at)) {
    throw authError(
      'twitter_account_too_new',
      403,
      'X account not eligible',
      'Registration requires an X account that is at least six months old.',
      {
        details: user.username ? `Account: ${user.username}` : '',
        username: user.username,
        created_at: user.created_at
      }
    );
  }

  const provider_user_id = String(user.id || '').trim();
  if (!provider_user_id) {
    throw authError(
      'twitter_missing_user_id',
      502,
      'X verification failed',
      'X profile did not include a stable user id.'
    );
  }

  return {
    provider: 'twitter',
    provider_user_id,
    provider_username: String(user.username || ''),
    provider_display_name: String(user.name || user.username || ''),
    provider_account_created_at: Date.parse(user.created_at) || 0
  };
}

module.exports = {
  createPkce,
  authenticateCredentials
};
