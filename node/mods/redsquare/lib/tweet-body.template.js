module.exports = ({ text = '' } = {}) => {
  if (!text || String(text).trim() === '') {
    return '';
  }

  return `<div class="body">${text}</div>`;
};
