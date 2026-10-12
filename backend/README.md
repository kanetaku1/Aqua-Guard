# AquaGuard Backend

NestJS / TypeScript によるバックエンドです。PostgreSQL の初期 Migration、InfluxDB の時系列書き込み、認証と一部の管理APIを実装しています。

## 開発用の起動

Node.js 20.19 以上と npm を使用します。

```powershell
cd backend
npm ci
npm run typecheck
npm run build
npm run test:unit
npm run start:dev
```

別の端末から `http://localhost:8000/health` にアクセスすると `{"status":"ok"}` を返します。`http://localhost:8000/health/ready` は PostgreSQL と InfluxDB の接続が成功すれば 200、失敗すれば 503 を返します。どちらも画面向け API には含めません。ポートを変える場合は `PORT` 環境変数を設定します。必要な環境変数名は [.env.example](./.env.example) に記載します。`start:dev` は `.env.example` を読み、存在すれば `.env` の設定で上書きします。

## ローカルのデータサービス

Docker Desktop を起動してから、`backend` ディレクトリで実行します。`.env.example` は開発専用の初期値です。別の認証情報を使う場合は `.env` にコピーして値を変更し、以下の `--env-file .env.example` を `--env-file .env` に置き換えてください。`.env` は Git に含まれません。

```powershell
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example up -d --wait
docker compose --env-file .env.example ps
```

| サービス | ホストからの接続先 | Compose 内からの接続先 | 保存先 |
| --- | --- | --- | --- |
| PostgreSQL 17 | `127.0.0.1:5433` | `postgres:5432` | `postgres-data` Volume |
| InfluxDB OSS 2.9 | `127.0.0.1:8086` | `influxdb:8086` | `influxdb-data` と `influxdb-config` Volume |
| Eclipse Mosquitto 2 | `127.0.0.1:1883` | `mqtt:1883` | `mosquitto-data` Volume |
| Mailpit | SMTP `127.0.0.1:1025`、受信画面 `http://127.0.0.1:8025` | `mailpit:1025` | 開発用の一時保存 |

接続ポートは `.env.example` の値で変更できます。InfluxDB の開発用 Organization は `aquaguard`、Bucket は `sensor_raw` です。`sensor_readings`、`device_heartbeats`、`actuator_feedback` の保存形式と現在の実装範囲は[ストレージ実装資料](./docs/storage_implementation.md)を参照してください。保持期間はまだ確定していないため、開発用 Bucket は初期設定のまま使用します。

停止するときは `docker compose --env-file .env.example stop` を実行します。Volume に保存されたデータは残ります。初期パスワードや Token は初回起動時に設定されるため、Volume を保持したまま環境変数だけ変更しても既存ユーザーの認証情報は変わりません。

Mosquitto はローカル開発用に匿名接続を許可しています。ホストへの公開ポートは `127.0.0.1` に限定しています。実機接続や本番配置の前に、機器認証・Topic・QoS を確定します。バックエンドの受信を有効にするには `.env` に `MQTT_ENABLED=true` を設定します。現行のローカル受信 Topic は `aquaguard/sensors/<deviceId>/readings`、`aquaguard/devices/<deviceId>/heartbeats`、`aquaguard/actuators/<deviceId>/feedback`、QoS は 1 です。Sensor Event は JSON で `eventId`、`deviceId`、`parameter`、`value`、`measuredAt` を含みます。Heartbeat は `eventId`、`deviceId`、`sentAt`、`onlineHint`、Actuator Feedback は `eventId`、`deviceId`、`occurredAt`、`state`（任意で `mode`、`faultCode`、`commandId`）を含みます。登録済み機器の ID と Topic の ID が一致する必要があります。購読側は保存完了後に確認応答を返し、一時的な保存失敗時は再接続して Broker の再配送を受けます。HeartbeatとFeedbackはPostgreSQL Receiptにも記録し、保存途中で停止した場合は再起動時にInfluxDBと照合します。不正な Event は `mqtt_rejected_messages` に理由・ハッシュ・件数を記録して確認応答を返します（生の Payload は保存しません）。再起動後の再配送には固定の `MQTT_CLIENT_ID` を使います。ローカル結合確認は `npm run test:ingestion:local` で行います。

