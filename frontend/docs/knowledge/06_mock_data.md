# 06. Mock Data (canonical)

All prototype screens use these values. "Now" = **29 Sep 2026 09:35 (WIB)**.

## Company & Farms

Company: **Nusantara Shrimp Co.** (fictional)

| Farm | Location | Ponds | Technical Manager | Status | Env. | Production | Operational | Open Issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Farm A | East Java, Indonesia | 8 | Sari Wijaya | Warning | Warning | Normal | Attention | 3 |
| Farm B | Lampung, Indonesia | 10 | Budi Santoso | Normal | Normal | Normal | Normal | 0 |
| Farm C | Banyuwangi, East Java | 6 | Dewi Lestari | Attention | Attention | Normal | Normal | 1 |
| Farm D | Lombok, West Nusa Tenggara | 8 | Agus Pratama | Critical | Critical | Warning | Attention | 2 |

Totals: 4 Farms · 32 Ponds · 6 open issues · Status count: Normal 1 / Attention 1 / Warning 1 / Critical 1.

## Production (current cycle, Actual unless noted)

| Farm | DOC | Biomass (Estimated) | ABW | ADG | Survival Rate (Estimated) | FCR |
| --- | --- | --- | --- | --- | --- | --- |
| Farm A | 62 | 18.4 t | 14.2 g | 0.24 g/day | 86 % | 1.32 |
| Farm B | 70 | 22.1 t | 16.8 g | 0.26 g/day | 89 % | 1.25 |
| Farm C | 55 | 9.6 t | 11.5 g | 0.21 g/day | 82 % | 1.41 |
| Farm D | 58 | 12.3 t | 12.9 g | 0.19 g/day | 76 % | 1.55 |
| Company | — | 62.4 t | 14.1 g (avg) | 0.23 g/day | 84 % (avg) | 1.37 (avg) |

Farm A previous week: Biomass 16.9 t, ABW 12.6 g, ADG 0.23, SR 87 %, FCR 1.30. Size Uniformity 78 % (CV 22 %).
Farm A ABW by week (DOC 20→62): 1.6, 3.1, 5.0, 7.2, 9.3, 11.0, 12.6, 14.2 g · Target: 1.8, 3.4, 5.3, 7.4, 9.5, 11.5, 13.3, 15.0 g.

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

Pond 02: Area 0.5 ha · Stocked 29 Jul 2026 · DOC 62 · Stocking 150,000 PL · ABW 13.8 g.

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
