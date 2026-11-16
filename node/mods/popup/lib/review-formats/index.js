const { multipleChoiceEnglish, multipleChoicePinyin } = require('./multiple-choice');

const formats = [multipleChoiceEnglish, multipleChoicePinyin];

function eligibleFormats(word, pool) {
  return formats.filter((format) => {
    try {
      return format.eligible(word, pool);
    } catch (err) {
      return false;
    }
  });
}

module.exports = {
  formats,
  eligibleFormats
};
