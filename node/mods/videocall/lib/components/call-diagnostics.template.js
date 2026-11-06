module.exports = () => `
  <details class="videocall-diagnostics" open>
    <summary>Connection status &amp; log</summary>
    <div class="videocall-diagnostics-body">
      <pre class="videocall-diagnostics-status"></pre>
      <details class="videocall-diagnostics-history">
        <summary>Event history</summary>
        <pre class="videocall-diagnostics-log"></pre>
      </details>
    </div>
  </details>`;
