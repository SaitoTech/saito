# Rustscript module

P2SH contract authoring: semantic script → locking script (LEFT) + unlocking script (RIGHT).

Lite-client: run `npm run compile` in `node/` before bundling. Do not add `.md` files under this mod.

## Script shape (opcode nodes)

```json
{
  "op": "CHECKSIG",
  "args": {
    "publickey": "",
    "signature": "context.witness.signature"
  },
  "witness": {
    "signature": ""
  }
}
```

- **LEFT**: contract definition; `witness` only has user-declared slots (from `witness.*` in semantic syntax).
- **RIGHT**: same tree; implicit runtime witness fields from opcode `witness_fields` are materialized.

Opcode `defaults` and `witness_fields` live in `lib/opcodes/*.js` only.

## Pipeline (`lib/rustscript/`)

```
semantic script  →  semantic_to_tokens.js  →  tokens
tokens           →  tokens_to_ast.js       →  raw tree
raw + opcodes    →  ast_execute.materialize →  LEFT / RIGHT JSON
unlocking        →  ast_execute.js          →  execution
```
