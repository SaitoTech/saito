# Bugs tests

Run the focused suite from the repository root:

```sh
npx jest --config tests/mods/bugs/jest.config.cjs --runInBand
```

Keep Bugs test configuration, specifications, and testing documentation in this
directory. The Lite-Client build copies `mods/bugs`, and Webpack's dynamic module
context includes its JavaScript files, so test configuration there becomes a
browser dependency.

## RedSquare context-menu acceptance checks

1. Before visiting `/bugs`, no Capture as Bug item is shown.
2. After visiting `/bugs`, root tweets and replies show Capture as Bug.
3. A reply context supplies its own signature as `source_tx_sig` and the thread root as `root_tx_sig`.
4. Selecting the item opens the standard Bugs overlay without changing the tweet.
