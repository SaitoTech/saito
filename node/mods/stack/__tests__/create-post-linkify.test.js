/**
 * Regression tests for emphasis-aware URL linkification in _convertBareUrlsToMarkdownLinks
 * and code-invariant behavior (URLs in code must not be linkified).
 *
 * Bug: **https://google.com** was serializing to **[https://google.com**](https://google.com**)
 * because autolink detection captured trailing emphasis markers as part of the URL.
 *
 * Fix: Detect symmetric emphasis wrapping, strip markers, linkify URL only, re-wrap.
 *
 * @jest-environment jsdom
 */

// CreatePost class - instantiate with minimal app/mod for unit testing
const CreatePostClass = require('../lib/ui/create-post');
const createPost = new CreatePostClass({}, {}, '');

describe('_convertBareUrlsToMarkdownLinks', () => {
  const convert = (text) => createPost._convertBareUrlsToMarkdownLinks(text);

  describe('emphasis-aware linkification (regression fix)', () => {
    it('bold span with text + URL: **Check this out: https://github.com**', () => {
      expect(convert('**Check this out: https://github.com**')).toBe(
        '**Check this out: [https://github.com](https://github.com)**'
      );
    });

    it('**https://google.com** → **[https://google.com](https://google.com)**', () => {
      expect(convert('**https://google.com**')).toBe(
        '**[https://google.com](https://google.com)**'
      );
    });

    it('**https://x.com** → **[https://x.com](https://x.com)**', () => {
      expect(convert('**https://x.com**')).toBe(
        '**[https://x.com](https://x.com)**'
      );
    });

    it('_https://x.com_ → _[https://x.com](https://x.com)_', () => {
      expect(convert('_https://x.com_')).toBe(
        '_[https://x.com](https://x.com)_'
      );
    });

    it('***https://x.com*** → ***[https://x.com](https://x.com)***', () => {
      expect(convert('***https://x.com***')).toBe(
        '***[https://x.com](https://x.com)***'
      );
    });

    it('__https://x.com__ → __[https://x.com](https://x.com)__', () => {
      expect(convert('__https://x.com__')).toBe(
        '__[https://x.com](https://x.com)__'
      );
    });

    it('*https://x.com* → *[https://x.com](https://x.com)*', () => {
      expect(convert('*https://x.com*')).toBe(
        '*[https://x.com](https://x.com)*'
      );
    });

    it('italic span with text + URL: _See https://example.com for details_', () => {
      expect(convert('_See https://example.com for details_')).toBe(
        '_See [https://example.com](https://example.com) for details_'
      );
    });
  });

  describe('plain URLs (control - unchanged behavior)', () => {
    it('https://x.com → [https://x.com](https://x.com)', () => {
      expect(convert('https://x.com')).toBe('[https://x.com](https://x.com)');
    });

    it('https://google.com → [https://google.com](https://google.com)', () => {
      expect(convert('https://google.com')).toBe(
        '[https://google.com](https://google.com)'
      );
    });

    it('plain URL with trailing punctuation is stripped', () => {
      expect(convert('https://example.com.')).toBe(
        '[https://example.com](https://example.com).'
      );
    });

    it('URL inside existing markdown link href is not double-linkified', () => {
      const text = 'see [click here](https://example.com) for more';
      expect(convert(text)).toBe(
        'see [click here](https://example.com) for more'
      );
    });
  });

  describe('code-invariant: URLs inside inline code or code blocks are not linkified', () => {
    it('inline code with URL remains literal', () => {
      const text = '`const url = "https://example.com";`';
      expect(convert(text)).toBe(text);
    });

    it('mixed content: code stays literal, plain URL gets linkified', () => {
      const text = 'See `https://example.com` and visit https://example.com';
      expect(convert(text)).toBe(
        'See `https://example.com` and visit [https://example.com](https://example.com)'
      );
    });
  });
});

