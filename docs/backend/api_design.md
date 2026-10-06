# API詳細設計

| 項目 | 内容 |
| --- | --- |
| 版 | 0.3（OpenAPI準拠ドラフト） |
| 更新日 | 2026-10-05 |
| API契約の基準 | [フロントエンド起案 OpenAPI](../api/openapi.yaml)（OpenAPI 3.1.0、`0.1.0-draft`） |
| 関連資料 | [全体設計](../backend_architecture_overview.md)、[ダイアグラム](../backend_architecture_diagrams.md)、[データベース設計](./database_design.md) |

## 1. 本書の位置付け

本書は、画面設計から洗い出された`docs/api/openapi.yaml`のWeb API契約を、バックエンド実装・レビュー向けに整理する。**既存APIのパス、HTTPメソッド、クエリ名、JSONフィールド名、enum、必須項目、レスポンス形状、HTTPステータスはOpenAPIを正とする。** 本書の記述とOpenAPIが異なる場合はOpenAPIを優先する。現在のOpenAPIはドラフトであり、未確定と記された条件を確定値として扱わない。

第3～10章は**OpenAPI定義済み**の74オペレーション（59パス）と、その実装上の規則を扱う。第11章は**OpenAPI未定義の追加提案**であり、フロントエンドとの合意とOpenAPIへの追記が完了するまで契約には含めない。既存APIのURLや応答を置き換える提案ではない。

AI助言、ML予測、予測Alert、AI制御提案、収益最適化、収穫推奨日、利益予測、将来在庫予測は対象外。IoT Deviceからの受信はMQTT／Ingestion側の契約であり、このWeb APIのパスには含めない。

## 2. 共通契約

### 2.1 URL・形式・時刻

| 項目 | OpenAPIの契約 |
| --- | --- |
| ベースURL | `/api/v1` |
| リクエスト・正常応答 | `application/json`。各オペレーションのschemaを直接返す。共通の`data`ラッパーは付けない |
| エラー | `application/problem+json`（RFC 9457） |
| ID | API上は文字列。`farmId`、`pondId`、`reportId`等はcamelCase |
| `date-time` | UTCのISO 8601（`Z`）。表示はフロントでWIB（UTC+7）へ変換 |
| `date` | 給餌・放養・Report等の業務日はWIBの暦日 |
| 重量・面積 | 重量kg、面積ha、Biomassはkgで返す。画面でtへ変換 |
| 割合 | `%`の数値。`88`は88%を意味する |
| Vibrio | `×10³ CFU/mL`の数値 |
| ページング | 定義のあるAPIは`page`（1始まり、既定1）、`pageSize`（1～100、既定20）を受け、`{ items, page, pageSize, total }`を返す |
| 画面更新 | `x-refresh-interval-seconds: 300`のAPIはフロントが5分ごとに再取得 |

ページングが定義されていないAPI（例：`GET /farms`、`GET /farms/{farmId}/ponds`）に`page`や`total`を勝手に追加しない。単一リソースを`{ data: ... }`で包まない。`from`／`to`の必須・任意、時刻か日付かは各オペレーションに従う。

### 2.2 認証・認可

OpenAPIは`aquaguard_session`というCookieの`sessionCookie`を仮置きしている。`httpOnly`、`Secure`、`SameSite=Lax`、無操作12時間の失効が記載されているが、セッション方式自体は未確定である。`/auth/login`、`/auth/password/forgot`、`/auth/password/tokens/{token}`、`/auth/password/set`のみ`security: []`。その他はグローバルの`sessionCookie`を適用する。Cookie採用時のCSRF対策とCORS設定は実装前に確定する。

サーバーは毎リクエストでRole、アカウント状態、Company／Farmの所属、対象Pondの所属を検証する。クライアントが送った`farmId`や`pondId`だけで権限を決めない。権限外の操作は403、範囲外の個別リソースは存在を漏らさない404とする。

