const { displayPinyin, promptChinese } = require('../vocab-fields');

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function buildChoices(word, pool, answerOf) {
  const answer = answerOf(word);
  if (!answer) {
    return null;
  }
  const seen = new Set([answer]);
  const distractors = [];
  shuffle(pool).forEach((candidate) => {
    if (distractors.length >= 3 || !candidate || candidate.id === word.id) {
      return;
    }
    const text = answerOf(candidate);
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    distractors.push(text);
  });
  if (distractors.length < 3) {
    return null;
  }
  const correctIndex = Math.floor(Math.random() * 4);
  const choices = distractors.slice();
  choices.splice(correctIndex, 0, answer);
  return { choices, correctIndex };
}

function renderChoices(model, slots, done) {
  slots.prompt.textContent = model.prompt;
  slots.prompt.className = 'review-prompt review-prompt-chinese';
  slots.answers.replaceChildren();
  delete slots.answers.dataset.locked;
  slots.feedback.textContent = '';

  model.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-choice';
    button.textContent = choice;
    button.addEventListener('click', () => {
      if (slots.answers.dataset.locked === '1') {
        return;
      }
      slots.answers.dataset.locked = '1';
      const correct = index === model.correctIndex;
      slots.answers.querySelectorAll('.review-choice').forEach((el, choiceIndex) => {
        el.disabled = true;
        if (choiceIndex === model.correctIndex) {
          el.classList.add('is-correct');
        } else if (choiceIndex === index) {
          el.classList.add('is-incorrect');
        }
      });
      slots.feedback.textContent = correct ? 'Correct' : 'Answer: ' + model.choices[model.correctIndex];
      done({ index });
    });
    slots.answers.appendChild(button);
  });
}

function multipleChoice(id, answerOf) {
  return {
    id,
    eligible(word, pool) {
      return !!promptChinese(word, false) && !!buildChoices(word, pool, answerOf);
    },
    build(word, pool, traditional) {
      const built = buildChoices(word, pool, answerOf);
      if (!built) {
        return null;
      }
      return {
        prompt: promptChinese(word, traditional),
        choices: built.choices,
        correctIndex: built.correctIndex
      };
    },
    render: renderChoices,
    evaluate(model, response) {
      return !!response && response.index === model.correctIndex;
    }
  };
}

const multipleChoiceEnglish = multipleChoice('multiple_choice_english', (word) =>
  String(word.english || '').trim()
);

const multipleChoicePinyin = multipleChoice('multiple_choice_pinyin', (word) =>
  displayPinyin(word.pinyin).trim()
);

module.exports = {
  multipleChoiceEnglish,
  multipleChoicePinyin
};