Mailpit は開発用のメール受信箱です。招待・パスワード再設定メールは外部へ配送されず、受信画面でリンクを確認できます。API をホスト上で起動するときの `SMTP_HOST` は `127.0.0.1`、Compose 内で起動するときは `mailpit` にします。実際のメール配送を使う環境では `SMTP_HOST`、`SMTP_PORT`、必要なら `SMTP_USER`／`SMTP_PASSWORD` と `SMTP_SECURE`、`MAIL_FROM`、`WEB_APP_ORIGIN` を環境別に設定します。

## 初期 Migration と検証

データサービスを起動した後、`backend` ディレクトリで実行します。

```powershell
npm run build
node --env-file=.env.example --env-file-if-exists=.env dist/tools/migrate.js
npm run test:db:local
npm run test:influx:local
npm run test:auth:local
npm run test:admin:local
npm run test:admin-settings:local
npm run test:sync-status:local
npm run test:admin-users:local
npm run test:password-links:local
npm run test:bootstrap:local
```

Migration は SQL ファイル順に適用され、適用済みファイルのチェックサムを照合します。ローカル連携テストも `.env.example` を読み、存在すれば `.env` の設定で上書きします。

## 認証と管理API（第4段階の実装済み範囲）

現在の画面向け API は `POST /auth/login`、`POST /auth/logout`、`GET/PATCH /auth/me`、`POST /auth/password/forgot`、`GET /auth/password/tokens/{token}`、`POST /auth/password/set`、`GET /sync-status`、`GET /ponds/{pondId}/sensors/series` と、SA専用のUser・Farm・Pond・Device管理APIです。User管理は一覧・詳細・招待・変更・再送・再設定依頼・無効化／再有効化、Farm／Pond管理は一覧・詳細・作成・変更、Device管理は一覧・登録・割当変更を実装しています。すべて `/api/v1` 配下で、[フロントエンドのOpenAPI](../frontend/app/api/openapi.frontend.yaml)の該当パスと応答を基準にします。

ログインには DB 内の管理者が必要です。初回だけ、Migration 後に `BOOTSTRAP_COMPANY_ID`、`BOOTSTRAP_COMPANY_NAME`、`BOOTSTRAP_ADMIN_ID`、`BOOTSTRAP_ADMIN_NAME`、`BOOTSTRAP_ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD` を環境変数に設定して `npm run admin:bootstrap` を実行します。パスワードをリポジトリ内のファイルに書かないでください。既に管理者がいる DB ではこのコマンドは拒否します。

認証はドラフト契約の `aquaguard_session` Cookie を使用し、無操作12時間で失効します。Cookie は HttpOnly / SameSite=Lax とし、本番では Secure を付けます。ローカルHTTPでは Secure を付けず、必要なら `COOKIE_SECURE=true` で指定できます。NestJS のCSRF防御を有効にしています。フロントエンド開発サーバーは `/api` をバックエンドへ同一Originでプロキシします。別Originからの利用には、Origin・Cookie・CORSを含めた配置設計が必要です。

招待リンクは72時間、再設定リンクは1時間有効で、使用は1回だけです。リンクのToken原文はDBに保存せず、ハッシュを保存します。招待でパスワードを設定した場合はセッションCookieを発行し、再設定では既存セッションを失効させます。忘れたパスワードはメールアドレスの存在にかかわらず202を返します。

フロントエンドの現行 `useSetPassword` は、再設定成功時にも返却された `Me` を画面内キャッシュに保存します。再設定後はログイン画面へ遷移する契約であり、バックエンドはCookieを発行しません。ログイン前に業務画面へ移動すると、画面内キャッシュと実セッションが一時的に食い違う可能性があります。フロントエンドを編集できる段階で、再設定時は `Me` キャッシュをクリアする調整が必要です。

SMTP送信はDBへの招待・Token保存後に行います。送信に失敗した場合、管理者の招待操作は503になりますが、Invitedユーザーは残ります。メールサービスを復旧してから管理画面の「招待を再送」を使ってください。ローカルの連携テストはMailpitでメールを受信し、テストメールを削除します。

