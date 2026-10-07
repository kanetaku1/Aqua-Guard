# データベース詳細設計

| 項目 | 内容 |
| --- | --- |
| 版 | 0.7（SSEによる管理画面内の即時通知） |
| 更新日 | 2026-10-06 |
| 基準 | [OpenAPI](../api/openapi.yaml)、[API詳細設計](./api_design.md)、[KPI定義](../../frontend/docs/04_KPI・データ項目定義書.md)、[画面要件](../../frontend/docs/05_画面・機能要件書.md) |
| 関連資料 | [全体設計](../backend_architecture_overview.md)、[ダイアグラム](../backend_architecture_diagrams.md) |

## 1. 設計方針

**InfluxDBはIoTデバイスから取得する測定値、Heartbeat、設備からの状態通知などの時系列データを管理する。PostgreSQLは、それ以外のユーザー・マスタ・運用設定・養殖記録・Alert・Issue・Report・制御要求・監査を管理する。** PostgreSQLにセンサーの生時系列や設備の生通知を複製しない。Alert発報時の値、Weekly Reportの週次集計、提出済みReportのスナップショットは、それぞれの業務判断・報告の証跡であり、PostgreSQLに保存する。

本書は`openapi.yaml`の既存APIを実装するためのDB設計である。APIのパス・フィールド・enum・HTTPステータスを変更しない。APIにない放養記録、Command追跡、Emergency Stop、PID設定のWeb操作は[API詳細設計第11章](./api_design.md)の追加提案として区別する。DBに将来の内部行を設けても、公開APIが増えたことにはならない。AI助言・ML予測・AI制御・収益予測の保存領域は設けない。

InfluxDBのVersion・提供形態は未決定のため、第10章は製品固有のDDLではなく論理スキーマとする。PostgreSQLは採用方針として扱い、テーブル・型・制約・索引を設計する。

## 2. 共通規則とID

| 項目 | 設計 |
| --- | --- |
| 内部PK/FK | PostgreSQLは`uuid`。FKは内部UUIDを参照する |
| APIのID | `text`の`public_id`を一意に保持し、APIの`id`、`farmId`、`pondId`等へ返す。`farm-a`、`ALT-1042`等の文字列例と両立する |
| Device ID | `devices.device_id text UNIQUE`。APIの`AdminDevice.deviceId`、Sensorの`deviceId`、Actuatorの`id`に使う。内部PKは別のUUID |
| カラム名 | PostgreSQLでは`snake_case`、APIではOpenAPIの`camelCase`へ変換する |
| 時刻 | `timestamptz`でUTC保存。IoTの計測時刻と受信時刻は別にする |
| 業務日 | `date`は**WIB（UTC+7）の暦日**。`farms.time_zone`の初期値は`Asia/Jakarta`だが、現行APIの業務日境界はWIB固定 |
| 数値 | 金額以外の業務量・設定値・KPIは原則`numeric`。面積は`area_ha`、重量は`*_kg`、ABWは`*_g`、割合は`*_pct`。APIの`88`は88% |
| 編集履歴 | 編集可能な行に`created_at`、`updated_at`、`row_version bigint`。APIに未定義のVersionフィールドを要求せず、DB内部の楽観制御や行ロックに使う |
| 削除 | Farm、Pond、Device、養殖記録、Alert、提出済みReport、Command、監査は原則物理削除しない |

すべての業務テーブルのFKを`ON DELETE RESTRICT`または論理無効化に合わせ、過去Report・Alert・監査の参照を壊さない。Role・状態・項目の許可値はOpenAPIのenumと一致させる。`NULL`は未取得・未算出・未着を示し、0と区別する。例示する`numeric(18,6)`等の精度は、実データの最大値を測定したうえでMigration時に確定する。

## 3. データの所有と読み取り

| 対象 | 正本 | API・処理での利用 |
| --- | --- | --- |
| センサー6項目の生測定値、品質、計測・受信時刻 | InfluxDB | `sensors/current`、`series`、`history`、週次水質集計、Alert判定 |
| IoT設備のHeartbeat・実状態・故障通知 | InfluxDB | Deviceの`connection`・`lastSeenAt`、Actuatorの`state`・`mode`、設備故障判定 |
| Farm/Pond/Device割当、権限、閾値・成長目標・Rules | PostgreSQL | Admin API、受信時の割当照合、業務判定 |
| 放養・給餌・死亡・Sampling・Laboratory、Report入力 | PostgreSQL | 現場記録、KPI、Report |
| Alert、Issue、Anomaly区間、Farm状態履歴 | PostgreSQL | FM/TMの状態表示と対応履歴。判定の元となる生時系列はInfluxDB |
| Actuator Command、Safety判断、操作結果 | PostgreSQL | 再送防止、監査、`actuator-logs`。機器が送った生通知はInfluxDB |
| Report提出時の集計結果 | PostgreSQL | 提出済みReportを当時の内容のまま再現するための派生値 |
| IngestionのMessage ID・Critical判定状態・処理Checkpoint | PostgreSQL | 受信ごとの判定、冪等化と再処理のメタデータ。測定値本文は保持しない |

InfluxDBとPostgreSQLの間にFKや分散Transactionはない。APIはRole・Company・担当FarmをPostgreSQLで確認してからInfluxDBを問い合わせる。InfluxDBのタグにあるFarm/Pond IDは受信時の割当結果であり、認可の根拠にはしない。古い測定値の表示・安全制御・Alert判定は別々に鮮度と品質を判定する。

## 4. 認証・組織・機器マスタ（PostgreSQL）

### 4.1 組織とユーザー

| テーブル | 主な列 | 制約・対応API |
| --- | --- | --- |
| `companies` | `id uuid PK`, `public_id text UNIQUE`, `name text`, `status text` | Farmの親。FMのCompany境界 |
| `farms` | `id uuid PK`, `public_id text UNIQUE`, `company_id uuid FK`, `name text`, `location text`, `time_zone text DEFAULT 'Asia/Jakarta'`, `status text` | `AdminFarmInput`。`status IN ('active','inactive')` |
| `ponds` | `id uuid PK`, `public_id text UNIQUE`, `farm_id uuid FK`, `name text`, `area_ha numeric`, `status text` | `AdminPondInput`。`area_ha > 0`、`status IN ('in_operation','fallow')` |
| `users` | `id uuid PK`, `public_id text UNIQUE`, `company_id uuid FK`, `name text`, `email text`, `password_hash text`, `role text`, `status text`, `language text`, `failed_login_count integer`, `locked_until timestamptz`, `last_sign_in_at timestamptz` | `Me`／`AdminUser`。`role IN ('farms_manager','technical_manager','system_administrator')`、`language IN ('en','id')`、`status IN ('invited','active','deactivated')` |
| `user_farm_assignments` | `id uuid PK`, `user_id uuid FK`, `farm_id uuid FK`, `assigned_at timestamptz`, `unassigned_at timestamptz` | TMの担当Farm履歴。現行`Me.farm`とAdminの単数`farmId`に合わせ、有効な割当はユーザーあたり最大1件 |

