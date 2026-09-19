#!/usr/bin/env python3
"""Preserve, statically decode, and format NFT JavaScript; never execute it."""

import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import unquote_to_bytes

MAX_BYTES = 8 * 1024 * 1024


def decode_base64(value):
    return base64.b64decode(b"".join(value.split()), validate=True)


def decode(raw, encoding):
    if encoding == "base64":
        raw = decode_base64(raw)
    elif encoding == "data-url":
        header, separator, body = raw.decode("utf-8-sig").strip().partition(",")
        if not separator or not header.lower().startswith("data:"):
            raise ValueError("Expected a data URL")
        parts = header[5:].lower().split(";")
        if parts[0] not in ("application/javascript", "text/javascript",
                            "application/ecmascript", "text/ecmascript", "text/plain", ""):
            raise ValueError("Extract JavaScript from this content type first")
        raw = unquote_to_bytes(body)
        if "base64" in parts[1:]:
            raw = decode_base64(raw)
    elif encoding == "json-string":
        value = json.loads(raw)
        if not isinstance(value, str):
            raise ValueError("Expected a JSON string; extract metadata's code field first")
        raw = value.encode("utf-8")
    if len(raw) > MAX_BYTES:
        raise ValueError("Decoded input exceeds 8 MiB")
    source = raw.decode("utf-8-sig")
    if source.lstrip().startswith("<"):
        raise ValueError("Appears to be HTML/SVG; extract executable units first")
    return source


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", required=True, type=Path,
                        help="Fresh evidence directory (must not exist)")
    parser.add_argument("--encoding", default="plain",
                        choices=("plain", "base64", "data-url", "json-string"))
    args = parser.parse_args()
    try:
        import jsbeautifier
    except ImportError:
        parser.error("Install jsbeautifier==2.0.3 in the dedicated audit venv")
    try:
        if args.out.exists():
            raise ValueError("Output directory already exists; choose a fresh directory")
        with args.input.open("rb") as handle:
            raw = handle.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("Input exceeds 8 MiB; extract a smaller unit first")
        source = decode(raw, args.encoding)
        options = jsbeautifier.default_options()
        options.eval_code = False
        options.unescape_strings = True
        options.indent_size = 2
        readable = jsbeautifier.beautify(source, options)
        files = {
            "original.bin": raw,
            "decoded.js": source.encode("utf-8"),
            "readable.js": (readable.rstrip() + "\n").encode("utf-8"),
        }
        if any(len(data) > MAX_BYTES * 4 for data in files.values()):
            raise ValueError("Transformed output exceeds 32 MiB")
        manifest = {
            "input_path": str(args.input.resolve()),
            "encoding": args.encoding,
            "jsbeautifier_version": jsbeautifier.__version__,
            "options": {"eval_code": False, "unescape_strings": True, "indent_size": 2},
            "transformations": [
                "Explicit wrapper decode; strict UTF-8 text; optional BOM removal",
                "jsbeautifier static unpackers, string unescaping, and formatting",
            ],
            "limitations": [
                "Not a security verdict or complete deobfuscation",
                "Unsupported packers can remain unchanged without an error",
                "Derived code may differ in behavior; inspect original alongside it",
                "No source map: correlate findings with the original manually",
                "Does not extract HTML, fetch dependencies, or execute sample code",
            ],
            "files": {name: {"sha256": digest(data), "bytes": len(data)}
                      for name, data in files.items()},
        }
        args.out.mkdir(parents=True, exist_ok=False)
        for name, data in files.items():
            with (args.out / name).open("xb") as handle:
                handle.write(data)
        with (args.out / "manifest.json").open("x", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2)
            handle.write("\n")
    except (OSError, ValueError) as exc:
        print(f"Preparation failed: {exc}", file=sys.stderr)
        return 1
    print(f"Saved {args.out / 'readable.js'} (static review artifact; not a safety verdict)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
