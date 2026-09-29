import { TranscriptRuntime } from './runtime.mjs';
const runtime = new TranscriptRuntime({});
const status = document.getElementById('status');
async function render() {
  try {
    const sessions = (await runtime.store.sessions()).sort((a, b) => b.startedAt - a.startedAt);
    const container = document.getElementById('transcripts');
    container.replaceChildren();
    status.textContent = sessions.length
      ? ''
      : 'No unsaved transcripts. Turn on Transcript during a video call to capture one.';
    for (const session of sessions) {
      const row = document.createElement('article');
      const heading = document.createElement('h2');
      heading.textContent = new Date(session.startedAt).toLocaleString();
      const save = document.createElement('button');
      save.textContent = 'Save transcript';
      save.onclick = async () => {
        try {
          await runtime.showSave(session, await runtime.store.entries(session.id));
          await render();
        } catch {
          status.textContent = 'Could not read this transcript.';
        }
      };
      row.append(heading, save);
      container.append(row);
    }
  } catch {
    status.textContent = 'Transcript storage is unavailable in this browser.';
  }
}
render();
