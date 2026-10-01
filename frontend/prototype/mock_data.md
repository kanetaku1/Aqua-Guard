# Mock Data (canonical)

Prototype sample data. Rules for the values: `frontend/docs/04_KPI・データ項目定義書.md`.

All prototype screens use these values. "Now" = **29 Sep 2026 09:35 (WIB)**.

## Company & Farms

Company: **Nusantara Shrimp Co.** (fictional)

| Farm | Location | Ponds | Technical Manager | Status | Env. | Production | Operational | Open Issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Farm A | East Java, Indonesia | 8 | Sari Wijaya | Warning | Warning | Attention | Attention | 3 |
| Farm B | Lampung, Indonesia | 10 | Budi Santoso | Normal | Normal | Normal | Normal | 0 |
| Farm C | Banyuwangi, East Java | 6 | Dewi Lestari | Attention | Attention | Normal | Normal | 1 |
| Farm D | Lombok, West Nusa Tenggara | 8 | Agus Pratama | Critical | Critical | Warning | Attention | 2 |

Totals: 4 Farms · 32 Ponds · 6 open issues · Status count: Normal 1 / Attention 1 / Warning 1 / Critical 1.

## Production

Ponds are stocked on different dates, so ABW / ADG are **never** aggregated (04_KPI・データ項目定義書 §4). Latest sampling: **28 Sep 2026**.

### Company & Farm level (only aggregatable values)

| Farm | DOC range | Biomass (Est., sum) | Survival Rate (Est., weighted) | FCR (weighted) | Ponds behind growth target | Production status |
| --- | --- | --- | --- | --- | --- | --- |
| Farm A | 34–76 | 11.6 t | 88 % | 1.31 | 2 / 8 | Attention |
| Farm B | 30–85 | 22.1 t | 89 % | 1.25 | 0 / 10 | Normal |
| Farm C | 28–70 | 9.6 t | 82 % | 1.41 | 1 / 6 | Normal |
| Farm D | 25–72 | 12.3 t | 76 % | 1.55 | 4 / 8 | Warning |
| Company | — | **55.6 t** | — | — | **7 / 32** | — |

Previous week (21 Sep): Company biomass 51.7 t, behind 6 / 32. Farm A: biomass 10.2 t, SR 89 %, FCR 1.29, behind 2 / 8.

### Target growth curve (sample)

| DOC | 27 | 34 | 41 | 48 | 55 | 62 | 69 | 76 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Target ABW (g) | 5.3 | 7.4 | 9.5 | 11.5 | 13.3 | 15.0 | 16.6 | 18.2 |

vs Target = ABW ÷ target − 1. **Behind** ≤ −5 %, **Ahead** ≥ +5 %, otherwise **On track**.

### Farm A — Pond Production Summary (sampling 28 Sep)

| Pond | Area | Stocked | Stocked PL | DOC | ABW | Target | vs Target | ADG | SR (Est.) | FCR | Biomass (Est.) | Uniformity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pond 01 | 0.4 ha | 15 Jul 2026 | 120,000 | 76 | 18.0 g | 18.2 g | −1 % On track | 0.21 | 88 % | 1.38 | 1.90 t | 81 % |
| Pond 02 | 0.5 ha | 29 Jul 2026 | 150,000 | 62 | 13.8 g | 15.0 g | −8 % **Behind** | 0.21 | 84 % | 1.41 | 1.74 t | 75 % |
| Pond 03 | 0.4 ha | 22 Jul 2026 | 120,000 | 69 | 16.9 g | 16.6 g | +2 % On track | 0.23 | 89 % | 1.29 | 1.80 t | 82 % |
| Pond 04 | 0.4 ha | 5 Aug 2026 | 120,000 | 55 | 12.9 g | 13.3 g | −3 % On track | 0.23 | 87 % | 1.30 | 1.35 t | 79 % |
| Pond 05 | 0.5 ha | 29 Jul 2026 | 150,000 | 62 | 13.9 g | 15.0 g | −7 % **Behind** | 0.21 | 82 % | 1.44 | 1.71 t | 74 % |
| Pond 06 | 0.4 ha | 12 Aug 2026 | 120,000 | 48 | 11.8 g | 11.5 g | +3 % On track | 0.27 | 90 % | 1.21 | 1.27 t | 83 % |
| Pond 07 | 0.4 ha | 19 Aug 2026 | 120,000 | 41 | 9.4 g | 9.5 g | −1 % On track | 0.26 | 91 % | 1.15 | 1.03 t | 85 % |
| Pond 08 | 0.4 ha | 26 Aug 2026 | 120,000 | 34 | 7.6 g | 7.4 g | +3 % On track | 0.30 | 92 % | 1.10 | 0.84 t | 84 % |
| **Farm A** | 3.4 ha | — | 1,020,000 | 34–76 | — | — | 6 on track · 2 behind | — | **88 %** | **1.31** | **11.6 t** | — |

