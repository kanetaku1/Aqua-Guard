# AquaGuard バックエンド説明資料

## この資料の目的

この資料は、AquaGuardのバックエンドについて、開発担当者以外にも文章で説明できるようにまとめたものです。発表では「何を担当するシステムか」「どのようにデータを保存するか」「フロントエンドやIoT機器とどう接続するか」の順に説明します。

## 最初に伝える要約

AquaGuardのバックエンドは、養殖場のユーザー、Farm、Pond、IoT機器、測定値、Alert、現場記録、Reportを一元管理するサーバーです。

フロントエンドから受け取った要求を処理するAPI、IoT機器から測定値を受け取る処理、異常判定、データ保存、権限管理を担当します。通常の業務データはPostgreSQLへ、時間とともに増えるセンサー測定値はInfluxDBへ保存します。

バックエンドはNestJSとTypeScriptで実装し、ローカル環境ではDocker Composeを使ってPostgreSQL、InfluxDB、Mosquitto、Mailpitを起動します。

## 1. バックエンドの役割

フロントエンドは画面表示とユーザー操作を担当します。バックエンドは、受け取った操作が許可されているかを確認し、データを保存・計算して結果を返します。

主な役割は次のとおりです。

- ログイン、ログアウト、セッション管理
- System Administrator、Farms Manager、Technical Managerの権限制御
- Company、Farm、Pond、User、Deviceの管理
- センサー測定値とHeartbeatの受信
- 水質異常、通信停止、運用上の問題の判定
- Feeding、Mortality、Samplingなどの現場記録
- 生存率、Biomass、FCR、成長状態などの集計
- Daily Report、Weekly Reportの作成と提出
- ポンプやエアレーターの状態表示と操作履歴管理

## 2. システム全体の流れ

システムの基本的な接続関係は次のとおりです。

```text
利用者
  ↓
Reactフロントエンド
  ↓ HTTP / JSON
NestJSバックエンド
  ├─ PostgreSQL：ユーザー、Farm、記録、Alert、Report
  ├─ InfluxDB：センサー値、Heartbeat、設備Feedback
  ├─ Mosquitto：IoT向けMQTT Broker
  └─ Mailpit：ローカル開発用メール受信
```

フロントエンドは`/api/v1`配下のAPIを呼び出します。開発時はViteが`/api`への通信を`http://localhost:8000`のバックエンドへ転送します。

## 3. 使用技術

### NestJS・TypeScript

APIサーバーにはNestJSとTypeScriptを使用しています。ControllerがHTTPリクエストを受け取り、Serviceが権限確認、入力検証、計算、DB操作を行います。

TypeScriptを採用することで、フロントエンドのOpenAPIと項目名や型を合わせやすくしています。

### PostgreSQL

PostgreSQLには、関連性と整合性が重要な業務データを保存します。

代表例は次のとおりです。

- Company、Farm、Pond
- UserとFarmへの割り当て
- DeviceとPondへの割り当て
- 認証セッション
- 閾値と運用ルール
- Feeding、Mortality、Sampling
- Alert、Issue、対応履歴
- Daily Report、Weekly Report
- 設備操作要求と監査履歴

DB構造の変更は番号付きMigrationで管理します。一度適用したMigrationを直接変更せず、新しいMigrationを追加することで環境ごとの差を防ぎます。

### InfluxDB

InfluxDBには、時刻を基準に大量に蓄積されるIoTデータを保存します。

現在の主なMeasurementは次の3種類です。

- `sensor_readings`：DO、pH、水温、TDS、濁度、水位
- `device_heartbeats`：機器の通信状態
- `actuator_feedback`：エアレーターやポンプの状態

測定時刻と受信時刻を分けて保存するため、通信が遅れた場合でも実際に測定された時刻を保持できます。

### MQTT・Mosquitto

IoT機器からのデータ受信にはMQTTを使用できます。ローカル環境ではMosquittoをBrokerとして起動します。

受信対象はセンサー測定値、Heartbeat、設備Feedbackです。同じEvent IDが再送された場合は重複保存せず、同じEvent IDで内容が異なる場合は競合として拒否します。

