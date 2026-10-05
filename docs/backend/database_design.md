# データベース詳細設計

| 項目 | 内容 |
| --- | --- |
| 版 | 0.2（提出用ドラフト） |
| 更新日 | 2026-10-05 |
| 対応資料 | [全体設計](../backend_architecture_overview.md) / [ダイアグラム](../backend_architecture_diagrams.md) / [API](./api_design.md) |

## 1. 方針と確定状況

InfluxDBは採用方針が決定している。業務DBはPostgreSQLを候補とし、以下の型・制約はPostgreSQLを用いた場合の物理設計案である。正式な採用、ID形式、InfluxDBのVersionと提供形態は未決定とする。

AI助言、ML予測、予測Alert、AI制御提案、収益・在庫予測の保存領域は今回設けない。ReportとAlertは独立して保存する。センサーの生データは業務DBへ複製しない。

## 2. 記法・共通規則

- `!`はNOT NULL、`?`はNULL可、`PK`は主キー、`FK`は外部キーを示す
- ID列は本書では`uuid`を提案する。外部から受信するDevice IDは別の一意な文字列列に保持する
- 時刻は`timestamp with time zone`でUTC保存する。業務日付は`date`で保持する
- 数量と金額は`numeric`を使用する。表示時の桁数は[KPI定義書](../../frontend/docs/04_KPI%E3%83%BB%E3%83%87%E3%83%BC%E3%82%BF%E9%A0%85%E7%9B%AE%E5%AE%9A%E7%BE%A9%E6%9B%B8.md)に従う
- 編集可能な行には`created_at`、`updated_at`、`version`を持たせる。更新時は`version`を比較する案とする
- 実績記録、提出済みReport、Alert、Command、監査記録は物理削除を基本操作にしない
- IDおよび列名は設計提案であり、既存資料にある正式な物理名ではない

## 3. データストア分担

| 保存先 | 対象 | 書き込み責務 |
| --- | --- | --- |
| InfluxDB | 3〜5分間隔のDO、pH、水温、TDS、濁度、水位、取得・受信時刻、品質 | Ingestion Service |
| 業務DB | 認証、Company / Farm / Pond、Device割当、閾値、現場記録、KPI、Alert、Report、制御、監査 | Backend API、業務処理 |

InfluxDBの点と業務DBの行は、`pond_id`、`device_id`、時刻範囲で照合する。両DBをまたぐ外部キーや単一Transactionは存在しない。

## 4. 業務DBの論理関係

Company 1対多 Farm、Farm 1対多 Pondを基準とする。Technical ManagerとFarmは多対多、PondとDeviceは期間を持つ割当関係である。放養・給餌・死亡・Sampling・Alert・制御履歴はPondに紐付く。Daily / Weekly ReportはFarm単位で作成し、Pond別内容を内包または参照する。

旧システム設計書にはEstateが登場するが、現在の権限・画面資料はCompany / Farm / Pondで定義されているため、本設計の物理案にはEstateを設けない。Estate階層が必要ならCompanyとFarmの間へ追加する。

関係図は[ダイアグラム第6章](../backend_architecture_diagrams.md)を参照する。

## 5. 認証・管理マスタ

### 5.1 `companies`

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | Company ID |
| `name` | `text` ! | Company名 |
| `status` | `text` ! | 稼働状態 |

単一Company固定にするか複数Companyを扱うかは未決定。複数CompanyならFarmとFarms ManagerのScopeを必ずCompany単位で絞る。

### 5.2 `farms` / `ponds`

| テーブル | 主な列 | 制約 |
| --- | --- | --- |
| `farms` | `id uuid PK`, `company_id uuid FK !`, `name text !`, `location text ?`, `status text !` | Company所属必須 |
| `ponds` | `id uuid PK`, `farm_id uuid FK !`, `name text !`, `area_m2 numeric ?`, `status text !` | Farm所属必須。StatusはIn operation / Fallow等 |

Farm内でのPond名重複を許すかは要確認。削除で履歴の参照を壊さないよう、無効化を基本とする。

### 5.3 `users` / `user_farm_assignments`

