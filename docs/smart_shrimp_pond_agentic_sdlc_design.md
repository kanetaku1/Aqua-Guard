# AquaGuard — Agentic SDLC 基本設計

---

# 1. 概要

AquaGuardのAgentic SDLCでは、開発工程を5つの専門Agentに分担させる。

```text
Human
  ↓
Management Agent
  ↓
┌───────────────────────┐
│ Design Agent          │
│ Data/ML Agent         │
└───────────┬───────────┘
            ↓
      Builder Agent
            ↓
       Verify Agent
            ↓
          Human
```

基本思想は、

> **Humanが「何を・なぜ作るか」を決め、Agentが「どう実現するか」を担う。**

ただし、Agentが重要な意思決定を独断で行うことは避け、設計や本番利用などの重要事項についてはHumanが承認する。

---

# 2. Agent構成

| Agent                | 役割                           | 一言でいうと           |
| -------------------- | ------------------------------ | ---------------------- |
| **Management Agent** | 全体管理・オーケストレーション | 誰が・何を・いつ行うか |
| **Design Agent**     | 要件・システム設計             | どう作るか             |
| **Data/ML Agent**    | IoTデータ・ML設計              | データをどう扱うか     |
| **Builder Agent**    | ソフトウェア・環境の実装       | 実際に作る             |
| **Verify Agent**     | 実装・設計・MLの検証           | 本当に正しいか確認する |

---

# 3. Human

HumanはAgentではなく、Agentic SDLCにおける**意思決定者**として位置付ける。

## 3.1 Humanの役割

- プランの目的を決める
- 現場要求を提示する
- 優先順位を決める
- 制約・方針を決める
- 設計を承認する
- 重要な設計変更を承認する
- MLモデルの本番採用を判断する
- 自動制御などの重要機能を承認する
- 本番利用に関する最終判断を行う

## 3.2 HumanがAgentに任せるもの

- 要件整理
- システム設計
- データ設計
- ML設計
- コーディング
- テスト実装
- 検証
- ドキュメント作成

したがって、

> **Humanは「作業者」ではなく「意思決定者」となる。**

---

# 4. Management Agent

## 4.1 役割

Agentic SDLC全体の**オーケストレーター**。

Management Agentは、自分自身ですべての設計・実装を行うのではなく、

> **誰に・何を・どの順番で実行させるか**

を管理する。

## 4.2 Input

- Humanの目的
- 現場要求
- Task
- Project State
- 各Agentの成果物
- Verify結果
- Humanの承認結果

## 4.3 Output

- Task
- Agentへの指示
- Task State
- Artifactの受け渡し
- Humanへの承認要求
- 進行状況
- 実行履歴

## 4.4 やらないこと

- コードを書く
- 詳細設計を行う
- MLモデルを設計する
- センサーデータを直接分析する
- 本番環境を勝手に変更する

## 4.5 基本イメージ

```text
Human
  │
  │「DO予測機能を追加したい」
  ▼
Management Agent
  │
  ├──→ Design Agent
  │      └─ 要件・システム設計
  │
  ├──→ Data/ML Agent
  │      └─ データ・予測モデル設計
  │
  ├──→ Builder Agent
  │      └─ 実装
  │
  └──→ Verify Agent
         └─ 検証
```

---

# 5. Design Agent

## 5.1 役割

Humanの目的・現場要求を、**実装可能なシステム仕様・設計へ変換する**。

Requirements AgentとArchitecture Agentの役割を統合した位置付けとする。

## 5.2 Input

- Humanの目的
- 現場要求
- 既存Requirements
- 既存Architecture
- 既存API
- 既存DB
- 既存Decision
- Task Context

## 5.3 Output

- Requirements
- Architecture
- API Specification
- DB / Data Model
- UI Specification
- Design Decision

## 5.4 責任範囲

```text
Human
  │
  │「DO低下リスクを減らしたい」
  ▼
Design Agent
  │
  ├─ 要件
  ├─ システム構成
  ├─ API
  ├─ DB
  └─ UI / Component
```

## 5.5 他Agentとの境界

Design Agentは、

> **「システムとしてどう作るか」**

を担当する。

一方、

> **「どのデータを使い、どのように処理し、どのMLモデルを使うか」**

はData/ML Agentが担当する。

## 5.6 やらないこと

- コードを書く
- MLモデルを学習する
- センサーデータを直接処理する
- 本番デプロイする
- 重要なHuman意思決定を勝手に行う

---

# 6. Data/ML Agent

## 6.1 役割

AquaGuardの**IoTデータ・データ基盤・MLを専門的に設計・管理するAgent**。

AquaGuardでは、

