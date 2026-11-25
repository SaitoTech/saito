module.exports = (lesson, question) => {
  const id = question.id;
  const answers = [question.answer1, question.answer2, question.answer3, question.answer4];
  let choices = '';

  answers.forEach((answer, index) => {
    if (answer == null || String(answer).trim() === '') {
      return;
    }
    const choice = index + 1;
    choices += `
      <div id="lesson_question_answer${choice}_${id}" class="lesson_question_answer${choice} lesson_question_answer_text lesson-question-choice" data-choice="${choice}">
        <input class="saito-radio" type="radio" name="lesson_question_answer_${id}" value="${choice}">
        <span id="qid_${id}_${choice}text">${answer}</span>
      </div>
    `;
  });

  let audio = '';
  if (question.audio) {
    const filename = String(question.audio).replace(/'/g, '');
    const src = `https://popupchinese.com/data/${lesson.id}/mp3/${filename}`;
    audio = `<button type="button" class="popup-vocab-play" onclick="playWordAudio('${src}', this)" aria-label="Play question audio"><img src="/popup/img/buttons/play_button.gif" alt=""></button>`;
  }

  const transcript = question.audio_transcript
    ? `<div id="lesson_question_audio_transcript_${id}" class="lesson_question_audio_transcript">${question.audio_transcript}</div>`
    : '';
  const explanation = question.explanation
    ? `<div id="lesson_question_explanation_${id}" class="lesson_question_explanation" hidden>${question.explanation}</div>`
    : '';

  return `
    <article id="lesson_question_${id}" class="lesson_question" data-correct="${question.correct}">
      ${audio || transcript ? `<div class="popup-question-media">${audio}${transcript}</div>` : ''}
      <div id="lesson_question_question_${id}" class="lesson_question_question_text">${question.question || ''}</div>
      <div class="popup-question-choices">${choices}</div>
      ${explanation}
    </article>
  `;
};
