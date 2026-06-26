/** Resolve a field from embedded required (locking) or unlock-time witness. */
function lookupField(node, key) {
  return node?.required?.[key] ?? node?.witness?.[key];
}

function isUnsetFieldValue(value) {
  return value === true || value === undefined || value === null;
}

module.exports = {
  lookupField,
  isUnsetFieldValue
};
