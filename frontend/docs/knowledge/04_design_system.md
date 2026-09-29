# 04. Design System (implementation spec)

**Design System v2** — the single source of truth for visual design (based on the Figma "UI Style Guidelines", revised and approved 2026-09-29).

- **Usage rules and rationale:** `frontend/docs/UI・UX設計書.md` (§ numbers below refer to it)
- **Implementation:** `prototype/assets/tokens.css` (tokens) · `prototype/assets/app.css` (components) · `prototype/design-system.html` (visual reference)

One design system for all screens and both roles. **Do not create per-screen styles.** Change order: UI・UX設計書 → this file → tokens.css / app.css → screens. The Figma file follows this definition.

## 01. Colors

| Token | Value | Role |
| --- | --- | --- |
| `--color-water-blue` (= primary) | `#087EA4` | Primary button, link, selected state, focus, sensor series, In Progress |
| `--color-deep-water` | `#075985` | Global header, primary hover, toast |
| `--color-mangrove` | `#2F855A` | Data color: actual / growth / feeding chart series only |
| `--color-mist` | `#F4F8F7` | Page background, table header, read-only input, unit chip, tags |
| `--color-white` | `#FFFFFF` | Cards, tables, forms, overlays |
| `--color-ink` | `#18323B` | Text, headings, key numbers |
| `--color-slate` | `#5B7078` | Secondary text, units, timestamps, table header text |
| `--color-tide-line` | `#D6E3E5` | Dividers and card/table borders (decorative only) |
| `--color-control-border` | `#7C8D93` | Borders of inputs, selects, checkboxes, radios, outline buttons (3.45:1, §3.1 A1) |
| Status | Green `#237A57` · Attention `#A15C00` · Orange `#B54708` · Red `#B42318` · Blue `#1769AA` | Status meaning only; Status Blue only for info notices |
| Tints | status bg 8 % · status border 35 % · selected `#E1F0F4` · row hover `#F9FBFB` · focus ring `#C1DEE8` | See tokens.css |

Color balance (§4.3): neutral ≈ 85 %, text ≈ 10 %, brand ≤ 5 %, status only in proportion to exceptions. Charts: max 2 series colors (Water Blue sensor, Mangrove actual) + Slate dashed target + Orange dashed threshold with warning-tint band.

## 02. Typography

Inter (+ Noto Sans JP fallback). Weights 400 / 700 only. Line height 1.4×. `tabular-nums` for numbers.

| Token | Size / Line | Use |
| --- | --- | --- |
| `--fs-display` | 24 / 33.6 Bold | KPI value, sensor current value, status count — **numbers only** |
| `--fs-large` | 20 / 28 Bold | Page title |
| `--fs-medium` | 18 / 25.2 Bold | Section label outside cards, dialog title |
| `--fs-normal` | 16 / 22.4 | Card title (Bold); input value, nav, tabs (Regular) |
| `--fs-small` | 14 / 19.6 | Body, table cell (Regular); button, badge, label (Bold) |
| `--fs-helper` (Caption) | 12 / 16.8 | Helper text, captions, timestamps (Regular); table header (Bold) |

Max 3 text sizes inside one card. Units are one step smaller and Slate. No ALL CAPS in screens.

## 03. Iconography

Lucide outline icons, stroke 1.75. Sizes: 16 inline · 20 nav / large button · 24 tiles & empty states · 40 frame (30 live + 5 safe) standalone.

| Group | Icons |
| --- | --- |
| Navigation | Dashboard `layout-dashboard` · Farms `warehouse` · Ponds `waves` · Reports `file-text` · Sensor `activity` · Company `building-2` |
| Pond metrics | Temperature `thermometer` · pH `beaker` · DO `wind` · TDS `gauge` · Turbidity `eye` · Water Level `ruler` |
| Operations & equipment | Feeding `utensils` · Mortality `clipboard-list` · Sampling `scale` · Aerator `fan` · Pump `droplets` · Generator `zap` |
| Status & trend | Normal `circle-check` · Alert `triangle-alert` · Critical `circle-alert` · Increasing `trending-up` · Decreasing `trending-down` · Stable `arrow-right` |
| Interface actions | Search · Filter `sliders-vertical` · Add `plus` · Edit `pencil` · Save · Submit `send` · Back `arrow-left` · Close `x` · Language `globe` · Date `calendar` · Time `clock` · Info `info` |

The Figma guideline's AI and Analytics icons are removed (out of scope).

## 04. Grid

| Frame | Columns | Gutter | Margin |
| --- | --- | --- | --- |
| Desktop 1440 | 12 | 24 | 32 (content 1144 = 1440 − sidebar 232 − 32 × 2) |
| Desktop 1024 | 12 | 24 | 24 |
| Tablet 768 | 6 | 24 | 24 |

Columns are fluid. Header 60, sidebar 232.

## 05. Spacing, size scale, radius, elevation

- Spacing: `--space-0` 4 (inside components only) · 8 · 16 · 24 · 32 · 40. No 12 / 20 / 30.
- **Control height scale**: XS 24 · S 32 · M 40 · L 48.

