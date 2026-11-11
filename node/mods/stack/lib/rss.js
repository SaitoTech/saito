const { pageQuery, postPage, collapsePosts, loadArchivePosts } = require('./post-feed');

function xml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function renderRss(app, mod, uri, publicKey = '') {
  const endpoint = app.server?.server?.endpoint || app.options?.server?.endpoint;
  const protocol = endpoint?.protocol?.replace(/:$/, '');
  const port = endpoint?.port ? `:${endpoint.port}` : '';
  const origin = protocol && endpoint?.host ? `${protocol}://${endpoint.host}${port}` : '';
  const resolveUrl = (path) => (origin ? new URL(path, `${origin}/`).href : path);

  let cursor = null;
  const posts = [];
  // Read every page, rather than silently truncating the feed at Archive's limit.
  while (true) {
    const query = { ...pageQuery(publicKey, cursor, 99), owner: '' };
    const rows = await loadArchivePosts(app, query);
    const page = postPage(mod, rows, 99);
    posts.push(
      ...page.posts.filter((tx) => {
        const msg = tx.returnMessage();
        return (
          !msg.access_hash &&
          !msg.access_script &&
          (!publicKey || tx.from?.[0]?.publicKey === publicKey)
        );
      })
    );
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  const title = publicKey ? `Saito Stack — ${publicKey}` : 'Saito Stack';
  const link = resolveUrl(`${uri}${publicKey ? '/' + publicKey : ''}`);
  const feed = resolveUrl(`${uri}/rss${publicKey ? '/' + publicKey : ''}`);
  const items = collapsePosts(mod, posts)
    .map((tx) => {
      const data = tx.returnMessage().data;
      const author = tx.from?.[0]?.publicKey;
      const url = resolveUrl(`${uri}/${author}/${tx.signature}`);
      return (
        `<item><title>${xml(data.title || 'Untitled')}</title>` +
        `<link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid>` +
        `<dc:creator>${xml(author)}</dc:creator><pubDate>${new Date(tx.timestamp).toUTCString()}</pubDate>` +
        `<description>${xml('<pre>' + xml(data.content || data.excerpt || '') + '</pre>')}</description></item>`
      );
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>${xml(title)}</title><link>${xml(link)}</link>
<description>Public posts on Saito Stack</description>
<atom:link href="${xml(feed)}" rel="self" type="application/rss+xml"/>
${items}</channel></rss>`;
}

function registerRssRoutes(app, mod, expressapp, uri) {
  const handler = async (req, res) => {
    const publicKey = req.params.publickey || '';
    if (publicKey && !app.crypto.isPublicKey(publicKey))
      return res.status(400).send('Invalid public key');
    try {
      const feed = await renderRss(app, mod, uri, publicKey);
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      return res.send(feed);
    } catch (error) {
      console.error('Stack: RSS feed failed', error);
      return res.status(500).send('Unable to load feed');
    }
  };
  expressapp.get(`${uri}/rss`, handler);
  expressapp.get(`${uri}/rss/:publickey`, handler);
}

module.exports = { registerRssRoutes, renderRss };
