"""Copy the three pieces' runtime (index.html, src/, assets/) into this site.

  python3 tools/sync.py

Each project's index.html is an Artifact page fragment; it is wrapped in the same
document skeleton tools/serve.py gives it locally. work/, out/, source/ and the
venvs are never copied."""
import os
import re
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

PAUSE = ('<button id="pause" type="button" aria-pressed="false" aria-label="暂停" title="暂停"><svg viewBox="0 0 24 24" aria-hidden="true">'
         '<g class="i-pause"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></g>'
         '<path class="i-play" d="M8 5.5v13l11-6.5z"/></svg></button>')
FULL = ('<button id="full" type="button" aria-label="全屏" title="全屏"><svg viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round"/></svg></button>')
ICON_CSS = """
  .controls button { width: 32px; height: 32px; padding: 0; border-radius: 16px; display: grid; place-items: center; }
  .controls button svg { width: 16px; height: 16px; fill: currentColor; }
  .controls .i-play { display: none; }
  .controls button[aria-pressed="true"] .i-play { display: block; }
  .controls button[aria-pressed="true"] .i-pause { display: none; }
</style>"""


def patch_html(h):
    """The site shows each piece full window: no caption bar, no margin, no hint,
    icon buttons."""
    h = re.sub(r'<figure class="(?:label|caption)">.*?</figure>\n?', '', h, flags=re.S)
    h = re.sub(r'const caption = .*?, m = Math\.max\(16, Math\.min\(vw, vh\) \* [0-9.]+\)', 'const caption = 0, m = 0', h)
    h = h.replace('<p class="hint" id="hint">', '<p class="hint" id="hint" hidden>')
    if 'aria-label="暂停"' not in h:
        h = re.sub(r'<button id="pause"[^>]*>.*?</button>', PAUSE, h)
        h = re.sub(r'<button id="full"[^>]*>.*?</button>', FULL, h)
        h = h.replace('</style>', ICON_CSS, 1)
        h = re.sub(r"( *)e\.currentTarget\.textContent = app\.state\.paused \? '播放' : '暂停';",
                   r"\1e.currentTarget.setAttribute('aria-label', app.state.paused ? '播放' : '暂停');", h)
    return h


def patch_scene(j):
    j = re.sub(r'const caption = [^;]*;', 'const caption = 0;', j)
    return re.sub(r'const m = Math\.max\(16, Math\.min\(vw, vh\) \* [0-9.]+\);', 'const m = 0;', j)


for dst, src in PIECES.items():
    out = os.path.join(ROOT, dst)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    page = open(os.path.join(PROJ, src, "index.html"), encoding="utf-8").read()
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(SKELETON.replace("@@PAGE@@", patch_html(page)))
    for d in ("src", "assets"):
        shutil.copytree(os.path.join(PROJ, src, d), os.path.join(out, d), ignore=shutil.ignore_patterns(".*"))
    sc = os.path.join(out, "src", "scene.js")
    code = patch_scene(open(sc, encoding="utf-8").read())
    open(sc, "w", encoding="utf-8").write(code)
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(out) for f in fs)
    print(f"{dst:9s} <- {src:18s} {size / 1e6:5.1f} MB")
