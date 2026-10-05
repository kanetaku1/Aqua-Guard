# UI/UX設計書

| 項目 | 内容 |
| --- | --- |
| 版 | v2.5（2026-10-01：センサー・Alert・Reportの分離）／ v2.4（2026-10-01：状態色の色相分離、Badge / Indicator の判定ルールを反映） |
| 対象 | AquaGuard — Web UI（Farms Manager / Technical Manager） |
| 関連文書 | 01〜06（業務・権限・用語・KPI・画面の正）、08_デザインシステム定義書（Design System v2：見た目の確定値）、Figma「UI Style Guidelines」（v2の元になった原典） |
| 実装 | `frontend/prototype/`（`assets/tokens.css` / `assets/app.css` / `design-system.html`） |

> v1の画面一覧（収益シミュレーション、将来在庫、AI予測アドバイス等）は現行スコープ外のため削除した。画面構成は「05_画面・機能要件書」、画面の構造は「06_画面構成ツリー」を正とする。

---

## 1. 目的と位置付け

本書は、画面ごとの判断が「その場の見た目合わせ」にならないよう、**なぜその色・サイズ・部品を使うのか**というUI/UXの判断基準を定義する。

| 文書 | 決めること |
| --- | --- |
| **本書** | UI/UXの判断基準（色・サイズ・部品を使う理由、UXルール、品質基準） |
| 08_デザインシステム定義書 | Design System v2（色・書体・アイコン・部品の確定値と実装クラス） |
| Figma UI Style Guidelines | v2の元になった原典。v2に合わせて更新する |
| 05_画面・機能要件書 / 06_画面構成ツリー | 各画面のセクション構成と優先順位 / 画面の構造 |
| 04_KPI・データ項目定義書 | KPIの算出・集計、閾値、単位・桁数 |

Design System v2 はFigmaの原典を本書 §3 のレビューに基づいて改訂したもので、2026-09-29に承認された。Figmaとの差分は §15 のとおりで、Figma側を v2 に合わせて更新する。

---

## 2. 設計原則

1. **結論を先に出す** — 画面上部に「今どういう状態か」「何をすべきか」を置き、詳細は下へ。
2. **正常は静かに、例外は目立たせる（Quiet normal, loud exceptions）** — 正常状態は控えめに表示し、色の強い表現は注意以上の状態だけに使う。画面の大半が正常なので、これが色のバランスを決める。
3. **役割で情報量を分ける** — Farms Managerは集約（VIEW / UNDERSTAND）、Technical Managerは詳細と操作（MONITOR / INVESTIGATE / MANAGE）。同じ部品を使い、密度と操作だけを変える。
4. **実績・推定・予測を混ぜない** — 値の種類（Actual / Estimated / Forecast）を必ずタグで示す。
5. **色だけで伝えない** — 状態はラベル＋色、範囲外の値は色＋アイコンで示す。
6. **データの鮮度と欠損を隠さない** — 取得時刻、更新遅延、センサー断を常に見える場所に出す。
7. **重大操作は人が確認する** — Actuator操作・レポート提出は確認ダイアログを通し、Safety Layerの制約を明示する。
8. **一つの意味には一つの表現** — 同じ意味の情報は、どの画面でも同じ部品・同じサイズ・同じ位置で表示する。
9. **重複させるなら見え方を変える（G1）** — 1つの画面・隣り合う画面で同じ内容を出すときは、粒度か形を変えて役割を分ける。例：Farm Status 表＝「どのFarmが・なぜ」（Pond数の事実）／Risk / Issue＝個々の問題（Pond・傾向・対応状態）。TM Dashboard＝今の水質／Pond List＝成長と当日の記録。同じ表を2か所に置かない。
10. **状態には根拠を添える** — Status だけを並べない。状態の隣に「なぜ」（Main reason、該当Pond数、値）を示す。名前を変えただけの集約状態（例：Overall）は作らない。
11. **2つの問いには2つの仕組みで答える** — 「今何が起きているか（What is happening now?）」は Sensor Data ＋ Alert ＋ Environmental / Pond Trend（Dashboard、Farm Detail、Pond Detail）で答える。「何が起き、何を観察し、TMが何をしたか（What happened, what was observed, what did the TM do?）」は Daily / Weekly Report で答える。Reportにセンサー値を転記せず、AlertをReportに依存させない（違いは 03_用語定義 §7「Report と Alert の違い」）。
    > Sensors continuously observe. Alerts continuously detect. Technical Managers operate and respond. Reports document human operational activity. Farms Managers oversee Farm-level conditions and review operational reports.

### 2.1 目指す印象と避けること

汎用のAIダッシュボードではなく、**養殖の現場運用を支える業務システム**として感じられることを目指す。

| 優先すること | 避けること |
| --- | --- |
| 情報の階層、運用上の分かりやすさ、状態の見やすさ、データの読みやすさ、Roleの分離、部品の一貫性、効率的な移動 | 装飾目的のグラフ、AIカード、グラデーションのヒーロー領域、不要なアニメーション、過剰なKPIカード、マーケティング調の大見出し、汎用SaaS的な機能 |

---

## 3. UI Style Guideline のレビュー（見落とし・課題）

FigmaのUI Style Guidelines（01〜09）を画面に適用した結果、以下の不足・課題を確認した。対応はすべて Design System v2 に反映済み。

### 3.1 アクセシビリティ上の課題

