# API詳細設計

| 項目 | 内容 |
| --- | --- |
| 版 | 0.2（提出用ドラフト） |
| 更新日 | 2026-10-05 |
| 対応資料 | [全体設計](../backend_architecture_overview.md) / [ダイアグラム](../backend_architecture_diagrams.md) / [データベース](./database_design.md) |

## 1. 適用範囲と設計状態

本書はWeb画面とBackend API間の契約を定義する。APIパス、JSON形式、エラーコードは今回の設計提案であり、既存資料に定義された確定値ではない。IoT Deviceからの測定値受信はMQTTとIngestion Serviceが担当し、以下の画面向けREST APIを経由しない。

AI助言、ML予測、予測Alert、AI制御提案、収益最適化、将来在庫予測のAPIは今回定義しない。

## 2. 共通契約

### 2.1 URL・形式

| 項目 | 設計 |
| --- | --- |
| Base path | `/api/v1` |
| Body | `application/json` |
| 時刻 | ISO 8601のUTC。例：`2026-10-05T04:00:00Z` |
| 表示時刻 | フロントエンドでWIB（UTC+7）へ変換 |
| ID | APIでは文字列として扱う。DBの物理型は詳細設計で確定 |
| 一覧 | `page`、`page_size`、絞り込み、並び替えを必要なAPIへ指定 |
| 期間 | `from`以上、`to`未満。UTCのISO 8601 |
| 金額・重量 | APIでは値と単位を明示。丸めは表示層で行う |

### 2.2 認証・認可

メールアドレスとパスワードで認証する。セッションの実装方法は未決定だが、すべての認証済みAPIはサーバー側でUser、Role、Account Status、Company / Farm / Pond Scopeを確認する。リクエストの`farm_id`や`pond_id`だけで権限を決めない。

1ユーザーにつきRoleは1つ。Technical Managerのアクセス範囲は`user_farm_assignments`とPondのFarm所属で決める。System Administratorは管理APIを使えても養殖業務APIは使えない。

### 2.3 正常応答

単一リソース：

```json
{
  "data": {
    "id": "POND-001"
  }
}
```

