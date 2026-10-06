# バックエンド全体設計

| 項目 | 内容 |
| --- | --- |
| 版 | 0.3（API・DB整合ドラフト） |
| 更新日 | 2026-10-05 |
| 関連資料 | [ダイアグラム](./backend_architecture_diagrams.md) / [OpenAPI契約](./api/openapi.yaml) / [API詳細設計](./backend/api_design.md) / [データベース詳細設計](./backend/database_design.md) |

## 1. 目的と設計の根拠

エビ養殖池管理システムのバックエンドについて、構成要素、データの流れ、権限境界、異常時の動作を定義する。Web APIのパス・メソッド・入出力はフロントエンド起案の[OpenAPI契約](./api/openapi.yaml)を正とし、詳細設計でこれを補う。

業務範囲と権限は[業務要件書](../frontend/docs/01_%E6%A5%AD%E5%8B%99%E8%A6%81%E4%BB%B6%E6%9B%B8.md)、[ユーザー権限定義書](../frontend/docs/02_%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E6%A8%A9%E9%99%90%E5%AE%9A%E7%BE%A9%E6%9B%B8.md)、[画面・機能要件書](../frontend/docs/05_%E7%94%BB%E9%9D%A2%E3%83%BB%E6%A9%9F%E8%83%BD%E8%A6%81%E4%BB%B6%E6%9B%B8.md)に従う。KPIと状態判定は[KPI・データ項目定義書](../frontend/docs/04_KPI%E3%83%BB%E3%83%87%E3%83%BC%E3%82%BF%E9%A0%85%E7%9B%AE%E5%AE%9A%E7%BE%A9%E6%9B%B8.md)を参照する。[旧システム設計書](./smart_shrimp_pond_system_design_v0.2.md)はIoTと制御の構想を参照するが、新しい業務・画面資料と異なる機能範囲は採用しない。InfluxDBとPostgreSQLの役割は本設計の決定事項である。

## 2. 対象範囲

### 2.1 設計する機能

- メールアドレスとパスワードによる認証、ユーザー招待、Role・担当Farmによる認可
- Company / Farm / Pondの管理、Sensor・Actuatorの割り当て、運用ルール設定
- 3〜5分間隔の水質データと設備通知の受信、品質確認、InfluxDB保存、現在値・履歴の参照
- 閾値によるPond Alert、Technical Managerの確認・対応・解決、Farms Manager向け集約表示
- 放養、給餌、死亡、Sampling、Laboratory、健康状態、設備操作の記録
- Pond単位の生産KPI、Farm・Companyで意味を持つ集計、Daily / Weekly Report
- Technical ManagerによるOpenAPI定義済みのActuator操作、Safety Layer、Auto制御の論理構成
- 変更・操作の監査記録、通信断・センサー異常・設備故障への対応

### 2.2 今回のスコープ外

AIによる助言、AI Agent、機械学習による異常検知・予測、予測Alert、AIからの制御提案は将来構想とする。現在のデータ収集構造は将来の分析に利用できるが、今回のAPI、DB、処理フローにAI固有の機能やテーブルは設けない。

最新の業務要件で除外されている収益最適化、収穫推奨日、利益予測、将来在庫・出荷量予測、Buyer関連機能、Farm比較も対象外とする。Farms Managerの生センサー値参照・Actuator操作、System Administratorの養殖業務データ参照も認めない。

本書は第2.1節に挙げた機能を対象とする完成形の論理設計である。実装順序は本書では定めない。

放養記録の登録、Actuator Commandの詳細追跡、Emergency Stopの画面操作、PID設定・承認のWeb APIは現行OpenAPIにない。内部のデータ・安全設計は含めるが、これらの公開APIは[API詳細設計第11章](./backend/api_design.md)の追加提案であり、合意前に既存のCommandへ混ぜない。

## 3. 技術と配置の前提

| 領域 | 方針 | 確定状況 |
| --- | --- | --- |
| IoT時系列DB | InfluxDB | 採用。Deviceが取得した測定値・Heartbeat・設備状態通知を保持 |
| 業務DB | PostgreSQL | 採用。マスタ・現場記録・Alert・Report・制御・監査を保持 |
| Web向け通信 | `/api/v1`のREST API、JSON | OpenAPI 3.1の契約に従う |
| IoT受信 | Edge -> MQTT Broker -> Ingestion Service | 旧システム設計に記載された構成。Broker製品は未決定 |
| クラウド | GCP | 業務要件で想定。個別サービスは未決定 |
| 実装言語・配布 | Python / FastAPI / Docker | 旧システム設計上の候補。確定技術とはしない |

Redis、WebSocket、別の時系列DB、特定のGCPサービスを必須構成には置かない。APIとIngestion Serviceは論理責務であり、同一アプリケーション内か別プロセスかは負荷と運用条件で決める。

## 4. コンポーネントと責務

