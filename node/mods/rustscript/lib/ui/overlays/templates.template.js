module.exports = (templates) => {
  const rows = Array.isArray(templates) ? templates : [];
  return `
<div class="rustscript-templates">
  <h2>Contract templates</h2>
  <p>Pick a starter locking script.</p>
  <ul>
    ${rows
      .map(
        (t) => `
    <li>
      <button type="button" class="rustscript-template" data-template-id="${t.id}">
        <strong>${t.name}</strong> — ${t.description}
      </button>
    </li>`
      )
      .join('')}
  </ul>
  <button type="button" class="rustscript-button">Close</button>
</div>
`;
};
