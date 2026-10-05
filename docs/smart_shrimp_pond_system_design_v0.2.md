# AquaGuard

## システム設計書・提案書

## 0. Document Purpose

本設計書は、エビ養殖において、IoT・環境データ・養殖管理データ・機械学習・AI Agent・制御システムを統合し、養殖池環境の継続的なモニタリング、異常・リスクの早期検知、養殖者への通知・意思決定支援、将来的な自動制御を実現するシステムの構想・要求・アーキテクチャ・開発計画を定義する。

最終目的は単なるIoTモニタリングではなく、

> **養殖池の状態を継続的に観測し、池内環境・外部環境・餌・養殖管理情報を統合して、エビにとって望ましくない状態を事前に予測し、養殖者が早期に適切なアクションを取れる状態を作ること**

である。

---

# 1. Executive Summary

## 1.1 提案システム

**AquaGuard**

養殖池に設置したIoTセンサーから水質・水環境データを取得し、天候・大気環境などの外部環境データ、および餌・給餌などの養殖管理データと統合する。

蓄積データを機械学習に利用し、異常検知・将来予測・リスク推定を行う。初期段階では推奨閾値による通知を実装し、学習データが蓄積されるにつれて、現在の異常だけでなく将来の環境悪化を予測した「Predictive Alert」へ発展させる。

AI Agentは、センサーデータ、履歴、外部環境、餌、ML予測などを統合して状況を解釈し、養殖者への推奨アクションを生成する。

将来的には、Agentの判断をSafety LayerとPID Controllerを介してポンプ等のアクチュエータへ接続し、閉ループ型の養殖環境制御を目指す。

## 1.2 Core Concept

> **From Monitoring to Predictive Aquaculture**

日本語では、

> **「状態を見る養殖」から「未来を予測して動く養殖」へ**

## 1.3 基本ループ

```text
Observe
  ↓
Collect
  ↓
Integrate
  ↓
Understand
  ↓
Predict
  ↓
Notify / Recommend
  ↓
Act
  ↓
Observe
  ↺
```

---

# 2. Background / Domain Context

## 2.1 エビ養殖の環境管理

調査対象：

- 養殖池の構造
- 水質管理
- 水交換
- 給餌
- エビの成長
- 生存率
- 疾病・ストレス
- 水温
- pH
- DO
- TDS / 塩分
- 濁度
- 水深
- 天候
- 大気環境

## 2.2 FAO等の資料

FAOの「Shrimp Farming: Pond Design, Operation and Management」等をドメイン知識の基礎資料として利用する。

https://www.fao.org/4/AC210E/AC210E00.htm

確認項目：

- 池の設計
- 水管理
- 水質管理
- 給餌
- 池の運用
- 生産管理

## 2.3 既存研究

調査対象：

- IoTによる養殖環境モニタリング
- IoT + MLによる異常検知
- 水質予測
- エビ成長予測
- 給餌最適化
- 自動養殖
- PID制御
- AI Agentを利用した農業・養殖
- Predictive Aquaculture

---

# 3. Problem Definition

## 3.1 現状の想定

```text
                    養殖池
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
        水質          天候        餌・給餌
          │            │            │
          └────────────┼────────────┘
                       ▼
                  養殖者の判断
                       │
                       ▼
                  ポンプ等操作
```

## 3.2 課題

### Monitoring

- 継続的な監視が必要
- 複数のセンサー値を同時に把握する必要がある
- センサー値だけでは状況の意味を判断しにくい

### Data

- 水質データだけでは将来予測が難しい可能性がある
- 天候などの外部環境を考慮する必要がある
- 餌の種類・成分・給餌量なども考慮する必要がある
- 給餌・水交換・ポンプ操作等の管理履歴も重要
- 過去データを継続的に蓄積する必要がある

### Decision

- 閾値を超えてから対応する事後対応になりやすい
- 複数変数の関係を人間だけで把握するのは困難
- 経験・知識への依存

### Operation

- ポンプ等の操作を人間が行う必要がある
- 常時監視が必要
- 異常時の対応負担が大きい

---

# 4. Goal / Objective