| # | 課題 | 根拠 | 本書での対応 |
| --- | --- | --- | --- |
| A1 | 入力欄・チェックボックスの枠線（Tide Line `#D6E3E5`）が白背景で **1.31:1** | WCAG 2.2 1.4.11（UI部品は3:1以上） | 操作部品の枠線は **`#7C8D93`（3:1以上）** を使う。Tide Lineはカード・表の区切り線（装飾）に限定 |
| A2 | Outlineボタンのホバー（`#7C8D93`背景＋Ink文字）が **3.91:1** | 1.4.3（14px Boldは4.5:1必要） | ホバーは **Mist背景＋Ink文字＋Slate枠** に変更 |
| A3 | Disabledの文字（`#E9EEF0` on `#C4CFD2`）が **1.36:1** | 無効状態は基準の対象外だが、何のボタンか読めない | 許容。ただし無効理由をツールチップ／補足文で必ず示す |
| A4 | 範囲外の値を文字色だけで表現しがち | 1.4.1（色のみに依存しない） | 範囲外の値は **色＋警告アイコン** |

### 3.2 色の意味の衝突

| # | 課題 | 数値 | 本書での対応 |
| --- | --- | --- | --- |
| C1 | Mangrove Green（補助ボタン）と Status Green（正常）がほぼ同色 | 色差 **1.16:1** | 緑のボタンは「正常／完了」と誤認されるため、**Secondary（緑）ボタンを廃止**。Mangrove Greenはグラフのデータ色（実績・成長・給餌）に限定 |
| C2 | Water Blue（リンク・主要操作）と Status Blue（情報）が近い | 色差 **1.25:1** | 「From records」等の情報タグを青にするとリンクに見えるため、**参照元タグはニュートラル（Slate/Mist）**。Status Blueは通知バナーのアイコンと枠に限定 |
| C3 | 状態バッジの多用で画面が騒がしい（例：Farm一覧で1行4個×4行＝16個） | — | **Status Badge と Status Indicator を使い分ける**（§8） |

### 3.3 定義の不足

| # | 不足している定義 | 本書での対応 |
| --- | --- | --- |
| D1 | 12px以下の文字（Helper text以外の補足・表見出し） | **Caption 12/16.8** を正式に定義 |
| D2 | KPI・センサー値などの「主要数値」用サイズ（最大が20pxのため、ページタイトルと同じ大きさになる） | **Display 24/33.6（Bold, 数値専用）** を追加 |
| D3 | 部品サイズの共通尺度（ボタン32/40/48、入力40、バッジ約40と部品ごとにばらばら） | **コントロール高さ尺度 24 / 32 / 40 / 48** に統一（§6.2） |
| D4 | グリッドの列間隔30pxが8pxの倍数の体系から外れている | **列間隔を24pxに統一**（§6.3） |
| D5 | 4px未満の微小な余白の扱い | **4px（部品内部専用）** を追加 |
| D6 | 状態の種類：Info、レポート状態、アラートの対応状態、データ品質 | §8で4つの系統として定義 |
| D7 | 部品：Card、Table、Tabs、Segmented、Page Header、KPI Card、Alert Row、Chart、Dialog、Drawer、Toast、Notice、Empty/Loading/Error、Tooltip | §7で構造とサイズを定義 |
| D8 | 影（Elevation）、重なり順（z-index）、枠線の太さ | §6.5で定義 |
| D9 | 日本語・インドネシア語の書体、数値の書式（桁区切り、小数桁、等幅数字） | §5・§12で定義 |
| D10 | 操作のフィードバック（保存中、保存済み、未保存の警告）、キーボードのフォーカス順 | §9で定義 |

---

## 4. カラー設計

### 4.1 パレット（原典）と役割

| 役割 | 色 | 値 | 使ってよい場所 | 使ってはいけない場所 |
| --- | --- | --- | --- | --- |
| Primary | Water Blue | `#087EA4` | 主要ボタン、リンク、選択中（タブ・ナビ・ページ送り）、フォーカス、センサー系列、進行中（In Progress） | 状態の意味（正常・警告など） |
| Primary Dark | Deep Water | `#075985` | グローバルヘッダー、Primaryのホバー、トースト背景 | 本文の文字色 |
| Data | Mangrove Green | `#2F855A` | 実績・成長・給餌のグラフ系列 | ボタン（C1により廃止）、状態表示 |
| Background | Mist | `#F4F8F7` | ページ背景、表見出し、読み取り専用の入力、単位チップ | カードの面 |
| Surface | White | `#FFFFFF` | カード、表、フォーム、ダイアログ | — |
| Text | Ink | `#18323B` | 本文、見出し、主要数値 | — |
| Muted | Slate | `#5B7078` | 補足、単位、更新時刻、表見出し、非活性アイコン | 主要数値 |
| Divider | Tide Line | `#D6E3E5` | カード・表・区切りの線（装飾） | 入力欄の枠（A1） |
| Status | Green / Yellow / Orange / Red | 目印 `#237A57` / `#E0A800` / `#EC6A0C` / `#D92D20`、文字 `#237A57` / `#7A5A00` / `#B54708` / `#B42318` | 状態表示のみ（§4.2 の役割分担に従う） | 装飾、ボタン（Dangerを除く） |
| Info | Status Blue | `#1769AA` | 情報バナー（アイコン・枠） | リンク、参照元タグ（C2） |

### 4.2 補完色

| 用途 | 値 | 算出 |
| --- | --- | --- |
| 操作部品の枠線（Control Border） | `#7C8D93` | 白背景に対し3.45:1 |
| 状態色の目印（Marker） | Normal `#237A57` / Attention `#E0A800` / Warning `#EC6A0C` / Critical `#D92D20` | 点・重大度バー・色帯・Status Strip・グラフの閾値。**黄→橙→赤と色相を離し**、小さな点でも区別できるようにする |
| 状態色の文字（Text） | Normal `#237A57` / Attention `#7A5A00` / Warning `#B54708` / Critical `#B42318` | 範囲外の値・Badgeの文字。白・淡色の上で4.5:1以上 |
| Badgeの面（Fill） | Attention `#FFF4CC` / Warning `#FFE8D6` / Critical `#D92D20`（白文字） | Badgeだけに使う。Criticalは塗りつぶし |
| Badgeの枠（Border） | Attention `#E0A800` / Warning `#EC6A0C` / Critical `#D92D20` | 目印と同じ |
| 淡い背景（領域の異常） | Normal `#EDF4F2` / Attention `#FFF8E1` / Warning `#FFF1E6` / Critical `#FDECEA` / Info `#ECF3F8` | 閾値外の帯、警告バナー、閾値エディタの Normal 列 |
| 選択中の背景 | `#E1F0F4` | Water Blueを12%の濃さに |
| フォーカスリング | `#C1DEE8` | 原典の値 |
| 表の行ホバー | `#F9FBFB` | 原典のPagination無効背景 |