| Role | 閲覧・操作範囲 |
| --- | --- |
| Farms Manager（FM） | Company配下のFarm状態、集約KPI、Issue、提出済みReportを閲覧。生センサー値、個々の現場記録、Draft、Actuator操作は不可 |
| Technical Manager（TM） | 担当FarmのPond、センサー値・時系列、Alert、現場記録、Report、Actuatorを閲覧・操作 |
| System Administrator（SA） | `/admin/*`のユーザー・マスタ・設定を管理。業務データは閲覧しない |

`GET/PATCH /auth/me`は認証済み本人が利用する。`GET /sync-status`はFM/TMの業務画面向けでありSAは呼ばない。`GET /farms`はFMには全Farm、TMには担当Farmのみを返す。`GET /reports`はFMにSubmittedのみ、TMに担当Farmの対象Reportのみを返す。`/admin/*`はSAのみ。

### 2.3 エラーと状態

エラー本文は`Problem`の`title`、`status`、`code`を必須とし、必要に応じて`type`、`detail`、`fieldErrors`、`existingReportId`を返す。`fieldErrors`の各要素は`field`と`message`を持ち、`field`は`items/0/warningLow`のようなJSON Pointer風のパスである。ログイン時は`LoginProblem`の`remainingAttempts`または`lockedUntil`を使用する。全エラーの`code`を固定した一覧はOpenAPIにないため、記載されたもの以外は実装前に定義する。

| HTTP | 主な定義済み用途 |
| --- | --- |
| 200 | 取得・更新・提出成功 |
| 201 | 記録・マスタ・Reportの作成成功 |
| 202 | パスワード再設定依頼、メール再送、Actuator Commandの受付 |
| 204 | ログアウト成功 |
| 401 | 未ログイン、認証失敗 |
| 403 | Role権限外、無効化アカウント |
| 404 | 不存在または参照範囲外 |
| 409 | 状態競合、重複Report、Safety Layer拒否等 |
| 410 | 招待・再設定リンクの期限切れ |
| 422 | 入力項目・業務ルール違反 |
| 423 | ログインロック中 |

ログインは5回連続失敗で15分ロックし、認証失敗時にメール・パスワードのどちらが違うかは公開しない。忘れたパスワードの依頼は、アカウントの有無にかかわらず202を返す。

エラーの形は次のとおり。`code`の値は該当オペレーションに記載されたものを使う。

```json
{
  "title": "Operation blocked",
  "status": 409,
  "code": "safety_blocked",
  "detail": "Current safety rule does not allow this command"
}
```

## 3. 認証・共通状態（OpenAPI定義済み）

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| POST | `/auth/login` | `email`, `password` → `Me`とセッションCookie | 200 |
| POST | `/auth/logout` | セッション失効、本文なし | 204 |
| GET | `/auth/me` | ログイン中の`Me` | 200 |
| PATCH | `/auth/me` | `language` → `Me` | 200 |
| POST | `/auth/password/forgot` | `email`、存在の有無を公開しない | 202 |
| GET | `/auth/password/tokens/{token}` | 招待／再設定の`PasswordToken` | 200 |
| POST | `/auth/password/set` | `token`, `password` → `Me` | 200 |
| GET | `/sync-status` | `SyncStatus`（`quality`, `syncedAt`, `nextSyncAt`） | 200 |

`Me`のRoleは`farms_manager`、`technical_manager`、`system_administrator`。言語は`en`／`id`。TMの`farm`は担当Farm、FM・SAは`null`。招待リンクは72時間、再設定リンクは1時間。パスワードは10文字以上かつ英字・数字を含む。招待での設定成功時にはセッションを発行する。`SyncStatus.syncedAt`はバックエンドがInfluxDBを最後に参照できた時刻で、データ品質は`live`、`delayed`、`offline`、`no_data`のいずれか。

## 4. Farm・Issue・生産KPI（OpenAPI定義済み）