Device の接続状態と最終受信時刻は InfluxDB の記録から算出します。初回受信前は `offline` と `lastSeenAt: null` を返し、Offline 件数には含めません。Offline 判定には会社の Rules に設定した `sensorOfflineAfterMinutes` を使い、設定前の初期値は60分です。Settings の Thresholds・Growth Targets・Rules は会社単位の版として保存し、変更前の版も残します。Thresholds は Farm 別の上書きと共通値の継承に対応します。初期値はフロントエンドの開発用設定と一致させています。

`GET /sync-status` は FM に会社の全 Farm、TM に担当 Farm のセンサー記録を対象として InfluxDB を参照し、Rules の遅延・Offline 分数で品質を判定します。参照成功時刻は `syncedAt` として返し、ユーザー別の参照Checkpointを保存します。データがなければ `quality: no_data` です。次回参照時刻は画面の5分再取得間隔から算出します。

`GET /ponds/{pondId}/sensors/series` は担当権限を PostgreSQL で確認した後、InfluxDB の実測値を指定間隔に集計します。欠損区間の `avg`・`min`・`max` は `null` で、表示する `threshold` は Farm 別上書きを優先します。現行フロントエンドの24時間・7日・30日表示に対応します。MQTT 購読を有効にすると、受信 Event の実測値も同じ系列に保存されます。

`GET /ponds/{pondId}/sensors/current` は担当 Pond に割り当てられた有効な6種類のセンサーについて、InfluxDB の保存済み最新値をリクエスト時に読み、Farm 別閾値と運用ルールから `severity`・`quality` を計算します。API 再起動後も同じ保存値を読み直します。必要な機器・有効値が欠ける、または計測値がオフライン判定時間を超える場合は `503 telemetry_not_ready` を返し、架空の値や `normal` を返しません。`series` と `sync-status` も無効な計測点を判定対象から外します。

TM 向け `GET /farms/{farmId}/ponds/water-quality` は担当 Farm の Pond ごとに6項目の最新値・品質・重大度を返し、各 Pond の状態をセンサー値と未解決 Alert のうち最も重い重大度で集計します。未受信は `value: null`・`quality: no_data`、無効または Offline の値は `value: null`・`quality: offline` として返し、架空の計測値を補いません。`counts` は Pond の状態別件数、`normalRanges` はその Farm に有効な閾値の Attention 境界から作ります。現在値APIとは用途が異なり、表全体の取得を欠測1項目で失敗させません。実DB／InfluxDB確認は `npm run test:sync-status:local` です。

TM向け `GET /ponds/{pondId}` は、担当Pondの面積、現在の放養サイクルの記録、DOC、最新SamplingのABW、当日の給餌計画、未解決Alert数を返します。状態は有効な6項目のSensor現在値と未解決Alertの最も重い重大度で算出し、必要なSensor値が欠ける場合は `503 telemetry_not_ready` を返します。放養記録がない場合は `stockedOn`・`stockedPl`・`doc`、Samplingがない場合は `abwG` を `null` にします。給餌計画がない場合は `feeding` の配列を空で返します。`stocking_records` と `feeding_plan_rounds` は既存のPond取得契約の入力源ですが、登録・編集の公開APIは現行フロントエンド契約にないため追加していません。保存構造はMigration `0016_pond_planning.sql`、確認コマンドは `npm run test:pond-planning:local` と `npm run test:sync-status:local` です。

TM向け `GET /farms/{farmId}/ponds` は担当FarmのPond一覧を返し、`status`・`alertState` で絞り込めます。状態とAlertは水質一覧、ABW・目標比は現行サイクルの最新Sampling、当日の給餌・死亡は現場記録、予定回数は給餌計画、エアレーター稼働数はInfluxDBのFeedbackから取得します。欠測値は契約上nullableな項目では `null` にし、Sensorまたは登録済みエアレーターの状態が確定できないPondでは `503 telemetry_not_ready` を返します。`latestSamplingDate` は絞り込み後のPondの最新日です。実DB・InfluxDBの確認は `npm run test:sync-status:local` です。