実機がメーカーのクラウドAPIを使用する場合は、API Tokenを環境変数へ設定し、専用Connectorを追加します。TokenはGitへ保存しません。

## 4. 認証と権限

ログインに成功すると、バックエンドがセッションCookieを発行します。CookieはHttpOnly、SameSite=Laxとし、本番HTTPS環境ではSecureを有効にします。

権限は次の3種類です。

| 権限 | 主な役割 |
| --- | --- |
| System Administrator | User、Farm、Pond、Device、閾値、ルールの管理 |
| Farms Manager | 複数Farmの状態、Issue、KPI、提出済みReportの確認 |
| Technical Manager | 担当FarmのPond確認、現場記録、Alert対応、Report作成、設備操作 |

Technical Managerは割り当てられたFarmだけにアクセスできます。URL上のIDを変更しても、担当外のFarmやPondは参照・更新できません。

新しいDB環境では、最初にSystem Administratorを1人だけBootstrapコマンドで作成します。その後のUserは管理画面から登録します。

## 5. IoTデータの処理

IoTデータを受信したときは、次の順序で処理します。

1. Payloadの形式を検証する
2. Deviceが登録されているか確認する
3. DeviceとPondの割り当てを確認する
4. Event IDと内容のハッシュを記録する
5. InfluxDBへ測定値を保存する
6. 保存結果をReceiptへ記録する
7. 必要に応じてCritical判定を行う

途中でInfluxDBへの保存に失敗した場合は、Receiptを残して再送または起動時の復旧処理を待ちます。保存済みのEventを再送しても二重登録されない設計です。

## 6. 状態判定とAlert

Criticalに該当する測定値は受信時に判定します。AttentionやWarning、センサーのOffline判定は定期処理で評価します。

異常が発生すると、Alert、Issue、異常区間、通知用OutboxなどをPostgreSQLへ保存します。同じ異常が継続している間は重複したAlertを作らず、回復した時点で異常区間を閉じます。

利用開始時には、すでに受信確認済みのIoTデータを読み取り、その時点の状態を表示します。根拠となるデータがない状態を無条件に`normal`とは扱いません。

## 7. 現場記録・KPI・Report

Technical Managerは、給餌、死亡数、サンプリング結果などを登録します。バックエンドはこれらの記録とセンサー値、Alert、設備操作履歴を組み合わせてDaily ReportとWeekly Reportを構成します。

下書きでは内容を編集できます。提出時には必須項目を検証し、その時点の内容をSnapshotとして固定します。提出後に元データが変更されても、提出済みReportの内容は変わりません。

生存率やBiomassなどのKPIは、Pondごとの根拠データから計算します。データが不足している場合は、推測値で埋めず、不明または未計算として扱います。

## 8. ポンプ・エアレーター

運用方針は、Technical Managerによる手動遠隔操作です。AIやルールによる自動制御は行いません。

フロントエンドにはON・OFF操作、確認画面、Safety表示、操作履歴があります。バックエンドAPIには`turn_on`、`turn_off`などの入力と監査テーブルがあります。

現時点では、実機へ命令を送るCommand TopicまたはメーカーAPI、Payload、ACK形式が未確定です。そのため、現在の実装は操作要求を監査履歴へ保存し、`409 safety_blocked`を返して実機送信を止めています。

実機仕様が確定した後は、次の処理を追加します。

1. 操作者と担当Farmを確認する
2. DeviceがOnlineで故障中ではないことを確認する
3. 操作要求とCommand IDを保存する
4. MQTTまたはメーカーAPIで実機へ送信する
5. ACKまたはFeedbackを受信する
6. 成功、失敗、Timeoutを操作履歴へ反映する

Safety判定はAIではなく、権限、Online状態、故障、緊急停止、連続操作防止などの固定条件で行います。

## 9. API契約

画面向けAPIでは、フロントエンドの次の資料を最優先にしています。

```text
frontend/app/api/openapi.frontend.yaml
frontend/app/api/OPENAPI_CHANGES.md
```

バックエンド側の都合で、パス、項目名、HTTPメソッド、Response形式を独自に変更しません。

