# KPI・データ項目定義書

## 1. 目的

画面に表示するKPI・水質項目について、**算出方法、集計してよい単位、単位・桁数、閾値、状態の判定ルール**を定義する。画面ごとの表示内容は「05_画面・機能要件書」、見せ方は「07_UI・UX設計書」で定義する。

> 閾値・目標成長曲線・判定の境界値は、System Administratorが設定画面（AD-04 Settings）で変更できる**運用ルール**である。本書の値は初期値（サンプル）であり、業務ルールの確定後に更新する（§8）。

---

## 2. データの発生源

| 発生源 | データ | 流れ |
| --- | --- | --- |
| IoTセンサー | DO、pH、水温、TDS、濁度、水位（3〜5分ごと） | センサー → Sensor Database → Environmental / Pond Trend・Alert rule（閾値）→ Pond Alert |
| Alert対応（Technical Manager） | 確認・対応の記録（時刻・対応種別・メモ）・解決 | 入力 → DB → Alertの対応状態・Daily Report の Actions Taken |
| 現場の記録（Technical Manager） | 放養、給餌、死亡、サンプリング、健康状態の観察、Actuator操作 | 入力 → DB → 生産KPI・Daily Report |
| 報告（Technical Manager） | Daily / Weekly Report | DBの記録を参照し、観察・Farm共通の項目・所見を加えて作成 → 提出 → Farms Managerが閲覧 |

- Sensor Database は InfluxDB とする。本システムは **5分ごと** に InfluxDB を参照し、現在値・Alert判定・集計に反映する（画面のライブ表示も5分ごとに更新）。センサーの計測間隔（3〜5分）とは別の値である。
- Sensor DataはReportとは独立して保存し、Alertは Sensor Database から直接判定する。**Reportの作成・提出はAlertの前提ではない。**
- Reportは既存のデータを**参照**して作成する構造化報告であり、データそのものではない。**センサー値はReportに手入力・転記しない。** Daily Reportはその日のAlert・センサーデータをリンクで参照し、Weekly Reportは水質を Sensor Database から週次で自動集計する。報告画面では記録から取り込んだ値に「From records」等の参照元を表示する。

---

## 3. 生産KPIの定義（Pond単位）

| KPI | 定義・算出式 | 単位・桁 | 値の種類 | 元データ |
| --- | --- | --- | --- | --- |
| DOC | 基準日 − 放養日 | 日・整数 | Actual | 放養記録 |
| ABW（平均体重） | サンプル総重量 ÷ サンプル尾数 | g・小数1桁 | Actual | サンプリング |
| ADG（日間成長量） | （今回ABW − 前回ABW）÷ 経過日数 | g/day・小数2桁 | Actual | サンプリング |
| 目標ABW | 目標成長曲線（§5）の、同じDOCの値 | g・小数1桁 | — | 目標成長曲線 |
| Growth vs target（目標比） | ABW ÷ 目標ABW − 1 | %・整数 | Actual | ABW、目標ABW |
| Survival Rate（生存率） | 推定生存尾数 ÷ 放養尾数（推定生存尾数 = 放養尾数 − 累積死亡数 − 推定不明減耗） | %・整数 | **Estimated** | 放養・死亡・サンプリング |
| Biomass（推定生体量） | 推定生存尾数 × ABW | t・小数2桁（Pond）／小数1桁（Farm以上） | **Estimated** | 上記 |
| FCR（飼料要求率） | 累積給餌量 ÷（Biomass − 放養時の生体量） | 小数2桁 | Actual | 給餌・Biomass |
| Size Uniformity（サイズの揃い） | 100% − サンプル体重の変動係数（CV） | %・整数 | Actual | サンプリング |

Growth vs target の判定：

