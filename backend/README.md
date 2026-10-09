# AquaGuard Backend

NestJS / TypeScript によるバックエンドの土台です。現段階の公開機能は稼働確認用の `GET /health` だけです。これは画面向け API には含めません。

## 開発用の起動

Node.js 20.19 以上と npm を使用します。

```powershell
cd backend
npm ci
npm run typecheck
npm run build
npm run start:dev
```

別の端末から `http://localhost:8000/health` にアクセスすると `{"status":"ok"}` を返します。ポートを変える場合は `PORT` 環境変数を設定します。必要な環境変数名は [.env.example](./.env.example) に記載します。

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

接続ポートは `.env.example` の値で変更できます。InfluxDB の開発用 Organization は `aquaguard`、Bucket は `sensor_raw` です。この Bucket には[DB 設計](./docs/database_design.md#10-influxdb論理設計)の `sensor_readings`、`device_heartbeats`、`actuator_feedback` を後続段階で保存します。保持期間はまだ確定していないため、開発用 Bucket は初期設定のまま使用します。

停止するときは `docker compose --env-file .env.example stop` を実行します。Volume に保存されたデータは残ります。初期パスワードや Token は初回起動時に設定されるため、Volume を保持したまま環境変数だけ変更しても既存ユーザーの認証情報は変わりません。

Mosquitto はローカル開発用に匿名接続を許可しています。ホストへの公開ポートは `127.0.0.1` に限定しています。実機接続や本番配置の前に、機器認証・Topic・QoS を確定します。現段階では NestJS API から各サービスへの接続と Migration は実装していません。

## API の基準

画面向け API は `/api/v1` に配置します。パス、メソッド、入出力、命名、エラーはフロントエンドの[必要 API 定義](../frontend/app/api/openapi.frontend.yaml)と[変更要求](../frontend/app/api/OPENAPI_CHANGES.md)を優先し、[統合 OpenAPI](../docs/api/openapi.yaml)に従って実装します。現段階では画面向け API の実装はありません。

PostgreSQL と InfluxDB の具体スキーマ、MQTT の Payload、NestJS API からの接続は次の実装段階で追加します。
