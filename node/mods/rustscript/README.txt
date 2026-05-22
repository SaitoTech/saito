# Rustscript module

P2SH contract authoring: semantic script → locking script JSON (LEFT) + execution context (RIGHT).

Lite-client: run `npm run compile` in `node/` before bundling. Do not add `.md` files under this mod.

## Compiler pipeline (`lib/rustscript/` — three files)

```
semantic script  →  semantic_to_tokens.js  →  tokens
tokens           →  tokens_to_ast.js       →  locking script JSON
locking script   →  ast_execute.js         →  run + validate
```

Opcodes: `lib/opcodes/` (execution primitives, not part of the compiler).

## UI

- **LEFT**: locking script (`{ op, bindings }` or `{ op, args }` for AND/OR/THEN/NOT)
- **RIGHT**: `{ witness, tx, blk }` runtime payload
- Context template generation lives in `lib/ui/main.js` only