Farm Summary の成長観点に向けて、稼働中の生産サイクルと最新サンプリングから、成長目標との比率および Behind のPond割合を計算する内部サービスを追加しました。割合の Attention／Warning 境界は Rules、Pond単位の Behind 判定幅は Growth Targets に従います。サンプルまたは目標値が欠けるPondがあれば `sampleBasedStatus: null` とし、未確定を正常と扱いません。放養尾数が未保存のためSurvival Rate急低下の判定はまだ含めず、フロントエンド向け `FarmSummary` APIには接続していません。`npm run test:sampling:local` と `npm run test:unit` で検証します。

Farm運用状態では、現行割当のSensorは最後の有効な計測時刻からOnline／Offlineを、Aerator・PumpはFeedbackの状態とHeartbeatから稼働・故障・切断を集計します。`GET /farms/{farmId}/operational-status` はTMの担当Farmについて、現地日付の給餌記録と予定、次回Sampling予定、登録済み発電機状態を組み合わせて現行OpenAPIの `OperationalStatus` を返します。次回Sampling予定が未登録なら `null`、発電機状態または機器の実状態が未確認なら503を返し、正常値を補いません。発電機状態とSampling予定は現行OpenAPIに更新APIがないため、`farm_generator_states` と `farm_sampling_schedule` をバックエンド運用側で登録する必要があります。`npm run test:sync-status:local` と `npm run test:farm-operations:local` で検証します。

Reportの共通ID・種別・日付・担当TM・保存時刻・提出時刻・締切を `reports` テーブルに保存する土台を追加しました。`GET /farms/{farmId}/report-status` は担当TMに、Farmの現地日付とRulesの締切から当日Daily・今週Weeklyの状態を返し、最新の提出済みReportを示します。未作成なら `reportId: null`、締切後は `overdue` とし、既存Draftの締切は保存済み `due_at` を使用します。Report本文・作成・提出APIは今後の実装範囲です。実DB検証は `npm run test:farm-report-status:local` です。

`GET /reports` はフロントエンド契約の種別・Farm・状態・日付範囲・ページ指定に対応します。FMには提出済みのみ、TMには担当FarmのDraftと提出済みを返します。Dailyの手入力項目は `daily_report_inputs`、Pond別入力、除外Alert、手入力Action・設備Eventのテーブルへ保存する設計です。Report一覧と入力テーブルの実DB検証は `npm run test:reports:local` です。

Daily Report本文の元記録として、指定日・Farmの給餌量と回数、計画回数、最後の飼料、死亡尾数と重量をPond別・Farm合計で読む内部サービスを追加しました。異なる記録のJOINで合計が重複しないよう集計を分離し、日付外の記録は混ぜません。検証は `npm run test:daily-report-records:local` です。

各Pondの `appetite`・`tray`・`health` はフロントエンドMockと同じ `good`・`clean`・`normal` を下書きフォームの編集可能な初期値とし、保存済みのTM入力があればそちらを優先します。これはセンサーから計算するPond／Farmの状態ではありません。Daily本文APIでは、この入力値と元記録に設備・Alert等を合成する必要があります。

Daily Reportの活動欄に向け、Farmの現地日付と重なるAlert、日付内のAlert対応、除外指定、手入力Action・設備Eventを読む内部サービスを追加しました。前日から継続したAlertも含め、手入力が別FarmのPondを指す場合は返しません。Actuator操作ログと故障通知のReport反映は設備操作の実装時に接続します。実DB検証は `npm run test:daily-report-activity:local` です。

`GET /ponds/{pondId}/sensors/history` は保存済みの有効な計測値を5分単位の行にまとめ、6項目の値・重大度とページ情報を返します。同じ5分枠に同じ項目が複数ある場合は最新値を使い、欠測項目は `value: null` とします。現行 OpenAPI の `HistoryValue.severity` は必須で null や `no_data` を許さないため、欠測項目の severity はフロントエンド Mock と同じ `normal` を返します。表示側では `value: null` を欠測として扱います。期間未指定時は直近24時間、指定できる範囲は最大31日です。検証は `npm run test:sensor-history:local` で行えます。

