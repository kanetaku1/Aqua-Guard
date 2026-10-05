# バックエンド全体設計ダイアグラム

| 項目 | 内容 |
| --- | --- |
| 版 | 0.2（提出用ドラフト） |
| 更新日 | 2026-10-05 |
| 対応資料 | [全体設計](./backend_architecture_overview.md) / [API](./backend/api_design.md) / [データベース](./backend/database_design.md) |

図中のMQTT Broker、PostgreSQL、REST API、Control Serviceは論理構成または技術候補を表す。配置先・製品・プロセス分割の確定を意味しない。AI助言・予測・AI制御は今回の図に含めない。

## 1. システム全体構成

```mermaid
flowchart LR
  FM["Farms Manager"] --> UI["Web UI"]
  TM["Technical Manager"] --> UI
  SA["System Administrator"] --> UI
  UI -->|"REST API"| API["Backend API / 認証・権限"]
  API --> BIZ["業務処理 / KPI / Report"]
  API --> ALERT["Alert判定・対応"]
  API --> CTRL["Control / Safety"]
  API -->|"センサー参照"| TS[("InfluxDB")]
  BIZ --> DB[("業務DB / PostgreSQL候補")]
  ALERT --> DB
  ALERT --> TS
  CTRL --> DB
  CTRL --> TS
  SENS["水質センサー"] --> EDGE["ESP32 / Edge"]
  EDGE -->|"Telemetry"| MQTT["MQTT Broker"]
  MQTT --> ING["Ingestion Service"]
  ING -->|"Device割当を照合"| DB
  ING -->|"測定値を保存"| TS
  ING --> ALERT
  CTRL -->|"承認済み目標値"| PID["PID Controller"]
  PID -->|"出力要求"| CTRL
  CTRL -->|"各出力を安全確認したCommand"| MQTT
  MQTT --> EDGE
  EDGE --> ACT["Pump / Aeration"]
  ACT --> POND["Pond"]
  POND --> SENS
```

業務DBとInfluxDBには責務の異なるデータを保存する。AlertとReportは独立した処理である。実機へのCommand送信経路はMQTTを候補とし、機器仕様確定時に接続方式を決める。

## 2. IoTデータ受信と画面参照

```mermaid
sequenceDiagram
  autonumber
  participant Sensor as Sensor
  participant Edge as Edge Device
  participant Broker as MQTT Broker
  participant Ing as Ingestion Service
  participant Biz as 業務DB
  participant Influx as InfluxDB
  participant Alert as Alert判定
  participant UI as Technical Manager画面
  participant API as Backend API

  Sensor->>Edge: DO・pH等を計測
  Edge->>Edge: 計測時刻付与・基本検証
  Edge->>Broker: TelemetryをPublish
  Broker->>Ing: Telemetryを配送
  Ing->>Biz: DeviceとPondの割当確認
  Biz-->>Ing: 割当・状態
  Ing->>Ing: 形式・品質・時刻・重複確認
  Ing->>Influx: 測定値と品質を保存
  Influx-->>Ing: 保存結果
  Ing->>Alert: 有効データを判定へ渡す
  UI->>API: GET 最新値 / 履歴
  API->>Biz: Roleと担当Farmを確認
  Biz-->>API: 権限範囲
  API->>Influx: Pondと期間で検索
  Influx-->>API: 測定値と品質
  API-->>UI: JSONで返却
```

IngestionがInfluxDBへの保存に失敗した場合は成功扱いせず、再送可能な状態を保つ。通信断時はEdgeが元の計測時刻で再送する。再送の保証範囲はBrokerとEdgeの仕様で決める。

## 3. Alertの発生と対応

```mermaid
sequenceDiagram
  autonumber
  participant Influx as InfluxDB
  participant Rules as 業務DB・閾値
  participant Engine as Alert判定
  participant DB as 業務DB・Alert
  participant API as Backend API
  participant TM as Technical Manager
  participant FM as Farms Manager

  Influx->>Engine: 検証済みSensor Data
  Engine->>Rules: 有効な全体設定とFarm上書きを取得
  Rules-->>Engine: 境界値・継続時間
  Engine->>Engine: Severityを判定
  alt Warning以上またはAttention継続
    Engine->>DB: Alertを作成または更新
    TM->>API: 担当FarmのAlertを取得
    API->>DB: Role・担当Farmを確認して検索
    API-->>TM: Alert詳細を表示
    TM->>API: Acknowledge / Record action / Resolve
    API->>DB: 対応と履歴を保存
    FM->>API: Risk / Issueを取得
    API->>DB: Company範囲の集約を検索
    API-->>FM: 集約したRisk / Issueを表示
  else 発報条件を満たさない
    Engine->>Engine: 状態監視を継続
  end
```

