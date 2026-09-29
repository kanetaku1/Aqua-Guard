# 02. Information Architecture

## 1. Structure per Role

```text
Farms Manager                     Technical Manager
├── Dashboard                     ├── Dashboard
├── Farms                         ├── Ponds
│   ├── Farm List                 │   ├── Pond List
│   └── Farm Detail               │   └── Pond Detail
└── Reports                       │       ├── IoT / Water Quality
    ├── Daily Reports             │       ├── Alerts
    ├── Weekly Reports            │       ├── Feeding
    └── Report Detail             │       ├── Mortality
        (Daily / Weekly)          │       ├── Sampling
                                  │       └── Actuator
                                  └── Reports
                                      ├── Daily Report  (Create/Edit · History)
                                      └── Weekly Report (Create/Edit · History)
```

Sidebar items — Farms Manager: `Dashboard / Farms / Reports`. Technical Manager: `Dashboard / Ponds / Reports`. Sidebar is identical on every page of the same role.

## 2. Navigation Flow

```text
FM:  Dashboard → Farm List → Farm Detail → Recent Report → Report Detail
     Dashboard → (Farm row) → Farm Detail
     Reports → Report List → Report Detail

TM:  Dashboard → Pond List → Pond Detail (tabs)
     Dashboard → (Alert row / Pond card) → Pond Detail
     Reports → Daily / Weekly Report (Create · Edit · Submit · History)
```

Farm Detail → Pond anomaly → Pond Detail is a **cross-role relationship** (the anomaly the FM sees is investigated by the TM in Pond Detail). The FM UI does **not** link into TM screens; the FM never sees raw sensor data.

Rule: create a new screen only when the user needs a different level of information or a different operational task. Sub-areas of one task use tabs within the same screen (Pond Detail, Reports type).

## 3. Screen Index

| ID | Screen | Role | Prototype file |
| --- | --- | --- | --- |
| FM-01 | Dashboard | FM | `screens/fm-dashboard.html` |
| FM-02 | Farm List | FM | `screens/fm-farms.html` |
| FM-03 | Farm Detail | FM | `screens/fm-farm-detail.html` |
| FM-04 | Reports List (Daily / Weekly tab) | FM | `screens/fm-reports.html` (`?type=weekly`) |
| FM-05 | Daily Report Detail | FM | `screens/fm-daily-report.html` |
| FM-06 | Weekly Report Detail | FM | `screens/fm-weekly-report.html` |
| TM-01 | Dashboard | TM | `screens/tm-dashboard.html` |
| TM-02 | Pond List | TM | `screens/tm-ponds.html` |
| TM-03 | Pond Detail (6 tabs) | TM | `screens/tm-pond-detail.html?tab=iot\|alerts\|feeding\|mortality\|sampling\|actuator` |
| TM-04 | Daily Report (Create/Edit · History) | TM | `screens/tm-daily-report.html` (`?tab=history`) |
| TM-05 | Weekly Report (Create/Edit · History) | TM | `screens/tm-weekly-report.html` (`?tab=history`) |
| DS | Design System | — | `design-system.html` |

State variants for Figma import: `tm-pond-detail.html?tab=actuator&dialog=1` (Confirmation Dialog), `tm-pond-detail.html?tab=alerts&drawer=1` (Alert Detail Drawer).

## 4. Functional ID mapping

Screen function IDs (FM-D-001 …, TM-PD-001 …) are defined in `画面・機能要件一覧.md`. Each screen spec in [03_screen_specs.md](03_screen_specs.md) lists which IDs it covers.