`users.email`は`lower(email)`の一意索引で大文字小文字を区別しない。Invitedユーザーの`password_hash`はNULLを許し、Active化時には必須にする。TM以外に有効なFarm割当を持たせない。AdminのFarm変更時は旧割当を閉じて新割当を作る。FMは自分のCompany配下、TMは有効な担当Farm配下のみ業務APIで参照できる。SAはAdmin APIのみ利用する。最後の有効なSAのRole変更・無効化は、同一CompanyのSA行をTransaction内でロックして拒否する。自分自身の無効化も拒否する。

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `auth_sessions` | `id uuid PK`, `user_id uuid FK`, `token_hash text UNIQUE`, `created_at`, `last_activity_at`, `expires_at`, `revoked_at` | OpenAPI仮置きのCookie Session。Cookie原文は保存しない。無操作12時間で失効 |
| `password_tokens` | `id uuid PK`, `user_id uuid FK`, `token_hash text UNIQUE`, `purpose text`, `expires_at`, `used_at`, `created_at` | `purpose IN ('invite','reset')`。招待72時間、再設定1時間。使用は1回限り |
| `auth_attempts` | `id uuid PK`, `email_key text`, `attempted_at`, `result text` | 連続5回失敗・15分ロックの判定。アカウント有無をAPIへ漏らさない |

認証方式がCookie以外に変わる場合もOpenAPIの契約更新を先に行う。招待・再設定Tokenの原文、パスワード、セッションCookie値をログ・監査へ保存しない。

### 4.2 Device割当

| テーブル | 主な列 | 制約・対応API |
| --- | --- | --- |
| `devices` | `id uuid PK`, `device_id text UNIQUE`, `type text`, `parameter text NULL`, `enabled boolean`, `created_at`, `updated_at` | `AdminDeviceInput`。`type IN ('sensor','aerator','pump')`。Sensorのみ`parameter`が6項目のいずれか、それ以外はNULL |
| `device_assignments` | `id uuid PK`, `device_id uuid FK`, `pond_id uuid FK`, `assigned_at timestamptz`, `unassigned_at timestamptz` | DeviceのPond割当履歴。同一Deviceの期間重複を禁止。現在割当は最大1件 |
| `device_config_versions` | `id uuid PK`, `device_id uuid FK`, `type text`, `parameter text NULL`, `effective_from timestamptz`, `effective_to timestamptz NULL` | Type・Sensor Parameterの変更履歴。遅延到着した点は計測時刻に有効だった設定で解釈する |
| `actuator_control_configs` | `device_id uuid PK/FK`, `desired_mode text`, `auto_rule_label text NULL`, `emergency_latched boolean`, `updated_at` | 管理側の制御意図。観測された実状態ではない |

APIの`AdminDevice.connection`／`lastSeenAt`は、Device割当とInfluxDBの最新Heartbeat／測定／状態通知を結合して返す。`Actuator.state`と観測済み`mode`もInfluxDBの設備通知から返す。PostgreSQLの`desired_mode`を実状態として表示しない。Deviceの再割当時は旧期間を閉じて新期間を作り、過去のIoTデータは**当時のPondタグ・割当期間・設定版**で参照する。`device_id`は実機の識別子として固定し、交換は新しいDevice登録と旧Deviceの内部無効化で扱う。既存の`PATCH /admin/devices/{deviceId}`では同じ`deviceId`を送る。ID自体の変更が必要なら、過去の点と認証情報を追跡できる別手順を確定する。`devices.type`にOpenAPI未定義の`edge`を追加しない。Edgeゲートウェイの識別が必要になった場合は内部認証資産として別に管理し、公開Device enumを変えない。

## 5. 運用設定（PostgreSQL）

設定は版を持つ。保存時に現在版を閉じ、新版を有効化する。過去Alert、日次Farm状態、提出済みReportは再判定・上書きしない。

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `threshold_sets` | `id uuid PK`, `farm_id uuid FK NULL`, `effective_from timestamptz`, `effective_to timestamptz NULL`, `updated_by uuid FK`, `updated_at` | `farm_id IS NULL`は全Farm共通、非NULLはFarm上書き。Scopeごとに現在版は1件 |
| `threshold_values` | `set_id uuid FK`, `parameter text`, `unit text`, `critical_low numeric NULL`, `warning_low numeric NULL`, `attention_low numeric NULL`, `attention_high numeric NULL`, `warning_high numeric NULL`, `critical_high numeric NULL` | PK `(set_id, parameter)`。対象はSensor 6項目＋Lab 4項目。未使用側はNULL |
| `growth_target_sets` | `id uuid PK`, `on_track_band_pct numeric`, `effective_from`, `effective_to`, `updated_by uuid FK` | OpenAPIは共通設定のみ。Farm別設定列は設けない |
| `growth_target_points` | `set_id uuid FK`, `doc integer`, `target_abw_g numeric` | PK `(set_id, doc)`。`doc >= 0`、`target_abw_g > 0`。中間DOCは直線補間 |
| `operational_rule_versions` | `id uuid PK`, `daily_report_due time`, `weekly_report_due_weekday smallint`, `sensor_delayed_after_minutes integer`, `sensor_offline_after_minutes integer`, `attention_to_alert_minutes integer`, `production_attention_pct numeric`, `production_warning_pct numeric`, `effective_from`, `effective_to`, `updated_by uuid FK` | OpenAPIの`RuleSettingsInput`と1対1。共通設定のみ |
| `critical_detection_policy_versions` | `id uuid PK`, `max_input_age_seconds integer`, `effective_from timestamptz`, `effective_to timestamptz NULL`, `updated_at timestamptz` | 即時判定用の内部鮮度設定。正の秒数。APIのRulesに新しいフィールドを加えず、運用設定・監査で版管理。初期値は検知期限と実機周期から確定 |

ThresholdのFarm別取得では、現在のFarm版にあるParameterはその値を使い、ないParameterは共通版を返して`inherited: true`とする。この値は保存せず導出する。Low側はNormalから離れるにつれAttention→Warning→Critical、高側も同様の順序で検証し、逆転時は422。設定のPUTは同一Scopeの版更新をTransactionで完結させる。Rulesでは`delayed < offline`、`production_attention_pct < production_warning_pct`等の整合性を検証する。`daily_report_due`は`HH:mm`、週次曜日は1=月曜～7=日曜へ変換してAPIに返す。期限の時刻はWIBで解釈する。18:00、翌週月曜、15分、60分、30分、25%／50%は初期値・仮値であり固定値として埋め込まない。

## 6. 養殖記録とKPI（PostgreSQL）