```text
Sensor
  ↓
Edge
  ↓
GCP
  ↓
Data
  ↓
Feature
  ↓
Dataset
  ↓
ML
  ↓
Prediction
```

というデータライフサイクルが重要になるため、独立したAgentとして扱う。

## 6.2 Input

- センサーデータ
- IoT Data Schema
- 気象データ
- 給餌データ
- 生産データ
- 現場ログ
- Design Specification
- 既存MLモデル
- 過去の評価結果

## 6.3 Output

- Data Schema
- Data Quality Specification
- Feature Specification
- Dataset Specification
- Label Specification
- Model Specification
- Evaluation Report
- Inference Specification
- Model Artifact

## 6.4 責任範囲

### IoT / Data

- センサーデータ形式
- サンプリング
- 欠損処理
- 外れ値処理
- センサー異常
- データ品質
- データパイプライン

### ML

- Feature Engineering
- Dataset設計
- Label設計
- Model設計
- Training
- Evaluation
- Inference
- Model Version
- Model Performance

## 6.5 他Agentとの境界

```text
Design Agent
    │
    │「システムとしてどこにMLを組み込むか」
    ▼
Data/ML Agent
    │
    │「どんなデータ・特徴量・モデルを使うか」
    ▼
Builder Agent
    │
    │「それをコードとして実装する」
```

## 6.6 重要な方針

1か月程度の計測データでは、すべての将来予測モデルを十分に学習できるとは限らない。

そのためData/ML Agentは、

- 既存データ量
- データ品質
- 学習可能性
- Baseline
- モデル評価
- 再学習可能性

を考慮し、

> **「現時点でMLを使うべきか」**

も判断材料として扱う。

---

# 7. Builder Agent

## 7.1 役割

承認された設計・仕様をもとに、**実際のソフトウェア・インフラ・MLパイプラインを実装する**。

## 7.2 Input

- Requirements
- Architecture
- API Specification
- Data Model
- Data/ML Specification
- Task
- 既存ソースコード

## 7.3 Output

- Source Code
- Tests
- Infrastructure / IaC
- DB Migration
- ML Pipeline
- Implementation Report

## 7.4 基本フロー

```text
Design Agent
      │
      │ Specification
      ▼
Builder Agent
      │
      │ Implementation
      ▼
Source Code
```

## 7.5 原則

Builder Agentは、設計そのものを勝手に変更しない。

実装中に設計上の問題を発見した場合は、

```text
Builder Agent
      │
      ▼
Design Change Request
      │
      ▼
Management Agent
      │
      ▼
Design Agent
      │
      ▼
Human Approval
```

という流れに戻す。

## 7.6 Cursorとの関係

現段階では、

> **Builder AgentがCursorを実装環境として利用する**

という構成を想定する。

Cursor自体をManagement Agentとして扱う必要はない。

---

# 8. Verify Agent

## 8.1 役割

他Agentが作成した成果物を**独立して検証する**。

特にBuilder Agentとは分離する。

> Builder = 作る  
> Verify = 疑う

という関係にする。

## 8.2 Input

- Requirements
- Architecture
- Data/ML Specification
- Source Code
- Tests
- ML Model
- Infrastructure
- Configuration

## 8.3 Output

- Verification Report
- Test Report
- Security Report
- ML Validation Report
- Issue List

## 8.4 検証対象

### Software

- Unit Test
- Integration Test
- API Test
- E2E Test
- Regression Test

### IoT

- Data Format
- Missing Data
- Anomaly
- Sensor Data Integrity

### ML

- Data Leakage
- Train/Test Split
- Time-series Split
- Baseline比較
- 評価指標
- 推論入力の整合性

### Architecture

- Requirementsとの整合性
- Architectureとの整合性
- API仕様との整合性
- Security
- Infrastructure

---

# 9. Agent間の責任分界

| 項目          |  Human   | Management | Design | Data/ML | Builder | Verify |
| ------------- | :------: | :--------: | :----: | :-----: | :-----: | :----: |
| 目的決定      |  **●**   |            |        |         |         |        |
| 現場要求      |  **●**   |            |        |         |         |        |
| 優先順位      |  **●**   |     ●      |        |         |         |        |
| Task管理      |          |   **●**    |        |         |         |        |
| 要件整理      |   承認   |     ●      | **●**  |         |         |        |
| システム設計  | **承認** |            | **●**  |         |         |        |
| API設計       |          |            | **●**  |         |         |        |
| DB設計        |          |            | **●**  |    △    |         |        |
| IoTデータ設計 |          |            |   △    |  **●**  |         |        |
| Feature設計   |          |            |        |  **●**  |         |        |
| MLモデル設計  | **承認** |            |   △    |  **●**  |         |        |
| コーディング  |          |            |        |         |  **●**  |        |
| IaC           |          |            |        |         |  **●**  |        |
| テスト実装    |          |            |        |         |  **●**  |        |
| テスト検証    |          |            |        |         |         | **●**  |
| ML検証        |          |            |        |    △    |         | **●**  |
| 本番利用判断  |  **●**   |            |        |         |         |        |
| 重要変更承認  |  **●**   |            |        |         |         |        |