### Farm A — Pond Production Summary (sampling 21 Sep, Weekly Report 15–21 Sep)

| Pond | DOC | ABW | Target | vs Target | SR | FCR | Biomass | Uniformity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pond 01 | 69 | 16.5 g | 16.6 g | −1 % On track | 89 % | 1.36 | 1.76 t | 80 % |
| Pond 02 | 55 | 12.3 g | 13.3 g | −8 % Behind | 85 % | 1.38 | 1.57 t | 76 % |
| Pond 03 | 62 | 15.3 g | 15.0 g | +2 % On track | 90 % | 1.27 | 1.65 t | 82 % |
| Pond 04 | 48 | 11.3 g | 11.5 g | −2 % On track | 88 % | 1.28 | 1.19 t | 79 % |
| Pond 05 | 55 | 12.4 g | 13.3 g | −7 % Behind | 83 % | 1.42 | 1.54 t | 74 % |
| Pond 06 | 41 | 9.9 g | 9.5 g | +4 % On track | 91 % | 1.19 | 1.08 t | 83 % |
| Pond 07 | 34 | 7.6 g | 7.4 g | +3 % On track | 92 % | 1.13 | 0.84 t | 85 % |
| Pond 08 | 27 | 5.5 g | 5.3 g | +4 % On track | 93 % | 1.08 | 0.61 t | 84 % |
| **Farm A** | 27–69 | — | — | 6 on track · 2 behind | **89 %** | **1.29** | **10.2 t** | — |

Previous week (14 Sep): Farm A biomass 8.9 t, SR 90 %, FCR 1.27.

## Environmental / Pond Trends & Risk / Issue

| ID | Farm | Pond | Issue Type | Parameter | Trend | Severity | Duration | Handling State | Related Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ISS-218 | Farm A | Pond 02 | Water Quality | DO | ↓ Decreasing | Warning | 2 days | In Progress | Daily 28 Sep |
| ISS-221 | Farm A | Pond 05 | Water Quality | Temperature | ↑ Increasing | Warning | 4 hrs | Acknowledged | — |
| ISS-220 | Farm A | Pond 04 | Water Quality | pH | ↓ Decreasing | Attention | 6 hrs | Unacknowledged | — |
| ISS-219 | Farm C | Pond 03 | Water Quality | Turbidity | ↑ Increasing | Attention | 1 day | Acknowledged | Daily 28 Sep |
| ISS-214 | Farm D | Pond 06 | Water Quality | DO | ↓ Decreasing | Critical | 8 hrs | In Progress | Daily 28 Sep |
| ISS-212 | Farm D | Pond 06 | Mortality | Mortality | ↑ Increasing | Warning | 3 days | In Progress | Weekly 15–21 Sep |

## Farm A Ponds (Technical Manager view: Sari Wijaya)

Thresholds (boundary values, Normal between the Attention boundaries — 04 §6.2): DO Normal ≥ 5.0 (Attention < 5.0, Warning < 4.5, Critical < 3.5) · pH 7.5–8.5 · Temp 26.5–30.5 °C (Warning < 26 / > 31) · TDS 16,000–24,000 mg/L · Turbidity 25–60 NTU · Water Level 120–150 cm.

| Pond | Status | DO | pH | Temp | TDS | Turbidity | Level (cm) | Aerators | Active Alerts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pond 01 | Normal | 5.9 | 7.9 | 29.4 | 18,200 | 38 | 135 | 2/2 On | 0 |
| Pond 02 | Warning | 4.1 | 7.8 | 29.8 | 18,900 | 45 | 132 | 4/4 On | 1 |
| Pond 03 | Normal | 6.1 | 8.0 | 29.2 | 17,800 | 35 | 138 | 2/2 On | 0 |
| Pond 04 | Attention | 5.4 | 7.4 | 29.5 | 18,400 | 40 | 136 | 2/2 On | 1 |
| Pond 05 | Warning | 5.0 | 7.9 | 31.6 | 18,600 | 42 | 130 | 3/4 On | 1 |
| Pond 06 | Normal | 6.0 | 8.1 | 29.1 | 17,900 | 33 | 137 | 2/2 On | 0 |
| Pond 07 | Normal | 5.8 | 8.0 | 29.3 | 18,100 | 36 | 134 | 2/2 On | 0 |
| Pond 08 | Normal | 5.7 | 7.9 | 29.4 | 18,000 | — (offline) | 135 | 2/2 On | 1 |