### 6.1 放養・養殖サイクル

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `production_cycles` | `id uuid PK`, `pond_id uuid FK`, `started_on date`, `ended_on date NULL`, `status text` | 同一Pondの養殖回を区別。終了日が開始日より前にならない。有効サイクルはPondあたり最大1件 |
| `stocking_records` | `id uuid PK`, `public_id text UNIQUE`, `cycle_id uuid FK UNIQUE`, `pond_id uuid FK`, `stocked_on date`, `stocked_pl integer`, `initial_biomass_kg numeric NULL`, `recorded_by uuid FK`, `created_at`, `updated_at` | `stocked_pl > 0`、`initial_biomass_kg >= 0`。API既存の`stockedOn`／`stockedPl`へ対応 |

`production_cycles.started_on = stocking_records.stocked_on`とする。給餌・死亡・Sampling・KPIは対象サイクルに結び、再放養後に旧サイクルの累積値を混ぜない。放養記録の登録・更新APIは**現行OpenAPIにない**ため、既存のPond取得・KPI APIの入力源としてデータを持ちつつ、外部からの編集経路はAPI追加合意後に確定する。既存データ移行時は出典と登録者を保持する。初期Biomassが不明ならFCRを架空の0や数値で返さない。

### 6.2 現場記録

| テーブル | 主な列 | 制約・対応API |
| --- | --- | --- |
| `feeding_records` | `id uuid PK`, `public_id text UNIQUE`, `pond_id uuid FK`, `cycle_id uuid FK NULL`, `record_date date`, `amount_kg numeric`, `rounds integer`, `feed_type text`, `appetite text NULL`, `tray text NULL`, `note text NULL`, `recorded_by uuid FK`, `created_at`, `updated_at` | `FeedingInput`。`amount_kg >= 0`、`rounds >= 0`。同日複数記録可 |
| `mortality_records` | `id uuid PK`, `public_id text UNIQUE`, `pond_id uuid FK`, `cycle_id uuid FK NULL`, `record_date date`, `count integer`, `weight_kg numeric NULL`, `abnormal boolean NULL`, `note text NULL`, `recorded_by uuid FK`, `created_at`, `updated_at` | `MortalityInput`。`count >= 0`、`weight_kg >= 0` |
| `sampling_records` | `id uuid PK`, `public_id text UNIQUE`, `pond_id uuid FK`, `cycle_id uuid FK NULL`, `sample_date date`, `sample_count integer NULL`, `sample_weight_g numeric NULL`, `tan numeric NULL`, `no2 numeric NULL`, `vibrio numeric NULL`, `alkalinity numeric NULL`, `recorded_by uuid FK`, `created_at`, `updated_at` | `SamplingInput`。`UNIQUE (pond_id, sample_date)`、`sample_count > 0`（非NULL時）、測定値は非負 |

`feeding_records.appetite`は`good`／`reduced`／`poor`、`tray`は`clean`／`leftover`。`sampling_records`の4検査項目は後着を許す。`sample_count`と`sample_weight_g`は両方そろった場合にABWを計算し、片方のみの保存は422とする。OpenAPIでは両方とも任意／nullなので、検査値だけの記録は許す。Laboratoryの`labPending`は未着・未確認状態から導出する。必要なら`lab_confirmed_at`／`lab_confirmed_by`を内部列として持つ。VibrioはAPIの`×10³ CFU/mL`の数値をそのまま保存し、単位の異なる生値を混在させない。

一括Samplingは`(pond_id, sample_date)`でUpsertし、指定された`entries`だけを1Transactionで処理する。権限外Pondや異なるFarmのPondが1件でもあれば全件拒否し、途中まで保存しない。通常のPOSTで同一Pond・日付が重複した場合の409と、訂正のPATCHは既存APIの状態に従う。`recorded_by`は初回登録者、`updated_at`と監査で訂正履歴を追う。記録日の未来日可否は既存APIに記載された個別規則を優先する。

### 6.3 KPI結果

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `pond_kpi_snapshots` | `id uuid PK`, `pond_id uuid FK`, `cycle_id uuid FK`, `as_of_date date`, `sampling_id uuid FK NULL`, `calculation_version text`, `doc integer NULL`, `abw_g numeric NULL`, `adg_g_per_day numeric NULL`, `target_abw_g numeric NULL`, `vs_target_pct numeric NULL`, `estimated_survivors numeric NULL`, `survival_rate_pct numeric NULL`, `biomass_kg numeric NULL`, `fcr numeric NULL`, `size_uniformity_pct numeric NULL`, `basis jsonb`, `calculated_at timestamptz` | `UNIQUE (cycle_id, as_of_date, calculation_version)`。元記録ID・設定版・欠損理由を`basis`に保持 |
| `farm_status_daily` | `farm_id uuid FK`, `status_date date`, `status text`, `water_quality text`, `growth text`, `operations text`, `main_reason text`, `rule_version_id uuid FK`, `computed_at timestamptz` | PK `(farm_id, status_date)`。`/status-trend?days=`の過去日別状態を固定 |

KPIはPond・サイクル単位で算出する。DOC=`基準日 - stocked_on`、ABW=`sample_weight_g / sample_count`、ADGは同じサイクル内の前回Samplingとの差、目標比は`(ABW / targetABW - 1) × 100`。Survival RateとBiomassはEstimated。`biomass_kg = estimated_survivors × abw_g / 1000`。Farm／CompanyのBiomassは合計、SRは`Σ推定生存尾数 / Σ放養尾数 × 100`、FCRは`Σ累積給餌量 / Σ増重量`で再計算し、Pond比率やABW・ADGを単純平均しない。0除算・未入力・古いデータはNULLと欠損理由にする。現行Sampling入力に個体別重量はないため、Size Uniformityは算出できずNULL。不明減耗の推定方法とFCRの正式な分母はKPI資料でも未確定であり、式Version確定まで推定値を創作しない。

現在のFarm状態は有効なAlert、Pond成長、設備・センサー接続、Report提出状況から導出する。`farm_status_daily`はWIBの日ごとの判定結果を保存し、後日の設定変更で過去の表示を変えない。`/production/summary`等は必要なPondスナップショットから集計し、FMには生センサー値を渡さない。

