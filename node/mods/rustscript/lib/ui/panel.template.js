module.exports = (state) => {
  const remaining = state?.remaining || 0;
  const scriptReady = !!state?.scriptReady;
  const testingUnlocked = !!state?.testingUnlocked;
  const executionStatus = state?.executionStatus || {};
  const hash = state?.hash || '';

  let statusHtml = 'Complete required fields';
  if (remaining > 0) {
    statusHtml = `${remaining} field${remaining === 1 ? '' : 's'} remaining`;
  } else if (scriptReady) {
    statusHtml = 'Script ready';
  }

  let buttonsHtml = '';
  if (scriptReady && !testingUnlocked) {
    buttonsHtml +=
      '<button type="button" class="rustscript-panel-button">Proceed to test</button>';
  }
  if (scriptReady && hash) {
    buttonsHtml +=
      '<button type="button" class="rustscript-panel-button">Create transaction</button>';
  }

  let extraStatusHtml = '';
  if (testingUnlocked) {
    extraStatusHtml += '<p class="rustscript-panel-status">Test Script — fill witness values</p>';
    if (executionStatus.attempted) {
      extraStatusHtml += `<p class="rustscript-panel-status">${executionStatus.success ? 'Execution passed' : 'Execution failed'}</p>`;
    }
  }
  if (scriptReady && hash) {
    extraStatusHtml += `<p class="rustscript-panel-status">Scripthash: <code>${hash}</code></p>`;
  }

  return `
<p class="rustscript-panel-status">${statusHtml}</p>
${extraStatusHtml}
${buttonsHtml}
`;
};
