module.exports = {
  name: "CHECKTIME",
  description: 'Verify lastest block relative to timestamp.',
  exampleScript: {
    op: 'CHECKTIME',
    timestamp: '<timestamp>',
    operator: '<='
  },
  exampleRequired: {
  },
  schema: {
    script: { timestamp : "string" , operator : "string" } ,
    required: {}
  },
  execute: function (node, context) {
    let ts_raw = node.timestamp || "";
    if (ts_raw === "") { return false; }
    const ts = parseInt(node.timestamp);
    // TODO: Remove stub — compare ts against context.block timestamp using node.operator.
    return true;
  }
};