| Element | Size |
| --- | --- |
| Button | S 32 · M 40 · L 48 |
| Input / Select / Sidebar item / Table header row | M 40 |
| Table row | L 48 (compact M 40) |
| Tab | L 48 |
| Segmented / Pagination / small button | S 32 |
| Status Badge | 28 (lg 32 in page header, xs 24 in tiles) |
| Tags (value type, source), link action | XS 24 |
| Card header | min 64 · Alert row min 64 |

- Radius: 4 (checkbox, pagination, tags) · 8 (cards, buttons, inputs, badges, overlays).
- Elevation: no shadow on cards; one overlay shadow. z-index: header 20 · dropdown 30 · overlay 50 · toast 60.

## 06. Buttons

Four variants: Primary · Outline · Danger · Link (the green Secondary button was removed in v2).


| Variant | Use |
| --- | --- |
| Primary | One per area: Submit, Save Record, Acknowledge, Turn On |
| Outline | Cancel, Save Draft, Turn Off, Return to Auto, Clear. Hover = Mist bg + Ink text (§3.1 A2) |
| Danger | Destructive / safety confirmation, inside dialogs only |
| Link | View, View All →, Detail (Water Blue text, XS 24) |

Order: most important on the right, Cancel to its left. Icons 16 on the left. Disabled buttons need a reason (helper text).

## 07. Inputs

M 40, White, 1 px **Control Border**, radius 8, value 16 Regular. Label above (14 Bold, required `*` in Status Red). Helper / error below (12). Focus: 2 px Water Blue + ring. Error: 2 px Status Red + message. Disabled / read-only: Mist. Number field: unit chip inside on the right. Values referenced from the database: read-only + source tag.

## 08. Status

| Family | Values | Colors |
| --- | --- | --- |
| Severity | Normal < Attention < Warning < Critical | Green / Attention / Orange / Red |
| Report | Draft → Submitted | Slate / Green |
| Alert handling | Unacknowledged → Acknowledged → In Progress → Resolved | Red / Slate / Water Blue / Green |
| Data quality | Live · Delayed · Offline · No data | Green / Attention / Red / Slate |

Two presentations (§8.2):

| Component | Class | Use |
| --- | --- | --- |
| **Status Badge** | `.badge .badge--{status}` | Primary status of an entity when **Attention or worse**; Draft; page-title status (lg); status legends / counts |
| **Status Indicator** | `.status-text .st--{status}` | **Normal** primary status, secondary statuses (environmental / production / operational breakdown), alert handling state (`.badge--state` renders as indicator), Submitted, equipment / sensor states |

Out-of-range values: `.val-warning` / `.val-attention` / `.val-critical` = status color + bold + alert icon (§8.3).

## 09. Selectors

Checkbox / Radio (20, Control Border, Water Blue when on) · Toggle (off = Control Border) · DropDown (M 40; selected option = Water Blue) · Pagination (S 32) · Tabs (L 48 underline, count badge in Status Orange) · Segmented (S 32, active = Water Blue).

## Components

| Component | Class | Rules |
| --- | --- | --- |
| Global Header | `.gh` (layout.js) | Deep Water · brand · scope · **Live** indicator + sync time WIB · language (EN/ID) · user |
| Sidebar | `.sb` | Items M 40, 16 Regular + 20 icons; active = selected tint + Water Blue Bold |
| Page Header | `.page-header` | Breadcrumb → title (+ lg badge) → meta → ≤ 2 actions. "Last updated" only on entity pages (Farm / Pond / Report) |
| Card | `.card` | Header min 64 (16 Bold title + caption), body padding 24 |
| KPI Card | `.kpi` | Name (14 Slate) + value type tag (XS) · value (Display 24) + unit · comparison (neutral color) · updated. Max 6 per row |
| Table | `.table` | Header M 40 · rows L 48 · numbers right · Link action at row end |
| Alert Row | `.alert-row` | 4 px severity bar · title · meta · severity badge + handling indicator · action |
| Time-series Chart | `charts.js` | See 01 chart colors; gaps for missing data |
| Form | `.form-grid` | 2 columns in a card; Primary bottom-right, Outline left of it |
| **Action Bar** | `.action-bar` | Sticky bottom bar on long forms: Draft badge + save state · Save Draft (Outline) · Submit (Primary) |
| Notice | `.notice` / `--warning` | Info (Status Blue) / warning (Orange) context such as Safety Layer |
| Confirmation Dialog | `.dialog` | 480, question title, consequence, constraint box (Mist), Outline Cancel + verb button |
| Drawer | `.drawer` | Right 480, detail without losing list context |
| Toast | `.toast` | Bottom-right 360, Deep Water, result of an action only |
| **Empty / Loading / Delayed** | `.empty` · `.skeleton` · `.value-delayed` | Reason + next action; skeleton instead of stale values; "Delayed · 09:10" tag |
| Tags | `.kpi-type` · `.source-tag` | XS 24, Mist + Slate (never link-blue) |
