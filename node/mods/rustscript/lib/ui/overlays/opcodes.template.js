module.exports = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return `
<div class="rustscript-opcodes">
  <h2>Opcodes</h2>
  <ul>
    ${list
      .map(
        (row) => `
    <li>
      <strong>${row.name}</strong>
      ${row.description ? ` ${row.description}` : ''}
    </li>`
      )
      .join('')}
  </ul>
  <button type="button" class="rustscript-button">Close</button>
</div>
`;
};
