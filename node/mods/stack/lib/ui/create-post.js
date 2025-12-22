const CreatePostTemplate = require('./create-post.template');

class CreatePost {
  constructor(app, mod, container = "") {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render(container = "") {
    if (container !== "") {
      this.container = container;
    }

    if (!this.container || this.container.trim() === "") {
      this.container = ".saito-container";
    }

    const html = CreatePostTemplate(this.app, this.mod);

    // Always replace content in container to overwrite existing content
    this.app.browser.replaceElementBySelector(html, this.container);

    // Update container class
    const containerEl = document.querySelector(this.container);
    if (containerEl) {
      containerEl.classList.remove('stack-splash-container');
      containerEl.classList.add('stack-create-post-container');
    }

    this.attachEvents();
  }

  attachEvents() {
    try {
      // Back button
      const backBtn = document.querySelector('#stack-back-to-splash-btn');
      if (backBtn) {
        backBtn.onclick = (e) => {
          e.preventDefault();
          if (this.mod.main) {
            this.mod.main.render();
          }
        };
      }

      // Publish button
      const publishBtn = document.querySelector('#stack-publish-btn');
      if (publishBtn) {
        publishBtn.onclick = (e) => {
          e.preventDefault();
          this.handlePublish();
        };
      }

      // Preview button (placeholder)
      const previewBtn = document.querySelector('#stack-preview-btn');
      if (previewBtn) {
        previewBtn.onclick = (e) => {
          e.preventDefault();
          console.log('Preview clicked (placeholder)');
        };
      }

      // Image upload
      this.setupImageUpload();
    } catch (err) {
      console.error('CreatePost attachEvents error:', err);
    }
  }

  setupImageUpload() {
    const uploadArea = document.querySelector('#stack-image-upload-area');
    const uploadInput = document.querySelector('#stack-image-upload-input');
    const uploadedImages = document.querySelector('#stack-uploaded-images');

    if (!uploadArea || !uploadInput) return;

    // Click to browse
    uploadArea.onclick = () => {
      uploadInput.click();
    };

    // Drag and drop
    uploadArea.ondragover = (e) => {
      e.preventDefault();
      uploadArea.classList.add('stack-upload-dragover');
    };

    uploadArea.ondragleave = () => {
      uploadArea.classList.remove('stack-upload-dragover');
    };

    uploadArea.ondrop = (e) => {
      e.preventDefault();
      uploadArea.classList.remove('stack-upload-dragover');
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      this.handleImageFiles(files);
    };

    // File input change
    uploadInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      this.handleImageFiles(files);
    };
  }

  handleImageFiles(files) {
    const uploadedImages = document.querySelector('#stack-uploaded-images');
    if (!uploadedImages) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'stack-uploaded-image-item';
        imageDiv.innerHTML = `
          <img src="${e.target.result}" alt="${file.name}" />
          <button class="stack-remove-image-btn" data-filename="${file.name}">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <span class="stack-image-name">${file.name}</span>
        `;
        uploadedImages.appendChild(imageDiv);

        // Remove button
        const removeBtn = imageDiv.querySelector('.stack-remove-image-btn');
        if (removeBtn) {
          removeBtn.onclick = () => {
            imageDiv.remove();
          };
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async handlePublish() {
    const title = document.querySelector('#stack-post-title-input')?.value || '';
    const content = document.querySelector('#stack-post-body-input')?.value || '';
    
    if (!title.trim()) {
      alert('Please enter a title for your post');
      return;
    }

    if (!content.trim()) {
      alert('Please enter content for your post');
      return;
    }

    try {
      // Get uploaded images
      const uploadedImages = document.querySelectorAll('.stack-uploaded-image-item img');
      let image = '';
      let imageUrl = '';
      
      // Use the first uploaded image if available
      if (uploadedImages.length > 0) {
        const firstImage = uploadedImages[0];
        const imageSrc = firstImage.getAttribute('src');
        if (imageSrc && imageSrc.startsWith('data:')) {
          // Extract base64 data (remove data:image/...;base64, prefix)
          image = imageSrc.split(',')[1] || '';
        } else if (imageSrc) {
          imageUrl = imageSrc;
        }
      }

      // Create excerpt from content (first 200 characters)
      const excerpt = content.substring(0, 200).replace(/\n/g, ' ').trim();
      const excerptWithEllipsis = excerpt.length < content.length ? excerpt + '...' : excerpt;

      // Prepare post data matching blog module structure
      const postData = {
        title: title.trim(),
        content: content.trim(),
        image: image,
        imageUrl: imageUrl,
        tags: [], // Can be extended later
        timestamp: Date.now(),
        subscriptionTier: 'free', // Default to free, can be extended later
        excerpt: excerptWithEllipsis
      };

      // Show loading message
      if (this.app.connection) {
        this.app.connection.emit('saito-header-update-message', {
          msg: 'Publishing post...',
          timeout: 0
        });
      }

      // Create and propagate the transaction
      await this.mod.createStackPostTransaction(postData, () => {
        // Callback after post is confirmed
        if (this.app.connection) {
          this.app.connection.emit('saito-header-update-message', { msg: '' });
        }
        
        // Return to splash page
        if (this.mod.main) {
          this.mod.main.render();
        }
      });

    } catch (error) {
      console.error('Error publishing post:', error);
      alert('Failed to publish post. Please try again.');
      if (this.app.connection) {
        this.app.connection.emit('saito-header-update-message', {
          msg: 'Error publishing post',
          timeout: 2000
        });
      }
    }
  }
}

module.exports = CreatePost;

