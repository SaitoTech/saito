# saito-python-test-node

This project is an interoperability harness for running a Python-driven Saito
node alongside a Rust node.

It now targets the runtime-backed `saito-python` adapter path, so tests can
exercise the same runtime-loader and host-bridge contract that a real Python
engine integration will use.