| 判定 | 条件 | 表示 |
| --- | --- | --- |
| Behind | 目標比 ≤ −5 % | Attention色の点＋「−8% Behind」 |
| On track | −5 % < 目標比 < +5 % | Normal色の点＋「−1% On track」 |
| Ahead | 目標比 ≥ +5 % | Normal色の点＋「+6% Ahead」 |

---

## 4. 集計ルール（Pond → Farm → Company）

Pondごとに放養日が異なる（DOCがそろわない）ため、足してよい値と、Pond単位でしか意味を持たない値を区別する。

| KPI | 性質 | Farm / Company の値 | 算出方法 |
| --- | --- | --- | --- |
| Biomass | 量（加算可） | **表示する** | Pondの合計 |
| 給餌量・死亡数・死亡重量 | 量（加算可） | **表示する** | 合計 |
| Survival Rate | 比率 | **表示する（重み付き）** | Σ推定生存尾数 ÷ Σ放養尾数。Pondの％の平均は使わない |
| FCR | 比率 | **表示する（重み付き）** | Σ給餌量 ÷ Σ増重量。PondのFCRの平均は使わない |
| Growth vs target | 判定 | **分布として表示する** | On track / Behind / Ahead のPond数（例：8池中2池が Behind） |
| ABW | 平均体重（成長段階に依存） | **表示しない** | Pond単位のみ。DOCが違うPondの平均は成長段階の違う個体を混ぜた値になり、判断に使えない |
| ADG | 速度（成長段階に依存） | **表示しない** | Pond単位のみ |
| Size Uniformity | Pond内のばらつき | **表示しない** | Pond単位のみ |

画面ごとの表示：

| 表示単位 | 表示する値 |
| --- | --- |
| Company（FM Dashboard） | 総Biomass、Behind のPond数（全体・Farm別） |
| Farm（Farm Detail・Weekly Report） | Biomass、Survival Rate（重み付き）、FCR（重み付き）、Growth vs target の分布、Pond Production Summary |
| Pond（Pond Production Summary・Pond Detail） | §3 のすべて |

Farm間の値を順位付け・比較する表示はしない（Farm Comparisonは対象外）。

### 4.1 Reportのデータ項目の粒度

Daily / Weekly Report は **Pond単位で記録**し、Farm単位では「足してよい値」だけを合計する。データの性質で、記録の単位とFarmとしての見せ方を決める。

| 性質 | 項目 | 記録の単位 | Farmとしての値 | 表現（07 §11.4） |
| --- | --- | --- | --- | --- |
| **積み重なる量**（加算可） | 給餌量、死亡数・死亡重量 | Pond | **合計**（Pond別の内訳付き） | Daily：Pondごとの数値の表（最下行に合計）／ Weekly：**ドーナツグラフ**（全Pond・Othersにまとめない）＋Pond別の数値の表 |
| **水質の傾向**（加算不可） | DO・pH・水温などのセンサーデータ | Pond（Sensor Databaseから**Weekly Reportでのみ週次で自動集計**。Daily Reportには含めない） | **平均は出さない**。Pondごとに DO最小、pH範囲、水温最大、範囲外の日数、Alert件数、傾向 | **Pond×項目の表**（範囲外を強調）＋TMの任意コメント |
| **検査の値**（加算不可） | Laboratoryの値（TAN・NO2・Vibrio・Alkalinity） | Pond（週次サンプリング時） | **平均は出さない**。範囲外のPond数 | **Pond×項目の表**（範囲外を強調、未着は Pending） |
| **Pondの観察・設備** | 健康状態・観察項目、摂餌・トレイの状態、エアレーター・ポンプの稼働 | Pond | 注意以上のPond数、停止中の設備数 | Pondごとの一覧（Normalは控えめ、注意以上を目立たせる） |
| **Farm共通** | 天候、降雨、環境上の出来事、発電機、Technical Managerの所見 | Farm | そのまま | 1つだけ表示 |
| **Pondに紐づく出来事** | Alerts / Issues（Alertシステムから自動参照）、Equipment events、Actions Taken（Alert対応・Actuator操作ログから自動＋手入力） | 出来事（対象Pondを持つ） | 件数 | 一覧（Pond列を持つ） |