## 4.1 Primary Goal

> **エビにとって望ましい養殖環境を安定的に維持し、高品質なエビを大量・安定的に生産する。**

## 4.2 Secondary Goal

> **養殖者が行う監視・データ分析・判断・操作の負担を減らす。**

## 4.3 System Objectives

1. 3〜5分間隔のセンサーデータを、取得時刻とデータ品質付きで把握する
2. 水質・水環境データを長期蓄積する
3. 天候・大気環境を取得する
4. 餌・給餌情報を記録する
5. 養殖管理情報を記録する
6. 複数データソースを統合する
7. 推奨閾値で異常を検知する
8. 異常時に対象範囲のTechnical Managerへ通知し、Farms Managerには集約結果を表示する
9. MLで将来の環境リスクを予測する
10. 環境悪化前に通知できる状態を目指す
11. AI Agentで状況を統合し推奨アクションを提示する
12. 将来的にポンプ等の自動制御へ接続する

## 4.4 Official Roles and Access Boundary

本システムの正式なユーザーRoleは以下の4つとする。

| Role | 主な責務 | 主なデータ範囲 |
| --- | --- | --- |
| Farms Manager | Company全体の経営・生産判断 | 複数Estate / Farmの集約KPI、分析結果、アラート。生センサー値は表示しない |
| Technical Manager | 担当Farmの技術・運用判断 | 担当Farm内のPond、IoT詳細値、報告、アラート、Recommendation、許可された制御操作 |
| Field Operator | 現場作業の実行 | 割り当てられた作業に必要な範囲。今回の主要UI対象外 |
| System Administrator | ユーザー、Role、システム設定の管理 | 管理対象の設定・監査情報。業務上の分析判断は行わない |

`Farmer` はユーザーRoleとして使用せず、画面文言では具体的なRole名を使用する。AI Agent、ML、Safety Layerはユーザーではなくシステムコンポーネントである。認証後のAPIでは、Roleに加えてEstate / Farm / Pondの所属範囲を必ず検証する。

## 4.5 Scope and Release Boundary

本設計書における初期実装の対象は、観測・記録・説明可能な集約・人間による確認である。AIはRecommendationを提示できるが、Actuatorを直接操作しない。本番実機の自動制御は初期実装の対象外とし、制御機能はシミュレーションまたはモック機器で検証する。実機制御の導入には、別途Safety Review、受入試験、運用手順、緊急停止手順の承認を必要とする。

---

# 5. Key Concept: Threshold Alert → Predictive Alert

## 5.1 Stage 1: Threshold-based Alert

```text
Sensor
 ↓
Current Value
 ↓
Recommended Threshold
 ↓
Threshold Exceeded
 ↓
Notification
```

例：

```text
DO
 ↓
Recommended Range
 ↓
Below Threshold
 ↓
Low DO Alert
```

MLが十分に学習されていない初期段階でも実装可能。

## 5.2 Stage 2: Predictive Alert

```text
Current Data
+
Historical Data
+
Weather
+
Air Environment
+
Feed
+
Operation
 ↓
ML
 ↓
Future Risk
 ↓
Prediction
 ↓
Early Notification
```

例：

```text
Current DO: Normal

Temperature ↑
Turbidity ↑
DO ↓ trend
Weather condition changed

        ↓

ML:
High risk of undesirable DO condition
within the next 3 hours.

        ↓

Early Notification
        ↓
Recommended Action
```

## 5.3 Target State

> **「異常が発生したから知らせる」のではなく、「異常が発生する可能性が高まった段階で知らせる」**

---

# 6. Data Architecture

本システムでは、単一のセンサーデータではなく、複数カテゴリのデータを統合する。

```text
                     Data Platform
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
 Pond Environment    External Environment  Farm Operation
       │                  │                  │
       ▼                  ▼                  ▼
   IoT Sensors          Weather             Feed
                        Air Quality          Feeding
                                             Stocking
                                             Pump
                                             Water Exchange
                                             Harvest
```

## 6.1 Data Categories

### A. Pond IoT Data

- pH
- Temperature
- TDS
- Turbidity
- Water Level
- DO

### B. External Environment

