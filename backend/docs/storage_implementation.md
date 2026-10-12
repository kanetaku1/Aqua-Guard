# ストレージ実装（初期段階）

この資料は[DB 設計](./database_design.md)のうち、現時点で実装した範囲を示す。画面向け API のパス、項目、命名はフロントエンドの[必要 API 定義](../../frontend/app/api/openapi.frontend.yaml)と[変更要求](../../frontend/app/api/OPENAPI_CHANGES.md)を優先する。

## PostgreSQL

初期スキーマは [`0001_foundation.sql`](../migrations/0001_foundation.sql) で管理する。`pg` からバージョン付き SQL を適用する方式を採用した。期間の重複を防ぐ排他制約、部分 Index、複合制約を SQL のまま表現し、DB 設計と実装を照合しやすくするためである。

現時点の表は Company、Farm、Pond、User とその割当、認証セッションとトークン、認証試行、Device と Pond への割当、Device 設定版、受信 Receipt、センサ同期 Checkpoint を扱う。センサの計測値本文は PostgreSQL に保存しない。

Migration Runner はファイル名順に未適用の SQL を Transaction で適用する。`schema_migrations` にファイル名と SHA-256 Checksum を記録し、適用後の SQL 変更を検出する。Advisory Lock により同時実行を直列化する。既存 Migration は編集せず、変更時は新しい番号のファイルを追加する。

ローカルでは Compose 起動後に以下を実行する。`DATABASE_URL` を設定した場合は `POSTGRES_*` より優先される。NestJS の接続確認は `GET /health/ready` に含まれる。

```powershell
cd backend
npm run build
node --env-file=.env.example --env-file-if-exists=.env dist/tools/migrate.js
npm run test:db:local
```

## InfluxDB OSS 2

Organization は `INFLUXDB_ORG`、Bucket は `INFLUXDB_BUCKET`、Token は `INFLUXDB_ADMIN_TOKEN`、URL は `INFLUXDB_URL` で指定する。ローカルの初期値は Organization `aquaguard`、Bucket `sensor_raw`。InfluxDB では最初の書き込み時に Measurement が現れる。Bucket の保持期間は未確定のため開発用の初期設定を使用する。

| Measurement | Point の時刻 | Tag | Field |
| --- | --- | --- | --- |
| `sensor_readings` | `measuredAt` | `farm_id`, `pond_id`, `device_id`, `parameter` | `value` float、`received_at_ns` int、`validity` string、任意の `quality_reason` / `event_id` string |
| `device_heartbeats` | `sentAt` | `farm_id`, `pond_id`, `device_id` | `received_at_ns` int、`online_hint` bool、MQTT受信時は `event_id` / `payload_hash` string |
| `actuator_feedback` | `occurredAt` | `farm_id`, `pond_id`, `device_id` | `received_at_ns` int、`state` string、任意の `mode` / `fault_code` / `command_id` string、MQTT受信時は `event_id` / `payload_hash` string |

`parameter` は画面向け API と同じ `do`、`ph`、`temperature`、`tds`、`turbidity`、`water_level` のみ。`event_id` と `command_id` は高 Cardinality を避けるため Tag ではなく Field にする。現在の入力時刻は JavaScript `Date` のミリ秒精度で、InfluxDB にはナノ秒単位の Timestamp として書き込む。受信時刻は `received_at_ns` に保持し、計測値の時刻を受信時刻で置き換えない。

`InfluxService` は3種類の Point を書き込み、接続確認の Query を提供する。Sensor の Device 割当照合、Event ID による再送重複の抑止、同一計測点の競合隔離、Receipt と InfluxDB の照合復旧は `SensorIngestionService` に実装した。API 起動時に保存済み点と `pending` Receipt を照合し、保存が確認できたものだけ `stored` に進める。点がない Receipt は残し、Broker 再送を待つ。MQTT のSensor・Heartbeat・Actuator Feedback受信を実装した。HeartbeatとFeedbackも割当を検証し、`device_telemetry_receipts` にEvent ID・ハッシュ・保存状態を記録する。同じEvent IDを別内容で使うことと、同じ計測点への異なるEventの書き込みを拒否する。InfluxDBに保存された `pending` Receiptは起動時に照合復旧し、点がなければ再送を待つ。実機認証、実機向けPayload契約、保持期間は未確定。Critical 判定はSensorの受信時に実装済み。画面向けには同期状態・Sensor 時系列・Sensor 現在値の Query を実装しており、Farm／Pond 全体の状態 API は未実装。受信契約と残りの API は[DB 設計](./database_design.md)に従って追加する。

ローカル連携テストは一時 Bucket を作り、6日前の3種類の点を書き込み、7日間の範囲で読み出してから一時 Bucket を削除する。

```powershell
cd backend
npm run build
npm run test:unit
npm run test:influx:local
```
