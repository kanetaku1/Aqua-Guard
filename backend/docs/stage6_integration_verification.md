# 第6段階 結合確認

確認日: 2026-10-13

## 目的

フロントエンドが基準とする `frontend/app/api/openapi.frontend.yaml` とバックエンド実装の整合性を確認し、ローカル環境でフロントエンドからバックエンドへ接続できることを確認する。

この確認ではフロントエンドのソースファイルを変更していない。

## 自動確認

### APIルート契約

`npm run test:contract:routes` は、フロントエンドOpenAPIの全パスとHTTPメソッドをNestJS Controllerから抽出したルートと照合する。

- OpenAPIにありバックエンドにない操作を失敗とする
- バックエンドにだけ存在する画面向け操作を失敗とする
- 内部監視用の `GET /health` と `GET /health/ready` だけを例外とする

確認結果: 成功

### バックエンド

```powershell
cd backend
npm run db:migrate:local
npm run build
npm run typecheck
npm run test:unit
npm run test:contract:routes
npm run test:integration:local
```

確認結果:

- Migration: 適用漏れなし
- Build / TypeScript型検査: 成功
- 単体テスト: 8件成功
- ルート契約テスト: 1件成功
- PostgreSQL、InfluxDB、MQTTを使う統合テスト: 40件成功

統合テストはDBを共有するため、`--test-concurrency=1` で順番に実行する。

### フロントエンド互換性

フロントエンド側では次を確認した。

- `npm run lint`: 成功
- `npm test`: 20ファイル、86件成功
- `npm run build`: 成功。成果物はフロントエンド配下へ書き込まず、一時ディレクトリに出力
- OpenAPIから生成した型と既存型のoperation key 75件、schema key 99件が一致

## 実HTTP疎通

Docker ComposeでPostgreSQL、InfluxDB、Mosquitto、Mailpitを起動し、Migration後にバックエンドとVite開発サーバーを実プロセスとして起動した。

| 確認項目 | 経路 | 結果 |
| --- | --- | --- |
| バックエンド稼働 | `GET http://127.0.0.1:8000/health` | 200 |
| DB / InfluxDB readiness | `GET http://127.0.0.1:8000/health/ready` | 200 |
| フロント画面配信 | `GET http://127.0.0.1:5173/` | 200 |
| ログイン | Viteの `/api/v1/auth/login` プロキシ経由 | 200 |
| セッション参照 | Viteの `/api/v1/auth/me` プロキシ経由 | 200、`system_administrator` |
| ログアウト | Viteの `/api/v1/auth/logout` プロキシ経由 | 204 |

疎通確認用に作成した会社、管理者、セッションは確認後にローカルDBから削除した。

## 現在の運用上の制限

- センサー値、Heartbeat、設備Feedbackの受信・保存・参照は実装済み
- IoT実機のTokenや本番Brokerを使う確認は、接続情報をリポジトリへ保存せず、配置環境の環境変数で行う
- ポンプやエアレーターは、Technical Managerによる手動遠隔操作を行う。AIやルールによる自動制御は行わず、実機の通信仕様が設定されていない環境では操作APIが監査履歴を保存して`409 safety_blocked`を返す
- 画面で扱うAPI契約はフロントエンドOpenAPIを最優先とする

## 再確認の基準

OpenAPI、Controller、認証、DB Migration、時系列保存、またはフロントエンドのAPI呼び出しを変更した場合は、上記の契約テストと統合テストを再実行する。