| Method | Path | 主な入力・応答 | 主な利用者 |
| --- | --- | --- | --- |
| GET | `/farms` | `q`, `status`, `location`, `hasIssues` → `items: FarmSummary[]`, `counts` | FM/TM |
| GET | `/farms/{farmId}` | `FarmDetail` | FM/TM |
| GET | `/farms/{farmId}/status-trend` | `days`（既定14、上限90）→日別の`items` | FM |
| GET | `/farms/{farmId}/operational-status` | `OperationalStatus`（設備・センサー・給餌等） | TM |
| GET | `/farms/{farmId}/report-status` | `ReportStatusSummary` | TM |
| GET | `/issues` | `farmId`, `state`, `page`, `pageSize` →`Issue[]` | FM |
| GET | `/issues/{issueId}` | `IssueDetail` | FM |
| GET | `/production/summary` | `CompanyProduction` | FM |
| GET | `/farms/{farmId}/production` | `samplingDate`任意 → `FarmProduction` | FM/TM |

Farmの`status`は`waterQuality`、`growth`、`operations`のうち最も重い`Severity`とし、別のOverall状態は作らない。`counts`は`GET /farms`の絞り込み前の状態別Farm数。IssueはAlert等から生成するFM向けの集約ビューで、生センサー値を含めず、既定では重大度の重い順、継続時間の長い順に並べる。`/issues`の`state`省略時は`ongoing`。Issueの対応履歴はTMのAlert対応に由来し、FMから更新できない。

生産KPIはバックエンドで計算する。DOCは放養日からの経過日数、ABWはサンプル総重量÷サンプル尾数、ADGは前回ABWとの差÷経過日数、目標比は`ABW ÷ targetABW − 1`を%で返す。BiomassとSurvival RateはEstimated。Farm／CompanyのBiomassはPondの合計、Survival Rateは`Σ推定生存尾数 ÷ Σ放養尾数`、FCRは`Σ給餌量 ÷ Σ増重量`で計算する。ABW・ADG・Size UniformityのFarm／Company平均は返さない。`samplingDate`はWeekly Reportの基準日指定に使い、未指定時は最新値を返す。不明減耗、放養時生体量、Size Uniformityの入力データや正式な推定式は[KPI定義書](../../frontend/docs/04_KPI・データ項目定義書.md)の未確定事項と整合させる。

## 5. Pond・Sensor（OpenAPI定義済み）

| Method | Path | 主な入力・応答 |
| --- | --- | --- |
| GET | `/farms/{farmId}/ponds/water-quality` | `items: PondWaterQualityRow[]`, `counts`, `normalRanges` |
| GET | `/farms/{farmId}/ponds` | `status`, `alertState` → `items: PondListRow[]` |
| GET | `/ponds/{pondId}` | `PondDetail`（Farm、面積、放養日、DOC、放養尾数、ABW等） |
| GET | `/ponds/{pondId}/sensors/current` | `items: SensorReading[]`。6項目の値、品質、時刻、閾値 |
| GET | `/ponds/{pondId}/sensors/series` | `parameter`, `from`, `to`必須、`interval`任意 → `SensorSeries` |
| GET | `/ponds/{pondId}/sensors/history` | `from`, `to`, `page`, `pageSize`任意 → `SensorHistoryRow[]` |
| GET | `/ponds/{pondId}/sensors/anomalies` | `from`, `to`任意 → `SensorAnomaly[]` |

センサー項目は`do`、`ph`、`temperature`、`tds`、`turbidity`、`water_level`。`SensorReading`には項目ごとの`deviceId`、`measuredAt`、`quality`、`severity`、`threshold`があり、未取得・通信断の場合の`value`は`null`。鮮度は運用ルールで可変だが、初期説明は15分以内`live`、15分超`delayed`、60分超`offline`、実績なし`no_data`。フロントに架空の数値を返さない。

