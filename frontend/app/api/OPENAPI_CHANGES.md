# Frontend OpenAPI changes (proposal)

The React app generates its types from `openapi.frontend.yaml` (this folder), which is the shared
`docs/api/openapi.yaml` (commit 1d86de6) plus the fields the screens need. The shared file is owned with the
backend team and is **not** changed by the frontend; this list is the material to agree on together.
Once a change is accepted it moves to `docs/api/openapi.yaml` and is removed from here.

Regenerate this list: `python tools/spec_diff.py` (from `frontend/app`).

## Paths

### Added

- `GET /farms/{farmId}/samplings`

### Changed (parameters, responses or descriptions)

- `GET /farms/{farmId}/ponds`
- `GET /ponds/{pondId}/feedings`
- `GET /ponds/{pondId}/mortalities`
- `GET /ponds/{pondId}/actuators`

## Schemas

### Added

- `HistoryValue`
- `TrayCheck`
- `MortalityObservation`
- `Weather`
- `EquipmentEvent`
- `WeeklyAction`

### Changed

- `TrayCondition`
  - enum: ['clean', 'leftover'] → ['clean', 'leftover', 'much_leftover']
- `Me`
  - + `scopeLabel`: {description: ヘッダーの対象範囲（TM "Farm A · East Java" / FM "All Farms (4)" / SA "System Administration"）, type: string}
  - required: +['company', 'farm', 'initials', 'scopeLabel'] −[]
- `StatusAspect`
  - ~ `fact`: {description: 根拠の事実（例 "2 of 8 Ponds out of range"）, type: string} → {description: 一覧用の短い根拠（例 "3 of 8 Ponds"）, type: string}
  - + `detail`: {description: FM-03 のタイル用の根拠（例 "Pond 02 DO (2 days) · Pond 05 Temp · Pond 04 pH"）。生の時系列は含めない, type: [string, 'null']}
