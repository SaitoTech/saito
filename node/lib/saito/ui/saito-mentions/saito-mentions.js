class SaitoMentions {
  constructor(app, ref, menuRef, inputType) {
    this.app = app;
    this.ref = ref;
    this.menuRef = menuRef;
    this.options = [];
    this.inputType = inputType;

    this.closeMenu = this.closeMenu.bind(this);
    this.onInput = this.onInput.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.renderMenu = this.renderMenu.bind(this);

    this.ref.addEventListener('input', this.onInput);
    this.ref.addEventListener('keydown', this.onKeyDown);

    this.properties = [
      'direction',
      'boxSizing',
      'width',
      'height',
      'overflowX',
      'overflowY',

      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'borderStyle',

      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',

      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'fontSizeAdjust',
      'lineHeight',
      'fontFamily',

      'textAlign',
      'textTransform',
      'textIndent',
      'textDecoration',

      'letterSpacing',
      'wordSpacing',

      'tabSize',
      'MozTabSize'
    ];

    this.isFirefox = typeof window !== 'undefined' && window['mozInnerScreenX'] != null;
  }

  closeMenu() {
    setTimeout(() => {
      this.options = [];
      this.triggerIdx = undefined;
      this.caretIdx = undefined;
      this.renderMenu();
    }, 0);
  }

  fieldText() {
    if (this.inputType != 'div') {
      return this.ref.value || '';
    }
    const range = document.createRange();
    range.selectNodeContents(this.ref);
    return range.toString().replace(/\n$/, '');
  }

  caretOffset() {
    if (this.inputType != 'div') {
      return this.ref.selectionStart ?? (this.ref.value || '').length;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.ref.contains(selection.focusNode)) {
      return this.fieldText().length;
    }
    const range = selection.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(this.ref);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  placeCaret(offset) {
    this.ref.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const walker = document.createTreeWalker(this.ref, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node = walker.nextNode();
    while (node) {
      if (remaining <= node.textContent.length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= node.textContent.length;
      node = walker.nextNode();
    }
    const range = document.createRange();
    range.selectNodeContents(this.ref);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  selectItem(active) {
    const text = this.fieldText();
    const preMention = text.substr(0, this.triggerIdx);
    const option = this.options[active];

    if (!option) {
      console.log('Null Items, nope out');
      this.closeMenu();
      this.ref.focus();
      return;
    }

    const trigger = text[this.triggerIdx] || '@';
    const mention = option?.identifier
      ? `${trigger}${option.identifier} `
      : `${trigger}${option.publicKey} `;

    let end = this.inputType == 'div' ? this.caretIdx : this.ref.selectionStart;
    if (typeof end != 'number' || end < this.triggerIdx) {
      end = text.length;
    }

    const postMention = text.substr(end);
    const newValue = `${preMention}${mention}${postMention}`;
    const caretPosition = preMention.length + mention.length;

    if (this.inputType == 'div') {
      this.ref.innerText = newValue;
    } else {
      this.ref.value = newValue;
    }

    this.closeMenu();
    this.ref.focus();
    if (this.inputType == 'div') {
      this.placeCaret(caretPosition);
    } else {
      this.ref.setSelectionRange(caretPosition, caretPosition);
    }
  }

  async onInput(ev) {
    const positionIndex = Math.min(this.caretOffset(), this.fieldText().length);
    const text = this.fieldText();

    const textBeforeCaret = text.slice(0, positionIndex);
    const tokens = textBeforeCaret ? textBeforeCaret.split(/\s+/) : [];

    let lastToken = tokens.pop();
    const triggerIdx = textBeforeCaret.endsWith(lastToken)
      ? textBeforeCaret.length - lastToken.length
      : -1;

    const maybeTrigger = textBeforeCaret[triggerIdx];
    const keystrokeTriggered = maybeTrigger === '@';

    if (!keystrokeTriggered) {
      this.closeMenu();
      return;
    }

    const query = textBeforeCaret.slice(triggerIdx + 1);

    this.options = await this.resolveFn(query);

    if (this.options?.length) {
      const coords = this.getCaretCoordinates(this.ref, positionIndex);
      const boundPos = this.ref.getBoundingClientRect();
      this.top = 0;
      this.left = 0;
      this.active = 0;
      this.triggerIdx = triggerIdx;
      this.caretIdx = positionIndex;
      setTimeout(() => {
        this.renderMenu(boundPos, coords);
      }, 1);
    } else {
      this.closeMenu();
    }
  }

  onKeyDown(ev) {
    let keyCaught = false;
    if (this.triggerIdx !== undefined) {
      switch (ev.key) {
        case 'ArrowDown':
          this.active = Math.min(this.active + 1, this.options.length - 1);
          this.renderMenu();
          keyCaught = true;
          break;
        case 'ArrowUp':
          this.active = Math.max(this.active - 1, 0);
          this.renderMenu();
          keyCaught = true;
          break;
        case 'Enter':
        case 'Tab':
          this.selectItem(this.active);
          keyCaught = true;
          break;
        case 'Escape':
          this.closeMenu();
          break;
      }
    }

    if (keyCaught) {
      ev.preventDefault();
    }
  }

  resolveFn(prefix) {
    let users = this.app.keychain.returnKeys(null, false);
    if (!prefix) {
      return users;
    } else {
      return users.filter((user) => {
        if (user?.identifier) {
          return user.identifier.toLowerCase().startsWith(prefix.toLowerCase());
        } else {
          return user.publicKey.toLowerCase().startsWith(prefix.toLowerCase());
        }
      });
    }
  }

  renderMenu(boundPos = null, coords = null) {
    if (!this.options.length) {
      this.menuRef.hidden = true;
      this.menuRef.setAttribute('status', 'hidden');
      this.menuRef.classList.add('hidden');
      return;
    } else {
      this.menuRef.setAttribute('status', 'show');
      this.menuRef.classList.remove('hidden');
      this.menuRef.hidden = false;
    }

    this.menuRef.style.left = this.left + 'px';
    this.menuRef.style.top = this.top + 'px';
    this.menuRef.innerHTML = '';

    this.options.forEach((option, idx) => {
      this.menuRef.appendChild(this.addMenuItem(option, idx));
    });

    if (boundPos != null || coords != null) {
      const offsetTop = 10;

      if (this.inputType != 'div') {
        this.left = window.scrollX + coords.left + this.ref.scrollLeft;
        this.top = window.scrollY + coords.top + coords.height - this.ref.scrollTop;
      } else {
        let menuStyles = getComputedStyle(this.menuRef);
        let listWidth = Number(menuStyles.width.split('px')[0]);
        let listHeight = Number(menuStyles.height.split('px')[0]);

        let inputStyles = getComputedStyle(this.ref);
        let inputWidth = Number(inputStyles.width.split('px')[0]);
        let inputHeight = Number(inputStyles.height.split('px')[0]);

        let listPosX = 0;
        let listPosY = 0;

        if (listWidth + boundPos.left > window.innerWidth) {
          let widthDiff = listWidth + boundPos.left - window.innerWidth;
          listPosX = 0 - widthDiff;
        } else {
          listPosX = 0;
        }

        listPosY = -listHeight - offsetTop;

        this.left = listPosX;
        this.top = listPosY;
      }

      this.menuRef.style.left = this.left + 'px';
      this.menuRef.style.top = this.top + 'px';
    } else {
      // Need to check if we are using keys to scroll down
      let selec = this.menuRef.querySelector('.saito-mentions-item.selected');
      if (selec) {
        if (selec.getBoundingClientRect().bottom > this.menuRef.getBoundingClientRect().bottom) {
          selec.scrollIntoView(false);
        }
        if (selec.getBoundingClientRect().top < this.menuRef.getBoundingClientRect().top) {
          selec.scrollIntoView();
        }
      }
    }
  }

  addMenuItem(user, idx) {
    const parentDiv = document.createElement('div');
    parentDiv.classList.add('saito-mentions-contact');

    // identifier
    if (!user?.identicon) {
      user.identicon = this.app.keychain.returnIdenticon(user.publicKey);
    }
    const identicon = document.createElement('img');
    identicon.classList.add('saito-identicon');
    identicon.setAttribute('src', user.identicon);

    parentDiv.appendChild(identicon);

    // username div
    const div = document.createElement('div');
    div.setAttribute('role', 'option');
    div.className = 'saito-mentions-item';
    if (idx === this.active) {
      div.classList.add('selected');
      div.setAttribute('aria-selected', '');
    }

    if (user?.identifier) {
      div.textContent = user.identifier;
    } else {
      div.textContent = user.publicKey;
    }

    parentDiv.appendChild(div);
    parentDiv.onclick = () => {
      this.selectItem(idx);
    };
    return parentDiv;
  }

  getCaretCoordinates(element, position) {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const style = div.style;
    const computed = getComputedStyle(element);

    style.whiteSpace = 'pre-wrap';
    style.wordWrap = 'break-word';
    style.position = 'absolute';
    style.visibility = 'hidden';

    this.properties.forEach((prop) => {
      style[prop] = computed[prop];
    });

    if (this.isFirefox) {
      if (element.scrollHeight > parseInt(computed.height)) style.overflowY = 'scroll';
    } else {
      style.overflow = 'hidden';
    }

    let text = '';
    if (this.inputType == 'div') {
      text = element.innerText;
    } else {
      text = element.value;
    }

    div.textContent = text.substring(0, position);

    const span = document.createElement('span');
    span.textContent = text.substring(position) || '.';
    div.appendChild(span);

    const coordinates = {
      top: span.offsetTop + parseInt(computed['borderTopWidth']),
      left: span.offsetLeft + parseInt(computed['borderLeftWidth']),
      // height: parseInt(computed['lineHeight'])
      height: span.offsetHeight
    };

    div.remove();
    return coordinates;
  }
}

module.exports = SaitoMentions;