`/sensors/series`の`interval`は`5m`、`15m`、`1h`、`6h`、`1d`。省略時は期間に応じて選ぶ（例：24h→5m、7d→1h、30d→6h）。各点は`t`と`avg`／`min`／`max`を持ち、欠損区間は`null`。グラフの閾値はレスポンスschemaの**単数形`threshold`**を返す。オペレーション説明文にある`thresholds`はschemaと不一致なので、実装時はschemaを優先し、OpenAPIの説明文修正をフロントと確認する。`/sensors/history`は1計測時刻につき6項目の行を返し、項目ごとの欠損を`null`で示す。

センサーは3～5分間隔でInfluxDBに保存する。OpenAPIとKPI資料の現行方針は、**バックエンドが5分ごとにInfluxDBを参照し、現在値・Alert判定・集計を更新する**こと。画面側の5分再取得とは別の処理である。IoT受信・重複排除・時刻検証・DeviceとPondの割当照合はIngestion側で扱い、画面向けAPIへIoT Deviceから送信しない。通信断・遅延データを最新値として偽装しない。Raw時系列はTMのみ取得できる。

## 6. Alert（OpenAPI定義済み）

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/alerts` | `farmId`, `pondId`, `state`, `from`, `to`, `page`, `pageSize` → `Alert[]` | 200 |
| GET | `/alerts/{alertId}` | `AlertDetail`（確認者・対応一覧を含む） | 200 |
| POST | `/alerts/{alertId}/acknowledge` | `unacknowledged` → `acknowledged`、`AlertDetail` | 200 |
| POST | `/alerts/{alertId}/actions` | `performedAt`, `type`, `note` → `AlertDetail` | 201 |
| POST | `/alerts/{alertId}/resolve` | 任意の`note` → `AlertDetail` | 200 |

`state`は配列で、`style: form`、`explode: false`（カンマ区切り）。フィルタ値`open`は`resolved`以外を意味する。Lifecycleの値は`unacknowledged`、`acknowledged`、`in_progress`、`resolved`。重大度の`normal`／`attention`／`warning`／`critical`とは別に管理する。対応種別は`increased_aeration`、`water_exchange`、`equipment_inspection`、`water_treatment`、`other`。最初の対応記録で`in_progress`となり、対応はDaily Reportの`alert_handling`に反映する。遷移違反は409を返す。

AlertはReport提出とは独立して判定する。Warning以上、またはAttentionの設定時間継続で発報する。共通閾値とFarm上書き閾値は保存以降の判定へ適用し、過去Alertの判定値を書き換えない。継続中Alertの重複抑止、回復後の再発、センサー遅延到着の扱いは詳細ルールが未確定である。

## 7. 現場記録（OpenAPI定義済み）

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/ponds/{pondId}/feedings` | `from`, `to`, `page`, `pageSize` → `FeedingRecord[]` | 200 |
| POST | `/ponds/{pondId}/feedings` | `FeedingInput` → `FeedingRecord` | 201 |
| PATCH | `/feedings/{recordId}` | `FeedingInput` → `FeedingRecord` | 200 |
| GET | `/ponds/{pondId}/mortalities` | `from`, `to`, `page`, `pageSize` → `MortalityRecord[]` | 200 |
| POST | `/ponds/{pondId}/mortalities` | `MortalityInput` → `MortalityRecord` | 201 |
| PATCH | `/mortalities/{recordId}` | `MortalityInput` → `MortalityRecord` | 200 |
| GET | `/ponds/{pondId}/samplings` | `items: SamplingRecord[]`, `growthCurve` | 200 |
| POST | `/ponds/{pondId}/samplings` | `SamplingInput` → `SamplingRecord` | 201 |
| PATCH | `/samplings/{recordId}` | `SamplingInput` → `SamplingRecord` | 200 |
| POST | `/farms/{farmId}/samplings/batch` | `date`, `entries[]` → `items: SamplingRecord[]` | 200 |