| テーブル | 主な列 | 制約 |
| --- | --- | --- |
| `users` | `id uuid PK`, `company_id uuid FK !`, `email text !`, `password_hash text ?`, `role text !`, `status text !`, `preferred_language text ?`, `failed_login_count integer !`, `locked_until timestamptz ?`, `last_login_at timestamptz ?` | `email`一意。Invited中はHash未設定、Active化時に必須。RoleはFM / TM / SA |
| `user_farm_assignments` | `id uuid PK`, `user_id uuid FK !`, `farm_id uuid FK !`, `assigned_at timestamptz !`, `unassigned_at timestamptz ?` | 有効期間が重なる同一User・Farm割当を禁止 |

1ユーザーに1Roleを割り当てる。System Administratorの最後の1人を無効化しない制約は、競合を防ぐためDB Transaction内で検証する。招待・再設定tokenとSessionの保存先・Hash形式は認証方式確定後に追加する。Token原文は保存しない。

### 5.4 `devices` / `device_assignments`

| テーブル | 主な列 | 制約 |
| --- | --- | --- |
| `devices` | `id uuid PK`, `external_device_id text !`, `kind text !`, `model text ?`, `connection_status text !`, `last_seen_at timestamptz ?`, `enabled boolean !` | `external_device_id`一意。KindはEdge / Sensor / Actuator |
| `device_assignments` | `id uuid PK`, `device_id uuid FK !`, `pond_id uuid FK !`, `assigned_at timestamptz !`, `unassigned_at timestamptz ?` | 1台が同時に複数Pondへ属さない |
| `sensors` | `id uuid PK`, `device_id uuid FK !`, `parameter text !`, `external_sensor_id text ?`, `calibration_at timestamptz ?`, `health_status text ?` | 1台のEdgeに複数Sensorを接続可能。Parameterは水質6項目 |
| `actuators` | `device_id uuid PK/FK`, `actuator_type text !`, `mode text !`, `operating_status text !`, `emergency_stopped boolean !` | Pump / Aeration等 |

過去のTelemetryを当時のPondへ対応付けるため、Device割当は期間履歴として保持する。Deviceから届いた`pond_id`はこの有効期間と照合する。Sensorが単独で通信する場合はSensor Deviceに、複数SensorがEdge経由で通信する場合はEdge Deviceに紐付ける。

## 6. 運用設定

### 6.1 `threshold_rules`

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | 閾値の版ID |
| `farm_id` | `uuid` FK ? | NULLなら全Farm共通、値があればFarm上書き |
| `parameter` | `text` ! | DO、pH、水温、TDS、濁度、水位 |
| `side` | `text` ! | LOW / HIGH |
| `attention_boundary` | `numeric` ? | Attention開始境界 |
| `warning_boundary` | `numeric` ? | Warning開始境界 |
| `critical_boundary` | `numeric` ? | Critical開始境界 |
| `effective_from` | `timestamptz` ! | 適用開始 |
| `effective_to` | `timestamptz` ? | 適用終了 |
| `updated_by` | `uuid` FK ! | 変更者 |

同じScope・Parameter・Sideで有効期間が重ならないようにする。Low側とHigh側それぞれで境界の順序を検証し、使わない側・段階をNULLにする。過去Alertは判定時に使用した`threshold_rule_id`を保持する。

### 6.2 `growth_targets` / `operational_rules`

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `growth_targets` | `id uuid PK`, `farm_id uuid FK ?`, `doc integer !`, `target_abw_g numeric !`, `effective_from timestamptz !`, `effective_to timestamptz ?` | DOCごとの目標ABW。中間DOCは直線補間 |
| `operational_rules` | `id uuid PK`, `farm_id uuid FK ?`, `daily_deadline text !`, `weekly_deadline text !`, `delayed_after_minutes integer !`, `offline_after_minutes integer !`, `attention_duration_minutes integer !`, `production_attention_ratio numeric !`, `production_warning_ratio numeric !`, `effective_from timestamptz !`, `effective_to timestamptz ?` | 提出期限、鮮度、Alert継続、Farm Status |

提出期限の保存型は時刻・曜日・Time zoneを分離する形に変更する可能性がある。日次18:00・週次翌週月曜、Live15分・Offline60分、Behind割合25% / 50%は既存資料の初期値または仮値であり、確定した業務値ではない。

