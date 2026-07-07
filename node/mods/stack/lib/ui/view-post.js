const ViewPostTemplate = require('./view-post.template');
const PostTeaser = require('./post-teaser');
const SaitoUser = require('./../../../../lib/saito/ui/saito-user/saito-user');

class ViewPost {
  constructor(app, mod, container, tx = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.tx = tx;
  }

  render(tx = null) {
    // Clear this out
    this.authorPublicKey = null;

    // Update transaction if provided
    if (tx !== null) {
      this.tx = tx;
    }

    // Handle null transaction by creating a mock transaction
    if (!this.tx) {
      this.tx = this.createMockTransaction();
    }

    // ========================================================================
    // CANONICAL URL UPDATE: Update browser URL to reflect the post being viewed
    // ========================================================================
    if (this.tx && this.tx.signature) {
      this.authorPublicKey =
        this.tx.from && this.tx.from.length > 0
          ? this.tx.from[0].publicKey || this.tx.from[0].address || ''
          : '';

      if (this.authorPublicKey) {
        const canonicalUrl = `/${this.mod.slug}/${this.authorPublicKey}/${this.tx.signature}`;
        // Use pushState to update URL without reload (allows back button to work)
        window.history.pushState(
          { view: 'stack_post', publicKey: this.authorPublicKey, signature: this.tx.signature },
          null,
          canonicalUrl
        );
      }
    }

    const html = ViewPostTemplate(this.app, this.mod, this.tx);

    // Render into container
    if (typeof this.container === 'string') {
      const containerEl = document.querySelector(this.container);
      if (containerEl) {
        containerEl.innerHTML = html;
        // Don't reset opacity/transition here - let the transition handler manage it
      } else {
        console.error('ViewPost: Container not found:', this.container);
        return;
      }
    } else if (this.container) {
      this.container.innerHTML = html;
      // Don't reset opacity/transition here - let the transition handler manage it
    } else {
      console.error('ViewPost: Invalid container');
      return;
    }

    // Attach events after render
    setTimeout(() => {
      this.attachEvents();
      this.renderAuthorBlock();
      this.addBreadCrumbs();
    }, 25);
  }

  renderAuthorBlock() {
    // Render SaitoUser component for author identity
    const authorContainer = document.querySelector('#stack-view-post-author-container');
    if (!authorContainer || !this.tx) return;

    // Get sender public key from transaction (canonical Saito field)

    if (!this.authorPublicKey) return;

    // Get publish date from transaction timestamp
    const timestamp = this.tx.timestamp || Date.now();
    const date = this.app.browser.formatDate ? this.app.browser.formatDate(timestamp) : null;
    const dateString = date ? `${date.month} ${date.day}, ${date.year}` : '';

    // Use SaitoUser component - notice parameter shows publish date as secondary line
    // Do NOT override SaitoUser CSS - use default styling
    const saitoUser = new SaitoUser(
      this.app,
      this.mod,
      '#stack-view-post-author-container',
      this.authorPublicKey,
      dateString, // Use notice parameter for publish date (renders as saito-userline)
      '' // fourthelem
    );
    saitoUser.render();
  }

