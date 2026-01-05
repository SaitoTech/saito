//const { default: Transaction } = require('saito-js/lib/transaction');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const SaitoProfile = require('./../../lib/saito/ui/saito-profile/saito-profile');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');
const BlogTemplate = require('./lib/blog.template');
const pageHome = require('./index');
const React = require('react');
const Transaction = require('../../lib/saito/transaction').default;
const { default: BlogPost } = require('./lib/react-components/blog-post');
const { default: BlogLayout } = require('./lib/react-components/blog-layout');
const markdownPage = require('./markdown.js');
const markdownTemplate = require('./lib/markdown-help.template');

class Blog extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = 'Blog';
    this.slug = 'blog';
    this.description = 'Blog Module';
    this.peer = null;
    this.icon_fa = 'fa-solid fa-book-open-reader';
    this.blog_rendered = false;

    this.social = {
      twitter: '@SaitoOfficial',
      title: '🟥 Saito Blog - Web3 Blogging',
      url: 'https://saito.io/blog',
      description: 'Peer to peer Web3 social media platform',
      image: 'https://saito.tech/wp-content/uploads/2022/04/saito_card.png'
    };

    this.callbackAfterPost = null;
    this.callBackAfterDelete = null;

    this.styles = ['/saito/saito.css', '/blog/style.css'];
    this.scripts = ['/blog/js/quill.js'];

    this.postsCache = {
      byUser: new Map(),
      lastFetch: new Map(),
      allPosts: [],
      lastAllPostsFetch: 0,
      deletedPosts: new Set()
    };

    this.react = null;

    this.overlay = new SaitoOverlay(app, this);

    this.CACHE_TIMEOUT = 10000;
  }

  async render() {
    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);
    this.addComponent(this.header);
    await super.render(this.app, this);
    // We don't render this, but want to add the hooks to get fallback blog image
    this.profile = new SaitoProfile(this.app, this);

    // Get post_id from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('tx_id');
    const author = urlParams.get('public_key');

    if (window.post) {
      let newtx = new Transaction();
      newtx.deserialize_from_web(this.app, window.post);

      const post = this.convertTransactionToPost(newtx);

      if (this.react?.cleanup) {
        console.log('Blog.Render -- remove previous React Root');
        this.react.cleanup();
      }

      this.react = this.app.browser.createReactRoot(
        BlogLayout,
        {
          post,
          app: this.app,
          mod: this,
          publicKey: post.publicKey,
          topMargin: true,
          ondelete: () => {
            const baseUrl = window.location.origin;
            window.location.href = `${baseUrl}/blog`;
          }
        },
        `blog-post-detail`
      );

      this.blog_rendered = true;
      this.attachEvents();
    } else if (postId) {
      const url = new URL(window.location);
      url.searchParams.delete('tx_id');
      window.history.pushState({}, '', url);
    }
  }

  attachEvents() {
    setTimeout(() => {
      Array.from(document.querySelectorAll('.byline .blog-author')).forEach((elm) => {
        elm.onclick = (e) => {
          e.stopImmediatePropagation();
          let pk = e.currentTarget.getAttribute('data-publickey');
          console.log('Click on: ', pk);
        };
      });
    }, 250);
  }

  respondTo(type = '', obj) {
    if (type === 'saito-header') {
      let x = [];
      if (!this.browser_active) {
        x.push({
          text: 'Blog',
          icon: this.icon_fa,
          rank: 105,
          type: 'navigation',
          callback: function (app, id) {
            navigateWindow('/blog');
          }
        });
      }
      return x;
    }

    if (type === 'saito-link') {
      const urlParams = new URL(obj?.link).searchParams;
      if (urlParams.has('tx_id')) {
        this.attachStyleSheets();
        return {
          processLink: (link) => {
            console.log('Process local link: ', obj.link);
            this.loadSinglePost(urlParams.get('tx_id'));
          }
        };
      }
    }

    if (type === 'filter-saito-link') {
      if (obj.slug == 'blog') {
        return { info: ['title', 'display_url', 'description'] };
      }
    }

    if (type === 'post-content') {
      let blog_self = this;
      return {
        icon: blog_self.icon_fa,
        text: 'Post through the Blog module',
        callback: async (content, image) => {
          let title = await sprompt('Add a title to your post');
          await blog_self.createBlogPostTransaction({
            title,
            content,
            image,
            tags: [],
            timestamp: Date.now(),
            imageUrl: ''
          });
        }
      };
    }
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!app.BROWSER) {
      return;
    }

    if (service.service === 'archive') {
      this.peer = peer;

      if (this.blog_rendered || !this.browser_active) {
        // We already have the target blog because it came in the index.js
        // We don't need to loadTransactions and create a duplicate react root
        return;
      }

      // Get post_id from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const postId = urlParams.get('tx_id');
      const author = urlParams.get('public_key');

      if (postId) {
        // Load specific post
        this.loadSinglePost(postId);
      } else if (author) {
        // Load post by author
        this.loadPosts(author);
      } else {
        this.loadPosts();
      }
    }
  }

  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();
    if (Number(conf) == 0) {
      if (txmsg.request === 'create blog post request') {
        console.log('Blog onConfirmation: createBlog');
        await this.receiveBlogPostTransaction(tx, blk);
      }
      if (txmsg.request === 'update blog post request') {
        console.log('Blog onConfirmation: updateBlog');
        await this.receiveBlogPostUpdateTransaction(tx);
      }
      if (txmsg.request === 'delete blog post request') {
        console.log('Blog onConfirmation: deleteBlog');
        await this.receiveBlogPostDeleteTransaction(tx);
      }
    }
  }

  async createBlogPostTransaction(
    post = {
      title: '',
      content: '',
      image: '',
      tags: [],
      timestamp: Date.now(),
      imageUrl: ''
    },
    callback
  ) {
    let { title, content, tags, timestamp, image, imageUrl } = post;
    try {
      // Create new transaction
      let newtx = '';
      newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);

      // Validate and sanitize the post data
      const data = {
        type: 'blog_post',
        title: post.title || 'Untitled',
        content: typeof post.content === 'string' ? post.content : JSON.stringify(post.content),
        tags: Array.isArray(post.tags) ? post.tags : [],
        image,
        timestamp: post.timestamp || Date.now(),
        imageUrl
      };

      // Set the transaction message
      newtx.msg = {
        module: this.name,
        request: 'create blog post request',
        data: data
      };

      await newtx.sign();

      await this.app.network.propagateTransaction(newtx);
      if (callback) {
        this.callbackAfterPost = callback;
      }

      return newtx;
    } catch (error) {
      console.error('Error creating blog transaction:', error);
      this.app.connection.emit('saito-header-update-message', {
        msg: 'Error creating blog post',
        timeout: 2000
      });
      throw error;
    }
  }

  async receiveBlogPostTransaction(tx, blk) {
    let from = tx?.from[0]?.publicKey;
    if (!from) {
      console.error('Blog: Invalid TX');
      return;
    }

    let txmsg = tx.returnMessage();

    let post = { ...txmsg.data, sig: tx.signature, publicKey: tx.from[0].publicKey };

    this.postsCache.allPosts.push(post);

    if (this.app.BROWSER) {
      if (tx.isFrom(this.publicKey)) {
        this.app.connection.emit('saito-header-update-message', { msg: '' });
        siteMessage('Blog post published', 1500);
      } else {
        siteMessage(`New blog post by ${this.app.keychain.returnUsername(from)}`, 3000);
      }
    }

    //
    // Save into archives
    //
    await this.app.storage.saveTransaction(tx, { preserve: 1 }, 'localhost', blk);

    if (this.callbackAfterPost) {
      this.callbackAfterPost();
      delete this.callbackAfterPost;
    }
  }

  async updateBlogPostTransaction(signature, title, content, tags, image, imageUrl, callback) {
    try {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);

      const data = {
        title,
        content,
        signature,
        content,
        tags,
        image,
        imageUrl
      };

      newtx.msg = {
        module: this.name,
        request: 'update blog post request',
        data: data
      };

      if (callback) {
        this.callbackAfterPost = callback;
      }

      // Sign the transaction
      await newtx.sign();
      await this.app.network.propagateTransaction(newtx);
    } catch (error) {
      console.error('Error updating blog transaction:', error);
      throw error;
    }
  }

  async receiveBlogPostUpdateTransaction(tx) {
    let from = tx?.from[0]?.publicKey;
    if (!from) {
      console.error('Blog: Invalid TX');
      return;
    }
    let txmsg = tx.returnMessage();
    //console.log('BLOG UPDATE: ', txmsg.data);
    if (tx.isFrom(this.publicKey)) {
      this.app.connection.emit('saito-header-update-message', { msg: '' });
      siteMessage('Blog post updated', 2000);
    }

    let { signature, content, title, tags, image, imageUrl } = txmsg.data;
    await this.app.storage.loadTransactions(
      { signature, field1: 'Blog' },
      async (txs) => {
        if (txs?.length > 0) {
          let tx = txs[0];
          tx.msg.data.content = content;
          tx.msg.data.title = title;
          (tx.msg.data.image = image),
            (tx.msg.data.tags = tags),
            (tx.msg.data.imageUrl = imageUrl),
            await this.app.storage.updateTransaction(tx, {}, 'localhost');
        }
      },
      'localhost'
    );

    if (this.callbackAfterPost) {
      this.callbackAfterPost();
      delete this.callbackAfterPost;
    }
  }

  async deleteBlogPost(sig, callback) {
    try {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);
      const data = {
        signature: sig
      };

      console.log('post data', data);

      newtx.msg = {
        module: this.name,
        request: 'delete blog post request',
        data: data
      };

      if (callback) {
        this.callBackAfterDelete = callback;
      }
      // Sign the transaction
      await newtx.sign();
      await this.app.network.propagateTransaction(newtx);
    } catch (error) {
      console.error('Error deleting blog transaction:', error);
      throw error;
    }
  }

  async receiveBlogPostDeleteTransaction(tx) {
    let from = tx?.from[0]?.publicKey;
    if (!from) {
      console.error('Blog: Invalid TX');
      return;
    }
    let txmsg = tx.returnMessage();
    console.log('BLOG DELETE: ', txmsg.data);
    if (tx.isFrom(this.publicKey)) {
      this.app.connection.emit('saito-header-update-message', { msg: '' });
      siteMessage('Blog post deleted', 2000);
    }

    let { signature } = txmsg.data;

    this.postsCache.deletedPosts.add(signature);

    await this.app.storage.loadTransactions(
      { signature, field1: 'Blog' },
      async (txs) => {
        if (txs?.length > 0) {
          let tx = txs[0];
          await this.app.storage.deleteTransaction(tx, {}, 'localhost');
        }
      },
      'localhost'
    );
    if (this.callBackAfterDelete) {
      this.callBackAfterDelete();
      this.callBackAfterDelete = null;
    }
    return true;
  }

  async loadBlogPostForUser(key, callback, useCache, limit = 20) {
    console.info('Blog.loadBlogPostForUser');
    // Check cache first
    const cachedPosts = this.postsCache.byUser.get(key) || [];
    const lastFetch = this.postsCache.lastFetch.get(key) || 0;
    const isCacheValid = Date.now() - lastFetch < this.CACHE_TIMEOUT;

    if (useCache) {
      if (cachedPosts.length > 0 && isCacheValid) {
        console.log('Using cached posts for user:', key);
        callback(cachedPosts);
        return;
      }
    }

    if (!this.peer) {
      siteMessage('Warning: no peers available...');
      callback(cachedPosts);
      return;
    }

    this.app.storage.loadTransactions(
      { field1: 'Blog', field2: key },
      (txs) => {
        const filteredTxs = this.filterBlogPosts(txs);
        const posts = this.convertTransactionsToPosts(filteredTxs);
        const updatedPosts = this.updateCache(key, posts);
        callback(updatedPosts);
      },
      this.peer
    );
  }

  async loadAllPostsFromKeys(keys, callback = null, useCache) {
    console.info('Blog.loadAllPostsFromKeys');
    if (useCache) {
      const isCacheValid = Date.now() - this.postsCache.lastAllPostsFetch < this.CACHE_TIMEOUT;
      if (this.postsCache.allPosts.length > 0 && isCacheValid) {
        console.log('Using cached all posts');
        if (callback) callback(this.postsCache.allPosts);
        return this.postsCache.allPosts;
      }
    }

    if (!this.peer) {
      siteMessage('Warning: no peers available...');
      if (callback) callback(this.postsCache.allPosts);
      return this.postsCache.allPosts;
    }

    const loadPromises = keys.map(
      (key) =>
        new Promise((resolve) => {
          this.app.storage.loadTransactions(
            { field1: 'Blog', field2: key },
            (txs) => {
              const filteredTxs = this.filterBlogPosts(txs);
              const posts = this.convertTransactionsToPosts(filteredTxs);
              const updatedPosts = this.updateCache(key, posts);
              resolve(updatedPosts);
            },
            this.peer
          );
        })
    );

    const postsArrays = await Promise.all(loadPromises);
    const allPosts = postsArrays.flat().sort((a, b) => b.timestamp - a.timestamp);

    // Update all posts cache
    this.postsCache.allPosts = allPosts;
    this.postsCache.lastAllPostsFetch = Date.now();

    if (callback) callback(allPosts);
    return allPosts;
  }

  async loadAllBlogPosts(callback, useCache = false, limit = 20) {
    console.info('Blog.loadAllBlogPosts');
    if (useCache) {
      const isCacheValid = Date.now() - this.postsCache.lastAllPostsFetch < this.CACHE_TIMEOUT;
      if (this.postsCache.allPosts.length > 0 && isCacheValid) {
        console.log('Using cached all posts');
        if (callback) callback(this.postsCache.allPosts);
        return;
      }
    }

    if (!this.peer) {
      siteMessage('Warning: no peers available...');
      if (callback) callback(this.postsCache.allPosts);
      return this.postsCache.allPosts;
    }

    this.app.storage.loadTransactions(
      { field1: 'Blog' },
      (txs) => {
        console.log(txs);
        const filteredTxs = this.filterBlogPosts(txs);
        const posts = this.convertTransactionsToPosts(filteredTxs);

        this.postsCache.allPosts = posts;
        this.postsCache.lastAllPostsFetch = Date.now();

        if (callback) callback(posts);
      },
      this.peer
    );
  }

  async loadPosts(author = null) {
    console.info('Blog.loadPosts -- ', author);
    if (this.react?.cleanup) {
      console.info('Blog.loadPosts -- remove previous react root');
      this.react.cleanup();
    }

    this.react = this.app.browser.createReactRoot(
      BlogLayout,
      { app: this.app, mod: this, publicKey: author, topMargin: true },
      `blog-layout-${Date.now()}`
    );
    this.attachEvents();
  }

  loadSinglePost(postId) {
    console.info('Blog.loadSinglePost');
    if (!this.peer) {
      siteMessage('Warning: no peers available...');
      this.loadPosts();
      return;
    }

    let blog_self = this;
    this.app.storage.loadTransactions(
      { field1: 'Blog', signature: postId },
      function (txs) {
        const filteredTxs = blog_self.filterBlogPosts(txs);
        const targetTx = filteredTxs.find((tx) => tx.signature === postId);
        if (targetTx) {
          const post = blog_self.convertTransactionToPost(targetTx);

          if (blog_self.browser_active) {
            console.log('Blog active...');
            if (blog_self.react?.cleanup) {
              console.info('Blog.loadSinglePost -- remove previous react root');
              blog_self.react.cleanup();
            }

            blog_self.react = blog_self.app.browser.createReactRoot(
              BlogLayout,
              {
                post,
                app: blog_self.app,
                mod: blog_self,
                publicKey: post.publicKey,
                topMargin: true,
                ondelete: () => {
                  const baseUrl = window.location.origin;
                  window.location.href = `${baseUrl}/blog`;
                }
              },
              `blog-post-detail-${Date.now()}`
            );
            this.attachEvents();
          } else {
            console.log('Loading blog post outside of blog...');
            blog_self.overlay.show(BlogTemplate(blog_self.app, blog_self.mod, post));
          }
        } else {
          console.error('Post not found');
          blog_self.loadPosts();
        }
      },
      this.peer
    );
  }

  updateCache(key, posts) {
    const existingPosts = this.postsCache.byUser.get(key) || [];

    const allPosts = [...posts];
    existingPosts.forEach((existingPost) => {
      if (!allPosts.some((p) => p.sig === existingPost.sig)) {
        allPosts.push(existingPost);
      }
    });

    allPosts.sort((a, b) => b.timestamp - a.timestamp);

    this.postsCache.byUser.set(key, allPosts);
    this.postsCache.lastFetch.set(key, Date.now());

    return allPosts;
  }

  filterBlogPosts(txs) {
    return txs.filter((tx) => tx.returnMessage().data.type === 'blog_post');
  }

  convertTransactionsToPosts(txs) {
    return txs.map((tx) => {
      const msg = tx.returnMessage();
      const data = msg.data;

      return {
        title: data.title || 'Untitled',
        content: data.content,
        image: data.image,
        timestamp: tx.timestamp || data.timestamp,
        sig: tx.signature,
        publicKey: tx.from[0].publicKey,
        imageUrl: data.imageUrl
      };
    });
  }

  convertTransactionToPost(tx) {
    const msg = tx.returnMessage();
    const data = msg.data;

    return {
      title: data.title || 'Untitled',
      content: data.content,
      timestamp: tx.timestamp || data.timestamp,
      sig: tx.signature,
      publicKey: tx.from[0].publicKey,
      image: data.image,
      imageUrl: data.imageUrl
    };
  }

  showMarkdownHelp() {
    this.overlay.show(markdownTemplate());
  }

  extractBlogSummary(text = '', length = 300) {
    // Extract preview of first n-hundred characters...
    let contentPreview = this.app.browser
      .stripHtml(text)
      .substring(0, length)
      .replace(/#+/g, '#')
      .split(/\s/);

    contentPreview.pop();
    let in_title = false;
    for (let i = 0; i < contentPreview.length; i++) {
      if (contentPreview[i] == '#') {
        in_title = true;
        contentPreview[i] = '<<';
      }
      if (in_title && !contentPreview[i]) {
        contentPreview[i] = '>> ';
        in_title = false;
      }
    }
    return contentPreview.join(' ') + '...';
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let mod_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
      let updatedSocial = Object.assign({}, mod_self.social);
      updatedSocial.url = reqBaseURL + encodeURI(mod_self.returnSlug());

      if (Object.keys(req.query).length > 0) {
        let query_params = req.query;
        let user = '';

        const postId = query_params?.tx_id;

        if (postId) {
          let cached_tx = '';

          const targetPost = mod_self.postsCache.allPosts.find((p) => p.sig === postId);

          if (targetPost) {
            user = app.keychain.returnUsername(targetPost.publicKey);

            updatedSocial.title = `'${targetPost.title}' by ${user}`;

            updatedSocial.description = mod_self.extractBlogSummary(targetPost.content);

            if (targetPost?.imageUrl) {
              updatedSocial.image = targetPost.imageUrl;
            } else if (targetPost?.image) {
              updatedSocial.image =
                reqBaseURL + encodeURI(mod_self.returnSlug()) + '?og_img_sig=' + postId;
            }

            cached_tx = targetPost?.tx;

            console.debug('***** serve blog page with cached post tx *****');
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.send(pageHome(app, mod_self, app.build_number, updatedSocial, cached_tx));
          } else {
            app.storage.loadTransactions(
              { field1: 'Blog', signature: postId },
              function (txs) {
                const filteredTxs = mod_self.filterBlogPosts(txs);
                const targetTx = filteredTxs.find((tx) => tx.signature === postId);
                let cached_tx = '';

                if (targetTx) {
                  const post = mod_self.convertTransactionToPost(targetTx);
                  user = app.keychain.returnUsername(post.publicKey);

                  updatedSocial.description = `'${post.title}' by ${user}`;

                  if (post?.imageUrl) {
                    updatedSocial.image = post.imageUrl;
                  } else if (post?.image) {
                    //
                    // We create a URL for the embedded image
                    //
                    updatedSocial.image =
                      reqBaseURL + encodeURI(mod_self.returnSlug()) + '?og_img_sig=' + postId;
                  }

                  cached_tx = targetTx.serialize_to_web(app);

                  post.tx = cached_tx;
                  mod_self.postsCache.allPosts.push(post);
                }

                console.debug('***** serve blog page after querying archive *****');
                res.setHeader('Content-type', 'text/html');
                res.charset = 'UTF-8';
                res.send(pageHome(app, mod_self, app.build_number, updatedSocial, cached_tx));
              },
              'localhost'
            );
          }
          // Wait for callback to complete
          return;
        } else if (query_params?.public_key) {
          user = app.keychain.returnUsername(query_params.public_key);
          updatedSocial.description = 'Blog posts by ' + user;
        }

        if (typeof query_params.og_img_sig != 'undefined') {
          let sig = query_params.og_img_sig;
          let img = '';
          let img_type;

          let targetPost = mod_self.postsCache.allPosts.find((p) => p.sig === sig);
          if (targetPost) {
            if (targetPost?.image) {
              switch (targetPost.image.charAt(0)) {
                case 'i':
                  img_type = 'image/png';
                  break;
                case 'R':
                  img_type = 'image/gif';
                  break;
                default:
                  img_type = 'image/jpeg';
              }
              img = Buffer.from(targetPost.image, 'base64');
              if (!res.finished) {
                res.writeHead(200, {
                  'Content-Type': img_type,
                  'Content-Length': img.length
                });
                return res.end(img);
              }
            }
          } else {
            // Need to load Transaction first!
            console.log('BLOG IMAGE REQUEST with Archive ! -- ', sig);
            app.storage.loadTransactions(
              { field1: 'Blog', signature: sig },
              function (txs) {
                const filteredTxs = mod_self.filterBlogPosts(txs);
                const targetTx = filteredTxs.find((tx) => tx.signature === sig);
                if (targetTx) {
                  targetPost = mod_self.convertTransactionToPost(targetTx);
                  mod_self.postsCache.allPosts.push(targetPost);
                  if (targetPost?.image) {
                    switch (targetPost.image.charAt(0)) {
                      case 'i':
                        img_type = 'image/png';
                        break;
                      case 'R':
                        img_type = 'image/gif';
                        break;
                      default:
                        img_type = 'image/jpeg';
                    }
                    img = Buffer.from(targetPost.image, 'base64');
                    if (!res.finished) {
                      res.writeHead(200, {
                        'Content-Type': img_type,
                        'Content-Length': img.length
                      });
                      return res.end(img);
                    }
                  }
                }
              },
              'localhost'
            );
            return;
          }
        }
      }

      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(pageHome(app, mod_self, app.build_number, updatedSocial));
      return;
    });

    expressapp.get('/' + encodeURI(this.returnSlug()) + '/markdown', async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(markdownPage(app, mod_self, app.build_number, mod_self.social));
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }
}

module.exports = Blog;
