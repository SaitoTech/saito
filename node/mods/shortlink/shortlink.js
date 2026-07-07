const ModTemplate = require('./../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;

//
// Shortlink -- server-side short links for transitory share URLs
//
// Modules that generate long invite links (base64 payloads in query strings)
// can register them here and hand out /l/{slug}/{id} instead. The resolver
// 302-redirects to the stored path + params, so the receiving module's
// existing URL-parameter parsing runs unchanged.
//
// This service is for TRANSITORY links (call rooms, game invites, file
// offers) where expiry is a feature. Permanent content (tweets, posts)
// should resolve from the Archive by signature instead -- see
// .design/link-sharing-design.md
//
class Shortlink extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Shortlink';
    this.slug = 'shortlink';
    this.description = 'Short URLs for share links';
    this.categories = 'Core Utilities';
    this.class = 'utility';

    //
    // peers offering the shortlink service (browser-side, via onPeerServiceUp)
    //
    this.peers = [];

    //
    // creation timestamps per requesting peer, for rate limiting
    //
    this.creation_log = {};
    this.max_creations_per_hour = 30;

    this.max_params_length = 4096;

    //
    // never persist private key material server-side; links carrying these
    // params must stay self-contained (see design doc, "private fragment links")
    //
    this.forbidden_params = /load_key|privatekey|private_key|seed/i;
  }

  returnServices() {
    let services = [];
    if (this.app.BROWSER == 0) {
      services.push(new PeerService(null, 'shortlink', 'saito'));
    }
    return services;
  }

  onPeerServiceUp(app, peer, service = {}) {
    if (service.service === 'shortlink') {
      let should_push = true;
      for (let i = 0; i < this.peers.length; i++) {
        if (this.peers[i].publicKey == peer.publicKey) {
          this.peers[i] = peer;
          should_push = false;
        }
      }
      if (should_push) {
        this.peers.push(peer);
      }
    }
  }

  //
  // browser-side entry point, called via app.browser.shortenLink()
  //
  // resolves to the short URL string, or null when no service peer is
  // available / the request times out / creation is refused. null means
  // "keep using the long URL" -- shortening is strictly best-effort.
  //
  async shorten(long_url, obj = {}) {
    let ttl = obj.ttl || 0;
    let max_uses = obj.max_uses || 0;
    let label = obj.label || '';

    if (!this.app.BROWSER || this.peers.length == 0) {
      return null;
    }

    let url;
    try {
      url = new URL(long_url);
    } catch (err) {
      return null;
    }

    let data = {
      path: url.pathname,
      params: url.search.replace(/^\?/, ''),
      ttl,
      max_uses
    };

    let peer = this.peers[0];

    return new Promise((resolve) => {
      let timer = setTimeout(() => resolve(null), 2000);
      this.app.network.sendRequestAsTransaction(
        'shortlink create',
        data,
        (res) => {
          clearTimeout(timer);
          if (res?.id && res?.slug) {
            let short_url = `${url.origin}/l/${res.slug}/${res.id}`;
            let tail = this.slugifyLabel(label);
            if (tail) {
              short_url += '/' + tail;
            }
            resolve(short_url);
          } else {
            resolve(null);
          }
        },
        peer.publicKey
      );
    });
  }

  slugifyLabel(label = '') {
    return String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 40);
  }

  async handlePeerTransaction(app, newtx = null, peer, mycallback = null) {
    if (newtx == null) {
      return 0;
    }
    let txmsg = newtx.returnMessage();
    if (!txmsg?.data) {
      return 0;
    }

    if (txmsg.request === 'shortlink create') {
      if (!this.app.BROWSER) {
        return this.createLink(txmsg.data, peer, mycallback);
      }
      return 0;
    }

    return super.handlePeerTransaction(app, newtx, peer, mycallback);
  }

  async createLink(data = {}, peer, mycallback = null) {
    let fail = (err) => {
      if (mycallback) {
        mycallback({ err });
      }
      return 1;
    };

    //
    // the target must be an installed module; we rebuild the path from the
    // validated slug so the resolver can only ever redirect within this
    // origin to a module root (no open-redirect, no path traversal)
    //
    let slug = String(data.path || '')
      .split('/')
      .filter((x) => x)[0];
    let mod = slug ? this.app.modules.returnModuleBySlug(slug) : null;
    if (!mod) {
      return fail('invalid path');
    }
    slug = mod.returnSlug();
    let path = '/' + slug + '/';

    let params = String(data.params || '');
    if (params.length > this.max_params_length) {
      return fail('params too long');
    }
    if (this.forbidden_params.test(params)) {
      return fail('refusing to store private key material');
    }

    let ttl = Math.max(0, Math.floor(Number(data.ttl) || 0));
    let max_uses = Math.max(0, Math.floor(Number(data.max_uses) || 0));

    let now = Date.now();

    if (!this.rateLimitOk(peer?.publicKey || '', now)) {
      return fail('rate limited');
    }

    await this.purgeExpired(now);

    //
    // 8 chars of base62 from crypto-random bytes (~47 bits). ids grant access
    // to exactly what the long URL already did, so unguessable-enough is the
    // bar, not cryptographic secrecy.
    //
    let id = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      id = this.generateId();
      let rows = await this.app.storage.queryDatabase(
        'SELECT id FROM links WHERE id = $id',
        { $id: id },
        'shortlink'
      );
      if (!rows?.length) {
        break;
      }
      id = '';
    }
    if (!id) {
      return fail('id generation failed');
    }

    await this.app.storage.runDatabase(
      `INSERT INTO links (id, module, path, params, creator, created_at, expires_at, max_uses, uses)
       VALUES ($id, $module, $path, $params, $creator, $created_at, $expires_at, $max_uses, 0)`,
      {
        $id: id,
        $module: slug,
        $path: path,
        $params: params,
        $creator: peer?.publicKey || '',
        $created_at: now,
        $expires_at: ttl > 0 ? now + ttl * 1000 : 0,
        $max_uses: max_uses
      },
      'shortlink'
    );

    if (mycallback) {
      mycallback({ err: null, id, slug });
    }
    return 1;
  }

  generateId() {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const crypto = require('crypto');
    let bytes = crypto.randomBytes(8);
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += alphabet[bytes[i] % alphabet.length];
    }
    return id;
  }

  rateLimitOk(publicKey, now) {
    let hour_ago = now - 60 * 60 * 1000;
    if (!this.creation_log[publicKey]) {
      this.creation_log[publicKey] = [];
    }
    this.creation_log[publicKey] = this.creation_log[publicKey].filter((ts) => ts > hour_ago);
    if (this.creation_log[publicKey].length >= this.max_creations_per_hour) {
      return false;
    }
    this.creation_log[publicKey].push(now);
    return true;
  }

  async purgeExpired(now = Date.now()) {
    try {
      // burned single-use rows get a week of grace so revisits still land on
      // the "expired" page before the row disappears entirely
      await this.app.storage.runDatabase(
        `DELETE FROM links WHERE (expires_at > 0 AND expires_at < $now)
         OR (max_uses > 0 AND uses >= max_uses AND created_at < $grace)`,
        { $now: now, $grace: now - 7 * 24 * 60 * 60 * 1000 },
        'shortlink'
      );
    } catch (err) {}
  }

  webServer(app, expressapp, express) {
    let shortlink_self = this;

    expressapp.get('/l/:slug/:id/:label?', async function (req, res) {
      let slug = String(req.params.slug || '');
      let id = String(req.params.id || '');

      //
      // land somewhere useful even when the link is dead: the named module's
      // home page if the slug is real, the site root if not
      //
      let fallback = app.modules.returnModuleBySlug(slug) ? `/${slug}/` : '/';

      if (!/^[0-9a-zA-Z]{8}$/.test(id)) {
        return res.redirect(302, fallback);
      }

      let rows = await app.storage.queryDatabase(
        'SELECT * FROM links WHERE id = $id',
        { $id: id },
        'shortlink'
      );

      //
      // the slug in the URL is a verified claim: a link that displays as
      // /l/videocall/... can never resolve into a different module
      //
      if (!rows?.length || rows[0].module !== slug) {
        return res.redirect(302, fallback);
      }

      let row = rows[0];
      let now = Date.now();

      if (
        (row.expires_at > 0 && row.expires_at < now) ||
        (row.max_uses > 0 && row.uses >= row.max_uses)
      ) {
        return res.redirect(302, `/${row.module}/?expired_invite=${row.id}`);
      }

      //
      // burned rows (uses >= max_uses) are kept so later visitors get the
      // "expired" landing rather than a generic miss; purgeExpired() removes
      // them after a grace period
      //
      await app.storage.runDatabase(
        'UPDATE links SET uses = uses + 1 WHERE id = $id',
        { $id: id },
        'shortlink'
      );

      let target = row.path;
      if (row.params) {
        target += '?' + row.params;
      }
      return res.redirect(302, target);
    });
  }
}

module.exports = Shortlink;