- Air Temperature
- Humidity
- Rainfall
- Wind
- Atmospheric Pressure
- Solar Radiation
- Weather Forecast
- PM2.5
- PM10
- NO2
- SO2
- CO
- O3
- AQI

### C. Farm Operation

- Feed type
- Feed composition
- Feed amount
- Feeding time
- Feeding frequency
- Stocking date
- Stocking density
- Shrimp species
- Estimated biomass
- Water exchange
- Pump operation
- Fertilizer / nutrient input
- Treatment
- Maintenance
- Harvest

---

# 7. IoT Sensor Architecture

## 7.1 Required Sensors

1. pH Sensor
2. Temperature Sensor
3. TDS Sensor
4. Turbidity Sensor
5. Ultrasonic Sensor
6. DO Sensor

## 7.2 Sensor Purpose

| Parameter   | Sensor             | Purpose            |
| ----------- | ------------------ | ------------------ |
| pH          | pH Sensor          | 水質・酸塩基状態   |
| Temperature | Temperature Sensor | 水温・環境状態     |
| TDS         | TDS Sensor         | 水中溶解物質の指標 |
| Turbidity   | Turbidity Sensor   | 水の濁り・状態変化 |
| Water Level | Ultrasonic Sensor  | 水深・水量変化     |
| DO          | DO Sensor          | 溶存酸素・酸素環境 |

## 7.3 DO

DO（Dissolved Oxygen）を重要な水質パラメータとして扱う。

```text
Temperature
+
pH
+
TDS
+
Turbidity
+
Water Level
+
DO
```

を統合することで、単一指標では捉えにくい環境変化を分析できる可能性がある。

## 7.4 将来追加候補

- Salinity
- ORP
- Ammonia
- Nitrite
- Camera
- Weather Station
- Feed Monitoring
- Biomass Estimation

---

# 8. IoT Edge Architecture

```text
Sensors
   ↓
ESP32 / Edge Device
   ↓
Filtering
   ↓
Validation
   ↓
Timestamp
   ↓
MQTT / Communication
   ↓
Backend
```

Edgeの役割：

- Sensor reading
- Local filtering
- Basic validation
- Timestamp
- Communication
- Offline buffering
- Device health monitoring

通信方式候補：

- MQTT
- Wi-Fi
- LoRa / LoRaWAN
- Ethernet

---

# 9. Data Platform

## 9.1 Data Flow

```text
IoT
 ↓
MQTT
 ↓
Ingestion Service
 ↓
Validation
 ↓
Database
 ↓
API
 ↓
Frontend / ML / Agent
```

## 9.2 Database Entities

```text
Estate
 └── Farm
  └── Pond
      ├── Sensor
      ├── Pump
      ├── Telemetry
      ├── EnvironmentalData
      ├── FeedRecord
      ├── OperationRecord
      ├── DailyReport
      ├── WeeklySampling
      ├── ProductionKPI
      ├── HarvestScenario
      ├── InventoryForecast
      ├── Alert
      ├── Prediction
      ├── ControlAction
      ├── ProductionRecord
      └── AuditLog
```

    日次報告には報告日、報告者、養殖日数、天候、推定生存数、当日の死亡数、死亡エビ回収数、給餌量、エサ残り、特記事項を保持する。週次サンプリングにはサンプリング日時、サンプリング尾数、合計重量を保持する。確定済み報告の修正は履歴を残し、重複報告を防止する。

    週次サンプリング等から、ABW、ADG、SR、Biomass、FCR、COGSを算出する。算出式、分母、費用に含める項目、未確定データの扱いは業務ルールとして別途確定し、KPIには実績・推定の区別と算出根拠を保持する。

    収益シミュレーションと将来在庫予測では、サイズ別数量、収穫推奨日、価格、費用、予測期間、供給確度、安全余裕、出荷可能量を保持する。利益の定義と「予測値」と「安全余裕控除後の販売可能量」の扱いは、企業合意後に確定する。

---

# 10. Telemetry Data

例：

