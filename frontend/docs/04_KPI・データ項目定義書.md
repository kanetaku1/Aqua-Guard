# KPI・データ項目定義書

## 1. 目的

画面に表示するKPI・水質項目について、**算出方法、集計してよい単位、単位・桁数、閾値、状態の判定ルール**を定義する。画面ごとの表示内容は「05_画面・機能要件書」、見せ方は「07_UI・UX設計書」で定義する。

> 閾値・目標成長曲線・判定の境界値は、業務ルールが確定するまでの**サンプル値**である（§8）。

---

## 2. データの発生源

| 発生源 | データ | 流れ |
| --- | --- | --- |
| IoTセンサー | DO、pH、水温、TDS、濁度、水位（5分ごと） | センサー → DB → Environmental / Pond Trend・Pond Alert |
| 現場の記録（Technical Manager） | 放養、給餌、死亡、サンプリング、Actuator操作 | 入力 → DB → 生産KPI |
| 報告（Technical Manager） | Daily / Weekly Report | DBの値を参照して作成 → 提出 → Farms Managerが閲覧 |

Reportは既存のデータを**参照**して作成する構造化報告であり、データそのものではない。報告画面では参照した値に「From sensor data」「From records」を表示する。

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

---

## 5. 目標成長曲線（サンプル）

| DOC | 27 | 34 | 41 | 48 | 55 | 62 | 69 | 76 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 目標ABW（g） | 5.3 | 7.4 | 9.5 | 11.5 | 13.3 | 15.0 | 16.6 | 18.2 |

曲線の間のDOCは直線で補間する。品種・Farmごとに設定できるようにする（§8）。

---

## 6. 水質項目

### 6.1 単位・表示桁・計測

| 項目 | 単位 | 表示桁 | 計測 |
| --- | --- | --- | --- |
| DO | mg/L | 小数1桁 | IoT（5分ごと） |
| pH | — | 小数1桁 | IoT |
| 水温（Water Temperature） | °C | 小数1桁 | IoT |
| TDS | mg/L | 整数（桁区切り） | IoT |
| 濁度（Turbidity） | NTU | 整数 | IoT |
| 水位（Water Level） | cm | 整数 | IoT |
| 塩分（Salinity） | ppt | 整数 | Daily Report |
| 透明度（Secchi Depth） | cm | 整数 | Daily Report |
| TAN / NO2 | mg/L | 小数1〜2桁 | Laboratory（週次） |
| Vibrio | CFU/mL | 指数表記（8.5 × 10³） | Laboratory |
| Alkalinity | mg/L | 整数 | Laboratory |

日時はWIB（UTC+7）、日付は `DD MMM YYYY`、時刻は `HH:mm`。数値の桁区切りはカンマ。

### 6.2 閾値と重大度（サンプル）

| 項目 | Normal（管理範囲） | Attention | Warning | Critical |
| --- | --- | --- | --- | --- |
| DO | ≥ 5.0 | 4.5 以上 5.0 未満 | 3.5 以上 4.5 未満 | 3.5 未満 |
| pH | 7.5–8.5 | 7.3–7.5 / 8.5–8.7 | 7.3 未満 / 8.7 超 | 7.0 未満 / 9.0 超 |
| 水温 | 26–31 | 25.5–26 / 30.5–31 に接近 | 31 超 / 26 未満 | 33 超 / 24 未満 |
| TDS | 15,000–25,000 | 範囲の端から5%以内 | 範囲外 | — |
| 濁度 | 25–60 | 60–80 / 20–25 | 80 超 / 20 未満 | — |
| 水位 | 120–150 cm | 115–120 / 150–155 | 115 未満 / 155 超 | 105 未満 |
| TAN | ≤ 1.0 | 1.0–2.0 | 2.0 超 | — |
| NO2 | ≤ 0.5 | 0.5–1.0 | 1.0 超 | — |
| Vibrio | < 5 × 10³ | 5 × 10³ – 1 × 10⁴ | ≥ 1 × 10⁴ | — |
| Alkalinity | 100–150 | 80–100 / 150–180 | 範囲外 | — |

- 画面の「Range」表示は Warning の閾値（Pond Alert が発報される境界）を示す。
- Pond Alert は Warning 以上、または Attention が一定時間継続した場合に発報する（継続時間は§8）。

---

## 7. 状態の判定ルール

| 対象 | 判定 |
| --- | --- |
| センサー値 | §6.2 の閾値で判定 |
| Pond Status | そのPondのセンサー値・未解決Alertのうち最も重い重大度 |
| Farm Environmental Status | Farm内のPond Statusのうち最も重いもの |
| Farm Production Status | Behind のPondの割合：25% 未満 = Normal、25〜49% = Attention、50% 以上 = Warning。Survival Rate の急低下がある場合は1段上げる |
| Farm Operational Status | 設備停止・センサー Offline・Report 未提出の有無：なし = Normal、あり = Attention、安全に関わる設備停止 = Warning 以上 |
| Farm Overall Status | Environmental / Production / Operational のうち最も重いもの |
| データ品質 | 最終取得から15分以内 = Live、15分超 = Delayed、60分超 = Offline、取得実績なし = No data |
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
| 閾値の設定画面 | 現行スコープ外 |
