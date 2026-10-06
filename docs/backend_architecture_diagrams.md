# バックエンド全体設計ダイアグラム

| 項目 | 内容 |
| --- | --- |
| 版 | 0.3（API・DB整合ドラフト） |
| 更新日 | 2026-10-05 |
| 対応資料 | [全体設計](./backend_architecture_overview.md) / [OpenAPI契約](./api/openapi.yaml) / [API詳細設計](./backend/api_design.md) / [データベース詳細設計](./backend/database_design.md) |

図は論理責務を示す。PostgreSQLとInfluxDBは採用方針、MQTT Brokerの製品・Cloud配置・プロセス分割は未決定である。Web向けのパスと入出力はOpenAPIを正とする。AI助言・予測・AI制御は対象外。

## 1. システム全体構成

```mermaid
flowchart LR
  FM["Farms Manager"] --> UI["Web UI"]
  TM["Technical Manager"] --> UI
  SA["System Administrator"] --> UI
  UI -->|"/api/v1・OpenAPI"| API["Backend API / 認証・権限"]
  API --> PG[("PostgreSQL<br/>業務DB")]
  API -->|"認可後のIoT参照"| IFX[("InfluxDB<br/>IoT時系列")]
  API --> CTRL["Control / Safety"]
  API --> KPI["KPI / Report処理"]
  KPI --> PG
  KPI -->|"Weekly水質集計"| IFX
  SENSOR["水質センサー"] --> EDGE["Edge / Device"]
  ACT["Actuator"] <--> EDGE
  EDGE -->|"測定値・Heartbeat・実状態"| BROKER["MQTT Broker"]
  BROKER --> ING["Ingestion Service"]
  ING -->|"割当・設定・処理メタデータ"| PG
  ING -->|"IoT観測を保存"| IFX
  WORKER["5分参照・Alert判定"] -->|"未処理区間を検索"| IFX
  WORKER -->|"Alert・Issue・Checkpoint"| PG
  CTRL --> PG
  CTRL -->|"Sensor・設備の観測"| IFX
  CTRL -->|"安全確認済みCommand"| BROKER
  BROKER --> EDGE
```

IoTの生データはInfluxDB、マスタ・現場記録・Alert・Issue・Report・Command・監査はPostgreSQLに置く。PostgreSQLのIoT処理Receipt／Checkpointは再送・再処理のためのメタデータであり、測定値本文を持たない。Deviceから画面向けREST APIへ送信しない。

## 2. IoTデータ受信と画面参照

```mermaid
sequenceDiagram
  autonumber
  participant Device as Sensor / Edge
  participant Broker as MQTT Broker
  participant Ing as Ingestion Service
  participant PG as PostgreSQL
  participant IFX as InfluxDB
  participant Worker as 5分参照処理
  participant API as Backend API
  participant TM as Technical Manager

  Device->>Broker: Telemetry（元の計測時刻・Device ID）
  Broker->>Ing: 配送・再配送
  Ing->>PG: 当時のDevice設定・Pond割当を確認
  PG-->>Ing: 有効な対応関係
  Ing->>Ing: 形式・品質・時刻・Message IDを検証
  Ing->>IFX: Sensor点／Heartbeat／設備通知を保存
  IFX-->>Ing: 書込結果
  Ing->>PG: Receiptの処理状態を記録（値本文なし）
  loop 5分ごと
    Worker->>IFX: 未処理区間の測定値を参照
    IFX-->>Worker: 観測値と品質
    Worker->>PG: 判定結果・CheckpointをTransactionで保存
  end
  TM->>API: GET /ponds/{pondId}/sensors/current 等
  API->>PG: Role・担当Farm・Pond所属を検証
  PG-->>API: 許可範囲・有効閾値
  API->>IFX: 認可済みPondの最新値／履歴を検索
  IFX-->>API: 値・計測時刻・品質
  API-->>TM: OpenAPIのschemaで返す
```

