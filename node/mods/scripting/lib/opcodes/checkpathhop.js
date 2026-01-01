/**
 * CHECKPATHHOP
 *
 * Validates a routing path and asserts conditions on a selected hop.
 * Supersedes CHECKPATH and CHECKPATHTIME.
 *
 * Conventions:
 * - routing path is provided in tx.msg.path (witness)
 * - hop.value is BASE64-encoded JSON
 * - comparison `type` is OPTIONAL
 *   - absent  → native JS semantics (backward compatible)
 *   - present → explicit coercion
 */

module.exports = {
  name: "CHECKPATHHOP",

  description:
    "Validate a routing path and assert conditions on one or more hops selected by predicate",

  // ------------------------------------------------------------------
  // EXAMPLE SCRIPT (for documentation / testing)
  // ------------------------------------------------------------------
  exampleScript: {
    op: "CHECKPATHHOP",
    selector: "FIRST", // FIRST | LAST | ONLY | ANY
    where: {
      field: "value.delegation",
      operator: "==",
      value: 0,
      type: "number" // optional
    },
    assert: [
      {
        field: "to",
        operator: "==",
        value: "REQUESTER"
      }
    ]
  },

  // ------------------------------------------------------------------
  // EXAMPLE WITNESS
  // In practice, routing data is extracted from tx.msg.path.
  // This is illustrative and fill-out-able for docs/tests.
  // ------------------------------------------------------------------
  exampleWitness: {
    path: [
      {
        to: "<publickey_A>",
        value: "eyJkZWxlZ2F0aW9uIjoxfQ==", // { delegation: 1 }
        sig: "<signature_A>"
      },
      {
        to: "<publickey_B>",
        value: "eyJkZWxlZ2F0aW9uIjowfQ==", // { delegation: 0 }
        sig: "<signature_B>"
      }
    ]
  },

  // ------------------------------------------------------------------
  // SCHEMA
  // ------------------------------------------------------------------
  schema: {
    script: {
      selector: "string",
      where: "object",
      assert: "array"
    },
    witness: {
      path: "array"
    }
  },

  // ------------------------------------------------------------------
  // EXECUTION
  // ------------------------------------------------------------------
  execute(app, tx, script, witness) {
    try {
      const path = tx?.msg?.path || witness?.path;
      if (!Array.isArray(path) || path.length === 0) return false;

      // --------------------------------------------------
      // 1. VERIFY ROUTING PATH
      // --------------------------------------------------
      if (!app.wallet.verifyRoutingPath(path)) return false;

      const selector = script.selector || "FIRST";
      const where = script.where || null;
      const asserts = script.assert || [];
      const requester = tx.from?.[0]?.publicKey || null;

      // --------------------------------------------------
      // 2. DECODE BASE64(JSON) HOP VALUES
      // --------------------------------------------------
      const decodedHops = path.map((hop) => {
        let decodedValue = {};
        if (hop.value) {
          try {
            const json = Buffer.from(hop.value, "base64").toString("utf8");
            decodedValue = JSON.parse(json);
          } catch (_) {
            decodedValue = {};
          }
        }
        return { ...hop, decodedValue };
      });

      // --------------------------------------------------
      // 3. COMPARISON HELPERS
      // --------------------------------------------------
      const coerceByType = (lhs, rhs, type) => {
        try {
          switch (type) {
            case "number":
              return [Number(lhs), Number(rhs)];
            case "bigint":
              return [BigInt(lhs), BigInt(rhs)];
            case "string":
              return [String(lhs), String(rhs)];
            default:
              return [lhs, rhs];
          }
        } catch (_) {
          return null;
        }
      };

      const compare = (lhs, rhs, operator) => {
        switch (operator) {
          case "==": return lhs === rhs;
          case "!=": return lhs !== rhs;
          case "<":  return lhs < rhs;
          case "<=": return lhs <= rhs;
          case ">":  return lhs > rhs;
          case ">=": return lhs >= rhs;
          default:   return false;
        }
      };

      const getFieldValue = (hop, field) => {
        const parts = field.split(".");
        if (parts[0] === "value") {
          return hop.decodedValue[parts[1]];
        }
        return hop[parts[0]];
      };

      // --------------------------------------------------
      // 4. WHERE FILTER
      // --------------------------------------------------
      const matchesWhere = (hop) => {
        if (!where) return true;

        let lhs = getFieldValue(hop, where.field);
        let rhs = where.value;

        if (where.type) {
          const coerced = coerceByType(lhs, rhs, where.type);
          if (!coerced) return false;
          [lhs, rhs] = coerced;
        }

        return compare(lhs, rhs, where.operator);
      };

      const candidateHops = decodedHops.filter(matchesWhere);
      if (candidateHops.length === 0) return false;

      // --------------------------------------------------
      // 5. SELECT HOP(S)
      // --------------------------------------------------
      let selectedHops = [];
      switch (selector) {
        case "FIRST":
          selectedHops = [candidateHops[0]];
          break;
        case "LAST":
          selectedHops = [candidateHops[candidateHops.length - 1]];
          break;
        case "ONLY":
          if (candidateHops.length !== 1) return false;
          selectedHops = candidateHops;
          break;
        case "ANY":
          selectedHops = candidateHops;
          break;
        default:
          return false;
      }

      // --------------------------------------------------
      // 6. ASSERTIONS
      // --------------------------------------------------
      for (const hop of selectedHops) {
        for (const assertion of asserts) {

          // Special symbolic value
          if (assertion.field === "to" && assertion.value === "REQUESTER") {
            if (hop.to !== requester) return false;
            continue;
          }

          let lhs = getFieldValue(hop, assertion.field);
          let rhs = assertion.value;

          if (assertion.type) {
            const coerced = coerceByType(lhs, rhs, assertion.type);
            if (!coerced) return false;
            [lhs, rhs] = coerced;
          }

          if (!compare(lhs, rhs, assertion.operator)) return false;
        }
      }

      return true;

    } catch (err) {
      console.error("CHECKPATHHOP error:", err);
      return false;
    }
  }
};