| コンポーネント | 責務 | 主な依存先 |
| --- | --- | --- |
| Edge Device | 測定、時刻付与、基本検証、通信断時の一時保存・再送 | Sensor、MQTT Broker |
| MQTT Broker | EdgeからのTelemetryをIngestion Serviceへ配送。制御Commandと応答の経路候補 | Edge、Ingestion、Control |
| Ingestion Service | Deviceの割当・設定履歴照合、形式・時刻・品質検証、重複処理、IoT時系列書き込み | PostgreSQL、InfluxDB |
| Backend API | 画面向け読み書き、認証・Role・担当Farm確認、業務処理 | 業務DB、InfluxDB |
| 5分参照・Alert判定 | InfluxDBを5分ごとに参照し、現在値・集計を更新。設定版からSeverityを判定し、Alert・Issue・処理Checkpointを保存 | InfluxDB、PostgreSQL |
| KPI / Report処理 | 現場記録からKPIを算出。Daily Draftを元記録から構成し、Weeklyの水質傾向を集計。提出時に内容を固定 | PostgreSQL、InfluxDB |
| Control / Safety | 操作権限、Sensor品質・鮮度、設備の観測状態、安全制限を確認してCommandを処理 | PostgreSQL、InfluxDB、設備通信 |
| PID Controller | 許可された目標値に対する閉ループ制御の内部責務。設定・実行場所は未確定 | Sensor Feedback、Safety、Actuator |

主要な関係図と処理シーケンスは[ダイアグラム](./backend_architecture_diagrams.md)に示す。

## 5. データの所有範囲

| データ | 保存先 | 読み取り元 |
| --- | --- | --- |
| DO、pH、水温、TDS、濁度、水位、計測・受信時刻、品質、Heartbeat、設備からの実状態通知 | InfluxDB | TMのSensor API、管理画面のDevice接続状態、Alert判定、週次Report、Safety / PID |
| ユーザー、Farm / Pond、Deviceの割当・設定履歴、閾値、成長目標、運用ルール | PostgreSQL | 認証、Ingestion、Alert、管理API |
| 放養・養殖サイクル、給餌、死亡、Sampling、Laboratory、観察 | PostgreSQL | KPI、Report、TMの現場記録API |
| Alert、Issue、Anomaly区間、Farm状態履歴、Report、Command結果、監査記録 | PostgreSQL | 画面API、集約処理 |
| IoTのMessage ID、処理Checkpoint | PostgreSQL | 再送・5分処理の冪等化に必要な技術メタデータ。測定値本文は保持しない |

InfluxDBとPostgreSQLの間に外部キーや単一Transactionは設定できない。Deviceの当時の割当・設定をPostgreSQLで照合し、InfluxDBのPond・Deviceタグと計測時刻で時系列を結び付ける。時系列の生データをReportへ複製しない。週次集計は提出時の派生結果としてPostgreSQLへ固定する。詳細は[データベース詳細設計](./backend/database_design.md)を参照する。

## 6. 主要な処理

### 6.1 IoT受信と参照

Sensor値はEdgeが取得し、通信できるときにMQTTで送信する。Ingestion Serviceは受信内容を検証してInfluxDBへ保存する。HeartbeatとActuator実状態の通知もIoT時系列として扱う。バックエンドはOpenAPIの方針どおり**5分ごと**にInfluxDBを参照し、現在値・Alert判定・集計を更新する。フロントの対象API再取得も5分間隔。AlertはReport提出を待たない。画面向けSensor APIはTMの担当Farmを検証してからInfluxDBを検索する。FMには状態と傾向だけを返す。IoT受信側に画面向けREST APIを通さない。

通信断時はEdgeが計測値と元の計測時刻を保持して再送する。再送重複を受信Message ID等で抑止し、5分処理のCheckpointが進まないようにして障害後に再実行する。Buffer期間、許容遅延、過去Alertへの遅延点の反映範囲は機器仕様と運用条件で決める。遅延データを制御判断に使用しない。

### 6.2 Alert

有効な全Farm共通閾値とFarm上書き閾値からNormal、Attention、Warning、Criticalを判定する。Warning以上、またはAttentionが設定時間続く場合にPond Alertを作る。Severityと対応状態（未確認、確認済み、対応中、解決済み）は別に管理する。Alert等からFM向けのIssueをReportと独立して作り、安定したIssue IDで詳細を参照する。TMがAlertの対応を記録・解決し、FMはIssueを閲覧する。閾値変更は以後の判定に適用し、過去のAlertを書き換えない。

通知チャネルは既存資料にWeb Dashboard、Browser、Email、LINE、SMS、Mobile Pushが候補として挙がる。正式チャネルと送信保証は未決定である。Alertの保存と外部通知の成否は区別する。

### 6.3 KPIとReport