### 4.3 カラーバランス

画面全体の面積比を以下の目安に収める。**色が画面の10%を超えたら、情報設計を見直す合図とする。**

| 区分 | 目安 | 内訳 |
| --- | --- | --- |
| ニュートラル面 | 約85% | Mist背景、White面、Tide Lineの線 |
| テキスト | 約10% | Ink、Slate |
| ブランド色 | 5%以下 | ヘッダー（Deep Water）、主要ボタン・リンク・選択（Water Blue） |
| 状態色 | 例外の数に比例 | 正常は点と文字だけ。注意以上だけがバッジ・色バー・背景を持つ |

ルール:
- 1画面の中で、同じ領域に置く主要ボタン（Primary）は1つまで。
- 状態色の背景（淡い色の面）は、「その領域そのものが異常」を示すときだけ使う（例：閾値外の範囲、警告バナー）。
- グラフの系列は2色まで（Water Blue＝センサー、Mangrove Green＝実績）。3本目以降は Slate の破線（目標）で表す。

### 4.4 コントラスト検証結果

| 組み合わせ | 比 | 判定 |
| --- | --- | --- |
| Ink / White | 13.48 | AA ✓ |
| Slate / White | 5.21 | AA ✓ |
| Slate / Mist | 4.86 | AA ✓ |
| Water Blue / White（リンク文字・ボタン） | 4.64 | AA ✓（余裕が小さいため、細字12pxのリンクは使わない） |
| White / Deep Water（ヘッダー） | 7.56 | AA ✓ |
| Attention文字 `#7A5A00` / White | 6.38 | AA ✓ |
| Attention文字 / Badge面 `#FFF4CC` | 5.79 | AA ✓ |
| Warning文字 `#B54708` / White | 5.43 | AA ✓ |
| Warning文字 / Badge面 `#FFE8D6` | 4.59 | AA ✓ |
| Critical文字 `#B42318` / White | 6.57 | AA ✓ |
| White / Critical面 `#D92D20` | 4.84 | AA ✓ |
| 目印 Warning `#EC6A0C` / White | 3.20 | 非テキスト 3:1 ✓ |
| 目印 Attention `#E0A800` / White | 2.15 | 非テキスト ✗ → 黄の目印は**必ず文字ラベルかアイコンと併記**する（色だけで伝えない） |
| Status Green / White | 5.26 | AA ✓ |
| Tide Line / White（入力欄の枠） | 1.31 | ✗ → Control Borderに変更（A1） |

---

## 5. タイポグラフィ

書体：**Inter**（英語・インドネシア語）＋ **Noto Sans JP**（日本語のフォールバック）。太さは Regular 400 / Bold 700 の2種類のみ。行の高さは文字サイズ×1.4。

| スタイル | サイズ / 行高 | 太さ | 用途 | 出典 |
| --- | --- | --- | --- | --- |
| Display | 24 / 33.6 | Bold | KPI値、センサー現在値、状態件数（**数値専用**） | 追加（D2） |
| Large | 20 / 28 | Bold | ページタイトル | 原典 |
| Medium | 18 / 25.2 | Bold | カード外のセクション見出し、ダイアログタイトル | 原典 |
| Normal | 16 / 22.4 | Bold / Regular | カードタイトル（Bold）、入力値・ナビ・タブ（Regular） | 原典 |
| Small | 14 / 19.6 | Bold / Regular | 本文・表のセル（Regular）、ボタン・バッジ・ラベル（Bold） | 原典 |
| Caption | 12 / 16.8 | Regular / Bold | 補足・更新時刻・Helper text（Regular）、表見出し（Bold） | 原典のHelper textを正式化（D1） |

ルール:
- 1つのカード内で使う文字サイズは3段階まで。
- 数値は `tabular-nums`（等幅数字）で表示し、表の数値列は右揃えにする。
- 単位は数値より1段小さい Slate 色で表示する（例：**4.1** mg/L）。
- ALL CAPS（全大文字）は使わない（インドネシア語の翻訳で長くなり読みにくいため）。

---

## 6. サイズ・余白・グリッド

### 6.1 余白の尺度

| トークン | 値 | 用途 |
| --- | --- | --- |
| space-0.5 | 4 | 部品内部だけ（アイコンと文字、点とラベル） |
| space-1 | 8 | 関連する要素の間、ボタン同士の間 |
| space-2 | 16 | カード内の項目の間、表のセルの左右 |
| space-3 | 24 | カードの内側の余白、カード同士・セクション同士の間、グリッドの列間隔 |
| space-4 | 32 | メイン領域の左右余白 |
| space-5 | 40 | ページ最下部の余白 |

12px・20px・30pxなど、尺度にない値は使わない。

### 6.2 コントロール高さの尺度（部品サイズの統一）

すべての操作部品・表示部品の高さを、次の4段階のどれかに揃える。