外部通知の配送方式は未決定である。Alert自体は業務DBに残し、通知チャネルの成否とは分ける。

## 4. KPIとReport

```mermaid
flowchart LR
  REC["放養・給餌・死亡・Sampling"] --> KPI["Pond別KPI計算"]
  KPI --> AGG["Farm / Company集計"]
  REC --> DAILY["Daily Report"]
  OBS["健康観察・天候・所見"] --> DAILY
  ALERT["Alert・対応記録"] --> DAILY
  ACT["Actuator操作履歴"] --> DAILY
  KPI --> WEEKLY["Weekly Report"]
  REC --> WEEKLY
  ALERT --> WEEKLY
  TS[("InfluxDB水質時系列")] -->|"Pond別の週次傾向"| WEEKLY
  DAILY -->|"Submit"| VIEW["Farms Manager閲覧"]
  WEEKLY -->|"Submit"| VIEW
```

Daily Reportには生センサー値を転記しない。Weekly ReportでもFarm平均の水質値は作らず、Pond別の傾向を示す。

## 5. Actuator操作と安全制御

```mermaid
sequenceDiagram
  autonumber
  participant TM as Technical Manager
  participant API as Backend API
  participant Safety as Safety Layer
  participant Influx as InfluxDB
  participant DB as 業務DB
  participant PID as PID Controller
  participant Edge as Edge / Actuator

  TM->>API: 手動操作または承認済み制御要求
  API->>DB: Role・担当Farm・Device割当を確認
  API->>Safety: 操作と現在状態を検証
  Safety->>Influx: Sensor値・計測時刻・品質を確認
  Safety->>DB: 制限値・設備状態・緊急停止状態を確認
  alt 安全条件を満たす
    Safety-->>API: 許可
    API->>DB: Commandと判定結果を記録
    alt 自動制御
      API->>PID: 承認済み目標値を引き渡す
      PID->>Safety: 出力ごとにSafety判定
      Safety->>Edge: 安全範囲内の出力Command
    else 手動操作
      Safety->>Edge: 安全確認済みCommand
    end
    Edge-->>API: 受信・実行結果
    API->>DB: 結果と操作履歴を記録
    API-->>TM: 最終状態を返す
  else 安全条件を満たさない
    Safety-->>API: 拒否理由
    API->>DB: 拒否を記録
    API-->>TM: 操作不可と理由を返す
  end
```

上図のPID経路は自動制御時、直接送信は手動操作時を示す。実際の設備通信経路は機器仕様で確定する。Human OverrideとEmergency Stopは自動制御より優先する。

## 6. データ関係図

```mermaid
erDiagram
  COMPANY ||--o{ FARM : owns
  FARM ||--o{ POND : contains
  USER ||--o{ USER_FARM_ASSIGNMENT : has
  FARM ||--o{ USER_FARM_ASSIGNMENT : assigned
  POND ||--o{ DEVICE_ASSIGNMENT : has
  DEVICE ||--o{ DEVICE_ASSIGNMENT : assigned
  DEVICE ||--o{ SENSOR : connects
  POND ||--o{ STOCKING_RECORD : has
  POND ||--o{ FEEDING_RECORD : has
  POND ||--o{ MORTALITY_RECORD : has
  POND ||--o{ SAMPLING_RECORD : has
  SAMPLING_RECORD ||--o| LABORATORY_RESULT : receives
  POND ||--o{ ALERT : raises
  ALERT ||--o{ ALERT_ACTION : records
  FARM ||--o{ DAILY_REPORT : has
  FARM ||--o{ WEEKLY_REPORT : has
  POND ||--o{ ACTUATOR_COMMAND : targets
  DEVICE ||--o{ ACTUATOR_COMMAND : receives
  POND ||--o{ WATER_QUALITY_POINT : measured
```

`WATER_QUALITY_POINT`のみInfluxDBの論理データで、他は業務DBの論理エンティティである。両DBの関連はアプリケーション内のID照合で実現し、DB間の外部キーは存在しない。列と制約は[データベース詳細設計](./backend/database_design.md)を参照する。
