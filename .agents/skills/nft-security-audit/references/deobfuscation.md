# Static deobfuscation and evidence

Use this reference when the input is wrapped HTML/metadata or still contains obfuscated behavior after the quick conversion. Preserve each layer with its hash and explain the transformation. Never evaluate a decoder copied from the NFT.

## Extract the actual code

- JSON metadata: inspect the schema as data, select the actual source/code field with a JSON parser, and save it verbatim. For example, after confirming `code` is a string, `jq -er '.code | select(type == "string")' ./metadata.json > ./extracted.js`. Keep the metadata separately and record the field path. Inspect `animation_url`, image/SVG data, and other executable references too; do not assume all metadata uses `code`.
- HTML/SVG: use a non-executing HTML/XML parser without external entity/network resolution. Save every inline script individually, including module scripts, with original offsets or element locations. Inventory `src`/`href`, event-handler attributes, `srcdoc`, executable URL schemes, nested documents, SVG scripting, import maps, and base URLs. Keep the whole document for context. JSON/import-map script elements are data and should be analyzed as such. Parsing scripts alone misses other execution paths.
- Remote resources: identify the exact URL and initiating code. Retrieve only relevant resources as data when authorized, without credentials or automatic rendering, and record response hashes and redirect destinations. Do not recursively crawl arbitrary discovered URLs or contact secret-bearing exfiltration URLs. Local files, private network addresses, and authenticated resources need their actual access context considered. Unretrieved resources remain explicit gaps.
- Data URLs/base64/JSON string wrappers: the helper supports one explicit wrapper at a time. For nested wrappers, decode and save each layer as data before applying the JavaScript formatter. For gzip/deflate, use a bounded streaming decoder and preserve compressed bytes; a small input can expand drastically. Do not run a package's build/install pipeline to extract its source.

## Go beyond beautification

The helper uses Python [js-beautify](https://github.com/beautifier/js-beautify). It applies supported static unpackers and readable string escapes, with evaluation disabled. Inspect [the upstream unpacker dispatch](https://github.com/beautifier/js-beautify/blob/main/python/jsbeautifier/unpackers/__init__.py) before changing versions or enabling new unpackers. Keep `eval_code=False`; do not use `--eval-code`.

Formatting is only the first pass. For remaining obfuscation:

1. Locate string tables, index functions, table rotations, arithmetic/XOR decoders, `atob`, character-code construction, and compressed/encrypted blobs. Follow their outputs to uses: a decoded string can be data, a property name, a destination, or executable code.
2. Reimplement only understood, bounded **data transformations** in trusted analysis code. For example, decode a literal base64 string using Python's base64 library and save the result. Do not execute the original IIFE or decoder with Node, `eval`, `Function`, or a browser to recover the strings.
3. When AST transforms help, parse without execution. Fold only expressions with proven literal operands and no side effects. Resolve immutable string-table lookups only after checking writes, aliases, mutation, and rotation; preserve uncertain expressions. Do not use global text substitution to rename bindings or replace arbitrary expressions.
4. Save `layer-01.js`, `layer-02.js`, etc., recording input/output hashes, extraction location, tool/version, transformation, and unresolved constructs. Save decoded data separately when it is not JavaScript. Review the original entry point and wrapper too: an unpacker can change semantics or omit context.
5. Give unresolved names meaningful annotations when their purpose is established. Do not invent original names or claim source maps are authentic without checking them against the shipped artifact.
6. If decoding depends on runtime state, unknown keys, remote responses, or self-modifying code, describe the dependency and the remaining uncertainty. An incomplete decode cannot support a clean verdict.

## Follow the complete path

Use a short evidence chain per behavior:

`NFT entry → decoded property/string → reachable host object → read/write/call → destination or later trigger`

Examples of distinctions that matter:

- Reading `wallet.publicKey` differs from reading a private key; a provider signing request can still be dangerous without key access.
- Saving a preference differs from saving executable content that a startup loader later runs.
- An interval persists during the page session; a service worker or stored activation flag can survive reload. Confirm actual registration success, origin/scope, and host behavior rather than assuming it from API names.
- A remote image is not inherently a code loader, but its URL can carry secret data.
- Blocking an outbound response through CORS does not establish that an outbound request never occurred.

For runtime follow-up, [Node documents that `vm` is not a security mechanism](https://nodejs.org/api/vm.html). For browser isolation review, check [iframe sandbox behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox), especially the actual origin and the combination of script and same-origin privileges. Base conclusions on the host's real boundary, not the presence of an iframe tag.