| サイズ | 高さ | 文字 | 使う部品 |
| --- | --- | --- | --- |
| XS | 24 | Caption 12 | 小さいバッジ（センサータイル内）、値種別タグ、参照元タグ、件数表示 |
| S | 32 | Small 14 | 小ボタン（表の行・カード見出し内）、ページ送り、セグメント、カード見出し内のSelect |
| M | 40 | Small 14 Bold / Normal 16 | 標準ボタン、入力欄、Select、サイドナビの項目、表の見出し行 |
| L | 48 | Normal 16 Bold | 大ボタン（ページ最下部の確定操作、タブレット向け）、表の行 |

派生するサイズ:

| 部品 | 高さ |
| --- | --- |
| 状態バッジ | 28（標準）／ 24（XS）／ 32（ページ見出し） |
| 表の行 | 48（標準）／ 40（コンパクト） |
| 表の見出し行 | 40 |
| カード見出し | 最小64（タイトル＋サブタイトル） |
| アラート行 | 最小64 |
| グローバルヘッダー | 60 |
| タブ | 48 |

タッチ領域: Technical Managerはタブレットでも使うため、ボタンなどの操作部品は見た目が32pxでも**押せる範囲を44px以上**確保する（行全体をクリック可能にする等）。

### 6.3 グリッド

| フレーム | 列数 | 列間隔 | 外側の余白 | 備考 |
| --- | --- | --- | --- | --- |
| Desktop 1440（サイドバーあり） | 12 | **24** | 32 | コンテンツ幅 1144 = 1440 − サイドバー232 − 32×2 |
| Desktop 1024 | 12 | 24 | 24 | サイドバーはアイコンだけの64pxに折りたたむ |
| Tablet 768 | 6 | 24 | 24 | サイドバーは開閉式、表は横スクロール |

列間隔は24pxで確定（原典の30pxから変更、D4）。列幅は可変。よく使う分割は 12 / 8+4 / 6+6 / 4+4+4 / 3×4 / 2×6。

### 6.4 角丸

| 値 | 用途 |
| --- | --- |
| 4 | チェックボックス、ページ送り、タグ類（XS部品） |
| 8 | カード、ボタン、入力欄、バッジ、ダイアログ、ドロワー、トースト |

### 6.5 影・重なり順・線

| 種類 | 定義 |
| --- | --- |
| 線 | 1px。区切り線は Tide Line、操作部品の枠は Control Border。フォーカス・選択は 2px |
| 影 | カードには付けない。重なって表示されるもの（ドロップダウン、ダイアログ、ドロワー、トースト）のみ 1種類 |
| 重なり順 | ヘッダー 20 → ドロップダウン 30 → ドロワー・ダイアログ 50 → トースト 60 |

### 6.6 アイコンサイズ

| サイズ | 使う場所 |
| --- | --- |
| 16 | 本文・表・ボタン（S/M）の中 |
| 20 | サイドナビ、Lボタン、カード見出し |
| 24 | 設備タイル、空状態 |
| 40（描画30＋余白5） | 単独で置くアイコン（原典のルール） |

---

## 7. コンポーネント設計

各部品の「構造・サイズ・使い分け」を定義する。見た目の値は 08_デザインシステム定義書 と `app.css` を正とする。

| 部品 | 構造 | 規則 |
| --- | --- | --- |
| **Global Header** | ロゴ・製品名 ／ 対象範囲（Company / Farm）／ データ鮮度 ／ 言語 ／ ユーザー | Deep Water、高さ60。データ鮮度は「● Live · 09:35 WIB」の形で示し、遅延時は Attention の「Delayed」に変わる |
| **Sidebar** | Roleラベル ／ ナビ項目（M 40）／ 下位項目 | 選択中は選択色の背景＋Water BlueのBold文字。権限のない項目は出さない |
| **Page Header** | パンくず（Caption）→ タイトル（Large）＋主状態バッジ → メタ情報（Small, Slate）→ 右側に操作 | ページごとの操作は最大2つ。「最終更新」は対象物の画面（Farm / Pond / Report）だけに表示し、一覧画面ではヘッダーのデータ鮮度に任せる |
| **Card** | 見出し（タイトル＋サブタイトル＋右にリンク／S操作）／ 本文 ／ 任意でフッター | 内側の余白24。見出しのアクションは「View All →」のリンクかSボタンに限る |
| **KPI Card** | KPI名（Small, Slate）＋値種別タグ（XS）／ 値（Display）＋単位 ／ 前回比（Caption）／ 更新（Caption） | 1行に並べるのは6枚まで。前回比は良し悪しを色で示さない（FCRのように下がるほど良い指標があるため） |
| **Status Badge** | 枠線＋点（10）＋ラベル（Small Bold） | §8.2 の使い分けに従う |
| **Status Indicator** | 点（8）＋ラベル（Small Regular） | 補助的な状態・正常・対応状態・設備の状態 |
| **Table** | 見出し（M 40, Mist, Caption Bold）／ 行（L 48） | 行全体をクリック可能にし、右端の「View」リンクも残す。数値列は右揃え。範囲外の値は色＋アイコン。空・読込中・エラーの状態を持つ |
| **Alert Row** | 重大度の色バー（4）／ タイトル＋メタ ／ 重大度バッジ＋対応状態 ／ 操作 | FMは閲覧のみ（操作は「View Farm」リンク）、TMはAcknowledge（Primary S） |
| **Time-series Chart** | 凡例 → グラフ → 軸 | 系列は2色まで、閾値は Orange の破線＋淡い帯、欠損区間はグラフを途切れさせる。期間はセグメントで切り替え。表形式でも同じデータを確認できるようにする |
| **Tabs** | 下線タブ（高さ48, Normal） | 同じ対象の中で観点を切り替えるときに使う。タブの状態はURLに保持する |
| **Segmented** | S 32 | 表示範囲の切り替え（24h / 7d / 30d）に限る |
| **Filter Bar** | 検索（M, 幅300）＋Select（M, 幅190）×最大3＋条件のクリア | 一覧の上に置く。条件はURLに保持する |
| **Pagination** | S 32（原典） | 表の下、右端。左に「Showing 1–8 of 112」 |
| **Form** | カード単位で区切る（2列）。ラベルは上、必須は赤の*、単位はチップ | 参照データは読み取り専用（Mist）＋参照元タグ。確定ボタンは右下（Primary）、取消はその左（Outline） |
| **Action Bar**（長いフォーム用） | 画面下に固定：状態（Draft · 保存時刻）／ Save Draft（Outline）／ Submit（Primary） | TMのレポート作成画面で使う。未保存の変更があれば「Unsaved changes」を表示 |
| **Confirmation Dialog** | タイトル（Medium, 疑問形）／ 結果の説明 ／ 影響・制約（Mist面）／ 取消・確定 | 確定ボタンのラベルは動詞（Turn On / Submit）。「OK」は使わない |
| **Drawer** | 右端から幅480 | 一覧の文脈を保ったまま詳細を見るときに使う。複雑な入力には使わない |
| **Toast** | 右下、幅360、Deep Water | 操作結果の通知だけ（4秒で消える）。重要な情報は画面側に残す |
| **Notice** | アイコン＋文、Info（青）／ Warning（橙） | 画面や領域の前提・制約（Safety Layer等）を示す |
| **Empty / Loading / Error** | アイコン24＋一文＋次の操作 | Loadingはスケルトン表示で、前回値を最新値と誤解させない |
| **Tag** | 値種別（Actual / Estimated / Forecast）、参照元（From records / From sensor DB〔Weeklyの自動集計〕/ Alert handling / Actuator log） | XS 24、Mist背景＋Slate文字。リンクの色は使わない（C2） |

