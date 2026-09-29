# 05. Guardrails

## 1. Do NOT add (unless requirements are explicitly changed)

- AI Recommendation / AI Insights (no "AI Insights" card just because the project uses Agentic SDLC)
- Management Decision screens
- Farm Comparison
- Buyer Matching, Buyer Contracts
- Market Price Simulation, Sales Strategy, Revenue Optimization
- International Sales, Transportation / Export Management
- Harvest recommendation date, profit forecast, inventory forecast
- Raw sensor monitoring or Actuator control for Farms Manager
- Acknowledge / Resolve / Edit actions for Farms Manager
- Generic SaaS features (global search, chat, onboarding tours, upgrade banners)

Note: older docs (RBAC, 用語定義, 業務要件書) mention AI Recommendation, health score, harvest date, Farm comparison. These are **out of the current UI scope**.

## 2. Design philosophy

It must feel like a professional aquaculture operations management system, not a generic AI dashboard.

Avoid: decorative charts, AI cards, gradient hero sections, unnecessary animation, excessive KPI cards, large marketing headings.

Prioritize: information hierarchy · operational clarity · status visibility · data readability · role separation · consistent components · efficient navigation.

## 3. Decision rules for Claude

1. Before building/modifying UI, read all files in `frontend/docs/knowledge/`.
2. A section may appear only if it is listed in [03_screen_specs.md](03_screen_specs.md).
3. Check every element against the Role Boundary table in [01_product_and_roles.md](01_product_and_roles.md).
4. Use only tokens and components from [04_design_system.md](04_design_system.md). If something is missing, propose an addition to 04 first — do not improvise inline styles.
5. Use sample values from [06_mock_data.md](06_mock_data.md) so the same Farm/Pond shows the same numbers on every screen.
6. Label values as Actual / Estimated / Forecast where relevant.
7. When a requirement is ambiguous, record it under "Open Questions" below rather than inventing a function.

## 4. Open Questions

| # | Question | Current assumption |
| --- | --- | --- |
| 1 | Figma file sync | Design System v2 (04) is approved; update the Figma UI Style Guidelines to match (UI・UX設計書 §15) |
| 2 | "Status" column in Environmental / Pond Trends | Shows alert handling state (Unacknowledged / Acknowledged / In Progress / Resolved) |
| 3 | Farm Detail → Pond anomaly → Pond Detail | Treated as cross-role relation; FM UI has no link to TM Pond Detail |
| 4 | Farm Overall Status derivation rule | Worst severity among open issues |
| 5 | KPI formulas (ABW, ADG, SR, FCR, Biomass) | Defined later by business rules; SR and Biomass labeled Estimated |
| 6 | Water-quality thresholds per parameter | Sample thresholds in 06 |
