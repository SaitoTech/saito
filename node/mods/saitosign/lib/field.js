// A field is a request that a signer act at one place on one page.
// It is not a cryptographic signature.

const TYPES = {
  signature: 'signature',
  initial: 'initial',
  date: 'date'
};

class Field {
  constructor(id, type, signer, page, x, y, width, height) {
    this.id = id;
    this.type = TYPES[type] ? type : 'signature';
    this.signer = signer;
    this.page = page;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  label() {
    return TYPES[this.type] || TYPES.signature;
  }
}

Field.types = TYPES;

module.exports = Field;