## 7. Alert・Issue・Anomaly（PostgreSQL）

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `alerts` | `id uuid PK`, `public_id text UNIQUE`, `pond_id uuid FK`, `parameter text`, `severity text`, `state text`, `observed_value numeric NULL`, `threshold_value numeric NULL`, `threshold_set_id uuid FK NULL`, `occurred_at timestamptz`, `acknowledged_at timestamptz NULL`, `acknowledged_by uuid FK NULL`, `resolved_at timestamptz NULL`, `resolve_note text NULL`, `telemetry_from timestamptz NULL`, `telemetry_to timestamptz NULL` | `Alert`／`AlertDetail`。`parameter`はSensor項目または`sensor_offline`。値は発報時の証跡であり、生時系列の複製ではない |
| `alert_actions` | `id uuid PK`, `public_id text UNIQUE`, `alert_id uuid FK`, `performed_at timestamptz`, `type text`, `note text NULL`, `recorded_by uuid FK`, `created_at` | `AlertActionInput`／`AlertAction`。最初の対応でAlertを`in_progress`へ |
| `alert_state_history` | `id uuid PK`, `alert_id uuid FK`, `from_state text`, `to_state text`, `changed_at timestamptz`, `changed_by uuid FK NULL` | Acknowledge、対応中、Resolveの監査 |
| `sensor_anomaly_intervals` | `id uuid PK`, `pond_id uuid FK`, `parameter text`, `severity text`, `started_at timestamptz`, `ended_at timestamptz NULL`, `extreme_value numeric NULL`, `threshold_set_id uuid FK NULL`, `alert_id uuid FK NULL` | `SensorAnomaly`。時間区間と判定の派生結果のみ |
| `equipment_incidents` | `id uuid PK`, `device_id uuid FK`, `pond_id uuid FK`, `failure text`, `occurred_at timestamptz`, `resolved_at timestamptz NULL`, `action text NULL`, `status text` | IoT故障通知や点検結果から作る業務イベント。Daily Reportの`equipmentEvents`と設備起点Issueの元データ |
| `issues` | `id uuid PK`, `public_id text UNIQUE`, `farm_id uuid FK`, `pond_id uuid FK`, `issue_type text`, `parameter text`, `severity text`, `trend text`, `state text`, `source_type text`, `source_id uuid`, `since timestamptz`, `resolved_at timestamptz NULL`, `summary text NULL`, `trend_description text NULL` | FM向け`Issue`／`IssueDetail`の安定したID。Alert等から継続的に更新し、Report提出を待たない |
| `alert_detection_states` | `id uuid PK`, `pond_id uuid FK`, `device_id uuid FK`, `parameter text`, `direction text`, `episode_no bigint`, `current_alert_id uuid FK NULL`, `live_measured_through timestamptz NULL`, `live_event_id text NULL`, `critical_active boolean`, `periodic_measured_through timestamptz NULL`, `periodic_severity text NULL`, `periodic_anomaly_started_at timestamptz NULL`, `updated_at timestamptz` | `UNIQUE (pond_id, device_id, parameter, direction)`。`direction IN ('low','high')`。両判定経路で行ロックする。異常区間の状態のみで生の測定列を保存しない |
| `alert_notification_outbox` | `id uuid PK`, `alert_id uuid FK`, `event_kind text`, `detected_at timestamptz`, `status text`, `attempt_count integer`, `next_attempt_at timestamptz NULL`, `materialized_at timestamptz NULL`, `last_error text NULL` | `UNIQUE (alert_id, event_kind)`。初回Critical／Critical昇格は`event_kind='critical_detected'`。`status IN ('pending','materialized','failed','no_recipient')`。`materialized`は利用者通知と配送依頼を保存済みという意味で、受信・既読ではない |

Alertの`severity`（`normal`／`attention`／`warning`／`critical`のうち発報対象）と`state`（`unacknowledged`／`acknowledged`／`in_progress`／`resolved`）は別軸。`issues.state`は`ongoing`／`resolved`で別enum。`issues.issue_type`は`water_quality`／`mortality`／`equipment`／`sensor`。Alert起点のIssueは`source_type='alert'`と`source_id=alerts.id`を一意にし、対応記録は`alert_actions`から参照する。設備起点のIssueは`equipment_incidents`を参照する。Alert以外のIssue生成元と詳細の本文は対応する業務イベントから作る。

受信ごとの経路は、有効かつ鮮度条件内のSensor点をCritical境界で判定する。該当すればAlert・Anomaly・Issue・Outbox・Receiptの判定完了をPostgreSQLの1Transactionで保存する。非Critical点ではCritical判定の完了と最新判定位置のみ記録し、Warning／Attentionの新規Alertは作らない。5分経路は未処理区間の全点から通常Alert・Attention継続・回復を判定し、Alert・Anomaly・Issue・検知状態・Checkpointを1Transactionで更新する。区間の途中にあるCriticalは既存の受信判定へ照合し、即時経路と同じAlertに結び付ける。

`alerts`に内部列`detection_state_id uuid FK NULL`、`episode_no bigint NULL`、`detection_source text`（`ingestion`／`periodic`）、`detected_at timestamptz`、`critical_detected_at timestamptz NULL`を追加する。`occurred_at`は元の計測時刻、`detected_at`は検知・保存時刻で区別し、新しい列は現行APIへ返さない。閾値がFarm上書きか共通かを確定して`threshold_set_id`へ保存する。各点は計測時刻に有効な版で判定し、過去行を設定変更で書き換えない。

### 7.1 即時処理と5分処理の競合防止

両経路は同じ検知状態行を`SELECT FOR UPDATE`し、初回行の同時作成は一意制約＋再試行で直列化する。`UNIQUE (detection_state_id, episode_no)`（双方非NULLの行）で1異常区間に1Alertとする。未解決の同一区間のWarningがあればそのAlertをCriticalへ昇格し、確認者・対応履歴を保持する。Critical通知Outboxは1Alertあたり1件なので再送・5分再読込・同時実行で増えない。異常区間が終わるまで同じAlertを使い、回復後の再発は`episode_no`を増やして新しいAlertを作る。TMが解決済みにした後に新しい有効なCritical点を受信した場合も新しいAlertとし、同じEventの再送では新規作成しない。

即時経路の`live_measured_through`と5分経路の`periodic_measured_through`を分け、旧点による即時状態の巻戻しを防ぐ。5分処理の古いWarningで既存Criticalの`severity`を下げない。同一Alertの重大度はその区間の最高重大度を保持し、現在の水質はSensor APIから返す。回復点が即時判定位置より古い場合は現在区間を閉じず、履歴だけを補完する。通常処理の継続時間は前周期の`periodic_anomaly_started_at`を引き継ぎ、欠測時間を自動的に異常継続とみなさない。回復とTMによる`resolve`は別の操作であり、自動回復で対応履歴や解決時刻を書き換えない。

未完了Receiptを復旧する場合の順序検査は、同じ検知状態の即時・定期の両処理位置を確認する。5分処理がすでに後の回復点まで進んでいれば、古いCritical点を現在の異常として再開しない。過去点は計測時刻と`telemetry_from`／`telemetry_to`で既存のAlert区間に照合し、現在の`current_alert_id`だけを根拠に別区間へ結び付けない。昇格時の値・閾値・閾値版はCriticalを検知した点の証跡へ更新し、後の古い点で上書きしない。

古い受信点・不正な時刻・無効な品質・順序逆転は即時Critical発報に使わず理由をReceiptに残す。遅延点は5分の履歴処理で過去区間を補完できるが、現在の危険としてCritical通知Outboxを作らない。`resolve`は状態と解決時刻を同一Transactionで更新し、検知状態とAlertの順にロックして検知との競合を抑える。状態競合は409。Alertの対応はDaily ReportのActions Takenへ`alert_handling`として参照される。

### 7.2 Critical即時通知の保存と配送