Pond 02: Area 0.5 ha · Stocked 29 Jul 2026 · DOC 62 · Stocking 150,000 PL · ABW 13.8 g (see Pond Production Summary for all Ponds).

## Pond Alerts (Farm A)

| ID | Pond | Alert | Severity | Occurred | State |
| --- | --- | --- | --- | --- | --- |
| ALT-1042 | Pond 02 | DO below threshold (4.1 mg/L < 4.5) | Warning | 29 Sep 07:50 | Unacknowledged |
| ALT-1041 | Pond 05 | Temperature above threshold (31.6 °C > 31.0) | Warning | 29 Sep 05:40 | Acknowledged |
| ALT-1039 | Pond 04 | pH below threshold (7.4 < 7.5) | Attention | 29 Sep 03:30 | In Progress |
| ALT-1035 | Pond 08 | Turbidity sensor offline | Attention | 28 Sep 22:10 | Acknowledged |
| ALT-1030 | Pond 02 | DO below threshold (4.3 mg/L < 4.5) | Warning | 27 Sep 05:15 | Resolved |

## Reports (Farm A)

| Report | Date / Period | Status | Submitted |
| --- | --- | --- | --- |
| Daily | 29 Sep 2026 | Draft | — |
| Daily | 28 Sep 2026 | Submitted | 28 Sep 18:20 |
| Daily | 27 Sep 2026 | Submitted | 27 Sep 18:05 |
| Weekly | 22–28 Sep 2026 | Draft | — (due 29 Sep) |
| Weekly | 15–21 Sep 2026 | Submitted | 22 Sep 10:10 |

### Daily Report 28 Sep (Farm A) — operational records per Pond (no sensor values, no Farm averages)

Sensor data (every 3–5 min) is stored separately and is **not** part of a Report. Alerts are generated from sensor data independently of Reports; the report only references them.

| Pond | Feed kg | Rounds | Feed type | Appetite | Tray | Mortality pcs / kg | Health | Observation | Aerators on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pond 01 | 190 | 4 | Grower 2 | Good | Clean | 18 / 0.25 | Normal | — | 2 / 2 |
| Pond 02 | 152 | 4 | Grower 2 | Reduced | Leftover | 64 / 0.82 | Attention | Abnormal swimming — shrimp near the surface 05:30 | 4 / 4 |
| Pond 03 | 180 | 4 | Grower 2 | Good | Clean | 15 / 0.20 | Normal | — | 2 / 2 |
| Pond 04 | 140 | 4 | Grower 2 | Good | Clean | 22 / 0.28 | Normal | — | 2 / 2 |
| Pond 05 | 168 | 4 | Grower 2 | Reduced | Clean | 31 / 0.40 | Attention | Reduced appetite in the afternoon heat | 4 / 4 |
| Pond 06 | 150 | 4 | Grower 1 | Good | Clean | 12 / 0.15 | Normal | — | 2 / 2 |
| Pond 07 | 140 | 4 | Grower 1 | Good | Clean | 14 / 0.17 | Normal | — | 2 / 2 |
| Pond 08 | 120 | 4 | Grower 1 | Good | Clean | 10 / 0.13 | Normal | — | 2 / 2 |
| **Farm A** | **1,240** | | | 2 reduced | 1 leftover | **186 / 2.40** | 2 Attention | | — |

Alerts referenced on 28 Sep: Pond 02 DO below threshold (Warning, 05:20, 1 h 40 min, resolved) · Pond 05 Temperature above threshold (Attention, 14:10, 1 h 50 min, resolved) · Pond 08 Turbidity sensor offline (Attention, 22:10, ongoing).
Equipment event: Pond 08 turbidity sensor offline 22:10 — replacement requested.

Farm-wide: Weather Cloudy · Rainfall 4 mm · Light rain 13:00–14:00 · Generator standby (tested 07:00). Feed type Grower 2 (Ponds 01–05), Grower 1 (06–08), 4 rounds.

Weekly per-Pond totals — 15–21 Sep: feed 1,291 / 1,035 / 1,222 / 951 / 1,136 / 1,019 / 951 / 815 kg (8,420); mortality 101 / 191 / 89 / 113 / **308** / 97 / 115 / 106 pcs (1,120; Pond 05 peak 18 Sep). 22–28 Sep: feed 8,610 kg; mortality 107 / **241** / 95 / 123 / 179 / 85 / 102 / 104 pcs (1,036). Daily values per Pond are in the page scripts.