Sensor Current／Series／History／Anomalies は TM と担当 Farm の Pond に限定します。`GET /ponds/{pondId}/sensors/anomalies` は PostgreSQL に保存した異常区間を現行 OpenAPI の `SensorAnomaly` 形式で返し、関連 Alert があれば `alertId` を含めます。期間未指定時は直近7日と重なる区間を返します。受信時 Critical 判定と5分処理の Warning／Attention 判定で閾値逸脱区間を作り、有効な回復点で区間を閉じます。増加・減少傾向の発報条件は既存資料では未確定のため、推測した条件で行を生成しません。参照 API の検証は `npm run test:sensor-anomalies:local` で行えます。

`GET/POST /ponds/{pondId}/mortalities` と `PATCH /mortalities/{recordId}` は TM の担当 Farm に限定した死亡記録 API です。入力と返却の `date`・`count`・`weightKg`・`observation` はフロントエンド OpenAPI に合わせています。一覧は日付範囲・ページ指定と直近7日の合計に対応し、修正前後の値は監査テーブルに残します。放養サイクルが登録されている場合は記録日に該当するサイクルへ結び付けます。放養の作成 API は現行契約になく、サイクル登録経路はまだありません。

`GET/POST /ponds/{pondId}/feedings` と `PATCH /feedings/{recordId}` も担当 TM のみ利用できます。`round`・`feedType`・`amountKg`・`trayCheck` はフロントエンド OpenAPI の名前と enum を使用します。同一 Pond・日付・回の重複登録は `409`、未来日の登録は `422` とし、一覧に直近2日の `dailyTotals` を返します。返却する `time` は初回記録時刻を WIB の `HH:mm` で表示します。修正前後の値を監査テーブルに残します。

業務画面向け Farm/Pond 状態APIは未実装です。運用開始前に対象IoT機器からの受信を確認し、再起動時は保存済みの有効な計測値と未処理判定から状態を復元する方針です。最初の5分を無条件に `normal` とせず、鮮度切れや必要項目の欠落も正常扱いしません。運用開始時に確認する機器・項目・鮮度の具体的条件、および未放養・Sampling未実施時に [フロントエンドOpenAPI](../frontend/app/api/openapi.frontend.yaml) の必須日付をどう扱うかは引き続き確定が必要です。バックエンド側で契約を独自変更せず、[DB設計の未決事項](./docs/database_design.md)に記録しています。

Sampling API は Pond の一覧・登録・修正と Farm の日付別一覧・一括保存に対応します。DOC、ABW、ADG、目標比、成長判定、Laboratory の閾値判定は保存済み記録と現行の管理設定から計算します。一括保存は同一 Farm 内の指定 Pond だけを同一トランザクションで更新し、途中で失敗した場合は全件を戻します。記録日を含む `production_cycles` が必要で、未登録の場合は 422 を返します。現行 OpenAPI に放養登録 API がないため、運用開始時のサイクル登録経路は今後の設計課題です。ローカル検証は `npm run test:sampling:local` で行えます。

## API の基準

画面向け API は `/api/v1` に配置します。パス、メソッド、入出力、命名、エラーはフロントエンドの[必要 API 定義](../frontend/app/api/openapi.frontend.yaml)と[変更要求](../frontend/app/api/OPENAPI_CHANGES.md)を優先し、[統合 OpenAPI](../docs/api/openapi.yaml)に従って実装します。

PostgreSQL の初期テーブルと InfluxDB の論理系列は実装済みです。`SensorIngestionService` は単一 Sensor Event の項目・計測時刻・機器割当を検証し、Receipt を先に記録してから InfluxDB に保存します。同一 Event の再送は重複保存せず、別 Event が同じ計測点を占有しようとした場合は Receipt を隔離します。起動時には `pending` の Receipt と InfluxDB の保存済み点を照合し、保存が確認できたものだけ `stored` に復旧します。InfluxDB に点がない Receipt は `pending` のままにし、再送を待ちます。Web 向けの受信 API は追加していません。