KPIはPond・養殖サイクル単位で算出する。Farm / CompanyではBiomassや給餌・死亡数を合計し、Survival RateとFCRは元の分子・分母から再計算する。ABWとADGの単純平均は作らない。APIの面積はha、Biomassはkg、比率は%の数値で返す。放養・Samplingや計算根拠がないKPIを架空の値で埋めない。

Daily Reportは当日の給餌・死亡・Alert対応・Actuator操作等を参照して、TMの観察と所見を加える。Daily Draftの自動値は取得時に元記録から再構成する。Weekly ReportはPond別の水質傾向をInfluxDBから集計し、SamplingとLaboratory結果を含める。Daily Reportへ生センサー値を転記しない。Submitted時は表示した派生結果・元記録をSnapshotとして固定し、後の元データ訂正や閾値変更で提出内容を暗黙に変えない。FMにはSubmittedのみ公開する。

### 6.4 ActuatorとPID

TMの`POST /actuators/{actuatorId}/commands`は`turn_on`／`turn_off`／`set_auto`を受け、Safety Layerが権限・Sensor鮮度・設備状態・制限を検証する。拒否時は409、受付時は202と`Actuator`を返す。**202は実機での完了ではない。** Commandとその結果はPostgreSQL、設備からの生ACK・実状態はInfluxDBに置く。画面はActuator状態と操作履歴を再取得して結果を確認する。Auto中の手動操作はManual Overrideとなる。PIDの目標値・実行場所・周期、Emergency Stopの解除条件は実機仕様に基づき決める。

旧システム設計書は実機制御の前にSimulationとSafety Reviewを要求する一方、業務要件書にはActuator操作が含まれる。本書は操作と安全制御の論理構成を設計対象とする。Emergency Stop、PID設定・承認、Command状態参照の公開APIと実機投入条件は未確定とする。

## 7. 認証・認可

| Role | 読める情報 | 実行できる操作 |
| --- | --- | --- |
| Farms Manager | Company配下のFarm状態、集約KPI、Risk / Issue、提出済みReport | 業務情報の閲覧のみ |
| Technical Manager | 担当FarmのPond詳細、時系列、現場記録、Alert、Report、Actuator状態 | 現場記録、Alert対応、Report提出、許可されたActuator操作 |
| System Administrator | ユーザー、Farm / Pond / Deviceマスタ、閾値・成長目標・運用ルール | 管理設定のみ |

Roleは1ユーザーにつき1つとする。APIはRoleだけでなくCompany / Farm / Pondの範囲を毎回確認する。System Administratorにも業務データは返さない。ログイン、招待、ロック、セッション期限は[権限定義書](../frontend/docs/02_%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E6%A8%A9%E9%99%90%E5%AE%9A%E7%BE%A9%E6%9B%B8.md)に従う。

## 8. 障害・運用の基本方針

- Sensorの欠損、異常値、時刻異常、通信断を品質と鮮度の情報として区別する。Drift・Stuck・Calibrationの詳細な記録方法は機器仕様に合わせて確定する
- Live / Delayed / Offline / No dataは最新取得時刻で判定する。初期値は15分・60分で、運用設定から変更可能とする
- InfluxDB書き込み失敗時は受信成功と扱わず、再送・再処理できるようにする。具体的な配送保証はBroker選定時に確定する
- 業務DB障害時はAlert、Report、操作履歴の更新を成功扱いしない
- Sensor値が古い、機器にFaultがある、Safety制限を超える場合は制御を拒否または停止する
- 監査対象は設定変更、Alert対応、Report提出・修正、Actuator操作、Override、Emergency Stopとする
- 日時はUTCで保存し、画面ではWIB（UTC+7）に変換する

## 9. 決定が必要な事項

| 論点 | 現状 |
| --- | --- |
| GCPサービス配置、MQTT Broker製品 | 配置・製品未決定。PostgreSQLとInfluxDBの採用は決定済み |
| InfluxDBのVersion / 提供形態、保持期間、Backup | 未決定 |
| Estateの扱い | 現行OpenAPIとDB設計はCompany / Farm / Pond。Estate追加は別途契約変更が必要 |
| MQTT Broker、通信回線、再送と重複処理 | 詳細未決定 |
| 外部通知チャネルと再送条件 | 候補のみ |
| 放養記録の登録APIと再放養時のサイクル終了手順 | 現行OpenAPIには登録APIなし |
| KPIの不明減耗、FCR、Size Uniformityの正式な元データ・式 | 業務確認待ち |
| Report提出後の修正方法 | 提出時Snapshotで内容を固定。Revisionの公開APIは未定義 |
| Actuator実機仕様、PID配置と設定、安全状態 | 未決定 |
| 本番実機制御の受入条件 | 資料間の範囲差を解消する必要あり |
| 初期状態とGeneratorの入力源 | Sensor未受信、Actuator実状態未受信、Generator状態などは現行APIに表現・入力源の不足あり |

未決定事項を仮の確定事項として図やAPIに埋め込まず、各詳細設計でも明示する。
