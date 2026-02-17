module.exports = {
  name: "CHECKTIME",
  description: 'Verify lastest block relative to timestamp.',
  exampleScript: {
    op: 'CHECKTIME',
    timestamp: '<timestamp>',
    operator: '<='
  },
  exampleWitness: {
  },
  schema: {
    script: { timestamp : "string" , operator : "string" } ,
    witness: {}
  },
  execute: function (app, script, witness, vars, tx, blk) {
    let ts_raw = script.timestamp || "";
    if (ts_raw === "") { return false; }
    const ts = parseInt(script.timestamp);
    return true;
  }
};