```json
{
  "pond_id": "POND-001",
  "device_id": "DEVICE-001",
  "timestamp": "2026-09-10T12:00:00Z",
  "ph": 7.8,
  "temperature": 28.4,
  "tds": 1850,
  "turbidity": 32.1,
  "water_level": 82.4,
  "do": 5.6
}
```

## 10.1 Data Quality

- Missing values
- Outliers
- Sensor drift
- Stuck values
- Impossible values
- Timestamp errors
- Calibration
- Communication loss

保存時刻はUTCで統一し、画面表示はWIB（UTC+7）へ変換する。センサー値には取得時刻、受信時刻、品質状態、欠損・遅延状態を付与する。センサー計測・送信は3〜5分間隔を基本とし、許容遅延、ローカルバッファ期間、復旧後の再送方式は運用設定として定義する。

```text
Raw Data
 ↓
Validation
 ↓
Cleaning
 ↓
Quality Monitoring
 ↓
Dataset
```

---

# 11. External Environment Data

## 11.1 Weather

候補：

- Temperature
- Humidity
- Rainfall
- Wind speed
- Wind direction
- Solar radiation
- Atmospheric pressure
- Weather forecast

## 11.2 Air Quality

候補：

- PM2.5
- PM10
- NO2
- SO2
- CO
- O3
- AQI

注意：

> 大気汚染度がエビ養殖環境へどの程度影響するかは、先行研究・実測データを確認した上で特徴量として採用する。

---

# 12. Feed / Farm Operation Data

## 12.1 Feed

候補：

- Feed type
- Brand / Product
- Composition
- Protein content
- Lipid content
- Feed size
- Feeding amount
- Feeding frequency
- Feeding time

## 12.2 Farm Operation

- Stocking
- Water exchange
- Pump operation
- Nutrient input
- Treatment
- Maintenance
- Harvest

## 12.3 ML Dataset

```text
Pond Environment
+
External Environment
+
Feed
+
Farm Operation
+
Historical Production
        ↓
      Dataset
```

---

# 13. Recommended Threshold Architecture

## 13.1 Threshold

閾値はコードへ固定せず、設定可能なデータとして管理する。

```text
Recommended Range
        ↓
Threshold Configuration
        ↓
Alert Engine
```

## 13.2 Levels

- Normal（正常）
- Attention（注意）
- Warning（警告）
- Critical（重大）

重要度（Severity）とアラート処理状態（Lifecycle Status）は別項目として管理する。処理状態は `未確認`、`確認済み`、`対応中`、`解決済み` とし、状態変更者、変更時刻、対応履歴を記録する。`Attention` は画面上では「注意」と表示し、`Watch` は正式な状態名として使用しない。

## 13.3 Context-aware Threshold

将来的には、

```text
Species
+
Shrimp Age
+
Growth Stage
+
Season
+
Pond Condition
+
Historical Data
```

に応じた閾値を検討する。

※具体的な閾値はFAO・研究論文・専門家・現場条件を確認して決定する。

---

# 14. Alert System

## 14.1 Current-state Alert

```text
Sensor Data
 ↓
Threshold Check
 ↓
Normal / Warning / Critical
 ↓
Notification
```

## 14.2 Predictive Alert

```text
Sensor + Environment + Feed + History
 ↓
ML
 ↓
Future Risk
 ↓
Notification
```

## 14.3 Notification Content

- 何が起きているか
- 問題のパラメータ
- 現在値
- 推奨範囲
- トレンド
- 将来予測
- リスク
- 推奨アクション
- 発生時刻

---

# 15. Frontend / Dashboard

## 15.1 Main Dashboard

Farms ManagerがEstate / Farmを横断して、経営・生産上の要対応事項を把握できる。生センサー値は表示せず、集約KPI、健康スコア、収益分析、将来在庫、アラート、分析根拠を表示する。

```text
┌──────────────────────────────┐
│       AQUAGUARD              │
├──────────────────────────────┤
│ Overall Status     Attention  │
├──────────────────────────────┤
│ Healthy Ponds       42        │
│ Attention Ponds      5        │
│ Warning Ponds        2        │
│ Recommended Harvest  3 ponds  │
│ Forecast Supply      12.4 t   │
├──────────────────────────────┤
│ Priority Alerts      2        │
├──────────────────────────────┤
│ Recommended Action             │
│ Review Pond P-021              │
└──────────────────────────────┘
```

