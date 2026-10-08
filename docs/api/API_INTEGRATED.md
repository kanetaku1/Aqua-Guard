# AquaGuard API 統合資料

| 項目 | 内容 |
| --- | --- |
| 更新日 | 2026-10-08 |
| 対象 | Web UI とバックエンド間の `/api/v1` |
| 現行契約 | 60パス・75操作、OpenAPI 3.1.0、`0.1.0-draft` |
| 機械可読の正本 | [統合 OpenAPI](./openapi.yaml) |

## 1. 資料の優先順位

1. フロントエンドの[必要 API 定義](../../frontend/app/api/openapi.frontend.yaml)と[変更要求](../../frontend/app/api/OPENAPI_CHANGES.md)を最優先とする。
2. [統合 OpenAPI](./openapi.yaml)の`paths`と`components`は、フロントエンドの必要 API 定義を変更せず取り込んだ現行契約である。本資料はその読み方と実装上の論点を整理する。
3. [バックエンド API 詳細設計](../../backend/docs/api_design.md)に異なるパス、命名、型、enum、必須項目、レスポンス、判定周期、HTTP ステータスがあれば現行契約を優先する。
4. バックエンドだけにある追加 API 案は、統合 OpenAPI の`x-backend-integration`と本資料の第5章に候補として記す。現行`paths`には含めない。

フロントエンドが必要とする API のパス、メソッド、クエリ名、JSON 名、型、enum、必須項目、レスポンス形状、HTTP ステータス、命名をバックエンド都合で変更しない。実装時の詳細は必ず統合 OpenAPI の該当`operationId`と schema を確認する。

## 2. 共通契約

| 項目 | 現行契約・実装上の扱い |
| --- | --- |
| ベース URL | `/api/v1` |
| 認証 | `aquaguard_session` Cookie をドラフトとして定義。方式、無操作失効、CSRF 対策は実装前に確定する |
| 認可 | FM は Company 配下の Farm の集約情報と提出済み Report、TM は担当 Farm の現場業務、SA は`/admin/*`。サーバーで毎回検証する |
| 言語 | クライアントは`Accept-Language`に`en`または`id`を送る。サーバー生成文は指定言語で返す。id の用語は[フロントエンド用語集](../../frontend/app/src/i18n/GLOSSARY-id.md)を基準とする |
| 日時 | `date-time`は UTC の ISO 8601（`Z`）、業務日の`date`は WIB の暦日 |
| 単位 | 重量 kg、面積 ha、割合は%の数値、Vibrio は ×10³ CFU/mL。Biomass と Survival Rate は Estimated |
| 一覧 | ページングを定義した操作だけ`page`・`pageSize`と`{items,page,pageSize,total}`を用いる。非ページング操作に追加しない |
| エラー | `application/problem+json`。操作ごとのステータスと`Problem.code`・`fieldErrors`に従う |
| データ更新 | `x-refresh-interval-seconds: 300`の操作は画面が5分ごとに再取得する |

現在のフロントエンド契約ではバックエンドが InfluxDB を5分ごとに参照して現在値、Alert 判定、集計を更新する。バックエンド資料にある「受信ごとの Critical 判定と SSE 即時通知」は第5章の未合意案として扱い、現行契約の判定周期や既存 API 応答を上書きしない。

## 3. 現行 API 一覧

以下の表は統合 OpenAPI の`paths`から作成した索引である。成功ステータスは主な2xx応答を示す。パラメータ、リクエスト本文、エラー、フィールド定義は[統合 OpenAPI](./openapi.yaml)の同じ`operationId`を正とする。

<!-- API_OPERATIONS_START -->

