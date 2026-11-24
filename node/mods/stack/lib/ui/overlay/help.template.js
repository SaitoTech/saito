/**
 * Writing guide shown from the editor sidebar.
 * Markers match what the editor accepts while typing, and what readers see after publish.
 */
module.exports = () => {
  return `
    <div class="guide">
      <div class="body">
        <h2 class="title">Writing a post</h2>
        <p class="lead">Write in the page. Press Enter after a marker to make a block. Drafts save on their own. Markers stay visible while you edit and format when someone reads the post.</p>

        <section class="group">
          <h3>Blocks</h3>
          <p>Start a line with the marker, then press Enter.</p>
          <ul class="items">
            <li><code># </code><span>title</span></li>
            <li><code>## </code><span>subtitle</span></li>
            <li><code>### </code><span>heading</span></li>
            <li><code>* </code><span>bullet. <code>- </code> works the same way.</span></li>
            <li><code>&gt; </code><span>quote</span></li>
            <li><code>\`\`\`</code><span>code block. Press Enter, write the code, then a line of <code>\`\`\`</code>.</span></li>
          </ul>
        </section>

        <section class="group">
          <h3>Inside a paragraph</h3>
          <ul class="items">
            <li><code>**bold**</code></li>
            <li><code>_italic_</code></li>
            <li><code>\`code\`</code></li>
            <li><code>[text](https://…)</code><span>or paste a web address on its own.</span></li>
          </ul>
        </section>

        <section class="group">
          <h3>Images</h3>
          <ul class="items">
            <li><span>Paste or drop an image into the writing area.</span></li>
            <li><span>The cover image is separate. Add it from the sidebar.</span></li>
          </ul>
        </section>
      </div>
    </div>
  `;
};