### 7.1 ボタンの使い分けと配置

| 種類 | 用途 | 例 |
| --- | --- | --- |
| Primary | その領域の確定・実行（1領域に1つ） | Submit、Save Record、Acknowledge、Turn On |
| Outline | 取消、補助的な操作、機器を止める等の中立的な操作 | Cancel、Save Draft、Turn Off、Return to Auto |
| Danger | 取り消せない・安全に関わる操作の確定（ダイアログ内のみ） | Stop All Aerators（将来） |
| Link | 別の画面・詳細への移動 | View、View All →、Detail |

ボタンは上記4種類のみ。Secondary（緑）ボタンは v2 で廃止した（C1）。

- 並べ方：右端に最も重要な操作、その左に取消。Dangerは単独で置かず、必ず取消と並べる。
- アイコンは補助として左側に置く（16px）。アイコンだけのボタンは閉じる（✕）に限る。
- 無効状態のボタンは、なぜ押せないかをHelper textで示す（例：「Weather and Summary are required」）。

---

## 8. 状態表示の体系

### 8.1 状態の系統

| 系統 | 値 | 色 |
| --- | --- | --- |
| 重大度（Condition / Severity） | Normal < Attention < Warning < Critical | Green / Yellow / Orange / Red（アイコン：なし / `circle-alert` / `triangle-alert` / `octagon-alert`） |
| レポート状態 | Draft（下書き）→ Submitted（提出済み） | Slate / Green（完了） |
| アラートの対応状態（用語定義） | Unacknowledged（未確認）→ Acknowledged（確認済み）→ In Progress（対応中）→ Resolved（解決済み） | Red / Slate / Water Blue（進行中）/ Green |
| データ品質 | Live / Delayed / Offline / No data | Green / Yellow / Red / Slate |
| アカウント | Active / Invited / Deactivated | Green / Water Blue（進行中）/ Slate |
| マスタの稼働状態 | Farm: Active / Inactive、Pond: In operation / Fallow、機器: Online / Offline | Green / Slate（機器のOfflineは Red） |

### 8.2 Badge と Indicator の使い分け

**判定は1つの質問で決める：「これは、この行・カード・ページが表す対象の“重さ（重大度）”で、Attention 以上か？」**
Yes なら **Status Badge**、それ以外はすべて **Status Indicator**。

| 部品 | 見た目 | 意味 |
| --- | --- | --- |
| **Status Badge** | **塗りのあるチップ**＋重大度アイコン＋太字。Attention＝淡い黄の面・黄の枠、Warning＝淡い橙の面・橙の枠、**Critical＝赤の塗りつぶし・白文字** | 「この対象は対応が必要」。重大度専用 |
| **Status Indicator** | **面も枠もない**。色の点（8px）＋通常の文字 | 状態の記録・説明。目立たせない |

| 表示するもの | 部品 | 理由・例 |
| --- | --- | --- |
| 対象の重大度が Attention / Warning / Critical | **Badge** | 一覧の Status 列（Farm D Critical、Pond 02 Warning）、Alert・Issue の Severity、ページタイトル横（lg）、Report の Pond Tile、Sensor Tile |
| 対象の重大度が Normal | Indicator | 一覧の Normal、ページタイトル横の Normal（lg） |
| 内訳・補助の状態（主語が対象そのものではない） | Indicator | Farm Status の Water quality / Growth / Operations の列・タイル、Report の Health 列、Growth vs target |
| 対応状態（Alert・Issue） | Indicator | Unacknowledged（赤の点）/ Acknowledged（Slate）/ In Progress（Water Blue）/ Resolved（Green） |
| Report 状態 | Indicator | Draft（Slate）/ Submitted（Green）。Draft の緊急度は期限の文字と Continue ボタンで示す |
| データ品質・設備・センサー・アカウント・マスタ | Indicator | Live / Offline、On / Off、Active / Invited |
| 状態別の件数（Status Summary）・凡例 | Indicator | 見出しは点＋文字、件数は Display |

