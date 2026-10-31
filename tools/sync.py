"""Copy the three pieces' runtime (index.html, src/, assets/) into this site.

  python3 tools/sync.py

Each project's index.html is an Artifact page fragment; it is wrapped in the same
document skeleton tools/serve.py gives it locally. work/, out/, source/ and the
venvs are never copied."""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.expanduser("~/projects")
PIECES = {"tametomo": "kuniyoshi-arashi", "fukagawa": "fukagawa-yuki", "kinpaku": "soma-kinpaku"}
SKELETON = """<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
@@PAGE@@
</body></html>
"""

for dst, src in PIECES.items():
    out = os.path.join(ROOT, dst)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    page = open(os.path.join(PROJ, src, "index.html"), encoding="utf-8").read()
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(SKELETON.replace("@@PAGE@@", page))
    for d in ("src", "assets"):
        shutil.copytree(os.path.join(PROJ, src, d), os.path.join(out, d), ignore=shutil.ignore_patterns(".*"))
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(out) for f in fs)
    print(f"{dst:9s} <- {src:18s} {size / 1e6:5.1f} MB")