## 15.2 Views

- Company Dashboard（Farms Manager）
- Revenue Simulation（Farms Manager）
- Biological Risk and Alerts（Farms Manager）
- Future Inventory Calendar（Farms Manager）
- Pond Drill-down（集約値・分析根拠のみ）
- Farm Pond Monitoring（Technical Manager）
- Alert Confirmation（Technical Manager）
- Threshold Configuration（Technical Manager / System Administrator）
- AI Prediction Advice（Technical Manager）
- Daily Report / Weekly Sampling / Report History
- Automatic Control Monitoring（Technical Manager）

---

# 16. Machine Learning Architecture

## 16.1 MLの役割

1. Anomaly Detection
2. Environmental Prediction
3. Future Risk Prediction
4. Growth / Production Prediction
5. Optimization Support

---

# 17. ML Dataset

## 17.1 Input

```text
Pond IoT
├── pH
├── Temperature
├── TDS
├── Turbidity
├── Water Level
└── DO

External Environment
├── Weather
├── Rainfall
├── Humidity
├── Air Temperature
└── Air Quality

Farm Operation
├── Feed
├── Feeding Amount
├── Feeding Time
├── Stocking
├── Water Exchange
└── Pump Operation
```

## 17.2 Target Variables

### Phase 1: Rule-based visibility and explainable management

- IoT ingestion at 3〜5 minute intervals
- Daily and weekly report input
- ABW / ADG / SR / Biomass / FCR / COGS calculation
- Revenue simulation and recommended harvest date
- Future inventory and size-based supply forecast
- Rule-based threshold alert

### Phase 2: Biological risk and predictive support

- Environmental anomaly detection
- Health score and risk classification
- Future sensor/environment prediction
- Predictive alert and AI Recommendation

### Phase 3: Advanced prediction and controlled verification

- Shrimp growth, biomass, survival, and harvest volume prediction
- Digital-twin and mock-device control verification
- Evaluation for possible real-device supervised control

収益、在庫、リスクの予測値には、対象期間、実績・推定・予測の区別、主要因、データ更新時刻を付与する。学習データ不足時は未評価または算出不能として表示し、値を推測して補完しない。

---

# 18. ML Learning Strategy

## 18.1 Data Scarcity

実運用開始時には十分な学習データがない可能性が高い。

したがって、

> **「最初から高精度な予測AIを作る」のではなく、「データを蓄積しながらモデルを改善する」**

という設計とする。

## 18.2 Stage 0

```text
Rules
+
Recommended Threshold
```

## 18.3 Stage 1

```text
Historical Data
 ↓
Anomaly Detection
```

## 18.4 Stage 2

```text
Historical Time Series
+
Environment
+
Feed
+
Operation
 ↓
Future Prediction
```

## 18.5 Stage 3

```text
Prediction
+
Production Outcome
 ↓
Growth / Yield Model
```

---

# 19. Predictive Alert Architecture

```text
                 Current State
                      │
                      ▼
             Feature Engineering
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
     IoT           Weather          Feed
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                     ML
                      │
                      ▼
              Future Prediction
                      │
                      ▼
                Risk Assessment
                      │
             ┌────────┴────────┐
             ▼                 ▼
          Low Risk          High Risk
                                │
                                ▼
                           Notification
                                │
                                ▼
                        Recommended Action
```

重要な評価指標：

> **Lead Time：実際の環境悪化よりどれだけ早く通知できたか**

---

# 20. AI Agent Architecture

## 20.1 Agent Definition

> **センサーデータ、外部環境データ、養殖管理データ、ML予測、システム状態を統合し、養殖者が次に取るべき行動を支援する意思決定オーケストレーター**

AgentそのものがMLモデルではない。

## 20.2 Agent Tools

```text
get_current_sensor_data()
get_historical_data()
get_weather_data()
get_air_quality_data()
get_feed_records()
get_operation_records()
get_thresholds()
get_alerts()
get_predictions()
get_pump_status()
create_alert()
generate_recommendation()
create_control_proposal()
generate_daily_report()
```