## 7. 養殖記録

### 7.1 `stocking_records`

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | 放養記録 |
| `pond_id` | `uuid` FK ! | Pond |
| `stocked_on` | `date` ! | 放養日 |
| `stocked_count` | `integer` ! | 放養尾数。0より大きい |
| `initial_biomass_kg` | `numeric` ? | 放養時生体量 |
| `species` | `text` ? | 品種 |
| `stocking_density` | `numeric` ? | 放養密度 |

同一Pondの複数養殖サイクルを識別する`production_cycle_id`は必要性を確認する。各KPIは対象サイクルの放養記録を参照する。

### 7.2 `feeding_records` / `mortality_records`

| テーブル | 主な列 | 制約 |
| --- | --- | --- |
| `feeding_records` | `id uuid PK`, `pond_id uuid FK !`, `fed_at timestamptz !`, `feed_type text ?`, `amount_kg numeric !`, `notes text ?` | `amount_kg >= 0` |
| `mortality_records` | `id uuid PK`, `pond_id uuid FK !`, `recorded_on date !`, `deaths_count integer !`, `collected_count integer ?`, `dead_weight_kg numeric ?`, `notes text ?` | CountとWeightは0以上 |

同一日複数回の給餌を許す。死亡記録の1日複数登録と訂正方法は要確認。

### 7.3 `sampling_records` / `laboratory_results`

| テーブル | 主な列 | 制約 |
| --- | --- | --- |
| `sampling_records` | `id uuid PK`, `pond_id uuid FK !`, `sampled_at timestamptz !`, `sample_count integer !`, `total_weight_g numeric !`, `abw_g numeric ?`, `notes text ?` | `sample_count > 0`, `total_weight_g >= 0` |
| `laboratory_results` | `id uuid PK`, `sampling_id uuid FK !`, `tan_mg_l numeric ?`, `no2_mg_l numeric ?`, `vibrio_cfu_ml numeric ?`, `alkalinity_mg_l numeric ?`, `status text !`, `received_at timestamptz ?` | Samplingにつき最大1件。未着はPending |

ABWは`total_weight_g / sample_count`から算出する。個体別重量が入力されない現行項目だけではSize Uniformityを算出できないため、値を架空に作らない。

### 7.4 `health_observations` / `operation_records`

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `health_observations` | `id uuid PK`, `pond_id uuid FK !`, `observed_on date !`, `feeding_condition text ?`, `health_severity text ?`, `observation_flags jsonb ?`, `notes text ?` | 摂餌・トレイ、健康状態、観察項目 |
| `operation_records` | `id uuid PK`, `pond_id uuid FK !`, `occurred_at timestamptz !`, `operation_type text !`, `details jsonb ?`, `recorded_by uuid FK !` | 水交換、Treatment、Maintenance等 |

`observation_flags`と`details`のキーは画面入力項目確定後に制約を追加する。給餌・死亡のように計算へ使用する数値はJSONへ隠さず専用列を使う。

## 8. Alertと通知

### 8.1 `alerts`

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | Alert ID |
| `pond_id` | `uuid` FK ! | 対象Pond。FarmはPondから解決 |
| `parameter` | `text` ! | 対象の水質項目 |
| `severity` | `text` ! | Attention / Warning / Critical |
| `lifecycle_status` | `text` ! | Unacknowledged / Acknowledged / In Progress / Resolved |
| `threshold_rule_id` | `uuid` FK ! | 判定に用いた閾値の版 |
| `observed_value` | `numeric` ? | 発報時値。FM向けAPIでは返さない |
| `occurred_at` | `timestamptz` ! | 発生時刻 |
| `resolved_at` | `timestamptz` ? | 解決時刻 |
| `telemetry_from` | `timestamptz` ! | 関連Sensor Dataの開始 |
| `telemetry_to` | `timestamptz` ! | 関連Sensor Dataの終了 |

同一Pond・Parameterの継続中Alertを複数作らない方式を提案する。再発時は新しい行を作る。重複抑止時間とSeverity更新条件は要確認。

