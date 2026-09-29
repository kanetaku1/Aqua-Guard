# 03. Screen Specifications

Every screen uses the shared shell (Global Header + role Sidebar + Page Header + Content). Sections are listed in **display priority order**.

---

## FM-01 Dashboard

Purpose: understand all Farms and answer **"Which Farm should I look at?"**
Covers: FM-D-001 … FM-D-006

1. **Farm Status Summary** — count per status (Normal / Attention / Warning / Critical) + Farm status table (Farm, Status, Production, Open Issues, Updated → Farm Detail)
2. **Risk / Issue Summary** — open Farm-level issues across Farms (Alert Row style, read-only)
3. **Production Status Summary** — company-level KPI Cards (Biomass, Avg. Survival Rate, Avg. FCR, Avg. ABW)
4. **Environmental / Pond Trend Summary** — aggregated trends (Farm, Pond, Parameter, Trend, Severity, Duration)
5. **Recent Reports** — latest Daily / Weekly Reports from all Farms

## FM-02 Farm List

Purpose: select a Farm and understand its high-level condition. Covers: FM-F-001 … 004

1. Page Header
2. Search / Filter (Search, Status, Location)
3. Farm Summary (status counts)
4. Farm List table — `Farm | Status | Production | Risk / Issue | Pond Trend | Updated | Action`

No detailed IoT sensor values.

## FM-03 Farm Detail (primary FM screen)

Purpose: understand what is happening in the selected Farm. Integrated overview, **not a raw-data screen**. Covers: FM-FD-001 … 013

1. **Farm Header** — Farm Name, Status, Location, Technical Manager, Last Updated
2. **Farm Status** — Overall / Environmental / Production / Operational Status + Status Trend (last 14 days status strip)
3. **Environmental / Pond Trends** — table `Pond | Parameter | Trend | Severity | Duration | Status` (Status = alert handling state). Never raw time-series.
4. **Production Status** — KPI Cards: Biomass, ABW, ADG, Survival Rate, FCR + Growth Trend chart (ABW weekly, Actual vs Target)
5. **Risk / Issue** — Issue Type, Severity, Affected Pond, Status, Related Report, Occurrence / Duration; row opens issue detail (read-only)
6. **Recent Reports** — latest 3 reports, "View All →" to Reports

## FM-04 Reports List

Purpose: review what the Technical Manager reported. **Read-only.** Covers: FM-R-001, 003, 004, 006

- Report Type tabs: Daily / Weekly
- Filters: Search, Farm, Date / Reporting Period, Status
- Table: `Date (Period) | Farm | Technical Manager | Status | Issues | Submitted | Action(View)`
- FM sees only submitted reports (Drafts are TM-only).

## FM-05 Daily Report Detail

Purpose: understand what happened in the Farm on a particular day. Covers: FM-R-002

1. Report Header — Daily Report, Farm, Date, Technical Manager, Status
2. Report Summary — key facts (overall condition, issues count, mortality, feed)
3. Water Quality — Morning / Evening table (DO, pH, Temperature, Salinity) + Secchi Depth, Water Level
4. Feeding — Total Feed, Frequency, Feed Type, Appetite / Tray Status
5. Mortality — Total Count, Total Weight, Pond-level records
6. Health Condition — TM observations
7. Environment / Equipment — Weather, Rainfall, Aerator, Pump, Generator
8. Alerts / Issues — referenced issues (**no Acknowledge / Resolve / Edit**)
9. Actions Taken
10. Technical Manager Summary (narrative)

## FM-06 Weekly Report Detail

Purpose: understand how the Farm progressed during the week. **Trend-oriented**, not 7 daily reports. Covers: FM-R-005

1. Report Header (period)
2. Report Summary
3. Production Status — KPI Cards: Biomass, ABW, ADG, Survival Rate, FCR, Size Uniformity + Growth Trend
4. Water Quality Trends — weekly min/avg/max per parameter + daily avg chart (daily granularity is report data, not raw stream)
5. Laboratory Results — TAN, NO2, Vibrio, Alkalinity
6. Feeding Summary
7. Mortality Summary
8. Major Alerts / Issues
9. Major Actions
10. Weekly Technical Summary

---

## TM-01 Dashboard

Purpose: identify which Pond needs attention. Covers: TM-D-001 … 006

1. **Pond Status** — Pond cards grid (status, DO / pH / Temp current, active alerts)
2. **Active Alerts** — Alert Rows (unresolved), link to Pond Detail › Alerts
3. **Water Quality Status** — parameter × status matrix across ponds
4. **Operational Status** — aerators running, feeding completed today, sampling due, sensors online
5. **Report Status** — today's Daily Report, this week's Weekly Report

## TM-02 Pond List

Covers: TM-P-001 … 004. Filters (Search, Status, Alert). Table: `Pond | Status | Alert Status | DO | pH | Temp | Operational Status | Updated | Action`.

## TM-03 Pond Detail

Purpose: investigate and technically manage a Pond. Header: Pond name, Farm, Status, DOC, Area, Stocking date. Tabs:

| Tab | Content | IDs |
| --- | --- | --- |
| IoT / Water Quality | Current sensor values (DO, pH, Temp, TDS, Turbidity, Water Level) with threshold & sensor status; time-series chart (parameter + range selector, threshold band); anomaly list; historical data table | TM-PD-001 … 005 |
| Alerts | Alert table with state (Unacknowledged / Acknowledged / In Progress / Resolved); Acknowledge action; Alert detail in Drawer | TM-PD-006 … 009 |
| Feeding | Record form + history table + edit | TM-PD-010 … 012 |
| Mortality | Record form + history table + edit | TM-PD-013 … 015 |
| Sampling | Record form + history table + edit | TM-PD-016 … 018 |
| Actuator | Actuator status cards (mode Auto/Manual, On/Off), control with Confirmation Dialog, Safety Layer notice, control history | TM-PD-019 … 021 |

Actuator constraints: TM only; Safety Layer limits apply; manual control while in Auto mode requires Human Override.

## TM-04 / TM-05 Daily & Weekly Report

Tabs: **Create / Edit** and **History**.
- Form sections mirror FM-05 / FM-06 exactly (same order, same labels) so what TM submits = what FM reads.
- Values referenced from the database are pre-filled and labeled ("From sensor data", "From records"); TM may adjust.
- Actions: Save Draft, Submit (Confirmation Dialog). Status: Draft → Submitted.
- History: table of past reports with status; submitted reports are view-only.