通知の正本もPostgreSQLに置く。InfluxDBの構造は変更しない。配送はSSEによる管理画面内通知のみとし、通知APIは[API設計第11.4節](./api_design.md)に記載する。

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `user_notifications` | `id uuid PK`, `public_id text UNIQUE`, `outbox_id uuid FK`, `user_id uuid FK`, `farm_id uuid FK`, `pond_id uuid FK`, `recipient_role text`, `alert_id uuid FK NULL`, `issue_id uuid FK NULL`, `stream_sequence bigint`, `summary text`, `created_at timestamptz`, `client_received_at timestamptz NULL`, `read_at timestamptz NULL` | `UNIQUE (outbox_id, user_id)`、`UNIQUE (user_id, stream_sequence)`。TMはAlert、FMはIssueのどちらか一方を参照。FMのsummaryは生Sensor値なし。受信・既読はAlertの対応状態と独立 |
| `notification_stream_cursors` | `user_id uuid PK/FK`, `last_sequence bigint`, `updated_at timestamptz` | 利用者ごとのSSE Sequence採番。利用者行をロックし、通知保存と同じTransactionで増加させる |
| `notification_deliveries` | `id uuid PK`, `notification_id uuid FK`, `channel text`, `delivery_key text`, `status text`, `attempt_count integer`, `next_attempt_at timestamptz NULL`, `dispatched_at timestamptz NULL`, `expires_at timestamptz NULL`, `last_error text NULL`, `updated_at timestamptz` | `UNIQUE (notification_id, channel, delivery_key)`。`channel = 'sse'`のみ。利用者ストリーム単位の配送メタデータで、各SSE接続への配信を抑止するフラグではない。`status IN ('pending','available','dispatched','retry_wait','failed','revoked','expired')` |

OutboxのCommit後、Dispatcherは`pending`行を`FOR UPDATE SKIP LOCKED`で取得し、対象Farmの有効なTMと同Companyの有効なFMへ通知を作る。TMにはAlert参照、FMにはIssue参照を保存する。対象ユーザーを安定した順で処理し、Cursor行をロックしてSequenceを採番する。利用者通知、SSE配信可能状態・配送メタデータ、Outboxの`materialized`更新を1TransactionでCommitする。ユーザーごとの採番をTransaction内で直列化するため、遅れてCommitした通知が先に進んだSSE Cursorの背後へ取り残されない。宛先が0人なら`no_recipient`を記録して運用監視する。

Commit後のPostgreSQL通知は配送・SSEを起動する合図として使い、Payloadは通知IDなどの参照だけとする。合図が失われても、Dispatcherは1秒間隔の未処理検索、SSEはDBの未配信Sequence検索で復旧する。複数のSSEプロセスは合図をそれぞれ受け取り、自分の接続ユーザーへ配信する。1プロセスの送信成功で他プロセスの接続への配信を省略しない。新規接続・再接続は本人の保持済み通知から再送し、通知作成と接続開始が競合しても取りこぼさない。

SSEへのネットワーク書込はDBロックを持たずに行い、結果は別Transactionで保存する。SSEは各接続のCursorから再送し、送信と結果保存の間の障害でも同じnotificationIdを使う。複数プロセス・接続で共通の配送行を独占して配信を省略しない。少なくとも1回の配送試行を前提にクライアント側で重複表示を抑止する。SSE書込成功は`dispatched`、クライアント受信は`user_notifications.client_received_at`、既読は`read_at`で区別する。

初回の通知作成・接続中の画面への配送はCommit直後に開始し、一時障害は1秒、5秒、15秒、以後最大60秒間隔で再試行する。恒久エラーは`failed`、一時障害は`retry_wait`とし、他の宛先は続行する。未接続の利用者も通知を保存して`available`とし、配送成功とは扱わない。再接続時には保持期間内の未受信通知を元の発生時刻付きで再送する。緊急表示の期限後は配送を`expired`とし、過去の通知として再送・一覧確認はできるが現在発生した危険として表示しない。通知保持期間、緊急表示の期限と試行上限は受入前に確定する。ページを閉じている間の端末通知は行わない。

配送直前とSSEの各イベント送信時にRole・現在の所属・アカウント状態・セッションを再検査する。Roleが`recipient_role`と異なる旧通知も配送対象から外す。権限を失った宛先は`revoked`にし、接続を閉じる。通知の既読・受信APIも本人かつ現在の権限内の行だけ更新する。ログアウト・セッション失効・ユーザー無効化時はSSE接続を閉じる。既存ログアウトAPIへ新しい入力を要求せず、204契約を維持する。

監視はCritical保存から通知作成・送信開始・クライアント受信までの遅延、未処理Outbox、再試行・恒久失敗・宛先不在を対象とする。通知の保存・送信成功で人間が対応済みになったとみなさない。保持期間内の通知は再接続で再送し、Cursor保持期間外はAPIの409で一覧再同期を要求する。

## 8. Report（PostgreSQL）

DailyとWeeklyは共通の`reports`でID・Farm・状態を管理する。これにより`POST /reports/{reportId}/submit`で種別に依存せず1件をロックでき、同じIDの重複を避けられる。

| テーブル | 主な列 | 制約・用途 |
| --- | --- | --- |
| `reports` | `id uuid PK`, `public_id text UNIQUE`, `farm_id uuid FK`, `type text`, `status text`, `report_date date NULL`, `week_start date NULL`, `week_end date NULL`, `technical_manager_id uuid FK`, `due_at timestamptz`, `saved_at timestamptz NULL`, `submitted_at timestamptz NULL`, `submitted_by uuid FK NULL`, `created_at`, `updated_at`, `row_version bigint` | `type IN ('daily','weekly')`、`status IN ('draft','submitted')`。Dailyは`report_date`のみ、Weeklyは月曜`week_start`と`week_end`を持つ |
| `daily_report_inputs` | `report_id uuid PK/FK`, `weather text NULL`, `rainfall_mm numeric NULL`, `events text NULL`, `generator text NULL`, `summary text NULL` | `DailyReportInput.environment`と`summary`。提出時はWeather・Summary必須 |
| `daily_report_pond_inputs` | `report_id uuid FK`, `pond_id uuid FK`, `appetite text NULL`, `tray text NULL`, `health text NULL`, `observations text[]`, `health_note text NULL` | PK `(report_id, pond_id)`。DailyのPond別観察。給餌量・死亡数をここへ複製しない |
| `report_excluded_alerts` | `report_id uuid FK`, `alert_id uuid FK` | PK `(report_id, alert_id)`。Dailyの`excludedAlertIds` |
| `report_manual_actions` | `id uuid PK`, `public_id text UNIQUE`, `report_id uuid FK`, `pond_id uuid FK NULL`, `at timestamptz`, `action text`, `outcome text NULL`, `sort_order integer` | Dailyの`manualActions`。PATCHで送った全件で置換し、既存IDを持つ行は同じReport内に限定 |
| `weekly_report_inputs` | `report_id uuid PK/FK`, `water_quality_comment text NULL`, `laboratory_confirmed boolean`, `technical_summary text NULL` | `WeeklyReportInput`。提出時はTechnical Summary必須 |
| `weekly_report_alert_notes` | `report_id uuid FK`, `alert_id uuid FK`, `cause text NULL`, `action text NULL`, `outcome text NULL` | PK `(report_id, alert_id)`。Weeklyの`alertNotes` |
| `report_snapshots` | `report_id uuid PK/FK`, `schema_version text`, `payload jsonb`, `source_cutoff_at timestamptz`, `influx_queried_at timestamptz NULL`, `created_at timestamptz` | Submitted時の`DailyReport`／`WeeklyReport`応答を固定。生センサー時系列は入れない |
| `report_source_refs` | `report_id uuid FK`, `source_type text`, `source_id uuid`, `source_updated_at timestamptz NULL` | 元の給餌・死亡・Sampling・Alert・Action・Actuator Logを追跡。PKは3列の組合せ |

