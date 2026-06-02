/** UI-only: seed locking scripts from opcode metadata (not part of the execution runtime). */

function template_locking(opcode) {
  if (!opcode?.exampleScript || typeof opcode.exampleScript !== 'object') {
    return { op: opcode?.name || '' };
  }
  const script = JSON.parse(JSON.stringify(opcode.exampleScript));
  delete script.witness;
  delete script.required;
  return script;
}

module.exports = {
  template_locking
};
