# AquaGuard Backend

NestJS / TypeScript によるバックエンドの土台です。現在は PostgreSQL の初期 Migration と InfluxDB への時系列書き込みを実装しています。画面向け API はまだ実装していません。

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

接続ポートは `.env.example` の値で変更できます。InfluxDB の開発用 Organization は `aquaguard`、Bucket は `sensor_raw` です。`sensor_readings`、`device_heartbeats`、`actuator_feedback` の保存形式と現在の実装範囲は[ストレージ実装資料](./docs/storage_implementation.md)を参照してください。保持期間はまだ確定していないため、開発用 Bucket は初期設定のまま使用します。

停止するときは `docker compose --env-file .env.example stop` を実行します。Volume に保存されたデータは残ります。初期パスワードや Token は初回起動時に設定されるため、Volume を保持したまま環境変数だけ変更しても既存ユーザーの認証情報は変わりません。

Mosquitto はローカル開発用に匿名接続を許可しています。ホストへの公開ポートは `127.0.0.1` に限定しています。実機接続や本番配置の前に、機器認証・Topic・QoS を確定します。

## 初期 Migration と検証

データサービスを起動した後、`backend` ディレクトリで実行します。

```powershell
npm run build
node --env-file=.env.example --env-file-if-exists=.env dist/tools/migrate.js
npm run test:db:local
npm run test:influx:local
```

Migration は SQL ファイル順に適用され、適用済みファイルのチェックサムを照合します。ローカル連携テストも `.env.example` を読み、存在すれば `.env` の設定で上書きします。

## API の基準

画面向け API は `/api/v1` に配置します。パス、メソッド、入出力、命名、エラーはフロントエンドの[必要 API 定義](../frontend/app/api/openapi.frontend.yaml)と[変更要求](../frontend/app/api/OPENAPI_CHANGES.md)を優先し、[統合 OpenAPI](../docs/api/openapi.yaml)に従って実装します。現段階では画面向け API の実装はありません。

PostgreSQL のテーブルと InfluxDB の論理系列は実装済みです。MQTT の Payload と受信処理、画面向け API は後続段階で追加します。