`reports`にはDailyの`UNIQUE (farm_id, report_date) WHERE type='daily'`とWeeklyの`UNIQUE (farm_id, week_start) WHERE type='weekly'`を置く。`week_start`はWIBの月曜、`week_end`は同週の日曜。Reportの`overdue`は`/farms/{farmId}/report-status`用の導出状態で、`reports.status`へは保存しない。`due_at`は設定版とWIB境界から作成時に計算し、期日変更をどのDraftへ適用するかは運用ルール確定時に決める。

Daily DraftのGETでは、給餌・死亡・設備・Alert・対応を元データから再構成し、TMの入力は上記入力テーブルから重ねる。給餌の`amountKg`、死亡の`count`等をDaily入力テーブルで編集しない。Pond別の`appetite`／`tray`はDailyのTM入力があればそれを表示し、なければFeeding記録を参照する。`manualActions`置換、`excludedAlertIds`、Pond観察は1Transactionで保存する。Weekly Draftの再構成タイミングはOpenAPI未定義なので、提出時には少なくとも現在の元データとInfluxDB集計を確定させる。

Submittedへの遷移時はReport行をロックし、必須入力・担当権限・状態を確認してスナップショットと`submitted_at`を同一PostgreSQL Transactionで保存する。PostgreSQLの元記録は同一Transaction内の一貫した読取スナップショットで集める。週次の水質はInfluxDBからPondごとのDO最小、pH最小・最大、水温最大、範囲外日数、Alert件数等を集計してからSnapshotへ入れ、集計完了時刻を残す。両DB間に単一Transactionはないため、提出Snapshotは「保存した集計結果とその取得時点」を正本とする。これは週次**派生結果**であり、測定点の複製ではない。提出後のGETはSnapshotを返し、元記録の訂正・閾値変更・遅延IoTデータで提出内容を暗黙に変えない。提出後RevisionのAPIは未定義なので、新たな訂正操作を勝手に設けない。`ReportAction.source`は`alert_handling`／`actuator_log`／`manual`、`Source` enum全体はAPI側の定義に従う。

## 9. Actuator・安全・監査（PostgreSQL）

| テーブル | 主な列 | 用途 |
| --- | --- | --- |
| `actuator_commands` | `id uuid PK`, `public_id text UNIQUE`, `device_id uuid FK`, `pond_id uuid FK`, `requested_by uuid FK NULL`, `source text`, `command text`, `status text`, `safety_result text NULL`, `safety_reason text NULL`, `requested_at timestamptz`, `sent_at timestamptz NULL`, `acknowledged_at timestamptz NULL`, `completed_at timestamptz NULL`, `failure_reason text NULL`, `idempotency_key text NULL` | `turn_on`／`turn_off`／`set_auto`を受付から実機結果まで追跡。202受付と完了を区別 |
| `actuator_logs` | `id uuid PK`, `public_id text UNIQUE`, `command_id uuid FK NULL`, `device_id uuid FK`, `pond_id uuid FK`, `at timestamptz`, `command text`, `actor_id uuid FK NULL`, `result text`, `reason text NULL` | APIの`ActuatorLog`へ対応。自動制御時は`actor_id NULL`、`command`は`auto_on`／`auto_off`も可 |
| `pid_setting_versions` | `id uuid PK`, `device_id uuid FK`, `controlled_parameter text`, `setpoint numeric`, `kp numeric`, `ki numeric`, `kd numeric`, `sample_period_ms integer`, `output_min numeric`, `output_max numeric`, `effective_from timestamptz`, `effective_to timestamptz NULL`, `approved_by uuid FK NULL` | 自動制御の内部設定履歴。画面からの変更APIは未定義 |
| `safety_rule_versions` | `id uuid PK`, `device_id uuid FK`, `input_min numeric NULL`, `input_max numeric NULL`, `runtime_limit_seconds integer NULL`, `freshness_limit_seconds integer NULL`, `fail_safe_action text`, `effective_from timestamptz`, `effective_to timestamptz NULL` | 操作拒否・Fail-safeの判断版 |
| `audit_logs` | `id uuid PK`, `actor_id uuid FK NULL`, `action text`, `target_type text`, `target_id uuid NULL`, `farm_id uuid FK NULL`, `pond_id uuid FK NULL`, `occurred_at timestamptz`, `result text`, `details jsonb NULL` | 設定変更、Alert対応、Report提出、Actuator操作と拒否の監査 |

Command受付時にTM権限、Device割当、現在の実機観測、Sensor鮮度、Safety版を確認する。Safety拒否は設備へ送らず409を返し、監査に残す。受付済みCommandは`requested`等の内部状態で管理し、ACKや結果を受けるまで成功扱いにしない。Deviceから届く生ACK／実状態はInfluxDB、Commandの業務上の結果と操作ログはPostgreSQLに残す。`GET /ponds/{pondId}/actuator-logs`の`result`は`succeeded`／`failed`／`blocked`へ変換する。再送時のIdempotency-KeyはAPI未定義のため現行画面に必須要求しないが、将来追加したときに`(requested_by, idempotency_key)`で重複防止できるようにする。PID・Emergency Stopの実機条件は設備仕様で確定する。

監査`details`にCookie、Token、パスワード、Device秘密鍵を入れない。設備故障、手動Override、Emergency Stopを扱う場合は、操作結果と承認・解除の証跡を残す。

## 10. InfluxDB論理設計

InfluxDBにはDeviceから受け取った**時系列の観測事実**だけを保存する。以下の`measurement`は論理名であり、InfluxDBのVersion確定後にBucket／Database、Measurement／Tableへ対応付ける。

| 論理系列 | Time | 低CardinalityのTag | Field | 用途 |
| --- | --- | --- | --- | --- |
| `sensor_readings` | `measured_at`（UTC） | `farm_id`, `pond_id`, `device_id`, `parameter` | `value`数値、`received_at_ns`整数、`validity`文字列、`quality_reason`文字列NULL、`event_id`文字列NULL | DO、pH、水温、TDS、濁度、水位の1Sensor・1項目・1計測時刻につき1点 |
| `device_heartbeats` | Device送信時刻（UTC） | `farm_id`, `pond_id`, `device_id` | `received_at_ns`整数、`online_hint`真偽等 | Admin Deviceの最終確認・接続判定 |
| `actuator_feedback` | Device通知時刻（UTC） | `farm_id`, `pond_id`, `device_id` | `state`文字列、`mode`文字列NULL、`fault_code`文字列NULL、`command_id`文字列NULL、`received_at_ns`整数 | Actuatorの最後に確認された実状態・実行結果の元通知 |