**凡例**

- **●** = 主担当
- **△** = 連携・参照
- **承認** = Humanによる最終判断

---

# 10. Agent間のデータフロー

Agent同士を自由な自然言語会話で接続するのではなく、**Artifactを介して接続する**。

```text
                         HUMAN
                           │
                           │ Goal / Requirement
                           ▼
                  ┌─────────────────┐
                  │ Management Agent│
                  └────────┬────────┘
                           │
                       task.yaml
                           │
                           ▼
                  ┌─────────────────┐
                  │  Design Agent   │
                  └────────┬────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
      requirements.md             architecture.md
             │                           │
             └─────────────┬─────────────┘
                           ▼
                  ┌─────────────────┐
                  │ Data/ML Agent   │
                  └────────┬────────┘
                           │
                    data-ml-spec.yaml
                           │
                           ▼
                  ┌─────────────────┐
                  │  Builder Agent  │
                  └────────┬────────┘
                           │
                       Source Code
                           │
                           ▼
                  ┌─────────────────┐
                  │  Verify Agent   │
                  └────────┬────────┘
                           │
                  verification-report
                           │
                           ▼
                         HUMAN
                           │
                        Approval
```

---

# 11. Artifact設計

Agent間のインターフェースを、自然言語の会話ではなく**構造化されたArtifact**として定義する。

## 11.1 Repository構成

```text
shrimp-os/
│
├── agents/
│   ├── management.md
│   ├── design.md
│   ├── data-ml.md
│   ├── builder.md
│   └── verify.md
│
├── docs/
│   ├── project.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── api.md
│   ├── data-model.md
│   └── decisions.md
│
├── tasks/
│   ├── TASK-001.yaml
│   └── TASK-002.yaml
│
├── data-ml/
│   ├── data-schema.yaml
│   ├── feature-spec.yaml
│   ├── dataset-spec.yaml
│   ├── model-spec.yaml
│   └── evaluation-report.yaml
│
└── verification/
    └── verification-report.yaml
```

## 11.2 Artifactの役割

```text
Human
  ↓
task.yaml
  ↓
Management
  ↓
requirements.yaml
architecture.yaml
  ↓
Design
  ↓
data-ml-spec.yaml
  ↓
Data/ML
  ↓
implementation
  ↓
Builder
  ↓
verification-report.yaml
  ↓
Verify
```

### 基本原則

> **Agentは必要なArtifactだけを読み込む。**

これにより、プロジェクト全体のコンテキストを毎回Agentへ渡す必要がなくなり、Token消費を抑える。

---

# 12. Task State Machine

Management AgentはTaskの状態を管理する。

```text
┌──────────────┐
│ TASK_CREATED │
└──────┬───────┘
       ▼
┌──────────────┐
│   DESIGNING  │
└──────┬───────┘
       ▼
┌──────────────┐
│ DESIGN_READY │
└──────┬───────┘
       ▼
┌──────────────────┐
│ HUMAN_APPROVAL   │
└──────┬───────────┘
       │
       │ Approved
       ▼
┌──────────────┐
│ IMPLEMENTING │
└──────┬───────┘
       ▼
┌──────────────┐
│ IMPLEMENTED  │
└──────┬───────┘
       ▼
┌──────────────┐
│  VERIFYING   │
└──────┬───────┘
       │
       ├──── NG ────→ CHANGE_REQUIRED
       │                    │
       │                    ├──→ Design
       │                    │
       │                    └──→ Builder
       │
       ▼
┌──────────────┐
│   VERIFIED   │
└──────┬───────┘
       ▼
┌──────────────────┐
│ HUMAN_APPROVAL   │
└──────┬───────────┘
       │
       ▼
     DONE
```

---

# 13. Human Approval Boundary

すべての処理をHuman承認にするとAgentic SDLCのメリットが失われる。

そのため、**低リスクな作業はAgentに任せ、重要な意思決定だけHumanが承認する。**

## 13.1 Agentのみで完結可能

```text
UI微修正
   ↓
Builder
   ↓
Verify
   ↓
完了
```

## 13.2 Human承認が必要

```text
Architecture変更
      ↓
    Human
```

