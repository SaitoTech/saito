/**
 * GitHub OAuth helpers for Faucet (authorization-code exchange + profile).
 * Does not touch registration, peer notify, or issuance.
 */

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

/**
 * @param {Date|string|number} createdAt
 * @param {number} [now]
 */
function isAccountAtLeastSixMonthsOld(createdAt, now = Date.now()) {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }
  const eligibleAt = new Date(created.getTime());
  eligibleAt.setMonth(eligibleAt.getMonth() + 6);
  return now >= eligibleAt.getTime();
}

/**
 * Exchange authorization code for access token.
 * Does not log the token.
 */
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

/**
 * Fetch authenticated GitHub user profile (includes created_at).
 */
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

module.exports = {
  GITHUB_TOKEN_URL,
  GITHUB_USER_URL,
  isAccountAtLeastSixMonthsOld,
  exchangeGithubCode,
  fetchGithubUser
};