  async addBreadCrumbs() {
    if (!this.tx || !this.authorPublicKey) {
      return;
    }

    let otherPosts = this.mod.postsCache.byAuthor.get(this.authorPublicKey);

    if (!otherPosts) {
      // Pull extras for breadcrumbs
      await this.mod.loadPostsForAuthor(this.authorPublicKey);
      otherPosts = this.mod.postsCache.byAuthor.get(this.authorPublicKey);
    }

    let idx = -1;

    if (otherPosts?.length > 1) {
      for (let i = 0; i < otherPosts.length; i++) {
        if (otherPosts[i].signature == this.tx.signature) {
          idx = i;
          break;
        }
      }

      if (idx >= 0) {
        if (idx > 0) {
          const teaser = new PostTeaser(this.app, this.mod, '#next-post', otherPosts[idx - 1]);
          teaser.render();
        } else {
          this.app.browser.addElementToId(
            `<div class="stack-view-footer-note">This is the most recent post</div>`,
            'next-post'
          );
        }

        if (idx < otherPosts.length - 1) {
          const teaser = new PostTeaser(this.app, this.mod, '#previous-post', otherPosts[idx + 1]);
          teaser.render();
        } else {
          this.app.browser.addElementToId(
            `<div class="stack-view-footer-note">This is the earliest available post</div>`,
            'previous-post'
          );
        }

        //attach Events

        const teasers = document.querySelectorAll('.stack-post-teaser');
        teasers.forEach((teaser) => {
          // Get transaction signature from DOM (preferred) or fallback to post-id
          const txSignature =
            teaser.getAttribute('data-tx-signature') || teaser.getAttribute('data-post-id');
          if (!txSignature) return;

          // Remove existing click handlers to avoid duplicates
          const newTeaser = teaser.cloneNode(true);
          teaser.parentNode.replaceChild(newTeaser, teaser);

          // Attach click handler
          newTeaser.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Resolve transaction from cache
            // First try this.posts (already loaded)
            let tx = otherPosts.find((p) => p.signature === txSignature) || null;

            if (tx) {
              this.render(tx);
              // Reset scroll position immediately
              const container = document.querySelector('.saito-container');
              window.scrollTo({ top: 0, behavior: 'instant' });
              if (container.scrollTop !== undefined) {
                container.scrollTop = 0;
              }
            } else {
              siteMessage('Something went wrong...');
            }
          };
        });
      }
    }
  }

  attachEvents() {
    try {
      // EDITOR icon (pencil) - only visible to post author, opens editor with post content
      const editorIcon = document.querySelector('#stack-view-post-build-on');
      if (editorIcon) {
        const currentUserPublicKey = this.mod.publicKey || '';

        if (this.authorPublicKey === currentUserPublicKey && this.authorPublicKey) {
          // Show icon for author
          editorIcon.style.display = '';
          editorIcon.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleBuildOn();
          });
        } else {
          // Hide icon for non-authors
          editorIcon.style.display = 'none';
        }
      }

      // Follow
      const followIcon = document.querySelector('#stack-view-post-subscribe');
      if (followIcon) {
        if (this.authorPublicKey !== this.mod.publicKey) {
          if (!this.mod.isSubscribed(this.authorPublicKey)) {
            followIcon.style.display = '';
            followIcon.onclick = (e) => {
              e.preventDefault();
              const added = this.mod.addSubscription(this.authorPublicKey);
              if (added) {
                followIcon.style.display = 'none';
                siteMessage('Subscribed!', 2000);
              } else {
                console.info(
                  ' ! Subscribe failed...',
                  this.authorPublicKey,
                  this.app.options.stack.subscriptions
                );
              }
            };
          }
        }
      }

      // Share icon - generic share
      const shareBtn = document.querySelector('#stack-view-post-share');
      if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
          e.preventDefault();

          if (!this.tx || !this.authorPublicKey) return;

          let shareUrl = window.location.href;
          if (this.authorPublicKey && this.tx.signature) {
            // prefer the registered name when our keychain knows it -- the
            // /stack/@name routes resolve it back to the publickey
            let name = this.app.keychain.returnIdentifierByPublicKey(this.authorPublicKey);
            let author_segment = name ? '@' + name.split('@')[0] : this.authorPublicKey;
            shareUrl = `/${this.mod.slug}/${author_segment}/${this.tx.signature}`;
            if (!shareUrl.startsWith('http')) {
              shareUrl = window.location.origin + shareUrl;
            }
          }

          const msg = this.tx.returnMessage();

          this.app.browser.handleShare({
            title: msg?.data?.title || 'Stack Post',
            url: shareUrl
          });
        });
      }
    } catch (err) {
      console.error('ViewPost attachEvents error:', err);
    }
  }

  handleBuildOn() {
    if (!this.tx || !this.mod || !this.mod.create_post_ui) return;

    // Extract post data from transaction
    const msg = this.tx.returnMessage();
    const data = msg && msg.data ? msg.data : {};
    const title = data.title || '';
    const content = data.content || data.text || '';

    // ========================================================================
    // INVARIANT 4: Unmount before navigating to editor (navigation path: viewer → editor)
    // ========================================================================
    if (typeof this.mod.create_post_ui.onEditorUnmount === 'function') {
      this.mod.create_post_ui.onEditorUnmount();
    }

    // ========================================================================
    // INVARIANT 2: Editor requires explicit intent - use "edit" mode for building on existing post
    // ========================================================================
    // Note: The editor will render with default "new" intent, then we load the post content
    // This is acceptable as "edit" mode is essentially "new" mode with pre-filled content
    // Render the editor (will use default "new" intent from render())
    this.mod.create_post_ui.render();

    // Load post content into editor after a short delay to ensure DOM is ready
    setTimeout(() => {
      const { parseMarkdownToDocument, renderDocument } = require('../post-document');

      // Set title
      const titleInput = document.querySelector('#stack-post-title-input');
      if (titleInput) {
        titleInput.value = title;
      }

      // Load content into editor
      const editor = document.querySelector('#stack-post-body-editor');
      if (editor) {
        if (content.trim()) {
          // ----------------------------------------------------
          // RESOLVE stack:image:* REFERENCES BEFORE EDIT RENDER
          // ----------------------------------------------------
          let resolvedContent = content;

          if (Array.isArray(data.images) && data.images.length > 0) {
            resolvedContent = resolvedContent.replace(
              /!\[([^\]]*)\]\(stack:image:([^)]+)\)/g,
              (match, alt, imageId) => {
                const image = data.images.find((img) => img.id === imageId);
                if (!image) return match;

                const src = `data:${image.mime};base64,${image.data}`;
                return `![${alt || ''}](${src})`;
              }
            );
          }

          // Parse markdown content to document structure
          const tempDocument = parseMarkdownToDocument(resolvedContent);

          renderDocument(tempDocument, editor, {
            contentEditable: true
          });

          // ----------------------------------------------------
          // RESTORE IMAGE REGISTRY + STAMP stackImageId (EDIT MODE)
          // ----------------------------------------------------
          if (Array.isArray(data.images)) {
            // Restore editor image registry
            this.mod.create_post_ui.images = [...data.images];

            // ----------------------------------------------------
            // NORMALIZE IMAGES INTO REAL IMAGE BLOCKS
            // ----------------------------------------------------
            const imgNodes = Array.from(editor.querySelectorAll('img'));

            imgNodes.forEach((img, i) => {
              const parent = img.closest('[data-block-type="image"]');
              if (parent) return;

              const figure = document.createElement('figure');
              const blockId = `img_block_${Date.now()}_${i}`;

              figure.setAttribute('data-block-id', blockId);
              figure.setAttribute('data-block-type', 'image');
              figure.className = 'stack-image-block';
              figure.contentEditable = false;

              img.replaceWith(figure);
              figure.appendChild(img);
            });

            // ----------------------------------------------------
            // RE-STAMP stackImageId AFTER NORMALIZATION
            // ----------------------------------------------------
            for (let i = 0; i < imgNodes.length; i++) {
              if (data.images[i]) {
                imgNodes[i].dataset.stackImageId = data.images[i].id;
              }
            }
          }
        } else {
          // Empty content - render empty document
          const { generateBlockId } = require('../post-document');
          const tempDocument = {
            blocks: [{ type: 'paragraph', id: generateBlockId(0), text: '' }]
          };
          renderDocument(tempDocument, editor, {
            contentEditable: true
          });
        }
      }

      // Load featured image if present
      if (data.image && this.mod.create_post_ui) {
        this.mod.create_post_ui.featuredImage = data.image;
        setTimeout(() => {
          if (
            this.mod.create_post_ui &&
            typeof this.mod.create_post_ui.updateFeaturedImageDisplay === 'function'
          ) {
            this.mod.create_post_ui.updateFeaturedImageDisplay();
          }
        }, 50);
      }

      // PART 2 — DETECTING PUBLISHED POSTS: Set parent_id for editing
      // Post loaded from transaction (view-post) is a published post
      // Determine root signature: if post has parent_id, use it; otherwise use post's own signature
      const parent_id = data.parent_id || null;
      if (this.mod.create_post_ui) {
        if (parent_id) {
          // This is a revision - root is the parent_id
          this.mod.create_post_ui.parent_id = parent_id;
        } else {
          // This is a root post - root is the post's own signature
          this.mod.create_post_ui.parent_id = this.tx.signature;
        }

        if (typeof this.mod.create_post_ui.updatePlaceholderVisibility === 'function') {
          this.mod.create_post_ui.updatePlaceholderVisibility();
        }
        if (typeof this.mod.create_post_ui.updatePublishTriggerVisibility === 'function') {
          this.mod.create_post_ui.updatePublishTriggerVisibility();
        }
        if (typeof this.mod.create_post_ui.updatePublishTriggerState === 'function') {
          this.mod.create_post_ui.updatePublishTriggerState();
        }
      }
    }, 100);
  }

  /**
   * Creates a mock transaction for development/testing when tx is null.
   * This is a temporary development bridge and should be replaced with real transactions.
   */
  createMockTransaction() {
    // Create a mock transaction object that matches the Stack transaction structure
    const mockTx = {
      from: [
        {
          publicKey: 'mock-author-key-1234567890abcdef'
        }
      ],
      timestamp: Date.now() - 86400000 * 3, // 3 days ago
      signature: 'mock-signature-1234567890',
      returnMessage: function () {
        return {
          module: 'Stack',
          request: 'create stack post request',
          data: {
            type: 'stack_post',
            title: 'On Shared Dreaming',
            subtitle: 'Exploring the architecture of collective consciousness',
            summary:
              'What happens when we build worlds together, not just in our minds, but in spaces we can enter together? The question of shared dreaming touches on something fundamental about how we construct reality and trust one another within it.',
            text: `# On Shared Dreaming

The idea of shared dreaming has haunted human imagination for as long as we have told stories. What happens when we build worlds together, not just in our minds, but in spaces we can enter together? The question touches on something fundamental about how we construct reality and trust one another within it.

## The Architecture of Collective Consciousness

When we dream alone, the rules are simple: everything we encounter is a product of our own mind. The physics, the logic, the people—all of it exists because we believe it does. But what if someone else could enter that space? What if the dream had to accommodate not just one consciousness, but two, or many?

The first challenge is coordination. In a private dream, you can change the rules on a whim. A door that was locked can suddenly be open because you willed it. But in a shared space, such changes require consensus, or at least acknowledgment. The shared dream becomes a negotiation, a collaborative construction where each participant brings their own expectations and limitations.

This negotiation is not just about what is possible, but about what is real. In your own dream, you know—or at least believe—that everything you see is a projection. But when another person enters, their presence introduces a fundamental uncertainty: are they real, or are they another projection? The question of authenticity becomes central, and trust becomes the currency of the shared space.

## Trust and Coordination Inside a Dream

Trust in a shared dream operates differently than trust in waking life. In the physical world, we have external referents—we can touch, measure, verify. But in a dream, verification is circular. If I ask you to prove you're real, and you respond, how do I know your response isn't just my mind creating what I expect to hear?

The answer, perhaps, is that trust in a shared dream is not about verification, but about surrender. To enter someone else's dream is to accept, at least provisionally, that their reality is as valid as your own. It is to agree to play by rules you did not create, to see things you did not imagine, to experience perspectives that are genuinely other.

This surrender is not passive. It requires active participation in the construction of the shared space. You must contribute your own elements, your own rules, your own understanding. The dream becomes a collaborative work, constantly being rewritten by all participants.

## The Difference Between Private and Collective Experience

A private dream is a monologue. A shared dream is a dialogue, or perhaps a polyphonic composition where multiple voices speak simultaneously, sometimes in harmony, sometimes in tension.

In a private dream, you are both the author and the audience. You know the plot because you wrote it, even if you don't remember writing it. But in a shared dream, you are only one of the authors, and you are constantly surprised by what the others create. The experience becomes genuinely collaborative, genuinely unpredictable.

This unpredictability is both the risk and the reward. In a private dream, you can control everything, but you can also be trapped by your own limitations. In a shared dream, you lose control, but you gain access to perspectives and possibilities you could never have imagined alone.

## The Boundaries of Shared Space

The question of boundaries becomes crucial. Where does one person's dream end and another's begin? If we are truly sharing a space, then the boundaries must be permeable, or perhaps non-existent. But if there are no boundaries, how do we maintain our individual identity? How do we know where we end and the other begins?

Perhaps the answer is that in a truly shared dream, identity itself becomes fluid. You are not just yourself, but also part of the collective construction. Your thoughts influence the space, and the space influences your thoughts. The distinction between self and other, between internal and external, begins to blur.

This blurring is not necessarily a loss. It can be an expansion, a way of experiencing consciousness that transcends individual boundaries. But it also requires a kind of courage—the willingness to let go of the certainty that comes with being the sole author of your reality.

## The Ethics of Shared Dreaming

If we can truly share dreams, then we must consider the ethics of such sharing. What are the responsibilities of the dream architect? What are the rights of the dream participant? Can someone be harmed in a shared dream? Can they be healed?

These questions are not just theoretical. They touch on fundamental issues of consent, agency, and the nature of experience itself. If a shared dream feels real, does that make it real? And if it is real, what obligations do we have to those who share it with us?

The answer may be that shared dreaming, like any form of shared experience, requires mutual respect and care. We must enter each other's spaces with intention, with awareness of the power we have to shape the experience, and with respect for the autonomy of others.

## Conclusion: The Promise of Shared Spaces

Shared dreaming, whether literal or metaphorical, represents a profound possibility: that we can construct realities together, that we can experience consciousness not just individually but collectively. This possibility challenges our assumptions about the boundaries of self and other, about what is real and what is imagined.

In the end, perhaps the question is not whether shared dreaming is possible, but whether we are willing to take the risk of entering spaces we did not create, of trusting others with the architecture of our experience, of surrendering control in exchange for the possibility of genuine collaboration.

The shared dream, then, becomes a metaphor for all forms of collective construction—for art, for community, for the ways we build worlds together in waking life. And in that sense, we are all already shared dreamers, architects of spaces we enter together, constantly negotiating the rules, the boundaries, and the meaning of what we create.

The idea of shared dreaming has haunted human imagination for as long as we have told stories. What happens when we build worlds together, not just in our minds, but in spaces we can enter together? The question touches on something fundamental about how we construct reality and trust one another within it.

## The Architecture of Collective Consciousness

When we dream alone, the rules are simple: everything we encounter is a product of our own mind. The physics, the logic, the people—all of it exists because we believe it does. But what if someone else could enter that space? What if the dream had to accommodate not just one consciousness, but two, or many?

The first challenge is coordination. In a private dream, you can change the rules on a whim. A door that was locked can suddenly be open because you willed it. But in a shared space, such changes require consensus, or at least acknowledgment. The shared dream becomes a negotiation, a collaborative construction where each participant brings their own expectations and limitations.

This negotiation is not just about what is possible, but about what is real. In your own dream, you know—or at least believe—that everything you see is a projection. But when another person enters, their presence introduces a fundamental uncertainty: are they real, or are they another projection? The question of authenticity becomes central, and trust becomes the currency of the shared space.

## Trust and Coordination Inside a Dream

Trust in a shared dream operates differently than trust in waking life. In the physical world, we have external referents—we can touch, measure, verify. But in a dream, verification is circular. If I ask you to prove you're real, and you respond, how do I know your response isn't just my mind creating what I expect to hear?

The answer, perhaps, is that trust in a shared dream is not about verification, but about surrender. To enter someone else's dream is to accept, at least provisionally, that their reality is as valid as your own. It is to agree to play by rules you did not create, to see things you did not imagine, to experience perspectives that are genuinely other.

This surrender is not passive. It requires active participation in the construction of the shared space. You must contribute your own elements, your own rules, your own understanding. The dream becomes a collaborative work, constantly being rewritten by all participants.

## The Difference Between Private and Collective Experience

A private dream is a monologue. A shared dream is a dialogue, or perhaps a polyphonic composition where multiple voices speak simultaneously, sometimes in harmony, sometimes in tension.

In a private dream, you are both the author and the audience. You know the plot because you wrote it, even if you don't remember writing it. But in a shared dream, you are only one of the authors, and you are constantly surprised by what the others create. The experience becomes genuinely collaborative, genuinely unpredictable.

This unpredictability is both the risk and the reward. In a private dream, you can control everything, but you can also be trapped by your own limitations. In a shared dream, you lose control, but you gain access to perspectives and possibilities you could never have imagined alone.

## The Boundaries of Shared Space

The question of boundaries becomes crucial. Where does one person's dream end and another's begin? If we are truly sharing a space, then the boundaries must be permeable, or perhaps non-existent. But if there are no boundaries, how do we maintain our individual identity? How do we know where we end and the other begins?

Perhaps the answer is that in a truly shared dream, identity itself becomes fluid. You are not just yourself, but also part of the collective construction. Your thoughts influence the space, and the space influences your thoughts. The distinction between self and other, between internal and external, begins to blur.

This blurring is not necessarily a loss. It can be an expansion, a way of experiencing consciousness that transcends individual boundaries. But it also requires a kind of courage—the willingness to let go of the certainty that comes with being the sole author of your reality.

## The Ethics of Shared Dreaming

If we can truly share dreams, then we must consider the ethics of such sharing. What are the responsibilities of the dream architect? What are the rights of the dream participant? Can someone be harmed in a shared dream? Can they be healed?

These questions are not just theoretical. They touch on fundamental issues of consent, agency, and the nature of experience itself. If a shared dream feels real, does that make it real? And if it is real, what obligations do we have to those who share it with us?

The answer may be that shared dreaming, like any form of shared experience, requires mutual respect and care. We must enter each other's spaces with intention, with awareness of the power we have to shape the experience, and with respect for the autonomy of others.

## Conclusion: The Promise of Shared Spaces

Shared dreaming, whether literal or metaphorical, represents a profound possibility: that we can construct realities together, that we can experience consciousness not just individually but collectively. This possibility challenges our assumptions about the boundaries of self and other, about what is real and what is imagined.

In the end, perhaps the question is not whether shared dreaming is possible, but whether we are willing to take the risk of entering spaces we did not create, of trusting others with the architecture of our experience, of surrendering control in exchange for the possibility of genuine collaboration.

The shared dream, then, becomes a metaphor for all forms of collective construction—for art, for community, for the ways we build worlds together in waking life. And in that sense, we are all already shared dreamers, architects of spaces we enter together, constantly negotiating the rules, the boundaries, and the meaning of what we create.`,
            image: null,
            imageUrl: '/saito/img/dreamscape.png',
            images: [],
            url: window.location.href + '#post/mock-shared-dreaming',
            tags: [],
            timestamp: Date.now() - 86400000 * 3,
            subscriptionTier: 'free',
            excerpt:
              'What happens when we build worlds together, not just in our minds, but in spaces we can enter together? The question of shared dreaming touches on something fundamental about how we construct reality and trust one another within it.'
          }
        };
      }
    };

    return mockTx;
  }
}

module.exports = ViewPost;
