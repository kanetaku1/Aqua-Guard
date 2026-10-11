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

Mosquitto はローカル開発用に匿名接続を許可しています。ホストへの公開ポートは `127.0.0.1` に限定しています。実機接続や本番配置の前に、機器認証・Topic・QoS を確定します。

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

`GET /ponds/{pondId}/sensors/series` は担当権限を PostgreSQL で確認した後、InfluxDB の実測値を指定間隔に集計します。欠損区間の `avg`・`min`・`max` は `null` で、表示する `threshold` は Farm 別上書きを優先します。現行フロントエンドの24時間・7日・30日表示に対応します。MQTT 受信が未実装のため、現時点の実測値は直接書き込みテストのデータだけです。

`GET /ponds/{pondId}/sensors/current` は担当 Pond に割り当てられた有効な6種類のセンサーについて、InfluxDB の保存済み最新値をリクエスト時に読み、Farm 別閾値と運用ルールから `severity`・`quality` を計算します。API 再起動後も同じ保存値を読み直します。必要な機器・有効値が欠ける、または計測値がオフライン判定時間を超える場合は `503 telemetry_not_ready` を返し、架空の値や `normal` を返しません。`series` と `sync-status` も無効な計測点を判定対象から外します。

業務画面向け Farm/Pond 状態APIは未実装です。運用開始前に対象IoT機器からの受信を確認し、再起動時は保存済みの有効な計測値と未処理判定から状態を復元する方針です。最初の5分を無条件に `normal` とせず、鮮度切れや必要項目の欠落も正常扱いしません。運用開始時に確認する機器・項目・鮮度の具体的条件、および未放養・Sampling未実施時に [フロントエンドOpenAPI](../frontend/app/api/openapi.frontend.yaml) の必須日付をどう扱うかは引き続き確定が必要です。バックエンド側で契約を独自変更せず、[DB設計の未決事項](./docs/database_design.md)に記録しています。

## API の基準

画面向け API は `/api/v1` に配置します。パス、メソッド、入出力、命名、エラーはフロントエンドの[必要 API 定義](../frontend/app/api/openapi.frontend.yaml)と[変更要求](../frontend/app/api/OPENAPI_CHANGES.md)を優先し、[統合 OpenAPI](../docs/api/openapi.yaml)に従って実装します。

PostgreSQL の初期テーブルと InfluxDB の論理系列は実装済みです。MQTT の Payload と受信処理、残りの画面向け API は後続段階で追加します。