- 水質の「Farm平均」は、悪いPondを平均で隠してしまうため使わない。
- 摂餌の状態は Good / Reduced / Poor、健康状態は重大度（Normal / Attention / Warning / Critical）で記録する。
- **Daily Reportは運用の記録であり、センサー値を含めない。** 朝・夕などの定時の水質値（DO・pH・水温等）は記録しない。水質の履歴は TM-03 Pond Detail › IoT / Water Quality で確認し、Daily Report はその日の Alert とそのセンサーデータへのリンクのみを持つ。
- **Reportの数値は記録から自動で集める。** 給餌・死亡は Pond Detail で入力した記録の合計、設備はActuatorの状態、Alerts / Issues はその日のAlert、Actions Taken はAlert対応の記録とActuator操作ログ、生産KPIは週次のサンプリング記録、Weekly Report の水質の傾向は Sensor Database から取り込む。Technical Managerが Daily Report で入力するのは、摂餌・トレイの状態、健康状態の観察、Farm共通の項目（天候・降雨・環境上の出来事・発電機）、手入力の対応、所見（Technical Manager Summary）。
- 週次のサンプリング（体重測定）とLaboratoryの検査は、Pond List の一括入力（Record weekly sampling）、または Pond Detail › Sampling でPondごとに記録する。検査結果は後から届くことがあるため、空欄で保存して後から追記でき、未着の間は Weekly Report に「Pending」と表示する。
- Weekly Report には、その週に測定済みのPond数と未測定のPondを示す。

---

## 5. 目標成長曲線（サンプル）

| DOC | 27 | 34 | 41 | 48 | 55 | 62 | 69 | 76 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 目標ABW（g） | 5.3 | 7.4 | 9.5 | 11.5 | 13.3 | 15.0 | 16.6 | 18.2 |

曲線の間のDOCは直線で補間する。On track の幅（初期値 ±5%）とともに、AD-04 Settings › Growth Targets で設定する。

---

## 6. 水質項目

### 6.1 単位・表示桁・計測

| 項目 | 単位 | 表示桁 | 計測 |
| --- | --- | --- | --- |
| DO | mg/L | 小数1桁 | IoT（3〜5分ごと） |
| pH | — | 小数1桁 | IoT |
| 水温（Water Temperature） | °C | 小数1桁 | IoT |
| TDS | mg/L | 整数（桁区切り） | IoT |
| 濁度（Turbidity） | NTU | 整数 | IoT |
| 水位（Water Level） | cm | 整数 | IoT |
| TAN / NO2 | mg/L | 小数1〜2桁 | Laboratory（週次・Pondごと） |
| Vibrio | CFU/mL | ×10³ 単位の小数1桁（例 8.5 = 8.5 × 10³） | Laboratory（Pondごと） |
| Alkalinity | mg/L | 整数 | Laboratory（Pondごと） |

日時はWIB（UTC+7）、日付は `DD MMM YYYY`、時刻は `HH:mm`。数値の桁区切りはカンマ。

### 6.2 閾値と重大度（サンプル）

閾値は**境界値**で持つ。各状態が「この値を下回る（Low side）／上回る（High side）と始まる」値を1つずつ定義し、Normal は両側の Attention 境界の間として自動で決まる。使わない側・段階は「—」（Not used）。境界値は Normal から離れる順（Attention → Warning → Critical）でなければならない。

