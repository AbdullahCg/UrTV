#!/usr/bin/env python3
"""Inline fonts and backgrounds into src/template.html -> dist/ksa-dashboard.html."""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FONTS = {
    "__F_LIGHT__": "Thmanyah-Light.woff2",
    "__F_REGULAR__": "Thmanyah-Regular.woff2",
    "__F_MEDIUM__": "Thmanyah-Medium.woff2",
    "__F_DISPLAY__": "ThmanyahDisplay-Bold.woff2",
}


def data_uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main():
    html = (ROOT / "src/template.html").read_text(encoding="utf-8")
    for token, name in FONTS.items():
        html = html.replace(token, data_uri(ROOT / "assets/fonts" / name, "font/woff2"))

    bg_dir = ROOT / "assets/backgrounds"
    entries = []
    for bg in json.loads((bg_dir / "backgrounds.json").read_text(encoding="utf-8")):
        uri = data_uri(bg_dir / bg["file"], "image/jpeg")
        entries.append(f'  {{u:"{uri}", c:{json.dumps(bg["credit"], ensure_ascii=False)}, d:{bg["brightness"]}}}')
    html = html.replace("__BG_SET__", ",\n".join(entries))

    out = ROOT / "dist/ksa-dashboard.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
