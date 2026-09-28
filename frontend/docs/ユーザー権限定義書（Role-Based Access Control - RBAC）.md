# ユーザー権限定義書

**Role-Based Access Control / RBAC**

---

## 1. 目的

Smart Shrimp Pond Management Systemにおける、ユーザーRole、管理対象、情報アクセス範囲、基本操作権限を定義する。

本書では、業務フロー、画面構成、UI/UX、KPI・データ項目、AIロジック、システム内部の実装は定義しない。

---

## 2. 管理階層とRole

```text
Company
  ├── Farm A
  │     ├── Pond 01
  │     └── Pond 02
  ├── Farm B
  │     ├── Pond 01
  │     └── Pond 02
  └── Farm C
        ├── Pond 01
        └── Pond 02

Farms Manager     → Companyが管理する複数Farm
Technical Manager → 担当Farm内のPond
```

| Role                  | 管理単位 | 主な役割                                               |
| --------------------- | -------- | ------------------------------------------------------ |
| **Farms Manager**     | Farm     | 複数Farmの状態を確認し、Farm単位の経営・生産判断を行う |
| **Technical Manager** | Pond     | 担当Farm内のPondを管理し、技術・運用上の判断を行う     |

Farms ManagerはPondの現場運用を直接管理しない。Technical Managerは担当Farmの範囲を超えて管理しない。

---

## 3. 権限の種類

| Permission      | 意味                                 |
| --------------- | ------------------------------------ |
| **View**        | 情報を閲覧する                       |
| **Create**      | 情報を新規登録する                   |
| **Manage**      | 担当範囲の情報を登録・更新・管理する |
| **Acknowledge** | Alert / Notificationを確認する       |
| **Decide**      | 担当範囲における業務上の判断を行う   |
| **Execute**     | 許可された操作を実行する             |

---

## 4. Role × Permission

| 対象                                   | Farms Manager | Technical Manager           |
| -------------------------------------- | ------------- | --------------------------- |
| Company情報                            | View          | -                           |
| Farm情報                               | View / Decide | View                        |
| Pond情報                               | View\*        | View / Decide               |
| Farm-level環境情報                     | View / Decide | View                        |
| Pond-level IoT情報                     | View\*        | View / Decide               |
| Farm-level Risk / Issue                | View / Decide | View                        |
| Pond Alert                             | View\*        | View / Acknowledge / Decide |
| Daily / Weekly Report                  | View          | Create / View               |
| Farm-level Production Status           | View / Decide | View                        |
| Pond-level Production Data             | View\*        | View / Manage               |
| Feeding / Mortality / Sampling Records | View          | Create / Manage             |
| AI Recommendation                      | View / Decide | View / Decide               |
| Actuator操作                           | -             | Execute                     |

`*` Farms Managerが参照できるPond-level情報は、Farmの状態把握に必要な集約情報に限る。

---

## 5. 情報アクセス範囲

### 5.1 Farms Manager

#### アクセス可能

- Companyが管理する全Farmの情報
- Farm-levelの環境状態、生産状況、Risk / Issue
- Farm間の比較情報
- Farmの状態把握に必要なPond-levelの集約情報
- Daily / Weekly Report
- Farm-levelのAI Recommendation

#### 原則として直接アクセスしない

- 生のセンサー値
- 詳細なセンサー時系列データ
- Pondの詳細な現場入力値
- PondのActuator操作および直接的な運用操作

Pond-levelの参照は、異常の有無、種類、重大度、傾向、継続状況、対象Pondなどの集約情報に限定する。

### 5.2 Technical Manager

#### アクセス可能

- 担当Farmの情報
- 担当Farm内のPond情報
- Pondの詳細なIoT・水質情報
- Pond Alert
- Feeding / Mortality / Sampling Records
- Daily / Weekly Report
- Pond-levelのAI Recommendation
- Safety Layer等で許可されたActuator操作

Technical Managerは、担当Pondの監視、Alertの確認、技術・運用上の判断を行う。

---

## 6. 権限設計原則

1. 最小権限を原則とする。
2. Roleごとに必要な情報と操作のみを提供する。
3. Farms ManagerはFarm単位、Technical ManagerはPond単位で管理する。
4. 情報の閲覧と操作の権限を分離する。
5. Farms Managerが参照するPond情報は、Farmの状態把握に必要な集約情報に限定する。
6. Actuator操作はTechnical Managerの許可範囲に限定する。
7. 本書で定義しない業務ルールや詳細仕様は、業務要件書・機能要件書・UI/UX設計書で定義する。
