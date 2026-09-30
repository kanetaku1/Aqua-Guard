# Web UI Prototype

`frontend/docs/`（05_画面・機能要件書・06_画面構成ツリー・08_デザインシステム定義書）に基づく全画面の静的プロトタイプ。ビルド不要（HTML / CSS / 最小限のJS）。

## 見る

```bash
# リポジトリルートで
python -m http.server 8000 --directory frontend/prototype
# → http://localhost:8000/        （全画面カタログ）
# → http://localhost:8000/design-system.html
```

`index.html` をブラウザで直接開いても表示されます（アイコン・フォントのためネット接続が必要）。

## Figmaへ取り込む（html.to.design）

- ローカルURLはFigmaプラグインから直接取得できないため、**html.to.design の Chrome拡張** を使う
  1. 上記でローカルサーバーを起動し、取り込みたい画面をChromeで開く
  2. 拡張を起動し、Viewport **Desktop 1440** を選んで取り込む（生成された `.h2d` ファイルをFigmaプラグインで読み込む）
- 状態違いのバリエーションはURLパラメータで開く（例: `?tab=actuator&dialog=1`）。一覧は `index.html` にあります
- グラフはインラインSVGのため、Figma上でもベクターとして編集可能

## 構成

```text
prototype/
├── index.html            全画面カタログ（サムネイル）
├── design-system.html    トークン・コンポーネント一覧
├── mock_data.md          全画面共通のサンプルデータ
├── assets/
│   ├── tokens.css        デザイントークン（ここだけ変えれば全画面に反映）
│   ├── app.css           共通コンポーネント
│   ├── layout.js         Global Header / Sidebar・タブ・Dialog/Drawer
│   └── charts.js         Time-series / Bar / Growth vs Target chart（SVG）
└── screens/              FM-01〜06, TM-01〜05
```

## ルール

- 新しい色・余白・コンポーネントを画面内に直接書かない。必要なら `docs/07_UI・UX設計書.md` / `docs/08_デザインシステム定義書.md` → `tokens.css` / `app.css` の順に追加する
- 数値は `mock_data.md`（このディレクトリ）に合わせる