`FeedingInput`の必須項目は`date`、`amountKg`、`rounds`、`feedType`。`MortalityInput`は`date`、`count`が必須で、`weightKg`、`abnormal`、`note`は任意。`SamplingInput`は`date`が必須で、`sampleCount`、`sampleWeightG`、`tan`、`no2`、`vibrio`、`alkalinity`は任意またはnullを許す。検査値は後着のためPATCHで追記でき、未着中は`labPending`を返す。ABW、ADG、DOC、目標比はバックエンドが計算して`SamplingRecord`に付ける。未来日の給餌は422。入力の負値は各schemaの`minimum`に従って拒否する。

PATCHの名前であっても、`/feedings/{recordId}`と`/mortalities/{recordId}`のリクエストschemaは各Inputを参照し、**作成時と同じ必須項目を要求する**。`/samplings/{recordId}`も`date`が必須。部分更新の一般的な解釈で必須項目を省略可能にしない。一括Samplingでは測定しないPondを`entries`に含めず、同じPond・同じ日付の記録は更新する。記録の所有Pondが担当Farmに属することをIDから再検証する。

## 8. Actuator（OpenAPI定義済み）

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/ponds/{pondId}/actuators` | `items: Actuator[]`（状態、モード、接続、禁止操作と理由） | 200 |
| POST | `/actuators/{actuatorId}/commands` | `command` → `Actuator` | 202 |
| GET | `/ponds/{pondId}/actuator-logs` | `page`, `pageSize` → `ActuatorLog[]` | 200 |

`command`は`turn_on`、`turn_off`、`set_auto`のみ。Actuatorの`state`は`on`／`off`／`fault`、`mode`は`auto`／`manual`、`connection`は`online`／`offline`。`blockedCommands[]`はSafety Layerで禁止された操作と理由を返す。Auto中に手動操作するとManual（override）になるため、画面は確認ダイアログを示す。サーバー側でもSafety Layerを再評価し、禁止時は`409`・`code: safety_blocked`と理由を返して設備へ送信しない。

**202は受付であり、実機実行完了を意味しない。** 現行OpenAPIの202本文は`Actuator`であり、Command IDや詳細な配送状態は返さない。既存画面は状態を再取得し、操作履歴の`result`（`succeeded`／`failed`／`blocked`）を参照する。バックエンド内部では要求者、対象、要求、Safety判定、送信、ACK、結果、時刻を追跡し、再送による二重操作を防ぐ。追跡用の公開APIは第11章の追加提案とする。PID設定値、Emergency Stopの操作APIはOpenAPIに定義されていないため、現行Commandのenumへ暗黙に追加しない。

既存契約のリクエストと202本文の最小例は次のとおり。応答の`state`は受付時点で把握している設備状態であり、要求した操作の完了値ではない。

```http
POST /api/v1/actuators/A-P02-AER1/commands
Content-Type: application/json

{"command":"turn_on"}
```

```json
{
  "id": "A-P02-AER1",
  "type": "aerator",
  "name": "Aerator 1",
  "state": "off",
  "mode": "manual",
  "connection": "online"
}
```

## 9. Report（OpenAPI定義済み）

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/reports` | `type`必須、`farmId`, `status`, `from`, `to`, `page`, `pageSize` → `ReportListItem[]` | 200 |
| POST | `/reports/daily` | `farmId`, `date` → `DailyReport` | 201 |
| GET | `/reports/daily/{reportId}` | `DailyReport` | 200 |
| PATCH | `/reports/daily/{reportId}` | `DailyReportInput` → `DailyReport` | 200 |
| POST | `/reports/weekly` | `farmId`, `weekStart` → `WeeklyReport` | 201 |
| GET | `/reports/weekly/{reportId}` | `WeeklyReport` | 200 |
| PATCH | `/reports/weekly/{reportId}` | `WeeklyReportInput` → `WeeklyReport` | 200 |
| POST | `/reports/{reportId}/submit` | Draftを提出 → `ReportListItem` | 200 |