一覧：

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total": 0
  }
}
```

POSTでリソースを作成した場合は201、非同期の設備Commandを受理した場合は202を返す。削除は明示された管理操作に限定する。

### 2.4 エラー応答

```json
{
  "error": {
    "code": "FORBIDDEN_SCOPE",
    "message": "この池を操作する権限がありません",
    "details": []
  }
}
```

| HTTP | `code`例 | 条件 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 形式または範囲指定が不正 |
| 401 | `UNAUTHENTICATED` | ログインしていない、セッション期限切れ |
| 403 | `FORBIDDEN_ROLE`, `FORBIDDEN_SCOPE` | Roleまたは担当範囲外 |
| 404 | `NOT_FOUND` | 対象なし、または存在を公開できない範囲外 |
| 409 | `DUPLICATE_REPORT`, `INVALID_STATE`, `VERSION_CONFLICT` | 重複または状態競合 |
| 422 | `VALIDATION_ERROR` | 項目間の整合性違反 |
| 503 | `DATA_UNAVAILABLE`, `DEVICE_UNAVAILABLE` | DBまたは設備が利用不能 |

権限外のIDについて存在の有無を不要に公開しない。内部エラーは詳細情報を画面へ返さず、監査・運用ログへ記録する。

## 3. 認証・アカウント

| Method | Path | 入力・戻り値 | 権限 |
| --- | --- | --- | --- |
| POST | `/auth/login` | email、password -> User、Role、Session | 公開 |
| POST | `/auth/logout` | Sessionを失効 | ログイン済み |
| GET | `/auth/me` | User、Role、担当Farm、表示言語 | ログイン済み |
| POST | `/auth/forgot-password` | email -> 受付結果 | 公開 |
| POST | `/auth/set-password` | 招待/再設定token、新password -> 更新結果 | token保持者 |
| PUT | `/auth/password` | 現password、新password | 本人 |
| PUT | `/auth/preferences` | 表示言語 | 本人 |

招待リンク72時間、再設定リンク1時間、パスワード10文字以上かつ英字と数字を含む、5回連続失敗で15分ロック、12時間無操作でログアウトする。招待・再設定tokenの保管方式は実装時に確定する。

## 4. Farms Manager向けAPI

`FM`はCompany配下の集約情報と提出済みReportを閲覧する。Raw Sensor Data、個々のFeeding / Mortality / Sampling Record、Actuator Commandは返さない。

| Method | Path | 主な出力 |
| --- | --- | --- |
| GET | `/manager/dashboard` | Farm Status一覧、Risk / Issue、総Biomass、Behind Pond数 |
| GET | `/manager/farms` | Farm名、所在地、Pond数、Status、Main reason |
| GET | `/manager/farms/{farm_id}` | Water quality、Growth、Operations、Pond要約 |
| GET | `/manager/farms/{farm_id}/status-trend` | 日付別のFarm Status推移 |
| GET | `/manager/farms/{farm_id}/issues` | 対象Pond、異常種類、傾向、重大度、対応状態 |
| GET | `/manager/farms/{farm_id}/production-summary` | Pond別KPI、Farm集計 |
| GET | `/manager/reports?farm_id=&type=&from=&to=` | SubmittedのDaily / Weekly Report一覧 |
| GET | `/manager/reports/{report_id}` | Submitted Reportの内容と参照元 |

例：`GET /manager/farms/{farm_id}/issues`の1件分。

```json
{
  "id": "ALERT-001",
  "pond_id": "POND-001",
  "parameter": "do",
  "severity": "WARNING",
  "trend": "decreasing",
  "lifecycle_status": "IN_PROGRESS",
  "occurred_at": "2026-10-05T04:00:00Z"
}
```

この応答に`current_value`、生の時系列、個別給餌記録を含めない。

## 5. Technical Manager向けAPI

以下のすべてで担当Farm所属を確認する。`TM`のPond IDが自分の担当Farm外なら読み取り・書き込みとも拒否する。

### 5.1 DashboardとSensor

| Method | Path | Query / 入力 | 主な出力 |
| --- | --- | --- | --- |
| GET | `/technical/dashboard` | `farm_id`任意 | 対応が必要なPond、Active Alert |
| GET | `/technical/ponds` | `farm_id`, `status`, `page` | Pond一覧 |
| GET | `/technical/ponds/{pond_id}` | なし | Pondマスタと状態 |
| GET | `/technical/ponds/{pond_id}/sensor-values/latest` | なし | 6項目の最新値、計測時刻、品質、鮮度 |
| GET | `/technical/ponds/{pond_id}/sensor-values` | `from`, `to`, `parameter`, `page` | 期間内の測定履歴 |
| GET | `/technical/ponds/{pond_id}/sensor-status` | なし | 接続、Calibration、最終受信 |

`sensor-values`はInfluxDBを検索する。`from`と`to`は必須、`parameter`は`do / ph / temperature / tds / turbidity / water_level`のいずれか。最大取得期間・点数はデータ量算定後に決める。

`latest`の応答例：

```json
{
  "data": {
    "pond_id": "POND-001",
    "measured_at": "2026-10-05T04:00:00Z",
    "received_at": "2026-10-05T04:00:04Z",
    "freshness": "LIVE",
    "values": {
      "do": { "value": 5.6, "unit": "mg/L", "quality": "VALID" },
      "ph": { "value": 7.8, "unit": null, "quality": "VALID" },
      "temperature": { "value": 28.4, "unit": "C", "quality": "VALID" },
      "tds": { "value": 1850, "unit": "mg/L", "quality": "VALID" },
      "turbidity": { "value": 32.1, "unit": "NTU", "quality": "VALID" },
      "water_level": { "value": 128, "unit": "cm", "quality": "VALID" }
    }
  }
}
```

項目ごとに取得時刻が異なるDevice構成では、各項目へ`measured_at`を付ける形に変更する。No data時は架空の数値を返さず`value: null`と品質状態を返す。

### 5.2 Alert

| Method | Path | 入力・出力 |
| --- | --- | --- |
| GET | `/technical/alerts?farm_id=&status=&from=&to=` | 担当FarmのAlert一覧 |
| GET | `/technical/alerts/{alert_id}` | 値、閾値、時系列への参照、対応履歴 |
| POST | `/technical/alerts/{alert_id}/acknowledge` | 未確認 -> 確認済み |
| POST | `/technical/alerts/{alert_id}/actions` | `action_at`, `action_type`, `notes`, `outcome` |
| POST | `/technical/alerts/{alert_id}/resolve` | `resolved_at`, `notes` -> 解決済み |

SeverityとLifecycle Statusは別項目とする。対応種別はIncreased aeration、Water exchange、Equipment inspection、Water treatment、Other。状態遷移違反は409とする。

### 5.3 現場記録

| Method | Path | 必須入力の例 |
| --- | --- | --- |
| GET / POST | `/technical/ponds/{pond_id}/stocking-records` | `stocked_on`, `stocked_count` |
| GET / POST | `/technical/ponds/{pond_id}/feeding-records` | `fed_at`, `amount_kg` |
| GET / PUT | `/technical/feeding-records/{record_id}` | 記録の参照・更新 |
| GET / POST | `/technical/ponds/{pond_id}/mortality-records` | `recorded_on`, `deaths_count` |
| GET / PUT | `/technical/mortality-records/{record_id}` | 記録の参照・更新 |
| GET / POST | `/technical/ponds/{pond_id}/sampling-records` | `sampled_at`, `sample_count`, `total_weight_g` |
| GET / PUT | `/technical/sampling-records/{record_id}` | Samplingと後着のLaboratory結果を参照・更新 |
| POST | `/technical/farms/{farm_id}/sampling-records/batch` | Pond別Samplingの配列 |

実績日の未来日は拒否する。`sample_count > 0`、`total_weight_g >= 0`とする。Laboratory結果は未着のまま保存できる。記録の更新時は`version`で競合を検出する方式を提案する。

### 5.4 KPIとReport

| Method | Path | 入力・出力 |
| --- | --- | --- |
| GET | `/technical/ponds/{pond_id}/production-kpis?as_of=` | DOC、ABW、ADG、SR、Biomass、FCR、目標比、値の種類、計算根拠 |
| GET / POST | `/technical/daily-reports` | `farm_id`, `report_date`で検索・Draft作成 |
| GET / PUT | `/technical/daily-reports/{report_id}` | Draft取得・観察と所見の更新 |
| POST | `/technical/daily-reports/{report_id}/submit` | 必須内容を検証しSubmittedにする |
| GET / POST | `/technical/weekly-reports` | `farm_id`, `week_start`で検索・Draft作成 |
| GET / PUT | `/technical/weekly-reports/{report_id}` | Draft取得・コメント等の更新 |
| POST | `/technical/weekly-reports/{report_id}/submit` | 必須内容を検証しSubmittedにする |

Report APIは記録を参照してFeeding、Mortality、Alert、Equipment、KPIを表示する。Daily ReportへのSensor Value入力項目は設けない。Weekly Reportの水質傾向だけInfluxDBからPond単位で集計する。Submitted Reportは通常のPUTを拒否し、修正方式は業務確認後に確定する。

### 5.5 Actuator

| Method | Path | 入力・出力 |
| --- | --- | --- |
| GET | `/technical/ponds/{pond_id}/actuators` | Mode、接続状態、稼働状態 |
| GET | `/technical/actuators/{actuator_id}/history` | 操作、Safety判定、実行結果 |
| POST | `/technical/actuators/{actuator_id}/commands` | `operation`, `requested_value`, `duration_seconds`, `expected_mode` -> Command IDと状態 |
| GET | `/technical/actuator-commands/{command_id}` | Commandの送信、受信、完了、失敗状態 |
| POST | `/technical/actuators/{actuator_id}/override` | AutoからManualへの切り替え |
| POST | `/technical/actuators/{actuator_id}/emergency-stop` | 緊急停止要求 |
| GET | `/technical/ponds/{pond_id}/automatic-control` | PID / Auto状態と設定概要 |
| POST | `/technical/ponds/{pond_id}/automatic-control/approve` | `pid_setting_id`, `expected_mode`を指定し自動制御を承認 |

Auto中の手動操作には画面で確認を求める。APIは`expected_mode`を照合し、状態が変わっていたら409を返す。Safety Layerが拒否した操作は送信せず理由を返す。Emergency Stop解除APIは条件未確定のため定義しない。

Command受理時の202応答例：

```json
{
  "data": {
    "command_id": "CMD-001",
    "status": "REQUESTED",
    "actuator_id": "ACT-001",
    "requested_at": "2026-10-05T04:10:00Z"
  }
}
```

202は実機での実行完了を意味しない。完了結果はCommand参照APIで確認する。重複送信対策として`Idempotency-Key`の利用を提案する。

## 6. System Administrator向けAPI

SA APIは業務数値を返さない。Device接続状態は管理上の死活確認に必要な範囲で返す。

| Method | Path | 入力・出力 |
| --- | --- | --- |
| GET / POST | `/admin/users` | 一覧／招待。Role、担当Farm |
| GET / PUT | `/admin/users/{user_id}` | User詳細／Role・担当Farm更新 |
| POST | `/admin/users/{user_id}/deactivate` | 無効化 |
| POST | `/admin/users/{user_id}/password-reset` | 再設定メール |
| GET / POST | `/admin/farms` | Farm一覧／登録 |
| GET / PUT | `/admin/farms/{farm_id}` | Farm詳細／更新 |
| GET / POST | `/admin/farms/{farm_id}/ponds` | Pond一覧／登録 |
| GET / PUT | `/admin/ponds/{pond_id}` | Pond詳細／更新 |
| GET | `/admin/farms/{farm_id}/devices` | Device割当と接続状態 |
| POST | `/admin/ponds/{pond_id}/devices` | Device割当 |
| DELETE | `/admin/ponds/{pond_id}/devices/{device_id}` | 割当解除 |
| GET / PUT | `/admin/settings/thresholds` | 共通の水質境界値 |
| GET / PUT | `/admin/farms/{farm_id}/settings/thresholds` | Farm上書き |
| GET / PUT | `/admin/settings/growth-targets` | DOC別目標ABW |
| GET / PUT | `/admin/settings/operational-rules` | Report期限、鮮度、Attention継続時間等 |

最後のSystem Administratorを無効化・Role変更しない。自分自身も無効化しない。閾値の境界順序が不正な更新は422とする。変更後の新しい判定へ適用し、過去のAlertとReportは変えない。

## 7. Export

| Method | Path | 条件 |
| --- | --- | --- |
| GET | `/technical/ponds/{pond_id}/sensor-values/export?from=&to=&format=csv` | TMのみ。担当Pondの生データ |
| GET | `/technical/records/export?farm_id=&type=&from=&to=&format=csv` | TMのみ。担当Farmの現場記録 |
| GET | `/manager/reports/export?farm_id=&type=&from=&to=&format=csv` | FMのみ。Submitted Report |

CSV / Excel等への出力は既存機能要件にある。上記のCSVパスとフィールドは提案で、Excel形式、最大期間、ファイル生成方法は未決定とする。Exportでも通常のAPIと同じRole・範囲制御を適用する。

## 8. 状態・重複・監査

- Reportは`DRAFT -> SUBMITTED`。同じFarm・日付のDaily Report、同じFarm・週開始日のWeekly Reportは重複を拒否する
- Alertは`UNACKNOWLEDGED -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED`を基本とする。Severityは別管理
- Actuator Commandは`REQUESTED -> SAFETY_CHECKING -> SENT -> ACKNOWLEDGED -> COMPLETED`を基本とし、拒否・失敗も記録する。正式な設備状態は機器仕様で確定する
- 設定更新、Alert対応、Report提出、Actuator操作はUser、日時、対象、結果を監査記録へ残す
- POST再送による二重Commandを防止する。Idempotency-Key保存期間は未決定

## 9. 未決定事項

- 認証Sessionの実装（Cookie / Token）とCSRF対策
- IDの物理形式、ページング上限、取得点数上限
- ExportのExcel形式と処理方法
- Alert解決条件、再発・重複抑止の細則
- 提出後Reportの修正権限とRevision方式
- 設備CommandのProtocol、Timeout、再送、解除手順
- 本番実機の承認範囲、PID設定のAPIと変更権限