通信断でEdgeが再送しても元の計測時刻を維持する。InfluxDB書込とPostgreSQL更新は単一Transactionにできないため、Message IDとCheckpointで再処理可能にする。書込失敗を成功として扱わず、欠損を架空値で補わない。`x-refresh-interval-seconds: 300`の画面APIはフロントが5分ごとに再取得する。

## 3. Alertの発生と対応

```mermaid
sequenceDiagram
  autonumber
  participant Worker as 5分参照・Alert判定
  participant IFX as InfluxDB
  participant PG as PostgreSQL
  participant API as Backend API
  participant TM as Technical Manager
  participant FM as Farms Manager

  loop 5分ごと
    Worker->>PG: 前回Checkpointと有効な閾値版を取得
    PG-->>Worker: 未処理区間・共通値とFarm上書き
    Worker->>IFX: 未処理区間のSensor値を検索
    IFX-->>Worker: 測定値・計測時刻・品質
    Worker->>Worker: Severityと継続時間を判定
    alt Warning以上またはAttention継続
      Worker->>PG: Alert・Anomaly区間・Issueを作成／更新
    end
    Worker->>PG: 成功した区間のCheckpointを進める
  end
  TM->>API: GET /alerts / GET /alerts/{alertId}
  API->>PG: 担当Farmを検証してAlertを取得
  API-->>TM: Alertと対応履歴
  TM->>API: POST acknowledge / actions / resolve
  API->>PG: 状態遷移・対応・監査を保存
  FM->>API: GET /issues / GET /issues/{issueId}
  API->>PG: Company配下のIssueを取得
  API-->>FM: 生のSensor値を除いた集約ビュー
```

CheckpointはAlert・Issue等の更新と同じPostgreSQL Transactionで進める。再試行では同じ異常を重複発報しない。閾値の変更は次の判定から適用し、過去のAlertを上書きしない。外部通知のチャネルと配送方式は未決定であり、Alertの保存とは分ける。

## 4. KPIとReport

```mermaid
flowchart LR
  REC[("PostgreSQL<br/>放養・給餌・死亡・Sampling")] --> KPI["Pond・サイクル別KPI"]
  KPI --> AGG["Farm / Company集計"]
  REC --> DD["Daily Draft<br/>取得時に元記録を再構成"]
  OBS[("PostgreSQL<br/>観察・天候・所見")] --> DD
  ALERT[("PostgreSQL<br/>Alert・対応・設備操作")] --> DD
  KPI --> WD["Weekly Draft"]
  REC --> WD
  ALERT --> WD
  IFX[("InfluxDB<br/>IoT水質時系列")] -->|"Pond別の週次傾向"| WD
  DD --> SUBMIT["Submit<br/>必須項目と権限を再検証"]
  WD --> SUBMIT
  SUBMIT --> SNAP[("PostgreSQL<br/>提出済みSnapshot")]
  SNAP --> FM["Farms Manager<br/>Submittedのみ閲覧"]
```

BiomassはPond値を合計し、Survival RateとFCRは分子・分母から再計算する。Farm／CompanyのABW・ADG平均を作らない。Daily Reportへ生Sensor値を転記せず、Weekly ReportにはPond別の派生集計のみを載せる。提出後はSnapshotを返し、元記録の訂正・遅延IoTデータで暗黙に内容を変えない。放養記録の登録APIは現行OpenAPI未定義。

## 5. Actuator操作と安全制御

