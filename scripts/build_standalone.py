#!/usr/bin/env python3
"""Build the SharePoint deliverable as one deterministic standalone HTML file."""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
SRC = ROOT / "src"
TEMPLATE = SRC / "index.template.html"
CSS = SRC / "app.css"
JS = SRC / "app.js"
JS_PARTS = [SRC / "data-adapter.js", SRC / "calculation-core.js", JS]
CSS_TOKEN = "{{APP_CSS}}"
JS_TOKEN = "{{APP_JS}}"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def extract() -> None:
    """Create modular sources from the current known-good index.html."""
    text = INDEX.read_text(encoding="utf-8")
    style_open = text.index("<style>") + len("<style>")
    style_close = text.index("</style>", style_open)
    script_open = text.index("<script>", style_close) + len("<script>")
    script_close = text.index("</script>", script_open)
    if text.find("<style>", style_open) >= 0 or text.find("<script>", script_open) >= 0:
        raise SystemExit("Expected exactly one inline style and one inline script block")
    css = text[style_open:style_close]
    javascript = text[script_open:script_close]
    template = text[:style_open] + CSS_TOKEN + text[style_close:script_open] + JS_TOKEN + text[script_close:]
    SRC.mkdir(parents=True, exist_ok=True)
    TEMPLATE.write_text(template, encoding="utf-8", newline="")
    CSS.write_text(css, encoding="utf-8", newline="")
    JS.write_text(javascript, encoding="utf-8", newline="")
    rebuilt = render()
    original = INDEX.read_bytes()
    if rebuilt != original:
        raise SystemExit("Extraction is not byte-equivalent to the original index.html")
    print(f"SOURCES EXTRACTED: sha256={digest(original)}")


def render() -> bytes:
    template = TEMPLATE.read_text(encoding="utf-8")
    if template.count(CSS_TOKEN) != 1 or template.count(JS_TOKEN) != 1:
        raise SystemExit("Template must contain one CSS and one JavaScript placeholder")
    html = template.replace(CSS_TOKEN, CSS.read_text(encoding="utf-8"))
    javascript = "\n".join(path.read_text(encoding="utf-8") for path in JS_PARTS)
    html = html.replace(JS_TOKEN, javascript)
    return html.encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--extract", action="store_true", help="bootstrap sources from index.html")
    parser.add_argument("--check", action="store_true", help="verify that index.html matches sources")
    args = parser.parse_args()
    if args.extract:
        extract()
        return 0
    built = render()
    if args.check:
        current = INDEX.read_bytes() if INDEX.is_file() else b""
        if current != built:
            print("STANDALONE BUILD: OUT OF DATE")
            print(f"expected sha256={digest(built)}")
            print(f"current  sha256={digest(current)}")
            return 1
        print(f"STANDALONE BUILD: OK sha256={digest(built)}")
        return 0
    INDEX.write_bytes(built)
    print(f"STANDALONE BUILD: WROTE index.html sha256={digest(built)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
