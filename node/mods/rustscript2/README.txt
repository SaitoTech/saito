# Rustscript module

P2SH contract authoring: semantic text → AST → execute.

Lite-client: run `npm run compile` in `node/` before bundling. Do not add `.md` files under this mod.

## Canonical AST

Leaf opcode:

```json
{
  "op": "CHECKSIG",
  "publickey": "<publickey>",
  "msg": "Hello",
  "required": {
    "signature": true
  }
}
```

After the user supplies data:

```json
{
  "required": {
    "signature": "552a50c7..."
  }
}
```

`true` means required but not yet supplied. Any other value is part of the script and participates in hashing exactly as written.

## Runtime (`lib/rustscript/`)

```
script → script_to_scripthash.js → script_to_scripthash(script)
AST    → ast_execute.js         → execute(ast, context) → true | false
```

## Parser (`lib/rustscript/`)

```
semantic text → semantic_to_tokens.js → tokenize(text)
tokens        → tokens_to_ast.js      → parse(tokens)
```

## UI

Structural validation for expert JSON editing: `lib/ui/script_validate.js`.
Scaffold required fields for test panel: `lib/ui/script_build.js`.

Opcode behavior lives in `lib/opcodes/*.js`.