`npm run test:contract:routes`では、フロントエンドOpenAPIの全パスとHTTPメソッドがNestJS Controllerに存在するかを自動確認します。

## 10. ローカル環境とデータの永続化

ローカル環境ではDocker Composeで次のサービスを起動します。

| サービス | 用途 |
| --- | --- |
| PostgreSQL | 業務データ保存 |
| InfluxDB | 時系列データ保存 |
| Mosquitto | MQTT Broker |
| Mailpit | 開発用メール確認 |

PostgreSQLとInfluxDBのデータはDocker Volumeへ保存されます。通常の停止やPC再起動では消えません。

```powershell
docker compose --env-file .env.example stop
docker compose --env-file .env.example up -d --wait
```

`docker compose down -v`を実行するとVolumeも削除されるため、実データを残す環境では使用しません。

## 11. 起動方法

### DBと周辺サービス

```powershell
cd backend
docker compose --env-file .env.example up -d --wait
npm run db:migrate:local
```

### バックエンド

```powershell
npm run start:dev
```

### フロントエンド

別のPowerShellで実行します。

```powershell
cd frontend/app
npm run dev
```

`npm run dev`は実際のバックエンドへ接続します。`npm run dev:mock`はフロントエンド単体確認用であり、PostgreSQLやInfluxDBへ保存しません。

## 12. テストと結合確認

現在、次の確認を実施しています。

- バックエンドBuildとTypeScript型検査
- 単体テスト8件
- OpenAPIルート契約テスト1件
- PostgreSQL、InfluxDB、MQTTを使う統合テスト40件
- フロントエンドテスト86件
- Vite Proxy経由のログイン、セッション確認、ログアウト
- PostgreSQLとInfluxDBのReadiness確認

主な確認コマンドは次のとおりです。

```powershell
npm run build
npm run typecheck
npm run test:unit
npm run test:contract:routes
npm run test:integration:local
```

## 13. 現在残っている作業

アプリケーションの基本機能とローカル結合環境は完成しています。実運用に向けて残っている主な作業は次のとおりです。

- 実IoT機器の認証情報とPayload仕様の設定
- 実機を使った測定値受信試験
- ポンプ・エアレーターへの手動遠隔CommandとACK処理
- MQTT認証と必要に応じたTLS設定
- ローカル本番用Docker構成
- バックアップ、自動起動、ログ保存、監視
- 実際の利用者、Farm、Pond、Deviceの初期登録

## 発表用の説明例

このシステムのバックエンドは、養殖場の業務データとIoTデータを管理する中心部分です。フロントエンドから送られたユーザー操作を受け取り、権限を確認して、PostgreSQLまたはInfluxDBへデータを保存します。

PostgreSQLには、ユーザー、Farm、Pond、現場記録、Alert、Reportなど、整合性が重要な業務データを保存します。InfluxDBには、センサー値、Heartbeat、設備Feedbackなど、時刻とともに大量に増えるデータを保存します。このようにDBを分けることで、それぞれのデータに適した方法で管理しています。

IoT機器からデータを受信した際は、Device登録とPondへの割り当てを確認し、重複や競合を防いでから保存します。Criticalな値は受信時に判定し、AttentionやWarning、Offlineは定期処理で判定します。発生した異常はAlertとIssueとして記録し、Technical Managerの対応履歴やReportへ反映します。

認証にはセッションCookieを使い、System Administrator、Farms Manager、Technical Managerの3権限を管理します。Technical Managerは、自分に割り当てられたFarmだけを操作できます。

ポンプやエアレーターについては、AIによる自動制御は行わず、Technical Managerが画面から手動で遠隔操作する方針です。現在は実機の送信形式とACK仕様が未確定なため、安全のため実機送信を停止しています。実機仕様が確定した後、操作要求、送信、ACK、Timeout、操作履歴までを接続します。

APIはフロントエンドのOpenAPIを最優先にしており、契約テストでパスとHTTPメソッドの不足を自動検出します。ローカル環境ではDocker Composeを利用し、実際のPostgreSQL、InfluxDB、Mosquittoを使った統合テストまで完了しています。
