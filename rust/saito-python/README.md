# saito-python

This package is a Python SDK layer for Saito.

Its public API stays stable behind a backend boundary, but it now includes a
runtime-backed adapter model that matches the instance-first wasm API:

- a runtime loader initializes the engine through `initialize_runtime(...)`
- a host bridge owns environment-specific IO and peer connectivity
- the Python client and node classes operate on the resulting runtime handle

That makes the package usable today for Python host integrations without baking
JS-specific assumptions into the Python surface.
