# Transcript

Optional multilingual transcript capture for Saito Talk. The module adds one **Transcript** toggle to the call controls. While active, it shows a capture status and the same red border as recording. Recording and transcription can run together and stop independently. Speech is processed locally; the call UI does not display captions.

## Installation

```sh
node mods/transcript/compile/install-runtime.mjs
npm run modules -- add transcript
```

Enable `transcript/transcript.js` in both server (`core`) and browser (`lite`) module lists, alongside Videocall. Remove any old `captions/captions.js` entries. Rebuild and restart the server, then refresh the browser. Deploy all of `mods/transcript/web`, including the generated `vendor/` directory. The node only serves the runtime; it does not need model files. Runtime assets are ignored by Git, pinned and checksum verified:

```sh
node mods/transcript/compile/install-runtime.mjs --check
```

## Model management

When capture is off, select **Transcript** in a call to open a **Start / Settings** menu. **Start** uses your saved model and language when downloaded, otherwise another downloaded model. If none is available, it downloads Whisper Tiny English automatically, displays progress, and starts capture when ready. Closing the download or ending the call cancels startup. **Settings** opens the model manager in a standard Saito overlay without starting capture. Choose/download a model and select **Use model** to save your settings. Closing Settings (including Escape or the backdrop) returns to the Start / Settings menu while the call is still active. The manager is also available through **Manage speech models** at `/transcript/`. Clicking Transcript during capture still stops and opens the save dialog.

- Whisper Tiny English (~43 MB) and Tiny Multilingual (~44 MB) favor speed and lower memory use.
- Whisper Base English (~79 MB) and Base Multilingual (~80 MB) provide a larger model at greater processing cost.
- Multilingual models offer automatic detection or any of Whisper's 99 supported languages. An explicit spoken language can help with short segments. Recognition produces text in the spoken language, without translating it to English.
- Downloads go directly from Hugging Face to the browser, with progress, cancellation, and retry. Completed files are reused after an interruption. All files use pinned revisions and SHA-256 verification before entering the dedicated browser cache.
- The dropdown marks every complete model with **(downloaded)**. The picker also reports partial downloads, remembers the selected model and language, and removes downloads individually. Models use a dedicated disk-backed Cache Storage cache and survive normal browser/device restarts on the same browser profile and site. Downloads request persistent storage to protect against automatic eviction; browsers may decline this request. Clearing site data, private browsing, or eviction can remove models. Browser storage needs HTTPS (or localhost).
- Call audio stays on the device. Hugging Face receives model download requests, including the user's IP address, but no call audio or transcript. Cached inference works without contacting Hugging Face.

Model files are defined in `web/model-catalog.mjs`; `runtime-assets.json` contains only the node-hosted runtime. The obsolete node model download directory has been removed, and `/transcript/models/` returns 404 even on old deployments that still contain weights. The runtime installer rejects model paths; the server never fetches model files. Model and language changes apply when starting capture. Sessions with pending audio keep their original model/language until that backlog is finished; recovery uses that saved selection.

## Capture, save, and recovery

