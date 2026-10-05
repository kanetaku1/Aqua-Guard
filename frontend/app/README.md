# AquaGuard Web (React)

Vite + React + TypeScript. Design docs: `../docs/01〜08`, latest design: `../img/wireframe` (Figma, wins over `../prototype`), API contract: `../../docs/api/openapi.yaml` (shared, read-only for the frontend) + frontend additions in `api/openapi.frontend.yaml` (see `api/OPENAPI_CHANGES.md`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev:mock` | Dev server with the API served by MSW (`src/mocks`) — no backend needed |
| `npm run dev` | Dev server; `/api` is proxied to the backend at `http://localhost:8000` |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` after changing `api/openapi.frontend.yaml` (then `python tools/spec_diff.py`) |
| `npm test` | Vitest (jsdom + MSW) |
| `npm run lint` / `npm run build` | oxlint / type check + production build |

### Mock sign-in (`dev:mock`)

Password `password123` for every user:

| Email | Role | First screen |
| --- | --- | --- |
| `sari.wijaya@nusantarashrimp.co.id` | Technical Manager (Farm A) | TM-01 Dashboard |
| `hendra.kusuma@nusantarashrimp.co.id` | Farms Manager | FM-01 (placeholder) |
| `yusuf.rahman@nusantarashrimp.co.id` | System Administrator | AD-01 (placeholder) |
| `eko.wibowo@nusantarashrimp.co.id` | deactivated | — |

Five wrong passwords lock the account for 15 minutes. Set Password links: `/set-password?token=invite-demo` · `reset-demo` · `expired-demo`. Sign out: `/logout`.
The mock clock is fixed at 29 Sep 2026 09:35 WIB (`VITE_MOCK_NOW`) so labels match `prototype/mock_data.md`.

## Structure (`src/`)

| Path | Contents |
| --- | --- |
| `api/` | Generated types, `client.ts` (openapi-fetch), `queries/` (TanStack Query hooks). Live data refetches every 5 min (`refresh.ts`) |
| `auth/` | Role guard (`RequireRole`), Role → home path |
| `layout/` | Global Header, Role sidebar (`nav.ts`), auth layout |
| `components/` | Thin wrappers over the design-system classes (`StatusMark`: Normal = Indicator, others = Badge) |
| `pages/` | Screens. `screens.ts` lists every screen; unbuilt ones render `Placeholder` |
| `lib/format.ts` | WIB date / time and number formatting |
| `i18n/` | `en.json` (base) and `id.json` (missing keys fall back to English) |
| `mocks/` | MSW handlers and data from `prototype/mock_data.md` |

## Rules

- Styles: only the classes in `../prototype/assets/tokens.css` and `app.css` (imported directly in `main.tsx`, one source shared with the prototype). Missing styles → update 07 / 08 first.
- KPIs and statuses come from the backend; the frontend only displays them. Never average ABW / ADG.
- Adding a screen: build the page from its prototype file, register it in `PAGES` (`src/app/routes.tsx`), add MSW handlers and a test with the `mock_data.md` values.