`type`は`daily`／`weekly`、`status`は`draft`／`submitted`。FMがDraftを指定して一覧検索した場合は空、個別Draftを取得した場合は404。TMは担当FarmのReportのみ作成・編集・提出する。同じFarm・日付のDaily、同じFarm・月曜開始日のWeeklyを重複作成すると409で、既存IDは`Problem.existingReportId`に返す。SubmittedへのPATCHは409。Daily提出時はWeatherとTechnical Manager Summary、Weekly提出時はWeekly Technical Summaryを必須として422で検証する。提出期限（Daily当日18:00、Weekly翌週月曜）は現行の仮値で、管理画面のRulesに従う。

Dailyの給餌・死亡・設備・Alert・対応・KPI等は元記録から自動収集する。`DailyReportInput`でTMが保存するのはPond別の観察、`environment`、`excludedAlertIds`、`manualActions`、`summary`。`manualActions`は全件送信による置き換え。Dailyへ生センサー値を入力・保存しない。WeeklyはPond別の水質傾向をInfluxDBから週次集計し、Laboratory未着はPendingで示す。`WeeklyReportInput`は`alertNotes`、`waterQualityComment`、`laboratoryConfirmed`、`technicalSummary`。**Daily Draft**取得時の自動値は最新の記録から再構成する。Weekly Draftでの再構成タイミングはOpenAPIに明記されていない。提出済みReportの再現性を守るため、提出時の集計結果または参照元・版を保持する方式はDB設計で確定する。

## 10. 管理API（OpenAPI定義済み、SAのみ）

### 10.1 User

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/admin/users` | `q`, `role`, `status`, `farmId`, `page`, `pageSize` → `AdminUser[]` | 200 |
| POST | `/admin/users` | `name`, `email`, `role`、TMのみ`farmId`必須 → `AdminUser` | 201 |
| GET | `/admin/users/{userId}` | `AdminUser` | 200 |
| PATCH | `/admin/users/{userId}` | `role`, `farmId`, `language` → `AdminUser` | 200 |
| POST | `/admin/users/{userId}/resend-invitation` | Invitedユーザーへ再送 | 202 |
| POST | `/admin/users/{userId}/send-password-reset` | 再設定メール送信 | 202 |
| POST | `/admin/users/{userId}/deactivate` | 無効化、記録は保持 | 200 |
| POST | `/admin/users/{userId}/reactivate` | 再有効化 | 200 |

`UserStatus`は`invited`／`active`／`deactivated`。FM・SAへの招待時は`farmId`を指定しない。招待メールは72時間有効。メールアドレス重複は409・`email_taken`。自分自身と最後のSAのRole変更・無効化は409。`AdminUser.canDeactivate`、`canChangeRole`は画面制御のヒントであり、サーバー側でも再判定する。

### 10.2 Farm・Pond・Device

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/admin/farms` | `items: AdminFarm[]` | 200 |
| POST | `/admin/farms` | `AdminFarmInput` → `AdminFarm` | 201 |
| GET | `/admin/farms/{farmId}` | `AdminFarm` | 200 |
| PATCH | `/admin/farms/{farmId}` | `AdminFarmInput` → `AdminFarm` | 200 |
| GET | `/admin/farms/{farmId}/ponds` | `items: AdminPond[]` | 200 |
| POST | `/admin/farms/{farmId}/ponds` | `AdminPondInput` → `AdminPond` | 201 |
| PATCH | `/admin/ponds/{pondId}` | `AdminPondInput` → `AdminPond` | 200 |
| GET | `/admin/farms/{farmId}/devices` | `pondId`, `type`, `connection`, `page`, `pageSize` → `AdminDevice[]` | 200 |
| POST | `/admin/farms/{farmId}/devices` | `AdminDeviceInput` → `AdminDevice` | 201 |
| PATCH | `/admin/devices/{deviceId}` | `AdminDeviceInput` → `AdminDevice` | 200 |