- Select **Transcript** to capture the local microphone and each remote participant separately. Other participants see **Transcribing** next to your name at the bottom of your video window, including when they join during capture. The notice disappears when capture stops. Names use cached identifiers and Registry lookup when available; the file includes timestamps and speaker names. Muted microphones and presentation streams are excluded.
- Select the toggle again or hang up to stop capture, flush the final audio frames, finish recognition, and open **Save call transcript**. The active button turns red and pulses like Record. **Preparing Transcription** shows processing status and a **Finish later** button: this pauses recognition after storing the remaining captured audio. There is no twenty-second backlog cutoff. Identifier lookup runs during the call and never delays saving.
- Capture checkpoints raw 16 kHz mono audio into IndexedDB about once per second per participant. Recognition reads stored audio in batches, normally after four seconds, and combines up to twelve seconds from one stream when behind. The silence gate runs after storage. Slow recognition grows the local backlog instead of dropping audio after thirty seconds; the status reports pending audio duration.
- Text and deletion of its source audio commit in a single IndexedDB transaction. A worker failure or page crash leaves unfinished audio available for retry, including the batch that was being recognized. Empty recognition results also consume their audio. Recovery activity is updated during capture; completed text survives independently of the audio queue.
- Where supported, **Save To File** opens the system file picker and clears recovery after writing and closing the file succeeds. Other browsers clear recovery after the download is dispatched without an error; browsers do not report download completion or subsequent cancellation. Saving is confirmed automatically without another button click. Successful saves drain queued writes and clear the session’s recovery data and in-memory resume state, so refreshing does not prompt to save it again. Reported errors, picker cancellation, or **Resume Later** retain recovery.
- Reopening Videocall prompts for unsaved transcripts. Pending audio offers **Finish transcription**, **Save partial transcript**, and **Discard** (with confirmation). Finishing needs no microphone or call connection; partial exports label the file as incomplete and clear that session’s remaining audio, text, and recovery metadata after saving succeeds. Finish transcription before saving if the remaining speech should be included. Only one tab can capture, process, export, or discard a given session at a time through Web Locks. Interrupted capture active **less than 15 minutes ago** offers **Append to transcript**; enable Transcript in the next call to resume that text and its original timestamps. Older or explicitly stopped captures still offer finishing any pending audio and saving. Age is measured from the last capture activity, not the beginning of a long call.
- In-app navigation opens the save prompt and stays on the page if the transcript is kept for later. Tab close, refresh, and direct browser navigation use the browser's native exit warning; browsers cannot await custom save dialogs during unload. Choosing to stay lets the save dialog appear. If the page exits, committed text and audio remain recoverable. Choosing **Finish later** permits in-app navigation once capture writes finish.
- `/transcript/` lists recovery copies, shows pending audio duration, and offers finishing or saving later. The module deliberately retains the old `saito-call-captions` IndexedDB name so renaming it does not strand existing transcripts.

Pending audio is limited to **256 MiB across all sessions** by default (`bufferLimit` on `TranscriptEngine`). Raw Float32 audio costs 3.84 MB per minute summed across participant streams, including silence until processed; completed batches free space immediately. Uncommitted writes are separately limited to 8 MiB. Storage exhaustion or failed writes stop capture visibly and retain previously committed audio. The engine requests persistent browser storage where available; clearing site data, browser eviction, private browsing, and sudden power loss can still remove data. A crash can lose approximately the last second per participant plus pending writes. No unload handler is required to recover already committed blocks. HTTPS (or localhost), IndexedDB, and Web Locks are required.

Storage failure is reported visibly; captured text remains in memory for saving. Each participant controls capture on their own device. Recognition speed and accuracy depend on the device, microphone, noise, and overlapping speech. Capture starts once browser storage and the audio worklet are ready, while the model initializes. Speech from before capture started cannot be recovered.

## Checks

```sh
node --test mods/transcript/compile/tests/*.test.mjs
node mods/transcript/compile/install-runtime.mjs --check
```

Browser integration requires Playwright with Chromium. It tests actual IndexedDB reload/recovery, append, independent borders, downloads, automatic confirmation and deletion. Optionally supply an English WAV to also download the English model directly and exercise local recognition, the audio worklet and two speakers:

```sh
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright node mods/transcript/compile/tests/browser-smoke.cjs
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright TRANSCRIPT_AUDIO_FIXTURE=/path/to/english.wav node mods/transcript/compile/tests/browser-smoke.cjs
```

The buffering browser test uses real IndexedDB, Web Locks, an audio worklet, and a forced renderer crash. Recognition is stubbed to deterministically verify migration, transaction rollback, storage limits, speaker isolation, duplicate prevention, partial exports, and finish-later recovery:

```sh
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright node mods/transcript/compile/tests/buffer-browser-smoke.cjs
```

`TRANSCRIPT_CHROMIUM` can select an existing Chromium executable.

The WebRTC browser test sends real remote audio through Talk's stream events and verifies capture of both speakers, including peers joining after capture starts. It omits the call video player to check that remote capture starts independently; the engine uses a muted media element to activate Chromium's remote audio without duplicate sound. Recognition is stubbed after speech gating.

```sh
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright node mods/transcript/compile/tests/webrtc-browser-smoke.cjs
```

The model-manager browser test uses real upstream downloads, closes and restarts Chromium with the same disk profile, then verifies downloaded labels, cached offline inference, settings persistence and removal. By default it checks both Tiny variants; choose all four with:

```sh
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright TRANSCRIPT_TEST_MODELS=tiny.en,tiny,base.en,base node mods/transcript/compile/tests/models-browser-smoke.cjs
```
