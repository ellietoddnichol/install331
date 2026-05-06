"""Replace common double-encoded UTF-8 mojibake byte sequences with proper UTF-8."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

REPLACEMENTS: list[tuple[bytes, bytes]] = [
    (b"\xc3\xa2\xe2\x80\xa0\xe2\x80\x99", b"\xe2\x86\x92"),  # â†' -> arrow
    (b"\xc3\xa2\xe2\x82\xac\xe2\x80\x9d", b"\xe2\x80\x94"),  # â€" -> em dash
    (b"\xc3\xa2\xe2\x82\xac\xe2\x84\xa2", b"'"),  # â€™ -> apostrophe
    (b"\xc3\xa2\xe2\x82\xac\xc2\xa6", b"\xe2\x80\xa6"),  # â€¦ -> ellipsis
    (b"\xc3\x83\xe2\x80\x94", b"\xc3\x97"),  # Ã— -> multiplication sign
    (b"\xc3\x82\xc2\xb7", b"\xc2\xb7"),  # Â· -> middle dot
]

TEXT_SUFFIXES = {".tsx", ".ts", ".md", ".mjs", ".js", ".html", ".css", ".json"}


def main() -> None:
    for path in REPO.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if "node_modules" in path.parts or "dist" in path.parts:
            continue
        data = path.read_bytes()
        if data.startswith(b"\xef\xbb\xbf"):
            data = data[3:]
        orig = data
        for a, b in REPLACEMENTS:
            data = data.replace(a, b)
        if data != orig:
            path.write_bytes(data)
            print(f"fixed: {path.relative_to(REPO)}")


if __name__ == "__main__":
    main()