- `OperationalStatus`
  - ~ `sensors`: {properties: {offline: {items: {properties: {deviceId: {type: string}, parameter: {$ref: '#/components/schemas/SensorParameter'}, pond: {... → {properties: {offline: {items: {properties: {deviceId: {type: string}, parameter: {$ref: '#/components/schemas/SensorParameter'}, pond: {...
  - ~ `feedingToday`: {properties: {pondsRecorded: {type: integer}, pondsTotal: {type: integer}, totalKg: {type: number}}, type: object} → {description: 当日の給餌の進み具合（例 2 / 4 rounds）, properties: {roundsDone: {type: integer}, roundsPlanned: {type: integer}, totalKg: {type: numbe...
  - ~ `generator`: {properties: {lastTestedAt: {format: date-time, type: string}, state: {enum: [standby, running, fault], type: string}}, type: object} → {properties: {lastTestedAt: {format: date-time, type: string}, state: {enum: [standby, running, fault], type: string}}, required: [state]...
  - required: +['aerators', 'feedingToday', 'generator', 'nextSampling', 'pumps', 'sensors'] −[]
- `ReportStatusSummary`
  - required: +['dailyToday', 'lastSubmitted', 'weeklyThisWeek'] −[]
- `ReportStatusItem`
  - + `date`: {description: Daily のみ, format: date, type: string}
  - + `weekStart`: {description: Weekly のみ, format: date, type: string}
  - + `weekEnd`: {description: Weekly のみ, format: date, type: string}
  - + `savedAt`: {description: 下書きの最終保存, format: date-time, type: [string, 'null']}
  - required: +['dueAt', 'reportId', 'state'] −[]
- `IssueDetail`
  - + `handledBy`: {description: 対応している TM（未対応なら null）, oneOf: [{$ref: '#/components/schemas/UserRef'}, {type: 'null'}]}
  - required: +['actions', 'handledBy', 'relatedReports', 'summary', 'trendDescription'] −[]
- `CompanyProduction`
  - + `survivalRatePct`: {description: Estimated・重み付き（Σ推定生存尾数 ÷ Σ放養尾数、04 §4）。Pond の％の平均ではない, type: number}
  - ~ `previous`: {description: 前週の値（比較表示用）, properties: {biomassKg: {type: number}, pondsBehind: {type: integer}}, type: object} → {description: 前週の値（比較表示用）, properties: {biomassKg: {type: number}, pondsBehind: {type: integer}, survivalRatePct: {type: number}}, requir...
  - required: +['survivalRatePct'] −[]
- `PondWaterQualityRow`
  - ~ `values`: {description: キーは SensorParameter, properties: {do: {$ref: '#/components/schemas/SensorValue'}, ph: {$ref: '#/components/schemas/SensorVa... → {description: キーは SensorParameter, properties: {do: {$ref: '#/components/schemas/SensorValue'}, ph: {$ref: '#/components/schemas/SensorVa...
- `PondListRow`
  - + `stockedOn`: {description: 放養日（未放養なら null）, format: date, type: [string, 'null']}
  - ~ `doc`: {type: integer} → {description: 今日の DOC（未放養なら null）, type: [integer, 'null']}
  - + `feedRoundsPlanned`: {description: 1日の給餌回数の予定（例 4）, type: integer}
  - required: +['abwG', 'aerators', 'areaHa', 'doc', 'feedRoundsPlanned', 'feedRoundsToday', 'feedTodayKg', 'growth', 'mortalityTodayPcs', 'openAlerts', 'stockedOn', 'vsTargetPct', 'worstAlertState'] −[]
- `PondDetail`
  - ~ `abwG`: {type: [number, 'null']} → {description: 最新サンプリング, type: [number, 'null']}
  - + `openAlerts`: {description: 未解決の Alert 数（Alerts タブの件数）, type: integer}
  - + `feeding`: {description: 給餌の記録フォーム用（回の予定時刻・飼料・当日の計画量）, properties: {feedTypes: {items: {example: Grower 2 (2.0 mm), type: string}, type: array}, pla...
  - required: +['abwG', 'areaHa', 'doc', 'feeding', 'openAlerts', 'stockedOn', 'stockedPl'] −[]
- `SensorHistoryRow`
  - + `values`: {description: キーは SensorParameter。範囲外の判定はバックエンド, properties: {do: {$ref: '#/components/schemas/HistoryValue'}, ph: {$ref: '#/components/s...
  - − `do` (removed)
  - − `ph` (removed)
  - − `temperature` (removed)
  - − `tds` (removed)
  - − `turbidity` (removed)
  - − `water_level` (removed)
  - required: +['values'] −[]
- `SensorAnomaly`
  - + `kind`: {enum: [below_threshold, above_threshold, increasing, decreasing], type: string}
  - + `unit`: {type: string}
  - ~ `endedAt`: {format: date-time, type: [string, 'null']} → {description: 継続中は null, format: date-time, type: [string, 'null']}
  - ~ `extremeValue`: {description: 区間中の最も外れた値, type: number} → {description: 閾値の逸脱：区間中の最も外れた値, type: [number, 'null']}
  - + `change24h`: {description: 傾向：変化量（例 −1.3）。comparedWith が null なら 24 時間の変化, type: [number, 'null']}
  - + `comparedWith`: {description: 傾向：変化量の比較元の日（その日の平均と比べた値。例 27 Sep avg.）, format: date, type: [string, 'null']}
  - + `withinRange`: {description: 傾向だが値は Normal の範囲内, type: boolean}
  - required: +['alertId', 'change24h', 'comparedWith', 'endedAt', 'extremeValue', 'kind', 'unit', 'withinRange'] −[]
- `Alert`
  - + `unit`: {example: mg/L, type: [string, 'null']}
  - + `direction`: {description: 閾値のどちら側に外れたか, oneOf: [{enum: [below, above], type: string}, {type: 'null'}]}
  - + `handledBy`: {description: 確認・対応した TM（未対応なら null）, oneOf: [{$ref: '#/components/schemas/UserRef'}, {type: 'null'}]}
  - required: +['direction', 'handledBy', 'resolvedAt', 'thresholdValue', 'unit', 'value'] −[]
- `AlertDetail`
  - + `sensor`: {oneOf: [{properties: {connection: {$ref: '#/components/schemas/Connection'}, deviceId: {example: A-P02-DO, type: string}}, required: [de...
  - + `issueId`: {description: FM に見える Farm の Issue（例 ISS-218）, type: [string, 'null']}
  - required: +['acknowledgedAt', 'acknowledgedBy', 'actions', 'issueId', 'sensor'] −[]
- `AlertAction`
  - + `source`: {description: TM の記録、または Actuator 操作ログからの自動追加, enum: [alert_handling, actuator_log], type: string}
  - required: +['source'] −[]
- `FeedingInput`
  - + `round`: {description: PondDetail.feeding.schedule の何回目か, minimum: 1, type: integer}
  - ~ `feedType`: {example: Grower 2, type: string} → {example: Grower 2 (2.0 mm), type: string}
  - ~ `amountKg`: {minimum: 0, type: number} → {exclusiveMinimum: 0, type: number}
  - + `trayCheck`: {oneOf: [{$ref: '#/components/schemas/TrayCheck'}, {type: 'null'}]}
  - ~ `note`: {type: string} → {type: [string, 'null']}
  - − `rounds` (removed)
  - − `appetite` (removed)
  - − `tray` (removed)
  - required: +['round'] −['rounds']
- `FeedingRecord`
  - + `time`: {description: '回の時刻 HH:mm（WIB）', example: '09:00', readOnly: true, type: string}
  - required: +['time'] −[]
- `MortalityInput`
  - + `observation`: {oneOf: [{$ref: '#/components/schemas/MortalityObservation'}, {type: 'null'}]}
  - ~ `note`: {type: string} → {type: [string, 'null']}
  - − `abnormal` (removed)
  - required: +['weightKg'] −[]
- `SamplingInput`
  - + `note`: {type: [string, 'null']}
- `SamplingRecord`
  - + `labSeverity`: {description: Laboratory の閾値判定（04 §6.2）。未測定は null, properties: {alkalinity: {oneOf: [{$ref: '#/components/schemas/Severity'}, {type: 'nul...
  - required: +['abwG', 'adgGPerDay', 'doc', 'growth', 'labPending', 'labSeverity', 'targetAbwG', 'vsTargetPct'] −[]
- `ActuatorCommand`
  - enum: ['turn_on', 'turn_off', 'set_auto'] → ['turn_on', 'turn_off', 'set_manual', 'set_auto']
- `Actuator`
  - + `spec`: {example: Paddlewheel · 2 HP, type: [string, 'null']}
  - + `runtimeTodayH`: {description: 当日の稼働時間, type: [number, 'null']}
  - + `modeSince`: {description: 現在のモードになった時刻（Manual のとき表示）, format: date-time, type: [string, 'null']}
  - + `lastRunAt`: {description: 停止中のとき最後に稼働した時刻, format: date-time, type: [string, 'null']}
  - + `safety`: {description: 操作の確認ダイアログに示す制約（例 Current water level 132 cm / Safety limit Stops at 150 cm）, items: {properties: {label: {type: string}, v...
  - required: +['autoRule', 'blockedCommands', 'lastRunAt', 'modeSince', 'runtimeTodayH', 'safety', 'spec'] −[]
- `ActuatorLog`
  - + `mode`: {enum: [auto, manual, manual_override], type: string}
  - required: +['actuatorName', 'mode'] −[]
- `ReportListItem`
  - + `pondsNeedingAttention`: {description: 注意以上の Pond 数（健康状態・含めた Alert）, type: [integer, 'null']}
  - + `feedKg`: {description: 期間の給餌量の合計, type: [number, 'null']}
  - + `mortalityPcs`: {description: 期間の死亡数の合計, type: [integer, 'null']}
  - + `biomassKg`: {description: Weekly のみ・週末時点の Biomass（Estimated）, type: [number, 'null']}
  - + `survivalRatePct`: {description: Weekly のみ・Survival Rate（Estimated・重み付き）, type: [number, 'null']}
  - + `pondsBehind`: {description: Weekly のみ・目標より遅れている Pond 数, type: [integer, 'null']}
  - required: +['dueAt', 'savedAt', 'submittedAt', 'technicalManager'] −[]
- `DailyPondRow`
  - ~ `feedKg`: {description: 'source: records', type: [number, 'null']} → {type: number}
  - ~ `feedRounds`: {type: [integer, 'null']} → {type: integer}
  - + `feedRoundsPlanned`: {type: integer}
  - ~ `mortalityPcs`: {description: 'source: records', type: [integer, 'null']} → {type: integer}
  - ~ `mortalityKg`: {type: [number, 'null']} → {type: number}
  - + `mortalityNote`: {description: 異常な死亡の観察（あれば）, type: [string, 'null']}
  - ~ `healthNote`: {type: string} → {type: [string, 'null']}
  - − `abnormalMortality` (removed)
  - − `pumps` (removed)
  - − `alertLine` (removed)
  - required: +['aerators', 'appetite', 'feedKg', 'feedRounds', 'feedRoundsPlanned', 'feedType', 'health', 'healthNote', 'mortalityKg', 'mortalityNote', 'mortalityPcs', 'observations', 'tray'] −[]
- `DailyReport`
  - + `farmStatus`: {allOf: [{$ref: '#/components/schemas/Severity'}], description: その日の Farm の状態（FM-05 の Farm Condition。Draft の間は現在の状態）}
  - ~ `previousReportId`: {type: [string, 'null']} → {description: 同じ Farm の前の Report（呼び出し元が開けるものだけ。FM は提出済みのみ。nextReportId も同様）, type: [string, 'null']}
  - ~ `totals`: {description: Farm の合計（加算可能な値のみ）, properties: {feedKg: {type: number}, healthAttentionPonds: {type: integer}, leftoverTrayPonds: {type: i... → {description: Farm の合計（加算可能な値のみ。平均は出さない）, properties: {feedKg: {type: number}, healthNotedPonds: {description: Health が Normal 以外の Pond 数...
  - ~ `environment`: {properties: {events: {type: [string, 'null']}, generator: {example: 'Standby (tested 07:00)', type: [string, 'null']}, rainfallMm: {type... → {properties: {events: {type: [string, 'null']}, rainfallMm: {type: [number, 'null']}, weather: {description: 提出に必須, oneOf: [{$ref: '#/com...
  - ~ `equipmentEvents`: {items: {properties: {action: {type: string}, equipment: {type: string}, failure: {type: string}, occurredAt: {format: date-time, type: s... → {items: {$ref: '#/components/schemas/EquipmentEvent'}, type: array}
  - ~ `alerts`: {description: 'その日の Alert（source: alert_system）。TM が除外したものは excluded: true', items: {allOf: [{$ref: '#/components/schemas/Alert'}, {prope... → {description: 'その日に発生した、またはその日に継続していた Alert（source: alert_system）。TM が除外したものは excluded: true', items: {allOf: [{$ref: '#/components/schem...
  - ~ `actions`: {items: {$ref: '#/components/schemas/ReportAction'}, type: array} → {description: 時刻順, items: {$ref: '#/components/schemas/ReportAction'}, type: array}
  - − `completeness` (removed)
  - required: +['environment', 'equipmentEvents', 'farmStatus', 'nextReportId', 'previousReportId', 'summary'] −['completeness']
- `ReportAction`
  - required: +['at', 'outcome', 'pond'] −[]
- `DailyReportInput`
  - ~ `ponds`: {items: {properties: {appetite: {$ref: '#/components/schemas/Appetite'}, health: {$ref: '#/components/schemas/Severity'}, healthNote: {ty... → {items: {properties: {appetite: {$ref: '#/components/schemas/Appetite'}, health: {$ref: '#/components/schemas/Severity'}, healthNote: {ty...
  - ~ `environment`: {properties: {events: {type: string}, generator: {type: string}, rainfallMm: {type: number}, weather: {type: string}}, type: object} → {properties: {events: {type: [string, 'null']}, rainfallMm: {type: [number, 'null']}, weather: {oneOf: [{$ref: '#/components/schemas/Weat...
  - ~ `manualActions`: {description: 手入力の対応（Add action）。全件を送る（置き換え）, items: {properties: {action: {type: string}, at: {format: date-time, type: string}, id: {de... → {description: 手入力の対応（Add action）, items: {properties: {action: {type: string}, at: {format: date-time, type: string}, id: {description: 既...
  - + `manualEquipmentEvents`: {description: 手入力の設備の出来事（Add equipment event）, items: {properties: {action: {type: [string, 'null']}, equipment: {type: string}, failure:...
  - ~ `summary`: {type: string} → {type: [string, 'null']}
- `WeeklyReport`
  - + `previousReportId`: {type: [string, 'null']}
  - + `nextReportId`: {type: [string, 'null']}
  - + `docRange`: {properties: {max: {type: integer}, min: {type: integer}}, required: [min, max], type: object}
  - ~ `summary`: {properties: {farmStatus: {$ref: '#/components/schemas/Severity'}, feedKg: {type: number}, mainIssues: {items: {type: string}, type: arra... → {properties: {alertCount: {type: integer}, alertsOngoing: {type: integer}, farmCondition: {allOf: [{$ref: '#/components/schemas/Severity'...
  - ~ `samplingCoverage`: {description: 週次サンプリングの測定状況, properties: {notSampled: {items: {$ref: '#/components/schemas/PondRef'}, type: array}, sampled: {type: integ... → {description: 週次サンプリングの測定状況（04 §4.1）, properties: {date: {format: date, type: [string, 'null']}, labReceived: {type: integer}, notSampled...
  - ~ `alerts`: {items: {allOf: [{$ref: '#/components/schemas/Alert'}, {properties: {action: {type: [string, 'null']}, cause: {type: [string, 'null']}, d... → {description: 週の Alert（自動集計）。TM が Cause / Action / Outcome を追記できる, items: {allOf: [{$ref: '#/components/schemas/Alert'}, {properties: {ac...
  - ~ `majorActions`: {items: {$ref: '#/components/schemas/ReportAction'}, type: array} → {description: 週の主要な対応（TM が入力）, items: {$ref: '#/components/schemas/WeeklyAction'}, type: array}
  - required: +['alerts', 'docRange', 'feeding', 'majorActions', 'mortality', 'nextReportId', 'pondsThisWeek', 'previousReportId', 'production', 'samplingCoverage', 'summary', 'technicalSummary', 'waterQualityComment'] −[]
- `WeeklyTotalByPond`
  - + `unit`: {example: kg, type: string}
  - + `totalKg`: {description: 死亡のみ・死亡重量の合計, type: [number, 'null']}
  - + `per10kStocked`: {description: 死亡のみ・Farm 全体の放養1万尾あたり（Σ死亡 ÷ Σ放養）, type: [number, 'null']}
  - + `reducedAppetitePonds`: {description: 給餌のみ・摂餌が落ちた日のある Pond 数, type: [integer, 'null']}
  - ~ `byPond`: {items: {properties: {dailyAverage: {type: number}, peakDate: {description: 死亡のみ・最多の日, format: date, type: [string, 'null']}, per10kStock... → {items: {properties: {changePct: {description: 前週比（%）, type: [number, 'null']}, peakDate: {description: 死亡のみ・最多の日, format: date, type: [s...
  - required: +['byPond', 'previousTotal', 'total', 'unit'] −[]
- `WeeklyPondRow`
  - ~ `waterQuality`: {description: 'Sensor Database から週次で自動集計（source: sensor_database）。平均は出さない', properties: {alertCount: {type: integer}, doMin: {type: [numb... → {description: 'Sensor Database から週次で自動集計（source: sensor_database）。平均は出さない', properties: {alertCount: {type: integer}, doMin: {type: [numb...
  - ~ `laboratory`: {properties: {alkalinity: {type: [number, 'null']}, no2: {type: [number, 'null']}, pending: {type: boolean}, sampledOn: {format: date, ty... → {properties: {alkalinity: {type: [number, 'null']}, expectedOn: {description: 未着のとき結果の予定日, format: date, type: [string, 'null']}, no2: {t...
  - required: +['growth', 'laboratory', 'waterQuality'] −[]
- `WeeklyReportInput`
  - + `farmCondition`: {$ref: '#/components/schemas/Severity'}
  - ~ `alertNotes`: {items: {properties: {action: {type: string}, alertId: {type: string}, cause: {type: string}, outcome: {type: string}}, required: [alertI... → {items: {properties: {action: {type: [string, 'null']}, alertId: {type: string}, cause: {type: [string, 'null']}, outcome: {type: [string...
  - + `majorActions`: {items: {properties: {action: {type: string}, date: {format: date, type: string}, id: {type: string}, pondId: {type: [string, 'null']}}, ...
  - ~ `waterQualityComment`: {type: string} → {type: [string, 'null']}
  - ~ `technicalSummary`: {type: string} → {type: [string, 'null']}
  - − `laboratoryConfirmed` (removed)