`AdminFarmInput`は`name`、`location`が必須、`timeZone`既定は`Asia/Jakarta`。`AdminPondInput`は`name`、`areaHa`が必須で、`status`は`in_operation`／`fallow`。`AdminDeviceInput`は`deviceId`、`type`、`pondId`が必須、`type`は`sensor`／`aerator`／`pump`、`parameter`はセンサーのみ。Adminに返すDeviceの状態は`connection`、`lastSeenAt`までとし、業務の測定値は返さない。同じDevice IDでの登録は409・`device_id_taken`。これらのPATCHも参照するInput schema上の必須項目を満たす。

### 10.3 Settings

| Method | Path | 主な入力・応答 | 成功 |
| --- | --- | --- | --- |
| GET | `/admin/settings/thresholds` | `farmId`任意 → `ThresholdSettings` | 200 |
| PUT | `/admin/settings/thresholds` | `farmId`任意、`items: Threshold[]` → `ThresholdSettings` | 200 |
| GET | `/admin/settings/growth-targets` | `GrowthTargetSettings` | 200 |
| PUT | `/admin/settings/growth-targets` | `points`, `onTrackBandPct` → `GrowthTargetSettings` | 200 |
| GET | `/admin/settings/rules` | `RuleSettings` | 200 |
| PUT | `/admin/settings/rules` | `RuleSettingsInput` → `RuleSettings` | 200 |

`farmId`省略時のThresholdは全Farm共通、指定時は当該Farmの上書きを扱う。上書きがない項目は`inherited: true`として共通値を返す。Thresholdはセンサー6項目とLaboratory4項目が対象で、Low／High側のCritical、Warning、Attention境界を扱う。順序違反は422とし、`fieldErrors`で欄を特定する。`/admin/settings/growth-targets`のDOC別目標点と`onTrackBandPct`は生産KPIに使用する。`/admin/settings/rules`はDaily／Weekly期限、センサー遅延・Offlineまでの分数、Attention継続時間、Farm ProductionのAttention／Warning境界値を扱う。設定は保存以降の判定に適用し、過去のAlert・提出済みReportは変更しない。

## 11. OpenAPI未定義の追加提案

ここに挙げるものは**既存74オペレーションには含まれない**。実装する場合は、先にフロントエンドと用途・レスポンスを合意し、`docs/api/openapi.yaml`へ追加してから本書の定義済みAPIへ移す。現行APIのパス、メソッド、schemaを黙って変更しない。

| 優先 | 提案 | 必要な理由・既存契約との関係 |
| --- | --- | --- |
| 高 | `GET/POST /ponds/{pondId}/stocking-records`、`GET/PATCH /stocking-records/{recordId}` | `PondDetail.stockedOn`／`stockedPl`、DOC・SR・Biomass・FCRの入力元が現行OpenAPIにない。TMの業務記録として登録・参照・訂正する。既存Pond取得APIはそのまま使う |
| 高 | Actuator Commandの追跡API（例：`GET /actuator-commands/{commandId}`） | 現行POSTは202で`Actuator`を返すのみ。要求と実機完了・失敗・Timeoutの対応付けができない。追加時はCommand IDをどう伝えるか（例：新規レスポンスヘッダー）を合意し、**現行202本文を変更しない** |
| 要判断 | Emergency Stopの操作API、解除条件 | 全体設計・DB設計には安全停止があるが、現行OpenAPIのCommand enumにはない。設備仕様と権限・解除手順を決めた後に独立した操作として追加する |
| 要判断 | PID／Auto設定・承認API | 現行の`Actuator.mode`、`autoRule`、`set_auto`は表示と切替の契約。PID係数・目標値・承認フローを画面から扱うかは未定で、現行Commandに暗黙に混ぜない |
| 低 | ログイン中のパスワード変更API | 招待・忘れたパスワードのフローは既にある。本人による通常変更画面を追加する場合にのみ設計する |