```mermaid
sequenceDiagram
  autonumber
  participant TM as Technical Manager
  participant API as Backend API
  participant PG as PostgreSQL
  participant Safety as Safety Layer
  participant IFX as InfluxDB
  participant Dispatch as Command配送処理
  participant Broker as MQTT Broker候補
  participant Device as Edge / Actuator
  participant Ing as Ingestion Service

  TM->>API: POST /actuators/{actuatorId}/commands (turn_on/off/set_auto)
  API->>PG: Role・担当Farm・Device割当を検証
  API->>Safety: 要求を評価
  Safety->>PG: Safety版・制御意図・緊急停止条件を取得
  Safety->>IFX: 最新のSensor品質・設備実状態を確認
  alt Safetyが拒否
    Safety-->>API: 理由を返す
    API->>PG: 拒否を監査に記録
    API-->>TM: 409 safety_blocked
  else 受付可能
    Safety-->>API: 許可
    API->>PG: CommandとSafety判断を記録
    API-->>TM: 202 Actuator（実行完了ではない）
    Dispatch->>PG: 未送信Commandを取得
    Dispatch->>Broker: 設備Commandを配送
    Broker->>Device: 操作要求
    Device->>Broker: ACK・実状態・故障通知
    Broker->>Ing: 設備通知を配送
    Ing->>IFX: 生の設備通知を保存
    Ing->>PG: Command結果とActuator Logを更新
    TM->>API: GET /ponds/{pondId}/actuators / actuator-logs
    API->>IFX: 最後に確認された実状態を取得
    API->>PG: 操作結果を取得
    API-->>TM: 状態と履歴を返す
  end
```

設備へのCommand経路とACK形式は実機仕様で確定する。Auto中の手動操作はManual Overrideとなる。PIDとEmergency Stopは安全制御の内部設計対象だが、その設定・承認・停止操作の公開APIは現行OpenAPIにない。PID出力もSafety Layerを通す。実状態未受信時は`off`や`fault`を推測で返さない。

## 6. データ関係図

以下はPostgreSQLの主要関係である。`REPORT`はDaily／Weekly共通の基底テーブルで、提出済み内容は`REPORT_SNAPSHOT`に固定する。図にない細部の列・索引・設定版は[データベース詳細設計](./backend/database_design.md)を参照する。

```mermaid
erDiagram
  COMPANY ||--o{ FARM : owns
  COMPANY ||--o{ USER : employs
  FARM ||--o{ POND : contains
  USER ||--o{ USER_FARM_ASSIGNMENT : has
  FARM ||--o{ USER_FARM_ASSIGNMENT : assigned
  POND ||--o{ DEVICE_ASSIGNMENT : has
  DEVICE ||--o{ DEVICE_ASSIGNMENT : assigned
  DEVICE ||--o{ DEVICE_CONFIG_VERSION : configured
  POND ||--o{ PRODUCTION_CYCLE : runs
  PRODUCTION_CYCLE ||--|| STOCKING_RECORD : starts
  PRODUCTION_CYCLE o|--o{ FEEDING_RECORD : has
  PRODUCTION_CYCLE o|--o{ MORTALITY_RECORD : has
  PRODUCTION_CYCLE o|--o{ SAMPLING_RECORD : has
  PRODUCTION_CYCLE ||--o{ POND_KPI_SNAPSHOT : calculates
  POND ||--o{ ALERT : raises
  ALERT ||--o{ ALERT_ACTION : records
  FARM ||--o{ ISSUE : shows
  DEVICE ||--o{ EQUIPMENT_INCIDENT : reports
  FARM ||--o{ FARM_STATUS_DAILY : tracks
  FARM ||--o{ REPORT : files
  REPORT ||--o| DAILY_REPORT_INPUT : daily
  REPORT ||--o| WEEKLY_REPORT_INPUT : weekly
  REPORT ||--o| REPORT_SNAPSHOT : submits
  REPORT ||--o{ REPORT_SOURCE_REF : cites
  DEVICE ||--o{ ACTUATOR_COMMAND : receives
  ACTUATOR_COMMAND o|--o{ ACTUATOR_LOG : records
```

InfluxDB側の論理系列は`sensor_readings`、`device_heartbeats`、`actuator_feedback`。PostgreSQLのDevice割当・設定履歴と、InfluxDBのDevice／Pondタグ・計測時刻をアプリケーションで照合する。両DB間にFKは存在しない。`ISSUE.source_id`はAlertや設備Incident等を参照する業務上の関連であり、参照先が複数テーブルにまたがるため通常の単一FKとして図示しない。