### Auth（7操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | `login` | ログイン | 200 |
| `POST` | `/auth/logout` | `logout` | ログアウト | 204 |
| `GET` | `/auth/me` | `getMe` | ログイン中のユーザー | 200 |
| `PATCH` | `/auth/me` | `updateMe` | 自分の表示言語を変更 | 200 |
| `POST` | `/auth/password/forgot` | `requestPasswordReset` | パスワード再設定メールを依頼 | 202 |
| `GET` | `/auth/password/tokens/{token}` | `getPasswordToken` | 招待・再設定リンクの検証 | 200 |
| `POST` | `/auth/password/set` | `setPassword` | パスワードを設定（招待・再設定） | 200 |

### Common（1操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/sync-status` | `getSyncStatus` | データ鮮度（ヘッダー表示） | 200 |

### Farms（5操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/farms` | `listFarms` | Farm の状態一覧 | 200 |
| `GET` | `/farms/{farmId}` | `getFarm` | Farm Detail（ヘッダー＋3観点の状態） | 200 |
| `GET` | `/farms/{farmId}/status-trend` | `getFarmStatusTrend` | Farm 状態の推移 | 200 |
| `GET` | `/farms/{farmId}/operational-status` | `getOperationalStatus` | 現場の運用状態 | 200 |
| `GET` | `/farms/{farmId}/report-status` | `getReportStatus` | Report の提出状況 | 200 |

### Issues（2操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/issues` | `listIssues` | Risk / Issue 一覧 | 200 |
| `GET` | `/issues/{issueId}` | `getIssue` | Issue の詳細（Alert Drawer・閲覧のみ） | 200 |

### Production（2操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/production/summary` | `getCompanyProduction` | Company の生産状況 | 200 |
| `GET` | `/farms/{farmId}/production` | `getFarmProduction` | Farm の生産 KPI と Pond Production Summary | 200 |

### Ponds（3操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/farms/{farmId}/ponds/water-quality` | `listPondWaterQuality` | Pond × 水質の現在値（TM ダッシュボード） | 200 |
| `GET` | `/farms/{farmId}/ponds` | `listPonds` | Pond 一覧（管理用） | 200 |
| `GET` | `/ponds/{pondId}` | `getPond` | Pond Detail ヘッダー | 200 |

### Sensors（4操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/ponds/{pondId}/sensors/current` | `getCurrentSensorData` | 6項目の現在値 | 200 |
| `GET` | `/ponds/{pondId}/sensors/series` | `getSensorSeries` | センサー時系列（グラフ） | 200 |
| `GET` | `/ponds/{pondId}/sensors/history` | `getSensorHistory` | 生データ（Historical Data） | 200 |
| `GET` | `/ponds/{pondId}/sensors/anomalies` | `listSensorAnomalies` | 範囲外の区間（Anomalies） | 200 |

### Alerts（5操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/alerts` | `listAlerts` | Pond Alert 一覧 | 200 |
| `GET` | `/alerts/{alertId}` | `getAlert` | Alert の詳細（Drawer） | 200 |
| `POST` | `/alerts/{alertId}/acknowledge` | `acknowledgeAlert` | Alert を確認（Acknowledge） | 200 |
| `POST` | `/alerts/{alertId}/actions` | `recordAlertAction` | 対応を記録（Record action） | 201 |
| `POST` | `/alerts/{alertId}/resolve` | `resolveAlert` | Alert を解決（Resolve） | 200 |

### Records（11操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/ponds/{pondId}/feedings` | `listFeedings` | 給餌の履歴 | 200 |
| `POST` | `/ponds/{pondId}/feedings` | `createFeeding` | 給餌を記録 | 201 |
| `PATCH` | `/feedings/{recordId}` | `updateFeeding` | 給餌の記録を修正 | 200 |
| `GET` | `/ponds/{pondId}/mortalities` | `listMortalities` | 死亡の履歴 | 200 |
| `POST` | `/ponds/{pondId}/mortalities` | `createMortality` | 死亡を記録 | 201 |
| `PATCH` | `/mortalities/{recordId}` | `updateMortality` | 死亡の記録を修正 | 200 |
| `GET` | `/ponds/{pondId}/samplings` | `listSamplings` | サンプリングの履歴＋成長グラフ | 200 |
| `POST` | `/ponds/{pondId}/samplings` | `createSampling` | サンプリングを記録 | 201 |
| `PATCH` | `/samplings/{recordId}` | `updateSampling` | サンプリングの記録を修正・検査結果を追記 | 200 |
| `GET` | `/farms/{farmId}/samplings` | `listFarmSamplings` | ある日の週次サンプリング（一括入力の初期値） | 200 |
| `POST` | `/farms/{farmId}/samplings/batch` | `batchCreateSamplings` | 週次サンプリングの一括記録 | 200 |

