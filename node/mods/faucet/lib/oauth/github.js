/**
 * GitHub OAuth protocol. Authenticates GitHub credentials.
 * Does not touch Faucet records, payments, or peer notify.
 */

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

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
  // Current validity criterion: GitHub account must be at least six months old.
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }
  const eligibleAt = new Date(created.getTime());
  eligibleAt.setMonth(eligibleAt.getMonth() + 6);
  return now >= eligibleAt.getTime();
}

async function exchangeGithubCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('code', code);
  body.set('redirect_uri', redirectUri);

  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    const msg = data.error_description || data.error || `token_http_${res.status}`;
    const err = new Error(String(msg));
    err.code = 'github_token_exchange_failed';
    throw err;
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || 'bearer',
    scope: data.scope || ''
  };
}

async function fetchGithubUser(accessToken) {
  const res = await fetch(GITHUB_USER_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Saito-Faucet-OAuth',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const msg = data.message || `user_http_${res.status}`;
    const err = new Error(String(msg));
    err.code = 'github_user_fetch_failed';
    throw err;
  }

  return {
    id: String(data.id),
    login: String(data.login || ''),
    name: String(data.name || ''),
    created_at: String(data.created_at || '')
  };
}

/**
 * Authenticate GitHub credentials (authorization code).
 * Performs GitHub token exchange, profile lookup, and GitHub-specific
 * account checks. Returns a provider identity. Does not touch Faucet state.
 */
async function authenticateCredentials({ code, clientId, clientSecret, redirectUri }) {
  const token = await exchangeGithubCode({
    clientId,
    clientSecret,
    code,
    redirectUri
  });

  const user = await fetchGithubUser(token.access_token);
  token.access_token = '';

  if (!user.created_at || !isAccountValid(user.created_at)) {
    throw authError(
      'github_account_too_new',
      403,
      'GitHub account not eligible',
      'Registration requires a GitHub account that is at least six months old.',
      {
        details: user.login ? `Account: ${user.login}` : '',
        login: user.login,
        created_at: user.created_at
      }
    );
  }

  const provider_user_id = String(user.id || '').trim();
  if (!provider_user_id) {
    throw authError(
      'github_missing_user_id',
      502,
      'GitHub verification failed',
      'GitHub profile did not include a stable user id.'
    );
  }

  return {
    provider: 'github',
    provider_user_id,
    provider_username: String(user.login || ''),
    provider_display_name: String(user.name || user.login || ''),
    provider_account_created_at: Date.parse(user.created_at) || 0
  };
}

module.exports = {
  authenticateCredentials
};
