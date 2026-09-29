# Frontend — Claude instructions

Before designing, building, or modifying any UI in `frontend/`, read every file in `docs/knowledge/` (start with `docs/knowledge/README.md`).

- The knowledge base is the source of truth, together with `docs/UI・UX設計書.md` v2.0 (UI/UX rules: color balance, size scale, Badge vs Indicator, states). `docs/en/ui_ux_design.md` is outdated — do not reference it.
- Stay within the screens, sections, and role boundaries defined there. Do not add AI Recommendation / AI Insights, Farm Comparison, Management Decision, or commercial/sales functions.
- Use only the tokens and components in `docs/knowledge/04_design_system.md` (implemented in `prototype/assets/tokens.css` and `prototype/assets/app.css`).
- Use sample values from `docs/knowledge/06_mock_data.md`.
- Update the knowledge base first when a spec changes, then the prototype.
