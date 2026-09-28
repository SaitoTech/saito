# Transcript

Optional English transcript capture for Saito Talk. The module adds one **Transcript** toggle to the call controls. While active, it shows a capture status and the same red border as recording. Recording and transcription can run together and stop independently. Speech is processed locally; the call UI does not display captions.

## Installation

```sh
node mods/transcript/compile/fetch-assets.mjs
npm run modules -- add transcript
```

Enable `transcript/transcript.js` in both server (`core`) and browser (`lite`) module lists, alongside Videocall. Remove any old `captions/captions.js` entries. Rebuild and restart the server, then refresh the browser. Deploy all of `mods/transcript/web`, including the generated `vendor/` and `models/` directories. Downloaded assets are ignored by Git, pinned and checksum verified:

```sh
node mods/transcript/compile/fetch-assets.mjs --check
```

The speech model and runtime total approximately 66 MB before compression and load only when capture starts. No model CDN requests are made by the browser.

## Capture, save, and recovery

- Select **Transcript** to capture the local microphone and each remote participant separately. Names use cached identifiers and Registry lookup when available; the file includes timestamps and speaker names. Muted microphones and presentation streams are excluded.
- Select the toggle again or hang up to finish recognition and open **Save call transcript**. The active button turns red and pulses like Record. A small **Preparing Transcription** overlay appears while the remaining recognition and storage writes finish. Identifier lookup runs during the call and never delays saving.
- Recognition runs throughout the call: speech is submitted after a 500 ms pause or at most four seconds of continuous speech. If inference falls behind, adjacent queued chunks from the same speaker are combined into requests of up to 12 seconds, preserving short pauses. Batching adds no waiting period when the engine is idle. On slower devices, recognition can still lag behind the call; stopping drains the remaining work.
- Text segments are committed to IndexedDB as recognition completes. Recovery activity is updated every ten seconds, including during silence. Audio is processed in memory; audio awaiting recognition at a crash cannot be recovered.
- Where supported, **Save To File** opens the system file picker. The recovery copy is removed only after writing and closing the file succeeds. Other browsers download the file, then require **I saved the file** confirmation before clearing recovery. Cancelling or **Resume Later** retains it.
- Reopening Videocall prompts for unsaved transcripts. Interrupted capture active **less than 15 minutes ago** offers **Append to transcript**; enable Transcript in the next call to resume that text and its original timestamps. Older or explicitly stopped captures prompt for saving. Age is measured from the last capture activity, not the beginning of a long call.
- In-app navigation opens the save prompt and stays on the page if the transcript is kept for later. Tab close, refresh, and direct browser navigation use the browser's native exit warning; browsers cannot await custom save dialogs during unload. Choosing to stay lets the save dialog appear. If the page exits, committed text remains recoverable.
- `/transcript/` lists recovery copies and offers saving later. The module deliberately retains the old `saito-call-captions` IndexedDB name so renaming it does not strand existing transcripts.

Storage failure is reported visibly; captured text remains in memory for saving. Each participant controls capture on their own device. English only; recognition speed and accuracy depend on the device, microphone, noise, and overlapping speech. Capture begins after model initialization and cannot recover speech from before that point.

## Checks

```sh
node --test mods/transcript/compile/tests/*.test.mjs
node mods/transcript/compile/fetch-assets.mjs --check
```

Browser integration requires Playwright with Chromium. It tests actual IndexedDB reload/recovery, append, independent borders, downloads, confirmation and deletion. Optionally supply an English WAV to also exercise the local model, audio worklet and two speakers:

```sh
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright node mods/transcript/compile/tests/browser-smoke.cjs
TRANSCRIPT_PLAYWRIGHT=/path/to/playwright TRANSCRIPT_AUDIO_FIXTURE=/path/to/english.wav node mods/transcript/compile/tests/browser-smoke.cjs
```

`TRANSCRIPT_CHROMIUM` can select an existing Chromium executable.
