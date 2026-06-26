# Rustscript module

Experimental Saito module for prototyping a **symbolic scripting language** in JavaScript before a Rust port.

## Scope (current)

- Tokenize expert script text
- Parse into an AST (`AND`, `OR`, `NOT`, `THEN`, opcodes, namespace refs)
- Render AST as JSON and ASCII tree
- **No** execution, validation, witness processing, or blockchain integration

## UI

Cloned from the Scripting module layout (toolbar, editors, sidebar, eval panel). Only **Generate Expert Script** is wired; other tools are disabled placeholders.

Navigate to `/rustscript` in the Saito client.

## Language (subset)

```
AND | OR | NOT | THEN
( )
OPCODE[key=value, ...]
field=tx.to AS alias
"quoted strings"
tx.amount, context.owner, witness.sig
```

## Examples

See `examples/scripts.js` and `examples/expected-ast.js`.

Smoke test:

```bash
node node/mods/rustscript/lib/parser/test-parse.js
```

## Layout

```
lib/parser/     tokenizer, parser, ast helpers, render
lib/ui/         cloned scripting UI (rs-* classes)
examples/       sample scripts + reference AST
web/            index.html + CSS
```