### 8.2 `alert_actions` / `alert_status_history`

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `alert_actions` | `id uuid PK`, `alert_id uuid FK !`, `action_at timestamptz !`, `action_type text !`, `notes text ?`, `outcome text ?`, `recorded_by uuid FK !` | TMの対応。Daily ReportのActions Takenで参照 |
| `alert_status_history` | `id uuid PK`, `alert_id uuid FK !`, `from_status text ?`, `to_status text !`, `changed_at timestamptz !`, `changed_by uuid FK ?` | Acknowledge、対応中、Resolveの履歴 |

外部通知を採用する場合の配送試行・到達記録はチャネル決定後に別テーブルとして設計する。Dashboardへの表示は`alerts`を参照する。

## 9. KPIとReport

### 9.1 KPI計算結果

`production_kpis`は画面応答速度と計算根拠の再現のために保持する設計提案である。

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | KPI計算結果ID |
| `pond_id` | `uuid` FK ! | Pond |
| `as_of_date` | `date` ! | 基準日 |
| `doc` | `integer` ? | 養殖日数 |
| `abw_g` / `adg_g_day` | `numeric` ? | 平均体重 / 日間成長量 |
| `target_abw_g` / `growth_ratio` | `numeric` ? | 目標 / 目標比 |
| `estimated_survivors` | `integer` ? | 推定生存尾数 |
| `survival_rate` / `biomass_t` / `fcr` | `numeric` ? | 生産指標 |
| `value_classes` | `jsonb` ! | 指標ごとのActual / Estimated区分 |
| `calculation_basis` | `jsonb` ! | 元記録ID、式Version、欠損理由 |
| `calculated_at` | `timestamptz` ! | 計算日時 |

同一Pond・基準日・計算Versionの一意制約を設ける案とする。KPIはPond単位。Farm / CompanyではBiomass等を合計し、SRとFCRは分子・分母から再計算する。ABW / ADGは平均しない。不明減耗、FCR、COGS、死亡率の正式式は業務確認待ちである。

### 9.2 `daily_reports` / `daily_report_pond_observations`

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `daily_reports` | `id uuid PK`, `farm_id uuid FK !`, `report_date date !`, `status text !`, `weather text ?`, `rainfall text ?`, `environment_event text ?`, `generator_status text ?`, `summary text ?`, `submitted_by uuid FK ?`, `submitted_at timestamptz ?` | Farm・日付で有効Report一意。Draft / Submitted |
| `daily_report_pond_observations` | `id uuid PK`, `report_id uuid FK !`, `pond_id uuid FK !`, `feeding_condition text ?`, `health_severity text ?`, `observation_flags jsonb ?`, `notes text ?` | ReportとPondの組合せ一意 |
| `report_manual_actions` | `id uuid PK`, `report_id uuid FK !`, `pond_id uuid FK ?`, `action_at timestamptz !`, `action text !`, `outcome text ?` | Alert / Actuator以外の手入力対応 |

Feeding、Mortality、Alert、Actuator操作は元記録を参照する。生Sensor Valueは保存しない。

### 9.3 `weekly_reports`

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | Report ID |
| `farm_id` | `uuid` FK ! | 対象Farm |
| `week_start` / `week_end` | `date` ! | 対象週 |
| `status` | `text` ! | Draft / Submitted |
| `water_quality_comment` | `text` ? | 水質傾向へのTMコメント |
| `technical_summary` | `text` ? | 週次所見 |
| `submitted_by` / `submitted_at` | `uuid FK ?` / `timestamptz ?` | 提出情報 |

同一Farm・週開始日の有効Reportは1件。InfluxDBからPond別のDO最小、pH範囲、水温最大、範囲外の日数と傾向を取得する。Laboratory未着はPendingとして表示する。提出時点の参照元IDと集計期間を保持する。Report修正時のSnapshot / Revision方式は未決定だが、提出済み内容を再現できることを条件とする。

## 10. Actuator・PID・監査