describe('code nested in formatted text - DOM path', () => {
  it('URL inside inline code nested in bold remains literal (getBlockContentForLinkification + linkify)', () => {
    const p = document.createElement('p');
    p.setAttribute('data-block-id', 'block-0');
    p.setAttribute('data-block-type', 'paragraph');
    const strong = document.createElement('strong');
    strong.textContent = 'Here is code: ';
    const code = document.createElement('code');
    code.textContent = 'https://example.com';
    p.appendChild(strong);
    p.appendChild(code);

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(code.firstChild, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    const createPostInstance = new CreatePostClass({}, {}, '');
    const { text } = createPostInstance.getBlockContentForLinkification(p, sel);
    expect(text).toBe('Here is code: `https://example.com`');

    const linkified = createPostInstance._convertBareUrlsToMarkdownLinks(text);
    expect(linkified).toBe('Here is code: `https://example.com`');
    expect(linkified).not.toContain('[https://example.com]');
  });

  it('URL inside inline code nested in italic remains literal', () => {
    const p = document.createElement('p');
    const em = document.createElement('em');
    em.textContent = 'See ';
    const code = document.createElement('code');
    code.textContent = 'https://x.com';
    p.appendChild(em);
    p.appendChild(code);

    const createPostInstance = new CreatePostClass({}, {}, '');
    const { text } = createPostInstance.getBlockContentForLinkification(p, window.getSelection());
    expect(text).toContain('`https://x.com`');
    const linkified = createPostInstance._convertBareUrlsToMarkdownLinks(text);
    expect(linkified).toBe('See `https://x.com`');
    expect(linkified).not.toContain('[https://');
  });
});

describe('blockquote after list - structural boundary', () => {
  it('blockquote is never a child of ul; repair moves it to sibling', () => {
    const editor = document.createElement('div');
    editor.id = 'stack-post-body-editor';
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.setAttribute('data-block-id', 'block-0');
    li.setAttribute('data-block-type', 'list-item');
    li.textContent = 'List item';
    const bq = document.createElement('blockquote');
    bq.setAttribute('data-block-id', 'block-1');
    bq.setAttribute('data-block-type', 'blockquote');
    bq.textContent = 'Blockquote';
    ul.appendChild(li);
    ul.appendChild(bq);
    editor.appendChild(ul);
    document.body.appendChild(editor);

    const createPostInstance = new CreatePostClass({}, {}, '');
    createPostInstance._ensureBlockquoteNotInList();

    expect(ul.contains(bq)).toBe(false);
    expect(ul.nextSibling).toBe(bq);
    expect(editor.contains(bq)).toBe(true);
    document.body.removeChild(editor);
  });
});

describe('markdown hard breaks (two trailing spaces)', () => {
  it('serializes <br> as markdown hard break (  \\n)', () => {
    const editor = document.createElement('div');
    editor.id = 'stack-post-body-editor';
    const p = document.createElement('p');
    p.setAttribute('data-block-id', 'block-0');
    p.setAttribute('data-block-type', 'paragraph');
    p.appendChild(document.createTextNode('This line has trailing spaces'));
    p.appendChild(document.createElement('br'));
    p.appendChild(document.createTextNode('This line should be a hard break.'));
    editor.appendChild(p);
    document.body.appendChild(editor);

    const createPostInstance = new CreatePostClass({}, {}, '');
    const markdown = createPostInstance.serializeDOMToMarkdown();
    document.body.removeChild(editor);

    expect(markdown).toContain('  \n');
    expect(markdown).toBe('This line has trailing spaces  \nThis line should be a hard break.');
  });
});

describe('block structure round-trip (paste → save → reload)', () => {
  it('headings, lists, blockquotes, paragraphs round-trip through serialize and parse', () => {
    const createPostInstance = new CreatePostClass({}, {}, '');
    const editor = document.createElement('div');
    editor.id = 'stack-post-body-editor';
    document.body.appendChild(editor);

    const markdown = `# Heading One

## Subheading

- List item one
- List item two

> Blockquote line one
> Blockquote line two

A plain paragraph.

Another paragraph.`;

    const blockEls = createPostInstance._parseMarkdownToBlockElements(markdown);
    blockEls.forEach((el) => editor.appendChild(el));

    const roundTripped = createPostInstance.serializeDOMToMarkdown();
    document.body.removeChild(editor);

    expect(roundTripped).toContain('# Heading One');
    expect(roundTripped).toContain('## Subheading');
    expect(roundTripped).toContain('- List item one');
    expect(roundTripped).toContain('- List item two');
    expect(roundTripped).toContain('> Blockquote line one');
    expect(roundTripped).toContain('> Blockquote line two');
    expect(roundTripped).toContain('A plain paragraph.');
    expect(roundTripped).toContain('Another paragraph.');

    const blockCount = blockEls.reduce((acc, el) => {
      if (el.tagName === 'UL') return acc + el.querySelectorAll('li[data-block-id]').length;
      return acc + (el.hasAttribute('data-block-id') ? 1 : 0);
    }, 0);
    expect(blockCount).toBeGreaterThanOrEqual(6);
  });

  it('blockquote serialization emits > prefix', () => {
    const editor = document.createElement('div');
    editor.id = 'stack-post-body-editor';
    const bq = document.createElement('blockquote');
    bq.setAttribute('data-block-id', 'block-0');
    bq.setAttribute('data-block-type', 'blockquote');
    bq.textContent = 'Quote text';
    editor.appendChild(bq);
    document.body.appendChild(editor);

    const createPostInstance = new CreatePostClass({}, {}, '');
    const markdown = createPostInstance.serializeDOMToMarkdown();
    document.body.removeChild(editor);

    expect(markdown).toMatch(/^>\s+Quote text/);
  });
});

describe('serializeDOMToMarkdown - code as opaque', () => {
  it('inline code containing URL remains literal after serialize (save/reload)', () => {
    const editor = document.createElement('div');
    editor.id = 'stack-post-body-editor';

    const p = document.createElement('p');
    p.setAttribute('data-block-id', 'block-0');
    p.setAttribute('data-block-type', 'paragraph');
    p.appendChild(document.createTextNode('Use '));
    const code = document.createElement('code');
    code.textContent = 'const url = "https://example.com";';
    p.appendChild(code);
    p.appendChild(document.createTextNode(' for the API.'));
    editor.appendChild(p);

    document.body.appendChild(editor);

    const createPostInstance = new CreatePostClass({}, {}, '');
    const markdown = createPostInstance.serializeDOMToMarkdown();
    document.body.removeChild(editor);

    expect(markdown).toBe('Use `const url = "https://example.com";` for the API.');
    expect(markdown).not.toContain('[https://example.com]');
  });
});
