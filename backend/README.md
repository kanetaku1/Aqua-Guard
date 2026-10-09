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

## API の基準

画面向け API は `/api/v1` に配置します。パス、メソッド、入出力、命名、エラーはフロントエンドの[必要 API 定義](../frontend/app/api/openapi.frontend.yaml)と[変更要求](../frontend/app/api/OPENAPI_CHANGES.md)を優先し、[統合 OpenAPI](../docs/api/openapi.yaml)に従って実装します。現段階では画面向け API の実装はありません。

PostgreSQL、InfluxDB、MQTT Broker と接続するローカル環境は次の実装段階で追加します。