### 10.1 `pid_settings` / `safety_rules`

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `pid_settings` | `id uuid PK`, `actuator_id uuid FK !`, `controlled_parameter text !`, `setpoint numeric !`, `kp numeric !`, `ki numeric !`, `kd numeric !`, `sample_period_ms integer !`, `output_min numeric !`, `output_max numeric !`, `effective_from timestamptz !`, `approved_by uuid FK ?`, `approved_at timestamptz ?` | 対象値とPID設定の版管理 |
| `safety_rules` | `id uuid PK`, `actuator_id uuid FK !`, `input_min numeric ?`, `input_max numeric ?`, `output_min numeric ?`, `output_max numeric ?`, `runtime_limit_seconds integer ?`, `freshness_limit_seconds integer ?`, `fail_safe_action text !`, `effective_from timestamptz !` | Range、Runtime、Sensor鮮度、Fail-safe |

値は実機仕様と養殖条件に基づき決める。本書では制御パラメータの具体値を仮定しない。

### 10.2 `actuator_commands` / `control_actions`

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `actuator_commands` | `id uuid PK`, `actuator_id uuid FK !`, `pond_id uuid FK !`, `requested_by uuid FK ?`, `source text !`, `operation text !`, `requested_value numeric ?`, `duration_seconds integer ?`, `expected_mode text ?`, `status text !`, `safety_result text ?`, `safety_reason text ?`, `requested_at timestamptz !`, `sent_at timestamptz ?`, `acknowledged_at timestamptz ?`, `completed_at timestamptz ?`, `failure_reason text ?`, `idempotency_key text ?` | Commandの要求から結果まで |
| `control_actions` | `id uuid PK`, `command_id uuid FK ?`, `actuator_id uuid FK !`, `pond_id uuid FK !`, `action_at timestamptz !`, `mode text !`, `output_value numeric ?`, `result text !`, `actor_id uuid FK ?` | 実施された操作履歴。Daily Reportから参照 |

`idempotency_key`は要求元と組み合わせて一意にする案とする。Emergency Stop、Override、Safety拒否もCommandまたは操作履歴として残す。Commandの202受付と完了は異なる状態であり、Device応答前にCompletedにしない。

### 10.3 `audit_logs`

| 列 | 型・制約 | 意味 |
| --- | --- | --- |
| `id` | `uuid` PK | 監査ID |
| `actor_id` | `uuid` FK ? | UserまたはSystem処理 |
| `action` | `text` ! | 操作名 |
| `target_type` / `target_id` | `text` ! / `uuid` ? | 対象 |
| `farm_id` / `pond_id` | `uuid` FK ? | 対象範囲 |
| `occurred_at` | `timestamptz` ! | 時刻 |
| `result` | `text` ! | 成功・拒否・失敗 |
| `details` | `jsonb` ? | 変更内容。秘密情報は含めない |

監査対象は管理設定、Alert対応、Report提出・修正、Actuator操作、Override、Emergency Stop。監査ログ閲覧画面は現在の画面要件では対象外である。

## 11. InfluxDB論理スキーマ

InfluxDBの物理用語はVersionによって異なる。ここでは論理名`water_quality`を用い、Database / Bucket、Table / Measurementは製品決定後に対応付ける。

| 分類 | 列・属性 | 説明 |
| --- | --- | --- |
| Time | `measured_at` | Sensorが取得したUTC時刻。時系列検索の軸 |
| Tag候補 | `pond_id`, `device_id`, `sensor_id`, `farm_id` | 発生元の識別。Device割当履歴と整合させる |
| Numeric Field候補 | `do`, `ph`, `temperature`, `tds`, `turbidity`, `water_level` | 測定値。単位は固定 |
| Quality Field候補 | `quality_status`, `received_at`, `delay_seconds` | 品質と受信遅延 |

受信例：

```json
{
  "pond_id": "POND-001",
  "device_id": "DEVICE-001",
  "measured_at": "2026-10-05T04:00:00Z",
  "received_at": "2026-10-05T04:00:04Z",
  "do": 5.6,
  "ph": 7.8,
  "temperature": 28.4,
  "tds": 1850,
  "turbidity": 32.1,
  "water_level": 128,
  "quality_status": "VALID"
}
```

このJSONは論理レコード例であり、InfluxDBへの実際の書込形式ではない。Sensorごとに測定周期・項目が異なるなら、欠損だらけの幅広いTableにせず、同時刻・同一構造の測定単位で分ける。正式なTag / Fieldは採用VersionとQuery要件に合わせて確定する。

### 11.1 品質と時刻

