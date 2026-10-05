# Frontend — Claude instructions

Before designing, building, or modifying any UI in `frontend/`, read the design documents in `docs/` in order:

| # | Document | Use it for |
| --- | --- | --- |
| 01 | `docs/01_業務要件書.md` | Business scope, roles, out-of-scope list, document map |
| 02 | `docs/02_ユーザー権限定義書.md` | Role boundary — what the Farms Manager / Technical Manager may see and do |
| 03 | `docs/03_用語定義.md` | Terms, statuses, value types |
| 04 | `docs/04_KPI・データ項目定義書.md` | KPI formulas, aggregation rules (no averaged ABW / ADG), units, thresholds, status rules |
| 05 | `docs/05_画面・機能要件書.md` | Screens, navigation, sections per screen (priority order), function IDs |
| 06 | `docs/06_画面構成ツリー.md` | Screen → section → component → state tree; prototype file mapping |
| 07 | `docs/07_UI・UX設計書.md` | UI/UX rules: color balance, size scale, Badge vs Indicator, interaction, states |
| 08 | `docs/08_デザインシステム定義書.md` | Design System v2 — exact tokens and component classes |

API contract with the backend: `../docs/api/openapi.yaml` (OpenAPI 3.1, drafted by frontend). KPIs and statuses are computed by the backend; live data is refetched every 5 minutes (`x-refresh-interval-seconds: 300`).

Rules:

- Lower numbers win on conflict (business / RBAC first). `docs/en/` is maintained separately — do not reference it.
- A section may appear on a screen only if it is listed in 05 / 06. Check every element against the role boundary in 02.
- Do not add AI Recommendation / AI Insights, Farm Comparison, Management Decision, harvest / profit / inventory forecasts, or commercial / sales functions.
- Use only the tokens and components in 08 (implemented in `prototype/assets/tokens.css` and `prototype/assets/app.css`). If something is missing, update 07 / 08 first — do not improvise inline styles.
- Use sample values from `prototype/mock_data.md` so the same Farm / Pond shows the same numbers on every screen.
- Label values as Actual / Estimated / Forecast. Never average ABW / ADG across Ponds or Farms (04 §4).
- When a requirement is ambiguous, record it in the "未確定事項" section of the relevant document instead of inventing a function.
- Update the documents first when a spec changes, then the prototype.