## 20.3 Workflow

```text
Event / User Request
        ↓
      Agent
        ↓
     Observe
        ↓
  Retrieve Data
        ↓
    Analyze State
        ↓
    Call ML Model
        ↓
   Assess Future Risk
        ↓
    Plan Response
        ↓
    Safety Check
        ↓
┌──────────────┴──────────────┐
▼                             ▼
Notify Technical Manager   Create Control Proposal
                                │
                                ▼
                  Human Approval / Safety Review
                                │
                                ▼
                 Simulation or Mock Device Only
```

---

# 21. Agent Autonomy Levels

## Level 1 — Monitoring

```text
Sensor
 ↓
Agent
 ↓
Status Summary
```

## Level 2 — Alert

```text
Sensor / ML
 ↓
Agent
 ↓
Notification
```

## Level 3 — Recommendation

```text
Sensor + ML + Context
 ↓
Agent
 ↓
Recommended Action
 ↓
Technical Manager
```

## Level 4 — Supervised Control (simulation / mock only in current scope)

```text
Agent
 ↓
Control Proposal
 ↓
Human Approval
 ↓
Safety
 ↓
PID
 ↓
Pump
```

## Level 5 — Autonomous Control (future scope only)

```text
Agent
 ↓
Safety
 ↓
PID
 ↓
Pump
```

初期実装では**Level 2〜3を主要目標**とする。Level 4はシミュレーションまたはモック機器に限定して検証し、Level 5は将来構想とする。本番実機への制御命令は初期実装から除外する。

---

# 22. PID Control Architecture

## 22.1 PIDの役割

PIDは、

> **決定された目標値に対して、ポンプ等のアクチュエータを安定的に制御する低レベル制御**

を担当する。

## 22.2 Control Loop

```text
Target
 ↓
Error
 ↓
PID Controller
 ↓
Pump Output
 ↓
Pond
 ↓
Sensor
 ↓
Feedback
 ↺
```

## 22.3 Responsibility Separation

```text
ML
 ↓
Predict
 ↓
Agent
 ↓
Decide / Recommend
 ↓
Safety Layer
 ↓
PID
 ↓
Control
 ↓
Pump
```

原則：

> **Agent / LLMが直接ポンプの低レベル制御を行わない。**

---

# 23. Safety Architecture

```text
Agent
 ↓
Action Proposal
 ↓
Safety Layer
 ├── Range Check
 ├── Rate Limit
 ├── Runtime Limit
 ├── Sensor Validation
 ├── Pump Status Check
 ├── Emergency Stop
 └── Human Override
 ↓
PID
 ↓
Pump
```

自動制御を実環境へ導入する場合、Safety Layerを必須とする。

## Fail-safe

以下の場合は自動制御を停止または安全側へ移行する。

- Sensor failure
- Missing data
- Communication failure
- Abnormal sensor values
- Pump failure
- ML confidence too low
- Agent uncertainty
- Safety threshold violation

---

# 24. Human + AI Architecture

AIが人間を完全に置き換えることを目的としない。

```text
AI
├── Monitor
├── Analyze
├── Predict
├── Alert
└── Recommend

Human
├── Domain Knowledge
├── Final Decision
├── Override
└── Exceptional Response
```

初期段階では、

> **AIは「判断を支援する存在」**

として導入し、十分な検証が進んだ領域から自動化する。

---

# 25. Digital Twin / Simulation

## 25.1 Purpose

実池での制御実験にはリスクがあるため、仮想養殖池を利用して検証する。

## 25.2 Virtual Pond

```text
Virtual Pond
├── pH
├── Temperature
├── TDS
├── Turbidity
├── Water Level
└── DO
```

## 25.3 Closed-loop Simulation

```text
Virtual Pond
 ↓
Sensor Simulation
 ↓
Data Platform
 ↓
ML
 ↓
Agent
 ↓
Safety
 ↓
PID
 ↓
Virtual Pump
 ↓
Virtual Pond
 ↺
```

## 25.4 Test Scenarios

