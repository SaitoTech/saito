module.exports = (lesson, question) => {
  const id = question.id;
  const answers = [question.answer1, question.answer2, question.answer3, question.answer4];
  let answerRows = '';

  answers.forEach((answer, index) => {
    if (answer == null || String(answer).trim() === '') {
      return;
    }
    const choice = index + 1;
    answerRows += `
                <tr>
	  <td>
	  </td>
	  <td style="padding-bottom:6px;">
            <div id="lesson_question_answer${choice}_${id}" class="lesson_question_answer${choice} lesson_question_answer_text lesson-question-choice" data-choice="${choice}">
              <table><tbody><tr><td width="30" id="qid_${id}_${choice}"><input class="saito-radio" type="radio" name="lesson_question_answer_${id}" value="${choice}"></td><td id="qid_${id}_${choice}text">${answer}</td></tr></tbody></table>
	    </div>
          </td>
        </tr>
    `;
  });

  let audio = '';
  if (question.audio) {
    const filename = String(question.audio).replace(/'/g, '');
    const src = `https://popupchinese.com/data/${lesson.id}/mp3/${filename}`;
    audio = `<img src="/popup/img/buttons/play_button.gif" onclick="playWordAudio('${src}', this);"> ${filename}`;
  }

  let transcript = '';
  if (question.audio_transcript) {
    transcript = `<div id="lesson_question_audio_transcript_${id}" class="lesson_question_audio_transcript">${question.audio_transcript}</div>`;
  }

  let explanation = '';
  if (question.explanation) {
    explanation = `
	<tr>
	  <td></td>
	  <td>
            <div style="padding:10px;margin-top:5px;margin-bottom:10px;border:1px dashed black;min-width:97%;background-color:lightyellow;font-size:0.8em;color:#444444;display:none;" id="lesson_question_explanation_${id}" class="lesson_question_explanation">${question.explanation}</div>
          </td>
	</tr>
    `;
  }

  return `
    <div id="lesson_question_${id}" class="lesson_question" data-correct="${question.correct}">
      <table>
	<tbody><tr>
	  <td>${audio}</td>
          <td>
            ${transcript}
          </td>
        </tr>

                  <tr>
                          <td class="question_player">
                            </td>
	    <td>
              <div id="lesson_question_question_${id}" class="lesson_question_question_text">
                ${question.question || ''}
              </div>
	    </td>
          </tr>
          ${answerRows}
          ${explanation}
      </tbody></table>
    </div>
  `;
};