ルール：
- **1つの行・カードに Badge は最大1つ**（その対象の重大度）。2つ目以降の状態は Indicator にする。
- 同じ列に Badge（異常）と Indicator（Normal）が混ざるのは意図どおり。異常な行だけが面を持つので、どこを見るべきかが分かる。
- Badge の色・面・アイコンを重大度以外（Draft、対応状態、件数の見出しなど）に使わない。

> 効果：Farm一覧で16個あったバッジが、異常なFarmの主状態の3個に減り、「どこを見るべきか」がすぐ分かる。

### 8.3 範囲外の値

表やタイルの数値が閾値を外れたら、**値を状態色の文字色で太字にし、前に重大度のアイコン（12px：Attention＝円、Warning＝三角、Critical＝八角形）を付ける**。正常な値はInkのまま。形でも重さが分かるので、色覚に頼らない。

---

## 9. インタラクション設計

| 項目 | ルール |
| --- | --- |
| 移動 | 一覧 → 詳細は行全体のクリック。戻り先はパンくずで示す。タブ・絞り込みの状態はURLに保持し、戻る操作で元に戻る |
| ホバー・フォーカス | クリックできるものはすべてホバーの見た目を持つ。キーボードのフォーカスは2pxのWater Blue＋フォーカスリング（`#C1DEE8`）で示す |
| フォーカスの順番 | ヘッダー → サイドナビ → ページ見出しの操作 → 絞り込み → 本文 → 画面下の操作バー |
| 入力 | 必須は `*`。数値は単位チップ付き。入力欄を離れたときに範囲を検査し、範囲外なら欄の下に理由を表示する（例：「Value out of range (0–20)」） |
| 保存 | 下書きは自動保存（30秒ごと）し、「Saved 09:20」と表示。未保存のまま離れる場合は確認する |
| 確定操作 | 提出・Actuator操作は確認ダイアログ → 結果をトーストで通知 → 画面の状態も更新する |
| Actuator | 自動（Auto）中に手動操作すると「Manual (override)」になることをダイアログで明示。Safety Layerで禁止された操作は無効にし、理由を表示する |
| 読み取り専用（FM） | 操作できない部品（Acknowledge、Edit）は無効で表示するのではなく、**そもそも表示しない**。必要に応じ「Handled by the Technical Manager」と注記する |
| 動き | 状態を理解するのに必要な動き（ドロワーの開閉、150ms）に限る。点滅は使わない |

---

## 10. 画面共通の状態とデータ品質

| 状態 | 表示 |
| --- | --- |
| Loading | 対象の領域にスケルトンを表示し、前回値を最新値と誤認させない |
| Empty | データがない理由と次の操作（例：「No reports for this period. Change the date filter.」） |
| Error | 何が失敗したか、発生時刻、「Retry」ボタン |
| Delayed（更新遅延） | センサー値の最終取得から15分を超えたら、値に「Delayed · 09:10」を付け、ヘッダーのデータ鮮度もAttentionにする |
| Offline / Sensor missing | 値の代わりに「Offline」（Slate）＋最終取得時刻。センサーの状態の欄に赤の点 |
| Forbidden | 権限がないことと、見られる範囲を表示。値を推測させる表示をしない |

---

## 11. 役割別の画面設計の要点

画面ごとのセクションと優先順位は 05_画面・機能要件書 を正とする。本書では役割ごとの見せ方の違いだけを定める。

| 観点 | Farms Manager | Technical Manager |
| --- | --- | --- |
| 最初の問い | Which Farm needs attention? | Which Pond needs attention? |
| 情報の粒度 | Farmへの集約、傾向（↓ Decreasing）、期間 | Pondごとの現在値、時系列、生データ |
| 数値の見せ方 | KPI Card、傾向、重大度 | センサー値のタイル、表、グラフ |
| 操作 | 閲覧・絞り込み・移動のみ（Alertも閲覧のみ） | 記録・Alertの確認（Acknowledge）・対応の記録（Record action）・解決（Resolve）・機器操作・提出 |
| 使う機器 | PC（1280px以上） | PC・タブレット（768px以上、タッチ操作） |

### 11.1 生産KPIの集計ルール

池ごとに放養日が異なる（DOCがそろわない）ため、生産KPIは「足してよい値」と「池単位でしか意味を持たない値」を区別して表示する（算出・集計ルールは 04_KPI・データ項目定義書 §4）。

| 表示単位 | 表示する値 | 表示しない値 |
| --- | --- | --- |
| Company（FM Dashboard） | 総Biomass（推定・合計）、成長目標より遅れている池の数 | 平均ABW・平均ADG・平均SR・平均FCR |
| Farm（Farm Detail・Weekly Report） | Biomass（合計）、SR・FCR（重み付きで再計算）、成長目標に対する池の分布（On track / Behind / Ahead） | 平均ABW・平均ADG・平均Size Uniformity |
| Pond（Pond Production Summary） | DOC、ABW、目標ABW、目標比、ADG、SR、FCR、Biomass、Uniformity | — |

- ABWは必ず「同じDOCでの目標値」と一緒に示し、目標比（%）で良し悪しを判断できるようにする。
- 成長グラフは平均線を描かず、目標曲線に各池の現在値を点で重ねる（DOCが異なる池を同じ図で比較できる）。
- Farms Managerは池ごとの生産サマリーを閲覧できる（サンプリング・給餌・死亡の記録から算出したKPIであり、生のセンサー値ではないため）。個々の記録（1回ごとの給餌・サンプリング等）はTechnical Managerの画面に留める。
- Farm間の数値を順位付け・比較する表示はしない（Farm Comparisonは対象外）。

### 11.2 認証画面（AU）

