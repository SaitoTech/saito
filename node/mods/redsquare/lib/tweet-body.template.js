module.exports = ({ presentation = 'timeline', text = '' } = {}) => {
  if (!text || String(text).trim() === '') {
    return '';
  }

  return `<div class="tweet-body ${presentation}">${text}</div>`;
};
