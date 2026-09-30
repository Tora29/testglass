#!/usr/bin/env bash
# demo/spec.html をヘッドレス Chrome で撮る（ダーク・ライト・狭い画面）。
# 使い方: screenshot.sh <出力先ディレクトリ>
set -euo pipefail

out="${1:?出力先ディレクトリを指定してください}"
root="$(git rev-parse --show-toplevel)"
html="$root/demo/spec.html"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [[ ! -x "$chrome" ]]; then
  echo "Chrome が見つかりません（CHROME 環境変数でパスを指定できます）: $chrome" >&2
  exit 2
fi
if [[ ! -f "$html" ]]; then
  echo "$html がありません。先に npm run demo を実行してください" >&2
  exit 2
fi

mkdir -p "$out"
shot() {
  # --virtual-time-budget: トランジションが終わってから撮る
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=2000 "$@" >/dev/null 2>&1
}

shot --window-size=1280,900 --force-prefers-color-scheme=dark --screenshot="$out/dark.png" "file://$html"
shot --window-size=1280,900 --force-prefers-color-scheme=light --blink-settings=preferredColorScheme=1 --screenshot="$out/light.png" "file://$html"

# ヘッドレス Chrome はウィンドウを 500px 未満にできないため、ページ側で幅 400px に固定して撮る
narrow="$out/narrow.html"
sed 's|<head>|<head><style>html{width:400px;overflow-x:hidden}</style>|' "$html" > "$narrow"
shot --window-size=600,900 --screenshot="$out/narrow.png" "file://$narrow"
rm "$narrow"

ls "$out"/*.png
