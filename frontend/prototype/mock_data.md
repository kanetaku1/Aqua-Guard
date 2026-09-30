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

Thresholds: DO ≥ 4.5 mg/L (Critical < 3.5) · pH 7.5–8.5 · Temp 26–31 °C · TDS 15,000–25,000 mg/L · Turbidity 25–60 NTU · Water Level 120–150 cm.

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

Daily Report 28 Sep (Farm A): DO 6.2 / 5.8 mg/L · pH 7.9 / 7.8 · Temp 28.1 / 28.4 °C · Salinity 15 / 15 ppt (morning / evening) · Secchi 38 cm · Water Level 134 cm · Total Feed 1,240 kg · 4×/day · Grower 2 (2.0 mm) · Mortality 186 pcs / 2.4 kg.