- Normal condition
- DO decrease
- Temperature increase
- pH change
- Turbidity increase
- Water level decrease
- Rainfall event
- Multiple simultaneous anomalies
- Sensor failure
- Network failure
- Pump failure

---

# 26. Backend Architecture

候補：

- FastAPI
- PostgreSQL
- MQTT Broker
- Python
- Docker

最終技術選定はArchitecture Phaseで決定する。

```text
IoT
 ↓
MQTT
 ↓
Ingestion Service
 ↓
Validation
 ↓
Database
 ↓
API
 ↓
Frontend
ML
Agent
```

---

# 27. Frontend Architecture

Main Views：

```text
Dashboard
 ├── Current Status
 ├── Sensor Monitoring
 ├── Prediction
 ├── Alerts
 ├── Pump Status
 ├── AI Recommendation
 ├── Feed / Operation
 └── History
```

管理者が、

- 閾値
- センサー
- 池
- ポンプ
- 通知
- AI設定

を管理できる構造を検討する。

---

# 28. Notification Architecture

通知先候補：

- Web Dashboard
- Browser Notification
- Email
- LINE
- SMS
- Mobile Push

MVPでは実装コストを考慮して1つ以上を選択する。

通知には、

- Current Value
- Recommended Range
- Trend
- Future Risk
- Recommended Action
- Timestamp

を含める。

---

# 29. Functional Requirements

## IoT

- センサー値取得
- Timestamp
- Device ID
- Pond ID
- Sensor health
- Communication status
- Calibration information

## Data

- Telemetry ingestion
- Environmental data ingestion
- Feed record
- Operation record
- Historical storage
- Data validation

## Monitoring

- Real-time dashboard
- Historical charts
- Status indicators

## Threshold

- Threshold management
- Warning / Critical
- Context-aware configuration

## Alert

- Threshold alert
- Predictive alert
- Notification
- Alert history
- Response logging

## ML

- Dataset creation
- Preprocessing
- Anomaly detection
- Prediction
- Evaluation
- Model versioning

## Agent

- Tool calling
- Context retrieval
- Situation analysis
- Recommendation
- Report generation
- Action proposal

## Control

- PID
- Pump operation
- Safety limit
- Manual override
- Emergency stop

---

# 30. Non-functional Requirements

## Reliability

- Sensor failure handling
- Network failure handling
- Backend failure handling
- Pump failure detection

## Safety

- Safe fallback
- Human override
- Emergency stop
- Autonomous control limits

## Security

- Authentication
- Authorization
- Device authentication
- API security
- Audit log

## Scalability

```text
1 Pond
 ↓
Multiple Ponds
 ↓
Farm
 ↓
Multiple Farms
```

へ拡張可能な構造を目指す。

---

# 31. Evaluation

## 31.1 Technical

- Sensor accuracy
- Data latency
- API latency
- System uptime
- ML performance
- Alert accuracy
- Control stability

## 31.2 ML

### Anomaly Detection

- Precision
- Recall
- F1
- False Positive Rate
- False Negative Rate

### Prediction

- MAE
- RMSE
- R²
- Forecast horizon

### Predictive Alert

- Lead Time
- Early Detection Rate
- False Alarm Rate

## 31.3 Aquaculture

可能な範囲で、

- Survival Rate
- Growth Rate
- Shrimp Size
- Biomass
- Harvest Volume
- Feed Conversion Ratio
- Water usage
- Energy usage

を評価する。

## 31.4 Human

- Monitoring Time
- Manual Operations
- Alert Response Time
- Number of Manual Interventions
- Decision Time

---

# 32. Baseline Comparison

```text
A. Traditional Management
B. IoT Monitoring
C. IoT + Threshold Alert
D. IoT + ML
E. IoT + ML + Agent
F. IoT + ML + Agent + Control
```

比較する観点：

1. 異常検知
2. 予測精度
3. Lead Time
4. 誤通知
5. 環境安定性
6. 作業負担
7. 生産性

---

# 33. Development: Agentic SDLC

システム開発自体にもAgentic SDLCを適用する。