保存済みの新規 Sensor Event は受信直後に、その計測時刻に有効な Farm 別／共通閾値で Critical 判定します。Critical の初回発生では Alert・Issue・異常区間・通知 Outbox・Receipt の判定完了を同じ PostgreSQL Transaction で保存し、継続点や再送で重複させません。現在の即時判定では、計測値が未来、または運用ルールの Offline 判定分数より古い場合と、同じ機器の後続点より古い場合は即時発報を見送り、理由を Receipt に残します。これは遅延点を現在の危険として通知しないための暫定条件で、専用の許容経過時間は実機条件に合わせて確定が必要です。保存後の判定が失敗した Receipt は `stored` に残り、再送、起動時、および稼働中の定期回収で再試行します。`npm run test:critical:local` で実 DB／InfluxDB を使った検証ができます。通知 Outbox は起動時と60秒間隔で、同じ会社の有効な FM および対象 Farm に担当登録された有効な TM の利用者別レコードへ展開します。対象者がいなければ `no_recipient`、保存に失敗すれば間隔を広げて再試行します。再実行しても利用者別レコードは重複しません。`materialized` はDB保存済みを示し、画面への配信・受信・既読を意味しません。通知 API と SSE は統合 OpenAPI で未合意のため追加していません。実DBでの確認は `npm run test:notifications:local` です。

起動時と稼働中の5分間隔で、有効な受信点を時刻順に再読込します。Warning は判定時に、Attention は Rules の `attentionToAlertMinutes` だけ連続した後に、Alert・Issue・異常区間を作ります。3～5分の計測周期に対し、点の間隔が6分を超える場合はAttentionの継続時間をリセットします（Rules の遅延判定時間が6分未満なら短い方を使います）。この6分は機器側の実測周期が決まるまでの暫定値です。回復点では異常区間を閉じますが、TMのAlert解決状態は自動変更しません。Criticalへの昇格は受信時判定と同じAlertを使い、古い点で重大度を下げません。未完了Receiptの点は追い越さず、再実行しても重複作成しません。Alert・Issue・検知状態・Farm別Checkpointは同一PostgreSQL Transactionで更新します。初回読込は直近24時間に限定します。Checkpointより古い計測時刻の点が後から届いた場合、直近24時間かつ既存の異常区間内の有効値に限り、区間の最大・最小値を補正します。この補正で過去Alertの発報・重大度・対応状態は変更しません。既存区間のない古い点による異常区間の再構築、24時間より古い点の補正、Farm／Pond集計と5分Checkpointの`/sync-status`への反映は未実装です。実DB・InfluxDB検証は `npm run test:periodic:local` です。

同じ5分処理で、受信実績のあるSensorについて最後の有効な計測時刻を確認し、Rules の `sensorOfflineAfterMinutes` を超えた場合に `sensor_offline` の Attention Alert と Sensor Issue を作ります。初回受信前は発報せず、停止中は1件にまとめます。再開した有効な計測値で `telemetry_to` を保存しますが、TMの確認・解決状態は変更しません。Offline Alert の `value`・`thresholdValue`・`direction` は `null` です。表示文には対象センサーの測定項目を含め、FMには生の数値を返しません。状態は `sensor_offline_states` に保存し、Alert・Issue・Checkpointと同じTransactionで更新します。

Alert 画面向けの `GET /alerts`、`GET /alerts/{alertId}`、`POST /alerts/{alertId}/acknowledge`、`POST /alerts/{alertId}/actions`、`POST /alerts/{alertId}/resolve` を追加しました。TM の担当 Farm に限定し、確認・対応・解決の状態変更と履歴は Transaction で保存します。Alert の title は `Accept-Language: en | id` に合わせて生成します。詳細の `sensor.connection` は現在の機器受信状況を参照します。関連する FM 向け Issue の ID を `issueId` に返します。対応記録は `alert_actions` に保存されますが、Daily Report の自動反映は Report API 実装時に接続します。実 DB による確認コマンドは `npm run test:alerts:local` です。

`GET /issues`・`GET /issues/{issueId}` は FM の会社内 Farm に限定します。Alert の発報時に安定した Issue ID を保存し、Alert の解決時に Issue も解決します。Migration `0010_alert_issues.sql` は既存の Alert にも Issue を割り当てます。一覧は既定で継続中のみを重大度順・発生時刻順に返し、詳細は TM の確認者・対応記録を参照します。FM へは生のセンサー値・閾値の数値を返しません。Report API が未実装のため `relatedReports` は現在空配列です。詳細の傾向文は閾値の上下方向を説明し、時系列変化量の推定は行いません。Alert と合わせた実 DB 検証は `npm run test:alerts:local` です。