### Actuators（3操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/ponds/{pondId}/actuators` | `listActuators` | 機器の状態 | 200 |
| `POST` | `/actuators/{actuatorId}/commands` | `sendActuatorCommand` | 機器を操作 | 202 |
| `GET` | `/ponds/{pondId}/actuator-logs` | `listActuatorLogs` | 操作履歴 | 200 |

### Reports（8操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/reports` | `listReports` | Report 一覧 | 200 |
| `POST` | `/reports/daily` | `createDailyReport` | Daily Report の下書きを作成 | 201 |
| `GET` | `/reports/daily/{reportId}` | `getDailyReport` | Daily Report | 200 |
| `PATCH` | `/reports/daily/{reportId}` | `updateDailyReport` | Daily Report の下書きを保存（Save Draft） | 200 |
| `POST` | `/reports/weekly` | `createWeeklyReport` | Weekly Report の下書きを作成 | 201 |
| `GET` | `/reports/weekly/{reportId}` | `getWeeklyReport` | Weekly Report | 200 |
| `PATCH` | `/reports/weekly/{reportId}` | `updateWeeklyReport` | Weekly Report の下書きを保存 | 200 |
| `POST` | `/reports/{reportId}/submit` | `submitReport` | Report を提出 | 200 |

### Admin（24操作）

| Method | Path | operationId | 概要 | 成功 |
| --- | --- | --- | --- | --- |
| `GET` | `/admin/users` | `adminListUsers` | ユーザー一覧 | 200 |
| `POST` | `/admin/users` | `adminInviteUser` | ユーザーを招待 | 201 |
| `GET` | `/admin/users/{userId}` | `adminGetUser` | ユーザーの詳細 | 200 |
| `PATCH` | `/admin/users/{userId}` | `adminUpdateUser` | Role・担当 Farm・言語を変更 | 200 |
| `POST` | `/admin/users/{userId}/resend-invitation` | `adminResendInvitation` | 招待を再送 | 202 |
| `POST` | `/admin/users/{userId}/send-password-reset` | `adminSendPasswordReset` | パスワード再設定メールを送る | 202 |
| `POST` | `/admin/users/{userId}/deactivate` | `adminDeactivateUser` | 無効化 | 200 |
| `POST` | `/admin/users/{userId}/reactivate` | `adminReactivateUser` | 再有効化 | 200 |
| `GET` | `/admin/farms` | `adminListFarms` | Farm マスタ一覧 | 200 |
| `POST` | `/admin/farms` | `adminCreateFarm` | Farm を登録 | 201 |
| `GET` | `/admin/farms/{farmId}` | `adminGetFarm` | Farm マスタ | 200 |
| `PATCH` | `/admin/farms/{farmId}` | `adminUpdateFarm` | Farm マスタを更新 | 200 |
| `GET` | `/admin/farms/{farmId}/ponds` | `adminListPonds` | Pond マスタ一覧 | 200 |
| `POST` | `/admin/farms/{farmId}/ponds` | `adminCreatePond` | Pond を登録 | 201 |
| `PATCH` | `/admin/ponds/{pondId}` | `adminUpdatePond` | Pond マスタを更新 | 200 |
| `GET` | `/admin/farms/{farmId}/devices` | `adminListDevices` | 機器一覧 | 200 |
| `POST` | `/admin/farms/{farmId}/devices` | `adminCreateDevice` | 機器を登録・割り当て | 201 |
| `PATCH` | `/admin/devices/{deviceId}` | `adminUpdateDevice` | 機器の割り当てを変更 | 200 |
| `GET` | `/admin/settings/thresholds` | `adminGetThresholds` | 閾値 | 200 |
| `PUT` | `/admin/settings/thresholds` | `adminPutThresholds` | 閾値を保存 | 200 |
| `GET` | `/admin/settings/growth-targets` | `adminGetGrowthTargets` | 目標成長曲線 | 200 |
| `PUT` | `/admin/settings/growth-targets` | `adminPutGrowthTargets` | 目標成長曲線を保存 | 200 |
| `GET` | `/admin/settings/rules` | `adminGetRules` | 運用ルール | 200 |
| `PUT` | `/admin/settings/rules` | `adminPutRules` | 運用ルールを保存 | 200 |

