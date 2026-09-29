# Frontend Knowledge Base

UIデザイン・実装が設計からぶれないための「正」となる知識集。
Claude（および人）がUIを作成・修正する前に、必ず全ファイルを読むこと。

## ファイル構成

| File | 内容 |
| --- | --- |
| [01_product_and_roles.md](01_product_and_roles.md) | プロダクト概要・Role定義・Role境界・データ関係 |
| [02_information_architecture.md](02_information_architecture.md) | 画面構成・ナビゲーション・画面一覧（Screen ID / ファイル対応） |
| [03_screen_specs.md](03_screen_specs.md) | 画面ごとの目的・情報優先度・セクション構成 |
| [04_design_system.md](04_design_system.md) | デザイントークン・共通コンポーネント・Status体系・レイアウト |
| [05_guardrails.md](05_guardrails.md) | 追加してはいけないもの・デザイン哲学・判断ルール |
| [06_mock_data.md](06_mock_data.md) | 全画面で共通使用するサンプルデータ（数値の整合性を保つ） |

## ドキュメントの優先順位

1. `frontend/docs/knowledge/*`（本ディレクトリ・最新）＋ `UI・UX設計書.md`（v2.0：UI/UXの判断基準）
2. `画面・機能要件一覧.md`
3. `ユーザー権限定義書（RBAC）.md` / `業務要件書.md` / `用語定義.md`

- `UI・UX設計書.md` は v2.0（2026-09-29）で全面改訂済み。色・サイズ・部品の「使い方」の根拠はこちらを参照する。`en/ui_ux_design.md` は旧版のまま。
- 上位ドキュメント間で矛盾がある場合は本ディレクトリを正とする。
  例: RBACには AI Recommendation / Farm間比較 の記載があるが、現行UIスコープでは**対象外**（[05_guardrails.md](05_guardrails.md)）。

## 実装物

- Web Prototype: [`frontend/prototype/`](../../prototype/README.md)
  - `index.html` … 全画面のカタログ
  - `design-system.html` … トークン・コンポーネント一覧
  - `screens/*.html` … 各画面（1440px幅, html.to.design でFigmaへ取り込む）

## 更新ルール

- 仕様変更は先に本ディレクトリを更新し、その後プロトタイプに反映する。
- 新しいStatus・コンポーネント・色を追加する場合は、必ず [04_design_system.md](04_design_system.md) を先に更新する。
- 未確定事項は各ファイルの「Open Questions」に記載する。