| 観点 | ルール |
| --- | --- |
| レイアウト | App Shellを持たない。Mist背景の中央に幅400のカード1枚。装飾的な画像・キャッチコピーは置かない |
| 操作 | 主要操作は全幅の Primary L（48）1つ。タブレットの現場でも押しやすくする |
| 言語 | ログイン前に右上で切り替えられる。ログイン後はユーザー設定を優先 |
| エラー | どの項目が違うかを示さない（「Email or password is incorrect」）。残り回数とロックの時間は示す |
| アカウントの有無 | 再設定メールの送信後は、登録の有無にかかわらず同じ文言にする |
| パスワード | 条件をチェックリストで入力中に示し、満たすまで確定ボタンを無効にする |

### 11.3 管理画面（AD）

| 観点 | ルール |
| --- | --- |
| 業務データ | センサー値・Alert・生産KPI・Reportは表示しない。機器は接続状態（Online / Offline）のみ |
| 編集の形 | 一覧 → Drawerで詳細・追加（一覧の文脈を保つ）。設定値はタブ内の表で直接編集し、まとめて保存する |
| 保存 | 判定に影響する設定は確認ダイアログで「適用範囲・適用開始・過去のデータは変わらない」を示す |
| 取り消せない操作 | 無効化は Danger の確認ダイアログを通す。削除は提供しない |
| 入力の矛盾 | 範囲の逆転などはその欄にエラーを表示し、保存ボタンを無効にする |
| 閾値の入力 | **境界値エディタ**：1つの欄に数値1つ。範囲（A–B）を入力させない。Low side（Critical・Warning・Attention < ）と High side（Attention・Warning・Critical > ）を左右に置き、Normal は中央に自動表示。使わない側は “Not used”。行の下に色帯と境界値のプレビューを出し、入力の結果を目で確かめられるようにする |
| 誰が変えたか | 設定・マスタの画面に「最終更新者・日時」を表示する |

### 11.4 Pond単位とFarm単位の表現

同じ画面にPondの値とFarmの値を並べるときは、データの性質（04 §4.1）で表現を決める。1つのFarmは約10池を想定する。

| 性質 | 表現 | ルール |
| --- | --- | --- |
| 積み重なる量・Daily（給餌・死亡） | **Pondごとの数値の表** | 最下行（tfoot）に合計。数値と同じ内容を繰り返すだけの横棒や構成比（Share）は置かない |
| 積み重なる量・Weekly（給餌・死亡） | **ドーナツグラフ ＋ Pondごとの数値の表（タブ内）** | ドーナツは週合計に占める割合。**全Pondを表示し、Othersにまとめない**。値の大きい順に同系色の濃→淡（最大10段）、凡例は1列の Pond・値・%（6池以上は行間を詰める）。中央に合計 |
| 状態の値（水質・検査） | **Pond×項目の表**（Weekly のみ） | Daily Report にはセンサー値を出さない（その日のAlertとセンサーデータへのリンクのみ）。Weekly の水質は Sensor Database から週次で自動集計した傾向（DO min・pH range・Temp max・範囲外の日数・Alert件数・Trend）。平均は出さない。範囲外の値は状態色＋アイコン |
| 観察・設備 | **Pondごとの一覧** | 注意以上のPondを先頭に並べ、Normalは Status Indicator で控えめに |
| Farm共通 | **1つの値** | Pondの表の中に混ぜない |

ドーナツの色：給餌は Mangrove Green、死亡は Slate の濃淡（08 §ドーナツ）。状態色は使わない（死亡＝異常と誤認させないため）。

**Pondが多くてもReportを短くする**（10池を想定）：

| 手法 | 使いどころ |
| --- | --- |
| **Ponds at a glance**（Pondタイル） | Daily の俯瞰。1池1枚、代表値4つ（Feed・Appetite・Mortality・Health）＋その日のAlertの1行。センサー値は出さない。注意以上は枠で強調 |
| **1つの表にまとめる** | 項目ごとに別の表（給餌・死亡・健康・設備）を並べず、Pondを行にした1つの表にする。TM Daily は行の Edit から Pond 単位の Drawer（摂餌・健康状態・観察）で入力 |
| **折りたたみ** | FM Daily の Pond details は初期で閉じる（俯瞰で足りない時だけ開く） |
| **タブ** | Weekly の Pond 別データは「Growth / Water quality trends / Feeding & mortality / Laboratory」のタブで1枚のカードにまとめる |
| **横に並べる** | 短いカード同士（Alerts と Actions、Growth グラフとドーナツ）は 6 : 6 で並べる |

### 11.5 日付の入力

日付はすべてカレンダー（Date Field）から選ぶ。表示形式は `DD MMM YYYY`。今日を枠で、選択中を Water Blue で示す。記録の日付は未来日を無効にし、予定日（次回サンプリングなど）だけ未来日を選べる。

### 11.6 自動で集まるReport（確認中心の入力）

Reportは人の運用業務を記録するもので、センサーの計測値を記録するものではない（§2 原則11、03_用語定義 §7）。

- **センサー値を入力・転記しない。** Daily Report に水質の欄（朝・夕の値など）は持たない。水質の履歴は Pond Detail › IoT / Water Quality にあり、Reportからはリンク（View Water Quality Data）で参照する。Weekly の Water quality trends は Sensor Database から自動集計し、TMは任意のコメントだけを加える。
- **Alert と対応は自動で参照する。** Major Alerts / Issues はその日（Weeklyはその週）のAlertをAlertシステムから取り込む。TMは項目を除外（Weekly は Cause / Action / Outcome を追記）できるが、値を入力し直さない。Actions Taken は Alert 対応の記録（Alert handling）と Actuator の操作（Actuator log）から自動で入り、手入力（Add action）を追加できる。ReportはAlertの前提ではない。
- 給餌・死亡・設備・生産KPIは記録から自動で集め、読み取り専用で表示する。「From records」「Alert handling」「Actuator log」等のタグで出どころを示す。値の修正は元の記録（Pond Detail）で行う。
- 画面上部に完成度のチェックリスト（Feeding · Mortality〔records〕／ Equipment〔auto〕／ Health〔任意〕／ Farm input〔Weather*・Summary*〕）を置き、残りの作業が分かるようにする。水質の項目は持たない。
- TMが入力するのは、観察（摂餌・トレイ、健康状態と観察項目。Daily は Pond ごとの Drawer）、Farm共通の項目（天候・降雨・環境上の出来事・発電機）、手入力の対応、所見（Technical Manager Summary* / Weekly Technical Summary*）だけ。所見がReportの存在理由であり、常に入力欄として表示する。

