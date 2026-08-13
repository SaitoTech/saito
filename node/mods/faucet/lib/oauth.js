const OAuthResultTemplate = require('./ui/oauth-result.template');
const GithubOAuth = require('./oauth/github');

class FaucetOAuth {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    // BEGIN TEMP_OAUTH_CONFIG — runtime OAuth client secrets (in-memory only).
    // Remove with /faucet/config when production env secrets are available.
    this.secret_github = null;
    this.secret_twitter = null;
    // END TEMP_OAUTH_CONFIG

    this.github = {
      client_id: 'Ov23liMPm8lCgwlK1eHq',
      authorize_url: 'https://github.com/login/oauth/authorize',
      callback_url: 'https://staging.saito.io/faucet/oauth',
      scope: 'read:user'
    };
  }

  /**
   * Authenticate credentials returned by the OAuth provider callback.
   * Returns an authenticated identity. Does not write Faucet records or pay.
   */
  async authenticateCredentials(credentials = {}) {
    const provider = String(credentials.provider || 'github')
      .trim()
      .toLowerCase();
    const code = String(credentials.code || '').trim();
    const state = String(credentials.state || '').trim();

    if (provider !== 'github') {
      const err = new Error('That authentication provider is not available yet.');
      err.code = 'unsupported_provider';
      err.httpStatus = 400;
      err.title = 'GitHub authorization incomplete';
      err.popupMessage = 'That authentication provider is not available yet.';
      throw err;
    }

    let publickey = '';
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      publickey = String(parsed?.pk || '').trim();
    } catch (err) {
      publickey = '';
    }
    if (!publickey) {
      const err = new Error('Could not recover the Saito public key from the OAuth response.');
      err.code = 'invalid_oauth_state';
      err.httpStatus = 400;
      err.title = 'Invalid OAuth state';
      err.popupMessage = err.message;
      throw err;
    }

    const gh = this.github || {};
    const clientId = String(gh.client_id || '').trim();
    const callbackUrl = String(gh.callback_url || '').trim();
    const clientSecret = this.secret_github;

    if (!clientId || !callbackUrl || !clientSecret) {
      const err = new Error(
        'Client ID, callback URL, or client secret is missing. Configure secrets via /faucet/config.'
      );
      err.code = 'github_oauth_not_configured';
      err.httpStatus = 500;
      err.title = 'GitHub OAuth not configured';
      err.popupMessage = err.message;
      throw err;
    }

    const identity = await GithubOAuth.authenticateCredentials({
      code,
      clientId,
      clientSecret,
      redirectUri: callbackUrl
    });
    identity.publickey = publickey;
    return identity;
  }

  attachRoutes(expressapp) {
    const oauth_self = this;
    const slug = encodeURI(this.mod.returnSlug());

    const sendPopup = (res, status, opts) => {
      res.status(status);
      res.setHeader('Content-type', 'text/html; charset=UTF-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(OAuthResultTemplate(opts));
    };

    // TEMP DEV: skip GitHub and feed a synthetic identity into the real
    // OAuth-success path. Bound to loopback so it cannot be used as a
    // production authentication bypass.
    expressapp.get(`/${slug}/oauth/test`, async (req, res) => {
      if (res.finished) {
        return;
      }

      const host = String(req.headers.host || '')
        .split(':')[0]
        .toLowerCase();
      if (host !== 'localhost' && host !== '127.0.0.1') {
        res.status(404);
        return res.end();
      }

      const publickey = String(req.query?.publickey || '').trim();
      if (!publickey) {
        return sendPopup(res, 400, {
          ok: false,
          title: 'Faucet OAuth test',
          message: 'Missing Saito public key. Open /faucet/oauth/test?publickey=<key>.'
        });
      }

      const identity = {
        provider: 'github',
        provider_user_id: 'dev-' + publickey,
        provider_username: 'faucet-dev',
        provider_display_name: 'Faucet Dev',
        provider_account_created_at: Date.now() - 200 * 24 * 60 * 60 * 1000,
        publickey
      };

      try {
        const outcome = await oauth_self.mod.acceptAuthenticatedIdentity(identity);
        return sendPopup(res, outcome.status, outcome.popup);
      } catch (err) {
        console.error('FAUCET OAUTH TEST: acceptAuthenticatedIdentity failed', err);
        return sendPopup(res, 500, {
          ok: false,
          title: 'Faucet OAuth test failed',
          message: err?.message || 'acceptAuthenticatedIdentity failed.'
        });
      }
    });

    expressapp.get(`/${slug}/oauth/github`, (req, res) => {
      if (res.finished) {
        return;
      }

      const publickey = String(req.query?.publickey || '').trim();
      if (!publickey) {
        return sendPopup(res, 400, {
          ok: false,
          title: 'GitHub sign-in unavailable',
          message: 'Missing Saito public key. Close this window and try again from Get SAITO.'
        });
      }

      const gh = oauth_self.github || {};
      const clientId = String(gh.client_id || '').trim();
      const authorizeUrl = String(gh.authorize_url || '').trim();
      const callbackUrl = String(gh.callback_url || '').trim();
      const scope = String(gh.scope || 'read:user').trim();

      if (!clientId || !authorizeUrl || !callbackUrl) {
        return sendPopup(res, 400, {
          ok: false,
          title: 'GitHub OAuth not configured',
          message:
            'Public GitHub OAuth settings are incomplete on this server (client_id / callback).'
        });
      }

      try {
        const state = Buffer.from(JSON.stringify({ pk: publickey }), 'utf8').toString(
          'base64url'
        );

        const url = new URL(authorizeUrl);
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', callbackUrl);
        url.searchParams.set('scope', scope);
        url.searchParams.set('state', state);

        return res.redirect(302, url.toString());
      } catch (err) {
        console.error('FAUCET OAUTH: failed to redirect to GitHub', err?.message || err);
        return sendPopup(res, 400, {
          ok: false,
          title: 'GitHub sign-in unavailable',
          message:
            'Could not start GitHub authorization. Close this window and try again from Get SAITO.'
        });
      }
    });

    expressapp.get(`/${slug}/oauth`, async (req, res) => {
      if (res.finished) {
        return;
      }

      const code = String(req.query?.code || '').trim();
      const state = String(req.query?.state || '').trim();
      const oauthError = String(req.query?.error || '').trim();

      if (!code && !state && !oauthError) {
        return sendPopup(res, 400, {
          ok: false,
          title: 'Invalid OAuth callback',
          message:
            'This endpoint accepts GitHub OAuth responses only. Start again from Get SAITO.'
        });
      }

      if (oauthError) {
        const desc = String(req.query?.error_description || oauthError);
        console.log('FAUCET OAUTH: GitHub returned error', oauthError);
        return sendPopup(res, 400, {
          ok: false,
          title: 'GitHub authorization failed',
          message: desc
        });
      }

      if (!code || !state) {
        return sendPopup(res, 400, {
          ok: false,
          title: 'GitHub authorization incomplete',
          message: 'Missing authorization code or state.'
        });
      }

      try {
        const identity = await oauth_self.authenticateCredentials({
          provider: 'github',
          code,
          state
        });
        const outcome = await oauth_self.mod.acceptAuthenticatedIdentity(identity);
        return sendPopup(res, outcome.status, outcome.popup);
      } catch (err) {
        if (err?.code === 'github_account_too_new') {
          console.log(
            'FAUCET OAUTH: GitHub account too new',
            err.login || '',
            err.created_at || '(no created_at)'
          );
        } else if (err?.httpStatus && err?.title) {
          // structured auth failure (state, config, missing user id)
        } else {
          console.error(
            'FAUCET OAUTH: GitHub exchange/profile failed',
            err?.code || err?.message || err
          );
          return sendPopup(res, 502, {
            ok: false,
            title: 'GitHub verification failed',
            message: 'Could not complete GitHub token exchange or profile lookup. Try again.'
          });
        }

        return sendPopup(res, err.httpStatus, {
          ok: false,
          title: err.title,
          message: err.popupMessage || err.message,
          details: err.details || ''
        });
      }
    });
  }
}

module.exports = FaucetOAuth;