## Users (System Administrator view)

Company email domain: `nusantarashrimp.co.id`. Signed-in admin: **Yusuf Rahman**.

| Name | Role | Farm | Status | Last sign-in |
| --- | --- | --- | --- | --- |
| Yusuf Rahman | System Administrator | — | Active | 30 Sep 08:12 |
| Nadia Kurnia | System Administrator | — | Active | 26 Sep 14:03 |
| Hendra Kusuma | Farms Manager | All Farms | Active | 29 Sep 09:30 |
| Rina Hartono | Farms Manager | All Farms | Invited (28 Sep, expires 1 Oct) | — |
| Sari Wijaya | Technical Manager | Farm A | Active | 29 Sep 09:20 |
| Budi Santoso | Technical Manager | Farm B | Active | 29 Sep 08:55 |
| Dewi Lestari | Technical Manager | Farm C | Active | 29 Sep 07:40 |
| Agus Pratama | Technical Manager | Farm D | Active | 29 Sep 06:15 |
| Fajar Nugroho | Technical Manager | Farm D | Invited (29 Sep, expires 2 Oct) | — |
| Eko Wibowo | Technical Manager | Farm B | Deactivated | 12 Aug 17:22 |

A Technical Manager has exactly one Farm; a Farm may have more than one Technical Manager.

## Farm / Pond / Device master

| Farm | Location | Ponds | Status | Devices online |
| --- | --- | --- | --- | --- |
| Farm A | East Java, Indonesia | 9 (8 in operation, Pond 09 fallow) | Active | 70 / 71 (A-P08-TRB offline) |
| Farm B | Lampung, Indonesia | 10 | Active | 88 / 88 |
| Farm C | Banyuwangi, East Java | 6 | Active | 53 / 53 |
| Farm D | Lombok, West Nusa Tenggara | 8 | Active | 69 / 71 |
| Farm E | Sumbawa, West Nusa Tenggara | 0 | Inactive (being set up) | — |

Farm A devices: 48 sensors (6 per operating Pond: DO, pH, Temperature, TDS, Turbidity, Water Level) + 23 actuators (20 aerators, 3 pumps). Device ID format: `A-P02-DO`, `A-P02-AER1`, `A-P02-PMP1`.
Aerators / pumps per Pond: 02 and 05 = 4 + 1 pump, 08 = 2 + 1 pump, others = 2.

Settings last updated 2 Sep 2026 by Yusuf Rahman. Farm D has a DO threshold override.

### Weekly sampling (TM-02 batch entry)

Sampled 28 Sep: 8 of 8 Ponds (see Pond Production Summary). Next sampling 5 Oct — prototype shows it in progress: Pond 01 100 pcs / 1,930 g → 19.3 g (−2%), Pond 02 100 / 1,480 → 14.8 g (−10% Behind), Pond 03 100 / 1,810 → 18.1 g (+1%); Ponds 04–08 not yet sampled. Target at DOC 82 / 68 / 75 = 19.6 / 16.4 / 18.0 g (interpolated / extrapolated from the curve).

### Laboratory per Pond (recorded with weekly sampling)

| Pond | 21 Sep: TAN / NO2 / Vibrio ×10³ / Alk. | 28 Sep: TAN / NO2 / Vibrio ×10³ / Alk. |
| --- | --- | --- |
| Pond 01 | 0.3 / 0.10 / 3.1 / 138 | 0.4 / 0.12 / 3.5 / 135 |
| Pond 02 | 0.6 / 0.18 / **6.2** / 130 | 0.8 / 0.22 / **7.2** / 128 |
| Pond 03 | 0.3 / 0.09 / 2.8 / 140 | 0.4 / 0.10 / 3.0 / 138 |
| Pond 04 | 0.4 / 0.12 / 4.0 / 126 | 0.5 / 0.14 / 4.4 / 118 |
| Pond 05 | 0.5 / 0.15 / **8.5** / 132 | 0.6 / 0.17 / **6.8** / 130 |
| Pond 06 | 0.2 / 0.08 / 2.2 / 142 | 0.3 / 0.09 / 2.5 / 140 |
| Pond 07 | 0.3 / 0.10 / 3.0 / 139 | 0.3 / 0.11 / 3.2 / 137 |
| Pond 08 | 0.3 / 0.11 / 2.6 / 137 | Pending (expected 30 Sep) |

Bold = Attention (Vibrio ≥ 5 × 10³ CFU/mL).