<!-- API_OPERATIONS_END -->

## 4. フロントエンド要求の反映

### 4.1 パスと応答

新規操作は`GET /farms/{farmId}/samplings`（`listFarmSamplings`）。指定日のサンプリング記録、`growthCurve`、`onTrackBandPct`を返す。次の14操作はパラメータ、レスポンス、説明または検証条件が変更された。

| 操作 | 主な変更 |
| --- | --- |
| `GET /farms/{farmId}/ponds` | `latestSamplingDate`、5分更新間隔 |
| `GET /ponds/{pondId}/feedings` | `dailyTotals`と日付・回の新しい順 |
| `GET /ponds/{pondId}/mortalities` | `last7Days` |
| `GET /ponds/{pondId}/actuators` | `autoControl`の状態・対象・override 数 |
| `GET /admin/users` | 絞り込み前の状態別`counts` |
| `GET /admin/farms` | Inactive を含む全 Farm を名前順に返す |
| `POST /admin/farms` | 新規 Farm は inactive、重複名は`409 farm_name_taken` |
| `PATCH /admin/farms/{farmId}` | Inactive 時の表示条件、重複名は`409 farm_name_taken` |
| `POST /admin/farms/{farmId}/ponds` | Farm 内の重複名は`409 pond_name_taken` |
| `PATCH /admin/ponds/{pondId}` | Farm 内の重複名は`409 pond_name_taken` |
| `GET /admin/farms/{farmId}/devices` | Farm 全体の機器種別・Offline 件数`counts` |
| `PATCH /admin/devices/{deviceId}` | 本文を`AdminDeviceUpdate`に変更。`deviceId`は変更しない |
| `PUT /admin/settings/thresholds` | Farm 別上書きの保存規則と`fieldErrors`の位置 |
| `PUT /admin/settings/growth-targets` | DOC・目標 ABW の検証と`onTrackBandPct`の範囲 |

### 4.2 スキーマ

追加された9スキーマは`HistoryValue`、`TrayCheck`、`MortalityObservation`、`Weather`、`EquipmentEvent`、`WeeklyAction`、`AdminFarmTechnicalManager`、`AdminDeviceUpdate`、`ThresholdFarmOverride`。

変更された44スキーマは以下のとおり。各フィールドの型、`required`、`null`、enum、削除項目は[統合 OpenAPI](./openapi.yaml)の`components.schemas`を正とする。