```text
重要なDB / API変更
      ↓
    Human
```

```text
MLモデルの本番採用
      ↓
    Human
```

```text
自動制御ルール
      ↓
    Human
```

```text
Productionへの重要変更
      ↓
    Human
```

---

# 14. Agentic SDLC 基本原則

## Principle 1 — Human Intent First

```text
Human
  ↓
目的・現場要求
  ↓
Agent
```

Agentがプロジェクトの目的を勝手に作らない。

---

## Principle 2 — Specialized Agents

```text
Management → 管理
Design     → 設計
Data/ML    → データ・ML
Builder    → 実装
Verify     → 検証
```

1つの巨大Agentにすべてを任せない。

---

## Principle 3 — Artifact Driven

```text
Agent
  ↓
Artifact
  ↓
Agent
```

Agent間の情報伝達をArtifact中心にする。

---

## Principle 4 — Least Privilege

各Agentには必要最低限の権限だけを与える。

```text
Design
  → Codeを書けない

Builder
  → Productionを直接変更しない

Verify
  → Codeを勝手に変更しない

Management
  → Productionを直接操作しない
```

---

## Principle 5 — Independent Verification

```text
Builder
   ↓
Verify
```

作成するAgentと検証するAgentを分離する。

---

## Principle 6 — Human Approval

重要な意思決定は、

```text
Agent Proposal
      ↓
    Human
      ↓
Approve / Reject
```

とする。

---

# 15. Agent責任範囲の一言定義

```text
┌──────────────────────────────────────────┐
│                  HUMAN                   │
│                                          │
│  WHY / WHAT                              │
│  ・目的                                  │
│  ・現場要求                              │
│  ・優先順位                              │
│  ・重要な意思決定                        │
│  ・承認                                  │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│           MANAGEMENT AGENT               │
│                                          │
│  WHO / WHEN                              │
│  ・タスク管理                            │
│  ・Agentへの分配                         │
│  ・状態管理                              │
└────────────────────┬─────────────────────┘
                     │
            ┌────────┴────────┐
            ▼                 ▼
┌──────────────────┐ ┌──────────────────┐
│   DESIGN AGENT   │ │  DATA/ML AGENT   │
│                  │ │                  │
│ HOW (System)     │ │ HOW (Data / ML)  │
│ ・要件            │ │ ・IoTデータ       │
│ ・Architecture   │ │ ・Feature        │
│ ・API             │ │ ・Dataset        │
│ ・DB              │ │ ・Model          │
└────────┬─────────┘ └────────┬─────────┘
         │                    │
         └─────────┬──────────┘
                   ▼
        ┌──────────────────────┐
        │    BUILDER AGENT     │
        │                      │
        │  IMPLEMENT           │
        │  ・Code              │
        │  ・IaC               │
        │  ・Tests             │
        │  ・ML Pipeline       │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │     VERIFY AGENT     │
        │                      │
        │  VERIFY              │
        │  ・Software          │
        │  ・IoT               │
        │  ・ML                │
        │  ・Architecture      │
        └──────────┬───────────┘
                   │
                   ▼
              HUMAN APPROVAL
```

---

# 16. 最終的なAgentic SDLC

AquaGuardの現段階では、以下を基本構成として採用する。

```text
                 HUMAN
                   │
          Goal / Field Request
                   │
                   ▼
          ┌─────────────────┐
          │   MANAGEMENT    │
          │     AGENT       │
          └────────┬────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
   ┌─────────────┐   ┌─────────────┐
   │   DESIGN    │   │  DATA / ML  │
   │    AGENT    │   │    AGENT    │
   └──────┬──────┘   └──────┬──────┘
          │                 │
          └────────┬────────┘
                   ▼
            ┌─────────────┐
            │   BUILDER   │
            │    AGENT    │
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   VERIFY    │
            │    AGENT    │
            └──────┬──────┘
                   │
                   ▼
                 HUMAN
              Final Approval
```

## Core Loop

> **Human → Management → Design / Data-ML → Builder → Verify → Human**

---

# 17. 現段階での開発方針

現時点では、この5 Agentを基本構成として固定する。

```text
Management Agent
Design Agent
Data/ML Agent
Builder Agent
Verify Agent
```

Release AgentやOps Agentなどは、現段階では独立したAgentとして実装しない。

将来的に必要になった段階で追加する。

## Phase 1

```text
Management
Design
Data/ML
Builder
Verify
```

↓

## Phase 2

```text
Release
```

↓

## Phase 3

```text
Ops
```

これにより、2人・約2か月という開発規模に対して、Agent構成を過剰に複雑化させず、まずAgentic SDLCそのものを成立させる。
