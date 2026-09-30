import { TranscriptRuntime } from './runtime.mjs';
import { showModelManager } from './model-manager.mjs';
const runtime = new TranscriptRuntime({});
document.getElementById('manage-models').onclick = () => {
  void showModelManager();
};
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
      row.append(heading);
      const pending = await runtime.store.audioStats(session.id);
      save.textContent = pending.count ? 'Finish transcript' : 'Save transcript';
      if (pending.count) {
        const remaining = document.createElement('p');
        remaining.textContent = `${Math.ceil(pending.bytes / 64000)} seconds of audio saved for transcription.`;
        row.append(remaining);
      }
      save.onclick = async () => {
        try {
          await runtime.showSave(session, await runtime.store.entries(session.id));
          await render();
        } catch {
          status.textContent = 'Could not read this transcript.';
        }
      };
      row.append(save);
      container.append(row);
    }
  } catch {
    status.textContent = 'Transcript storage is unavailable in this browser.';
  }
}
render();
