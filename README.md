# 浮世絵 動く

Three Edo prints brought to life in WebGL, switched by a segmented control:
為朝難風 (Kuniyoshi), 深川の雪 (Utamaro), 金箔 相馬の古内裏 (Kuniyoshi).

Static site, no build step. Each piece lives in its own folder (`tametomo/`,
`fukagawa/`, `kinpaku/`) and the root page loads only the selected one.

- `python3 -m http.server` in this folder to run it locally.
- `python3 tools/sync.py` re-copies the three pieces from `~/projects/*`.
- Deploy: GitHub Pages, branch `main`, folder `/ (root)`.