---

## 12. 多言語・日時・単位・数値

| 項目 | ルール |
| --- | --- |
| 言語 | TMの画面はインドネシア語が必須、FMはインドネシア語／英語の切替。ユーザーごとに保持し、ヘッダーから切り替える。プロトタイプは英語で作成 |
| 文言の長さ | インドネシア語は英語より約30%長くなる前提で、ボタン・列・タブの幅を固定しない |
| タイムゾーン | WIB（UTC+7）。ヘッダーのデータ鮮度に「WIB」を表示し、他の時刻表示では省略してよい |
| 日付 | `DD MMM YYYY`（例：29 Sep 2026）。期間は `22–28 Sep 2026`。同じ年の中では年を省略してよい（`28 Sep`） |
| 時刻 | `HH:mm`（24時間制） |
| 数値 | 桁区切りはカンマ（18,900）。小数の桁数は項目ごとに固定する |
| 単位と小数桁 | 項目ごとに固定する。一覧は 04_KPI・データ項目定義書 §3・§6.1（例：DO `mg/L` 小数1桁、水位 `cm` 整数、ABW `g` 小数1桁） |

---

## 13. アクセシビリティ

- テキストのコントラスト比は4.5:1以上、UI部品と状態の境界は3:1以上（§4.4）。
- 状態は「色＋ラベル」、範囲外の値は「色＋アイコン」で示す。
- キーボードだけで主要な操作を完了できる。フォーカスは常に見えるようにする。
- 入力欄にはラベルを付け、エラーはその入力欄と結び付けて表示する。
- グラフには凡例を付け、同じデータを表でも確認できるようにする。
- タッチ操作の対象は44px以上。
- 動きを減らす設定（prefers-reduced-motion）を尊重する。

---

## 14. レスポンシブ

| 幅 | 対象 | 方針 |
| --- | --- | --- |
| 1280px以上 | FM・TMのPC | 設計の基準（1440で作成） |
| 1024〜1279px | 小さいPC | サイドバーをアイコンだけに。KPIは3列に |
| 768〜1023px | TMのタブレット | 2列以下。Actuatorタイル・入力欄を1列に。操作バーは下に固定 |
| 767px以下 | 将来の対応 | 確認と入力だけに絞る |

ページ全体の横スクロールは起こさない。表だけ、カードの中で横スクロールさせる。

1280px で主要な表（FM Farm Status、TM Pond Status、Pond List、Report の表）が横スクロールなしで収まるよう、列は7〜12に抑える。セルの数値・名前は折り返さない（`white-space: nowrap`）。文章の列（Main reason・観察）だけ折り返す。

---

## 15. Figma原典からの変更点（Design System v2・確定）

Figma側は以下に合わせて更新する。

| # | 対象 | 変更内容 | 理由 |
| --- | --- | --- | --- |
| F1 | 01 Colors | Control Border `#7C8D93` を追加 | A1（入力欄の枠のコントラスト） |
| F2 | 01 Colors | 状態色の背景（8%）・枠線（35%）・選択中の背景を追加 | 淡い色の定義がない |
| F3 | 02 Typography | Display 24/33.6（数値専用）、Caption 12/16.8 を追加 | D1・D2 |
| F4 | 04 Grid | 列間隔 30 → **24**（確定）、列幅は可変 | D4（8pxの倍数に揃える） |
| F5 | 05 Spacing | 4px（部品内部専用）を追加、コントロール高さの尺度 24/32/40/48 を追加 | D3・D5 |
| F6 | 06 Buttons | **Secondary（緑）を削除**。Outlineのホバー → Mist背景＋Ink文字。Link（テキストボタン）を追加 | A2・C1 |
| F7 | 07 Inputs | 枠線を Control Border に | A1 |
| F8 | 08 Status | Status Indicator（点＋文字）を追加。レポート状態・対応状態・データ品質の系統を追加 | C3・D6 |
| F9 | 09 Selectors | Tabs、Segmented を追加 | D7 |
| F11 | 03 Iconography | AI・Analyticsを削除。Farms・Mortality・Sampling・Aerator・Pump・Generator・Trend（↓ / →）・Language等を追加し、5グループに再編 | 現行スコープに合わせる |
| F12 | 01 Colors | Data（グラフ用）とTints（補完色）のグループを追加。各色の用途を再定義 | C1・C2・F2 |
| F10 | 新規 10 Components | Card、KPI Card、Table、Alert Row、Chart、Dialog、Drawer、Toast、Notice、Empty / Loading / Error | D7 |

---

## 16. 未確定事項

| 論点 | 現時点の扱い |
| --- | --- |
| データ遅延のしきい値 | センサーは15分、レポートは提出期限で判定（仮） |
| 下書きの自動保存の間隔 | 30秒（仮） |
| 閾値の設定画面 | 現行スコープ外。変更の権限・承認の流れが決まってから設計する |
| 通知チャネル（Email / SMS / Push） | 未定。Web画面ではヘッダーではなくダッシュボードのActive Alertsに集約する |
| 1024px以下のレイアウト | 本書の方針のみ。プロトタイプは1440で作成 |
| ロゴ | システム名は AquaGuard で確定。ロゴは検討中のため、ダミーのマーク（盾＋波）で代用する（プロトタイプは `assets/layout.js` の `LOGO` のみ差し替えればよい） |