| 領域 | 変更スキーマ | 特に確認する内容 |
| --- | --- | --- |
| 認証・Farm・生産 | `Me`, `StatusAspect`, `OperationalStatus`, `ReportStatusSummary`, `ReportStatusItem`, `IssueDetail`, `CompanyProduction`, `PondListRow`, `PondDetail` | `Me.scopeLabel`、給餌の`roundsDone/roundsPlanned`、重み付き`survivalRatePct`、未放養時の nullable な DOC |
| センサー・Alert | `Threshold`, `PondWaterQualityRow`, `SensorHistoryRow`, `SensorAnomaly`, `Alert`, `AlertDetail`, `AlertAction` | 履歴行の`values`、異常の種類・変化量、Alert の`direction`・`handledBy` |
| 現場記録 | `TrayCondition`, `FeedingInput`, `FeedingRecord`, `MortalityInput`, `SamplingInput`, `SamplingRecord` | `much_leftover`、給餌の`round`と`trayCheck`、死亡観察、検査値の閾値判定 |
| 設備 | `ActuatorCommand`, `Actuator`, `ActuatorLog` | `set_manual`、仕様・稼働時間・Safety 表示、操作ログの mode |
| Report | `ReportListItem`, `DailyPondRow`, `DailyReport`, `ReportAction`, `DailyReportInput`, `WeeklyReport`, `WeeklyTotalByPond`, `WeeklyPondRow`, `WeeklyReportInput` | 日次の手入力設備イベント、週次の`majorActions`、前後 Report ID、集計値と nullable 値。廃止済み`laboratoryConfirmed`を要求しない |
| 管理 | `AdminUser`, `AdminFarmInput`, `AdminFarm`, `AdminPondInput`, `AdminPond`, `AdminDeviceInput`, `AdminDevice`, `SettingsMeta`, `ThresholdSettings`, `RuleSettingsInput` | 招待・有効化・ロック状態、Farm time zone、機器 ID 不変、Farm 別閾値、Weekly 締切時刻 |

## 5. バックエンド側の追加 API 候補

次の操作はバックエンド設計に必要性が記されているが、**現行 OpenAPI の`paths`にはない**。パス・本文・応答を確定して公開する段階では、フロントエンドの必要 API を維持したまま合意内容を契約に追加する。

| 候補 | 操作・用途 | 決める事項 |
| --- | --- | --- |
| 放養記録 | `GET/POST /ponds/{pondId}/stocking-records`、`GET/PATCH /stocking-records/{recordId}`。放養履歴と養殖サイクルの入力元 | `stockedOn`、`stockedPl`、任意の`initialBiomassKg`を想定。PATCH 本文、再放養時のサイクル重複、FCR 計算不能時の扱い |
| Command 追跡 | `GET /actuator-commands/{commandId}`。受付、送信、ACK、完了・失敗の追跡 | Command ID の通知方法、状態語彙、冪等性。既存の Command POST の202本文`Actuator`は維持 |
| Critical 通知 | `GET /notifications/stream`、`GET /notifications`、`POST /notifications/{notificationId}/received`、`POST /notifications/{notificationId}/read` | 受信ごとの判定と SSE 画面動作、通知保持期間・再送・権限再評価。FM は Issue、TM は Alert を参照 |
| 緊急停止 | パス・schema 未定。通常の`turn_off`と分けた停止・解除 | 設備仕様、解除条件、権限、監査 |
| PID 設定 | パス・schema 未定。係数・目標値・承認を画面で扱う場合の操作 | 制御の実行場所、版管理、承認者 |
| 本人の通常パスワード変更 | パス・schema 未定。専用画面が必要になった場合の操作 | 認証方式、本人確認、既存の招待・再設定との関係 |

通知候補の`Notification`は`id`、`kind`、`severity`、`createdAt`、`farmId`、`pondId`、`target`、`summary`、nullable な`receivedAt`・`readAt`を想定する。SSE の詳細や各候補の制約は[統合 OpenAPI のバックエンド拡張](./openapi.yaml)の`x-backend-integration`を参照する。

## 6. バックエンド実装で確定する事項

- Cookie セッションの採否・失効・更新と CSRF 対策。
- MQTT の Topic・Payload・認証・再送、InfluxDB の保存と集計。
- KPI の計算不能値、再計算の基準、提出済み Report の固定と訂正履歴。
- Actuator の Safety 判定、Command 配送・ACK・Timeout・再送、監査。
- 追加 API 候補を契約に含める場合のフロントエンドとの合意と schema の確定。
