# 01. Product & Roles

## 1. Product Overview

Smart Shrimp Pond Management System — an operations management system for a shrimp aquaculture company that manages multiple Farms.

```text
Company
  ├── Farm A
  │    ├── Pond 01
  │    ├── Pond 02
  │    └── ...
  ├── Farm B
  └── Farm C ...
```

Focus:

- Farm environment management
- Pond water-quality management
- Shrimp production status
- Operational reporting (Daily / Weekly Reports)
- Risk / Issue visibility
- IoT sensor data

Out of focus: commercial sales, market simulation, buyer matching, revenue optimization.

## 2. Roles

| Role | Scope | Stance |
| --- | --- | --- |
| **Farms Manager** | All Farms of the Company | **VIEW / UNDERSTAND** |
| **Technical Manager** | One assigned Farm and its Ponds | **MONITOR / INVESTIGATE / MANAGE** |

### Farms Manager — main questions

```text
Which Farm needs attention?
  → What is happening in this Farm?
  → What problems or abnormal trends exist?
  → What did the Technical Manager report?
```

Sees aggregated Farm-level information. Must NOT:

- Monitor raw IoT sensor streams / sensor time-series
- Operate actuators
- Manage Feeding / Mortality / Sampling records
- Acknowledge / resolve Pond Alerts
- Perform detailed Pond technical operations

### Technical Manager — main questions

```text
Which Pond needs attention?
  → What is happening in the Pond?
  → What is the water quality?
  → What operation or action is required?
```

Can access: raw IoT data, sensor time-series, Pond Alerts, Feeding, Mortality, Sampling, Actuator controls, Daily / Weekly Reports (create / submit).

## 3. Role Boundary (critical)

| Function | Farms Manager | Technical Manager |
| --- | --- | --- |
| Farm Status | View | View |
| Pond Status | Aggregated View | View / Manage |
| Raw Sensor Data | **No** | View |
| Sensor Time-series | **No** | View |
| Pond Alerts | Aggregated View | Manage (Acknowledge etc.) |
| Feeding | View / Summary | Manage |
| Mortality | View / Summary | Manage |
| Sampling | View / Summary | Manage |
| Production Status | View | View / Manage |
| Daily Report | View (read-only) | Create / Submit |
| Weekly Report | View (read-only) | Create / Submit |
| Risk / Issue | View | View |
| Actuator | **No** | Execute |

Farms Manager's Pond-level visibility is limited to: presence of anomaly, type, severity, trend, duration, affected Pond, handling state.

## 4. Information Concepts (keep distinct)

| Concept | Meaning | Example |
| --- | --- | --- |
| **Farm Status** | Overall condition of a Farm | Overall / Environmental / Production / Operational Status |
| **Pond Condition / Environmental Trend** | What is happening at Pond/environment level. For FM, an aggregated trend — never raw values | Pond 02 · DO · ↓ Decreasing · Warning · 2 days |
| **Production Status** | Shrimp production progress | Biomass, ABW, ADG, Survival Rate, FCR, Growth Trend |
| **Risk / Issue** | Farm-level problem the FM should understand. **Not an AI prediction** | Water Quality · Pond 02 · Warning · 2 days |
| **Pond Alert** | Threshold-exceeded notification handled by TM | DO below 4.5 mg/L |

Value types (from 用語定義): **Actual** (measured/entered), **Forecast** (predicted; show period), **Estimated** (derived; basis must be checkable). Always label which one is shown.

## 5. Data Relationship

```text
IoT Sensors → Continuous Sensor Data → Database → Environmental / Pond Trends

Feeding / Mortality / Sampling / Actuator → Operational Data → Database

Technical Manager → Daily / Weekly Report → Structured Report
```

Reports can **reference** existing database data (e.g. auto-filled water quality), but reports are not the database itself. In the report form, auto-filled values are marked "From sensor data" / "From records".