| 項目 | 単位 | Critical < | Warning < | Attention < | Normal（自動） | Attention > | Warning > | Critical > |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO | mg/L | 3.5 | 4.5 | 5.0 | ≥ 5.0 | — | — | — |
| pH | — | 7.0 | 7.3 | 7.5 | 7.5–8.5 | 8.5 | 8.7 | 9.0 |
| 水温 | °C | 24 | 26 | 26.5 | 26.5–30.5 | 30.5 | 31 | 33 |
| TDS | mg/L | — | 15,000 | 16,000 | 16,000–24,000 | 24,000 | 25,000 | — |
| 濁度 | NTU | — | 20 | 25 | 25–60 | 60 | 80 | — |
| 水位 | cm | 105 | 115 | 120 | 120–150 | 150 | 155 | — |
| TAN | mg/L | — | — | — | ≤ 1.0 | 1.0 | 2.0 | — |
| NO2 | mg/L | — | — | — | ≤ 0.5 | 0.5 | 1.0 | — |
| Vibrio | ×10³ CFU/mL | — | — | — | < 5 | 5 | 10 | — |
| Alkalinity | mg/L | — | 80 | 100 | 100–150 | 150 | 180 | — |

- 画面の「Range」表示は Warning の閾値（Pond Alert が発報される境界）を示す。
- 閾値は全Farm共通の初期値と、Farmごとの上書きを持つ（AD-04 Settings › Thresholds）。変更は保存以降の判定に適用し、過去のAlertは変更しない。
- Pond Alert は Warning 以上、または Attention が一定時間継続した場合に発報する（継続時間は§8）。
- センサーのデータ品質が Offline（§7：最終取得から60分超）になったら、そのセンサーの Pond Alert（Attention、種別 Sensor offline、例「Turbidity sensor offline」）を発報する。Offline の間はそのPondの水質を監視できないため、値の逸脱と同じく Technical Manager に知らせ、確認・対応・解決の流れに乗せる。

---

## 7. 状態の判定ルール

| 対象 | 判定 |
| --- | --- |
| センサー値 | §6.2 の閾値で判定 |
| Pond Status | そのPondのセンサー値・未解決Alertのうち最も重い重大度 |
| Farm Environmental Status（画面表記：Water quality） | Farm内のPond Statusのうち最も重いもの。根拠として範囲外のPond数を示す |
| Farm Production Status（画面表記：Growth） | Behind のPondの割合：25% 未満 = Normal、25〜49% = Attention、50% 以上 = Warning。Survival Rate の急低下がある場合は1段上げる |
| Farm Operational Status（画面表記：Operations） | 設備停止・センサー Offline・Report 未提出の有無：なし = Normal、あり = Attention、安全に関わる設備停止 = Warning 以上 |
| Farm Status | Water quality / Growth / Operations のうち最も重いもの。別の「Overall」状態は持たない。最も重い観点の事実を Main reason（1文）として示す |
| データ品質 | 最終取得から15分以内 = Live、15分超 = Delayed、60分超 = Offline、取得実績なし = No data |
| Ponds needing attention（Daily Report の要約） | その日に、健康状態に注意以上の観察があるPond、または Report に含めた Alert（センサー Offline を含む）があるPond の数。根拠として Pond 番号を示す（例「3 of 8 (02, 05, 08)」） |
| Report | Draft → Submitted。提出期限（Daily：当日18:00、Weekly：翌週月曜）を過ぎた未提出は Operational Status に反映 |

---

## 8. 未確定事項

| 論点 | 現在の扱い |
| --- | --- |
| KPIの正式な算出式（不明減耗の推定、FCRの基準） | 本書 §3 の式を仮置き。業務ルール確定後に更新 |
| 目標成長曲線 | サンプル値（§5）。品種・Farmごとの値を業務側で定義 |
| 水質の閾値 | サンプル値（§6.2）。Farmごとに変えるかを業務側で判断 |
| Attention継続でAlertを出す時間 | 未定（仮：30分） |
| Farm Production Status の境界値 | 25% / 50%（仮） |
| 設定値の変更履歴 | 設定画面に「最終更新者・日時」のみ表示。変更履歴（監査ログ）の閲覧画面はスコープ外 |