`farm_id`／`pond_id`／`device_id`はAPIの文字列IDと同じ値を使い、受信時にPostgreSQLのDevice割当期間から解決する。DeviceがPondを申告しても、割当と違えば信頼しない。`parameter`はOpenAPIの6つの`SensorParameter`値のみ。Sensorが同時に複数項目を送っても、異なる時刻・項目ごとの欠損を表現できるよう項目別の点に分割する。高Cardinalityな`event_id`、`command_id`、自由文をTagにしない。単位はDO mg/L、pH無単位、水温°C、TDS mg/L、濁度NTU、水位cmで固定する。LaboratoryのTAN／NO2／Vibrio／AlkalinityはIoT由来ではなくTM入力のためPostgreSQLの`sampling_records`に置く。

`measured_at`はDeviceの計測時刻、`received_at_ns`はIngestionが受け取った時刻。WIB変換はAPI/画面側。再送では元の`measured_at`を保持し、受信時刻で過去の計測順を上書きしない。`validity`は受信データの物理的妥当性を表し、画面用の`live`／`delayed`／`offline`／`no_data`とは別。業務閾値を超えた実測値は異常でも有効な観測として保存する。不正形式・時刻異常は隔離し、制御・Alert・KPIに使わない。

再送の同一EventはIngestionで`device_id`＋`event_id`等を使って冪等化する。同じDevice・Parameter・計測時刻に異なるEventが衝突した場合は黙って上書きせず、隔離して調査する。Brokerの再配送、InfluxDB書込成功後のPostgreSQL障害に備え、`ingestion_receipts`で時系列保存とCritical判定を別段階として追跡する。測定値本文はPostgreSQLに入れない。Event IDがない機器にはDevice・Sequence等から安定したIDを付ける契約を確定する。

| PostgreSQLの連携テーブル | 主な列 | 制約 |
| --- | --- | --- |
| `ingestion_receipts` | `id uuid PK`, `device_id uuid FK`, `event_id text`, `payload_hash text`, `observation_refs jsonb`, `received_at timestamptz`, `stored_at timestamptz NULL`, `status text`, `critical_evaluation_status text`, `critical_evaluated_at timestamptz NULL`, `critical_policy_version_id uuid FK`, `evaluation_metadata jsonb`, `retry_count integer`, `next_retry_at timestamptz NULL`, `processed_at timestamptz NULL` | `UNIQUE (device_id, event_id)`。`status IN ('pending','stored','completed','quarantined')`、判定状態は`pending`／`evaluated`／`skipped`／`failed`。生データなし。点の識別情報・閾値版・除外理由・処理進捗を保持 |
| `sensor_sync_checkpoints` | `scope_key text PK`, `last_success_at timestamptz NULL`, `processed_through timestamptz NULL`, `next_sync_at timestamptz NULL`, `updated_at timestamptz` | 5分処理の復旧点。`scope_key`でCompany/Farm単位の進捗を区別 |

ReceiptはInfluxDB書込前に作成し、`observation_refs`には系列名・Device/Pond/Parameter・元時刻・各点に適用する閾値版だけを保存する。書込成功後は検証済み受信点でCritical判定し、全点が判定済みまたは理由付き対象外になった時だけ`completed`とする。非Sensor通知も保存し、Sensor Critical判定は`skipped`とする。Heartbeat欠落のような無受信は5分の時刻監視で扱う。

再配送時に`stored`だが判定未完了のReceiptを「受信済み」として読み飛ばさず、保存済み点をInfluxDBから取得して再試行する。書込後のReceipt更新が失敗して`pending`が残る場合も、参照情報と同一点検出で復旧する。受信経路と復旧処理はReceiptを先に、検知状態を安定したキー順に、Alertを最後にロックする。5分処理はReceiptを更新しない。Brokerの受信確認は時系列保存と判定の永続化後に行う設計とし、QoS・受信確認の具体方式はBroker仕様で確定する。障害復旧時に鮮度条件を外れた点は現在のCriticalとして通知しない。未完了件数と最古の判定待ち時間を運用監視する。

### 10.1 APIごとの検索

| API・処理 | InfluxDBでの検索 |
| --- | --- |
| `/sensors/current`、Pond水質一覧 | 割当が有効なSensorのParameter別最新値。欠損はNULL、品質と時刻を添える |
| `/sensors/series` | Pond＋Parameter＋UTC期間で平均・最小・最大を指定`interval`に集計。欠損バケットはNULL |
| `/sensors/history` | Pond＋UTC期間の生点を計測時刻で整列し、同一時刻の6項目を行へ組み立てる |
| `/sensors/anomalies`、Alert | 閾値版と測定値から区間・極値を判定し、派生イベントをPostgreSQLに保存 |
| `/admin/farms/{farmId}/devices`、`/ponds/{pondId}/actuators` | Deviceの最終Heartbeat／観測状態と割当を結合し、`connection`／`lastSeenAt`／`state`等を返す |
| Weekly Report | WIB週をUTCの半開区間へ変換し、Pond別のDO最小、pH最小・最大、水温最大、範囲外日数等を集計 |
| Safety／PID | 最新の有効測定値と取得時刻を参照。遅延・欠損値は制御入力に使わない |

画面向けの5分再取得と別に、バックエンドは**5分ごとにInfluxDBの未処理区間の全点を参照**してWarning・Attention継続、過去の異常区間、現在値・集計を更新する。Critical初回判定は受信経路で実行する。`sensor_sync_checkpoints`には5分処理の前回成功時刻、処理済み計測時刻、次回予定時刻を保持し、`GET /sync-status`の`syncedAt`／`nextSyncAt`へ利用する。受信Critical判定でこのCheckpointは進めない。`GET /alerts`・`GET /issues`は即時Commit済みの行を取得でき、同期Checkpointの進行を待たない。5分処理の失敗時はCheckpointを進めず再実行する。再送による遅延点はLookbackで再読込し、共通の検知状態で重複を抑える。Lookback長と過去判定の訂正範囲は運用決定が必要である。

Raw Dataと集計Dataの保持期間は必要なSensor History検索期間とBackup要件から決める。提出済みReportはPostgreSQLのSnapshotにより、InfluxDBのRaw保持期間が切れても内容を再現できる。InfluxDB障害時は最新値を捏造せず、取得不可・古さを示す。Deviceの最初の状態通知がない場合、OpenAPIの`Actuator.state`が`on`／`off`／`fault`必須で「未確認」を表せないため、初期表示の扱いはフロントと契約を確認する。未確認を勝手に`off`や`fault`と見なさない。

## 11. 制約・索引・競合処理

### 11.1 PostgreSQLの主要索引

