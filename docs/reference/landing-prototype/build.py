"""Rebuild preview.html from template.html by embedding the images as data URIs.

Run from this folder:  python build.py
"""
import base64
from pathlib import Path

here = Path(__file__).parent


def uri(name):
    return "data:image/webp;base64," + base64.b64encode((here / "assets" / name).read_bytes()).decode()


body = (here / "template.html").read_text(encoding="utf-8")
body = body.replace("__PADDLE__", uri("paddle-2x.webp")).replace("__BALL__", uri("ball-2x.webp"))
head = ('<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>')
(here / "preview.html").write_text(head + body + "</body></html>", encoding="utf-8")
print("wrote preview.html")