放養の設計では、同じPondを再放養したときの養殖サイクル識別、開始・終了、給餌・死亡・Samplingがどのサイクルに属するかを定める。既存DB案の`stocking_records`を起点に検討できる。名称を`production-cycles`へ変える場合も、フロント合意とOpenAPI追記を先に行う。センサー状態は現行`SensorReading.quality`／`measuredAt`／`deviceId`とAdminのDevice接続情報で画面要件を満たすため、専用のSensor Status APIは現時点で追加しない。Farm別閾値は既存`farmId`クエリで扱う。CSV／Excel Exportは現行画面要件とOpenAPIにないため、ここでは追加しない。

### 11.1 放養記録API案

追加するなら、`POST /ponds/{pondId}/stocking-records`の本文を`stockedOn`（WIBの日付）、`stockedPl`（正の整数）、`initialBiomassKg`（任意の非負数）とする。成功時は201で`id`、`pondId`、上記の値、`recordedBy`、`updatedAt`を返す。GET一覧は同じPondの過去記録を放養日の降順で返し、個別GET/PATCHは記録IDで扱う。PATCHの本文・必須項目はOpenAPI追記時に定義する。TMの担当Farmに属するPondだけ作成・変更でき、再放養時のサイクル重複と終了条件を検証する。`initialBiomassKg`が不明な場合、FCRを推測値で埋めず、計算不能として扱う条件を定める。

### 11.2 Command追跡API案

現行`POST /actuators/{actuatorId}/commands`の202本文は`Actuator`のまま維持する。追加案は202のレスポンスヘッダーでCommand IDを通知し、`GET /actuator-commands/{commandId}`で`actuatorId`、`command`、`status`、`requestedAt`、`completedAt`、失敗・拒否理由を取得するもの。状態候補は`requested`、`safety_checking`、`sent`、`acknowledged`、`completed`、`failed`、`timeout`、`blocked`。要求者とActuatorの担当Farmを照合して参照を制限する。ヘッダー名、状態語彙、`Idempotency-Key`の導入と保持期間、端末ACKの意味はMQTT／実機仕様を確認してOpenAPIへ定義する。

### 11.3 安全制御API案

Emergency Stopを画面または外部運用から要求するなら、通常の`turn_off`とは区別した独立操作とし、監査記録に要求者・理由・Safety判定・設備応答を残す。停止後の解除にはセンサー鮮度、設備状態、現地確認と承認権限を定める。PID設定の取得・変更・承認APIは制御を実行する場所（EdgeかBackendか）、対象機器、版管理、承認者が決まってから具体的なパスとschemaを定義する。

## 12. 実装前に確定する内部仕様

以下はWeb APIのパス追加とは別に必要なバックエンド実装条件である。確定時も既存OpenAPIの契約を守る。

| 領域 | 確定する内容 |
| --- | --- |
| セッション | Cookieの採否、失効・更新、CSRF対策、ログアウト時の無効化 |
| IoT通信 | MQTT Topic／Payload、Device認証、時刻とSequence、QoS、重複排除、通信断時の再送 |
| InfluxDB | Version、measurement／tag／field、保存期間、時系列集計、最終参照時刻の管理 |
| Alert | 5分参照処理の再実行、重複抑止、遅延データ、解決・再発の条件、通知の別契約 |
| KPI | 不明減耗、放養時生体量、Size Uniformity、0除算時の扱いと再計算の基準日 |
| Report | Submitted内容の固定・再現、元データ訂正時の扱い、提出後Revision、締切のWIB境界 |
| Actuator | Safety判定、Command配送・ACK・Timeout・再送、実機状態の確認、PID実行場所、Emergency Stop解除 |
| 監査 | 設定更新、Alert対応、Report提出、設備操作の実行者・対象・時刻・結果の記録 |

これらは[全体設計](../backend_architecture_overview.md)と[データベース設計](./database_design.md)の詳細化事項でもある。特に現行OpenAPIが定めるInfluxDBの5分参照を変更する場合は、API応答の鮮度・Alert通知遅延に影響するため、要件とOpenAPIを先に合意更新する。