| 対象 | 索引・制約 |
| --- | --- |
| User | `UNIQUE (lower(email))`、Role／StatusのCHECK、`user_farm_assignments(user_id) WHERE unassigned_at IS NULL`の一意索引 |
| Master | `farms(company_id)`、`ponds(farm_id)`、`devices(device_id)`一意、Device割当・設定版の有効期間非重複 |
| Setting | Scopeごとの現行`threshold_sets`一意、`threshold_values(set_id, parameter)`一意、Growth点のDOC一意 |
| Records | `feeding_records(pond_id, record_date)`、`mortality_records(pond_id, record_date)`、`sampling_records(pond_id, sample_date)`一意 |
| Alert／Issue | `alerts(pond_id, state, occurred_at DESC)`、`alerts(detection_state_id, episode_no)`部分一意、`alert_detection_states(pond_id, device_id, parameter, direction)`一意、`issues(farm_id, state, severity, since)`、`issues(source_type, source_id)`一意 |
| 通知 | Outbox `(alert_id, event_kind)`一意、`(status, next_attempt_at)`検索。利用者通知 `(outbox_id, user_id)`・`(user_id, stream_sequence)`一意、未読 `(user_id, created_at DESC) WHERE read_at IS NULL`。SSE配送 `(notification_id, channel, delivery_key)`一意・`(status, next_attempt_at)`検索 |
| Report | Daily `(farm_id, report_date)`、Weekly `(farm_id, week_start)`の部分一意索引、`reports(farm_id, type, status, submitted_at DESC)` |
| Control | `actuator_commands(device_id, requested_at DESC)`、`actuator_logs(pond_id, at DESC)`、冪等Keyの部分一意索引 |
| Checkpoint | `ingestion_receipts(device_id, event_id)`一意、未完了Receiptの`(critical_evaluation_status, next_retry_at)`部分索引、`sensor_sync_checkpoints(scope_key)`一意 |

Device割当の期間非重複はPostgreSQLのRange排他制約か、対象Device行をロックするTransactionで保証する。設定版と養殖サイクルも同様に期間重複を防ぐ。IDから所属を解決してから更新し、`pond_id`と`cycle_id`、ReportとPond、AlertとReportのFarmが一致することを検証する。FK単体ではこの横断整合性を保証できないため、Transaction内の検証または複合キーで担保する。

### 11.2 更新競合と障害

| 操作 | Transactionと再試行の境界 |
| --- | --- |
| User招待・Role変更 | メール重複と最後のSAをDB制約・行ロックで再検査。招待メール配送はCommit後のOutbox／Jobで実行 |
| Device再割当 | 旧期間終了と新期間開始を1Transactionにする。過去IoT点は書き換えない |
| Threshold／Rule保存 | 現行版の終了と新版挿入を1Transactionにし、反映時刻を固定する |
| Sampling一括保存 | 対象Farm内の全Entryを検証して1TransactionでUpsert。1件失敗なら全件Rollback |
| 受信Critical処理 | InfluxDB保存後、Receiptと検知状態をロックし、Alert・Issue・Anomaly・通知Outbox・判定完了を1Transactionで更新。失敗時は再配送・未完了Receiptで再試行 |
| 5分Alert処理 | 通常判定・区間補完とAlert・Issue・Anomaly・Checkpointを1Transactionで更新。受信経路と同じ検知状態・一意制約で重複抑止 |
| Critical通知作成 | OutboxをClaimし、利用者Cursorをロックして通知・配送依頼・Outbox完了を1Transactionで保存。再試行でも同じ利用者通知を複製しない |
| 通知配送 | 各SSE接続のCursorに従いDBロック外で書込。利用者別に結果・再試行を保存。送信とDB更新の間の障害は同じnotificationIdで再送し、1接続の成功で他接続の配信を省略しない |
| 通知受信・既読 | 本人と現在の権限を確認し、初回時刻のみ保存。Alertの確認・解決状態は変更しない |
| Report下書き | Report行をロックし、TM入力テーブルと手入力Action置換を1Transactionで保存 |
| Report提出 | Report行をロックし、状態・必須項目を再検証してSnapshotと提出情報を1Transactionで保存。二重提出は409 |
| Actuator Command | 受付・Safety結果をまず永続化。配送とACKは別Transactionで進め、202と実機成功を混同しない |

InfluxDB書込とPostgreSQLのReceipt／Checkpoint更新は原子的にCommitできない。書込後に失敗した場合は同じEventを再処理し、InfluxDB側の同一点検出とInboxで重複計上を避ける。InfluxDBからの集計中に提出処理が失敗した場合はReportをDraftのまま残し、再試行する。提出Snapshotには集計時刻と元記録参照を残す。画面用の一覧集計に一時的な不整合があっても、権限制御と提出済み内容はPostgreSQLで一貫して守る。

## 12. 残る決定事項

| 項目 | 決める内容・影響 |
| --- | --- |
| InfluxDB | Version、Bucket／Table表現、Retention、Backup、同時刻点の重複挙動、容量見積もり |
| Device通知 | センサー以外のHeartbeat・Actuator実状態・ACKのPayload。なければ`connection`や実状態の信頼性が下がる |
| Generator | `OperationalStatus.generator`の構造化された状態・試験時刻の入力源が現行OpenAPIにない。Reportの自由文`environment.generator`から正確に導出できない |
| 初回Actuator状態 | フィードバック未着時の`Actuator.state`はOpenAPIに未知値がない。誤って`off`／`fault`を返さない表現が必要 |
| 初回Sensor・生産状態 | 未受信時も`SensorValue.severity`、放養・Samplingがない場合も`PondProduction.doc`・`CompanyProduction.latestSamplingDate`・`FarmProduction.samplingDate`はOpenAPI上必須。ダミーのNormal、DOC、日付を返さないため、未取得時の契約確認が必要 |
| Issueの傾向 | 初回発生で比較対象がない場合も`Issue.trend`は必須。`stable`を無根拠に返さないため、初回の表現を確認する |
| 養殖サイクル | 再放養の終了・開始手順と放養記録APIの採用。現行OpenAPIには放養更新APIがない |
| KPI | 不明減耗、初期Biomass、Size Uniformityの元データと正式式。未算出時はNULLにする |
| Report | Weekly Draftの再構成時点、提出後Revision、遅延IoTデータの扱い、設定期限変更の既存Draftへの適用 |
| Alert／Control | 区間同一視の基本ルールは第7.1節。欠測を挟む区間の分割・回復のヒステリシス・遅延点訂正範囲、Safety条件、Command Timeout／再送、Emergency Stop解除を確定する |
| Critical判定 | 受信から保存までの目標時間、`max_input_age_seconds`の初期値、実機の測定・送信周期、未完了Receiptの再試行間隔 |
| Critical通知 | SSE、TM／FM宛先、利用者別再送を第7.2節に定義。通知保持期間・緊急表示の期限・再送上限・接続中の到達目標を確定する |

上記の未決定事項はOpenAPIを暗黙に変更する理由にはしない。契約変更が必要な項目はAPI設計書の追加提案として合意してから反映する。