```text
Human Goal
    ↓
Guide
    ↓
Generate
    ↓
Verify
    ↓
Solve
    ↓
Review
    ↓
Iterate
```

## Human

- Goal definition
- Domain decisions
- Requirement approval
- Architecture approval
- Safety decisions
- Final review

## AI Agent

- Research support
- Documentation
- Code generation
- Test generation
- Debugging
- Data analysis
- Refactoring
- Verification support

---

# 34. Development Agents

## Management Agent

- Project requirements
- Task decomposition
- Progress management
- Documentation coordination

## Design Agent

- System architecture
- API
- Data model
- UI design
- ADR

## Data / ML Agent

- Dataset
- Feature engineering
- Model training
- Evaluation
- Data quality

## Builder Agent

- IoT
- Backend
- Frontend
- Integration
- Infrastructure

## Verify Agent

- Unit tests
- Integration tests
- Simulation
- Failure tests
- Regression tests
- Requirement verification

---

# 35. Development Workflow

```text
Human Requirement
       ↓
Management Agent
       ↓
Design Agent
       ↓
Architecture
       ↓
Data / ML Agent
       ↓
Builder Agent
       ↓
Verify Agent
       ↓
Human Review
       ↓
Iteration
```

重要な設計・安全判断はHumanが承認する。

---

# 36. Design Principles

## Principle 1 — Observe before Automate

まず正確に観測する。

## Principle 2 — Data before ML

十分なデータ品質を確保してからMLを高度化する。

## Principle 3 — Prediction before Autonomous Control

予測精度を検証してから自動制御へ進む。

## Principle 4 — Agent does not directly control Hardware

AgentとHardwareをSafety Layerで分離する。

## Principle 5 — Human remains the Supervisor

初期段階では人間が最終判断を行う。

## Principle 6 — Simulation before Real-world Control

実池への制御前にSimulationで検証する。

## Principle 7 — Measure Lead Time

予測精度だけでなく、異常発生前にどれだけ早く通知できたかを評価する。

---

# 37. Final System Architecture

```text
                       Farms Manager
                            │
                            ▼
                  ┌─────────────────┐
                  │   Dashboard     │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   Farm Agent    │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Current      Historical    Context
            Data          Data        Data
              │            │            │
              └────────────┼────────────┘
                           ▼
                          ML
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Anomaly       Prediction    Risk
          Detection                    Score
                           │
                           ▼
                     Recommendation
                           │
                    ┌──────┴──────┐
                    ▼             ▼
                 Technical Manager    Safety
                                  │
                                  ▼
                                 PID
                                  │
                                  ▼
                                Pump
                                  │
                                  ▼
                             SHRIMP POND
                                  │
             ┌────────────────────┼──────────────────┐
             ▼                    ▼                  ▼
          pH Sensor          Temperature          TDS
             │                    │                  │
             ▼                    ▼                  ▼
        Turbidity           Ultrasonic              DO
             │                    │                  │
             └────────────────────┼──────────────────┘
                                  │
                                  ▼
                            Data Platform
                                  ▲
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
                 ▼                                 ▼
          Weather / Air                      Feed / Operation
           Environment                          Records
```

---

# 38. Final Vision

```text
             SHRIMP FARM
                  │
           Continuous Data
                  │
                  ▼
           Data Platform
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
     Pond       Weather     Feed
      IoT       / Air       / Farm
                 Environment Operation
       └──────────┼──────────┘
                  ▼
                 ML
                  │
           Future Prediction
                  │
                  ▼
                Agent
                  │
         Decision / Recommendation
                  │
          ┌───────┴────────┐
          ▼                ▼
    Technical Manager   Control Proposal
                           │
                         Safety
                           │
                          PID
                           │
                          Pump
                           │
                           ▼
                         Pond
                           │
                           └────────↺
```

## Final Message

> **「養殖者が池を監視する」のではなく、システムが池を継続的に観測・理解・予測し、養殖者には重要な判断と対応だけを求める。**

最初は閾値ベースの監視から始め、データが蓄積されるにつれてMLによる予測へ進み、最終的にはAI Agentと制御システムによる半自律・自律的な養殖環境管理を目指す。

---