- Edgeが`measured_at`を付け、Ingestionが`received_at`を付ける
- 通信断の再送時も元の`measured_at`を保持する
- Missing、Outlier、Drift、Stuck、Impossible、Timestamp Error、Delayedを区別する方法を決める
- 業務閾値超過は品質不良と同義ではない。物理的に妥当な異常値は保存しAlert判定に使う
- 制御入力には古い値や品質不良の値を使わない
- UTCで保存し、WIBは表示時に変換する

### 11.2 重複・欠損・遅延

同一Sensor・同一時刻の再送を二重計上しない。MQTTの配送保証とInfluxDBの重複書込動作は製品選定後に検証する。重複判定に必要ならEdgeのSequence番号またはMessage IDを追加する。通信断で届かなかった期間を無理に補完せず欠損として示す。遅延到着分を過去Alertや提出済みReportへ反映するかは業務判断が必要である。

### 11.3 検索・集計

| 用途 | Query範囲 |
| --- | --- |
| Pond最新値 | Pond、Sensor、Parameterの最新有効値と品質 |
| Pond履歴 | Pond、Parameter、UTC期間 |
| Alert | Pond、Parameter、有効閾値の期間 |
| Weekly Report | Pond別の週次DO最小、pH範囲、水温最大、範囲外の日数、傾向 |
| Safety / PID | 対象Sensorの最新値、取得時刻、品質 |

Farms Managerには生値を返さず、業務APIでAlertと集約した傾向を返す。System AdministratorにはDevice接続状態だけを返す。

### 11.4 保持・Backup

Raw Data保持期間、集計値の保持期間、Database / Bucket分割、Backup / Restore、高可用性は未決定とする。Pond数、Sensor数、送信間隔、保持年数から容量を見積もって定める。制御判断・Alertの根拠となった時刻範囲は業務DBのAlertやCommandに残す。

## 12. 整合性・索引

### 12.1 業務DBの主要制約

- `users.email`は一意。RoleとStatusは許可値のみ
- Pondは必ずFarmへ、Farmは必ずCompanyへ所属する
- Device割当の有効期間は重複させない
- 閾値の同一Scope・Parameter・Sideの有効期間は重複させない
- Daily ReportはFarm・日付で、Weekly ReportはFarm・週開始日で有効行を一意にする
- Samplingの尾数、Feed量、死亡数、Actuator時間は負値を拒否する
- Report提出後の通常更新を拒否し、修正履歴を残す

### 12.2 索引候補

- `ponds(farm_id)`、`user_farm_assignments(user_id, farm_id)`
- `device_assignments(device_id, assigned_at, unassigned_at)`
- `alerts(pond_id, lifecycle_status, occurred_at)`
- `feeding_records(pond_id, fed_at)`、`mortality_records(pond_id, recorded_on)`、`sampling_records(pond_id, sampled_at)`
- `daily_reports(farm_id, report_date)`、`weekly_reports(farm_id, week_start)`
- `actuator_commands(actuator_id, requested_at)`、`actuator_commands(status, requested_at)`

### 12.3 DB間の失敗

InfluxDB書込成功と業務DBのAlert保存は1つのTransactionにできない。Sensor値を保存した後にAlert判定が失敗した場合、未判定期間を記録して再判定する仕組みが必要である。具体的な再処理方式はBroker、Ingestionの配置を決めて設計する。Reportの週次集計にInfluxDBを使えない場合は数値を推測せず、対象の水質欄を取得不能とする。

## 13. 確定前に必要な判断

| 項目 | 判断内容 |
| --- | --- |
| 業務DB | PostgreSQLを正式採用するか、ID形式、Backup方針 |
| 管理階層 | Estateの有無、Company複数利用の有無 |
| 養殖サイクル | 再放養時のProduction Cycle識別方法 |
| KPI | 不明減耗、FCR、COGS、死亡率、Size Uniformityの正式な元データと式 |
| Report | 提出後Revision / Snapshot、遅延Sensor Dataの反映方針 |
| Alert | 継続中Alertの一意単位、過去データ再判定方針 |
| Actuator | 実機状態、PID実行場所、安全状態、Command応答仕様 |
| InfluxDB | Version、提供形態、Tag / Field、保持期間、集計・Backup |
