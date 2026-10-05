import { Droplets, Fan, ShieldCheck, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useActuatorCommand, useActuatorLogs, useActuators } from '@/api/queries/pond'
import type { components } from '@/api/schema'
import { ConfirmDialog } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Card } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatDayTime, formatNumber, formatRecentTime } from '@/lib/format'
import type { Notify } from './PondDetail'

type S = components['schemas']
type Actuator = S['Actuator']
type Command = S['ActuatorCommand']

/**
 * Actuator (TM-PD-019〜021). Only the Technical Manager may operate equipment; the Safety Layer blocks unsafe
 * operations (the button is disabled with the reason). Manual operation while in Auto becomes Manual (override),
 * which the confirmation dialog states (05 §5 Actuator).
 */
export function ActuatorTab({ pond, notify }: { pond: S['PondDetail']; notify: Notify }) {
  const { t } = useTranslation()
  const actuators = useActuators(pond.pond.id)
  const logs = useActuatorLogs(pond.pond.id)
  const command = useActuatorCommand(pond.pond.id)
  const [confirm, setConfirm] = useState<{ actuator: Actuator; command: Command } | null>(null)

  const run = (actuator: Actuator, cmd: Command) =>
    command.mutate(
      { actuatorId: actuator.id, command: cmd },
      {
        onSuccess: () => {
          setConfirm(null)
          notify(t(`actuator.done.${cmd}`, { name: actuator.name }), pond.pond.name)
        },
      },
    )

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="notice">
        <Icon icon={ShieldCheck} />
        <span>
          <Trans i18nKey="actuator.safetyNotice" components={{ b: <b /> }} />
        </span>
      </div>

      <QueryState query={actuators}>
        {(data) => (
          <div className="grid cols-3 gap-4">
            {data.items.map((a) => (
              <ActuatorTile
                key={a.id}
                actuator={a}
                busy={command.isPending}
                onCommand={(cmd) => (cmd === 'set_auto' ? run(a, cmd) : (command.reset(), setConfirm({ actuator: a, command: cmd })))}
              />
            ))}
            <div className="actuator">
              <div className="actuator-head">
                <span className="actuator-icon">
                  <SlidersHorizontal strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <div className="strong">{t('actuator.auto.title')}</div>
                  <div className="caption">{t('actuator.auto.caption')}</div>
                </div>
              </div>
              <dl className="dl dl-3">
                <div>
                  <dt>{t('actuator.status')}</dt>
                  <dd>
                    <span className="equip-state">
                      <span className={cx('dot', data.autoControl.status === 'running' ? 'dot--normal' : 'dot--attention')} />
                      {t(`actuator.auto.${data.autoControl.status}`)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t('actuator.auto.target')}</dt>
                  <dd>{data.autoControl.target}</dd>
                </div>
                <div>
                  <dt>{t('actuator.auto.overrides')}</dt>
                  <dd>{t('actuator.auto.active', { count: data.autoControl.overrides })}</dd>
                </div>
              </dl>
              <div className="caption">{t('actuator.auto.scope', { scope: data.autoControl.scope })}</div>
            </div>
          </div>
        )}
      </QueryState>

      <Card title={t('actuator.history')}>
        <QueryState query={logs}>
          {(data) => (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('actuator.time')}</th>
                  <th>{t('actuator.actuator')}</th>
                  <th>{t('actuator.operation')}</th>
                  <th>{t('actuator.mode')}</th>
                  <th>{t('actuator.operatedBy')}</th>
                  <th>{t('actuator.result')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDayTime(l.at)}</td>
                    <td>{l.actuatorName}</td>
                    <td>{t(`actuator.op.${l.command}`)}</td>
                    <td>{t(`actuator.modeLabel.${l.mode}`)}</td>
                    <td>{l.by?.name ?? t('actuator.system')}</td>
                    <td>
                      <span className="equip-state">
                        <span className={cx('dot', l.result === 'succeeded' ? 'dot--normal' : 'dot--critical')} />
                        {t(`actuator.resultLabel.${l.result}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </QueryState>
      </Card>

      {confirm && (
        <ConfirmDialog
          title={t(`actuator.confirm.${confirm.command}.title`, { name: confirm.actuator.name })}
          confirmLabel={t(`actuator.confirm.${confirm.command}.button`)}
          busy={command.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm.actuator, confirm.command)}
        >
          <p className="text-secondary">
            <Trans
              i18nKey={`actuator.confirm.${confirm.command}.${confirm.actuator.mode === 'auto' ? 'fromAuto' : 'fromManual'}`}
              values={{ name: confirm.actuator.name, pond: pond.pond.name, type: t(`actuator.type.${confirm.actuator.type}`) }}
              components={{ b: <b /> }}
            />
          </p>
          {confirm.actuator.safety.length > 0 && (
            <dl className="dl dl-2" style={{ background: 'var(--color-bg-subtle)', padding: '12px 16px', borderRadius: 8 }}>
              {confirm.actuator.safety.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {command.isError && (
            <div className="notice notice--warning" role="alert">
              <Icon icon={TriangleAlert} />
              <span>
                {isApiError(command.error, 409) && command.error.code === 'safety_blocked'
                  ? t('actuator.blocked', { reason: command.error.problem?.detail ?? '' })
                  : t('actuator.failed')}
              </span>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}

function ActuatorTile({ actuator: a, busy, onCommand }: { actuator: Actuator; busy: boolean; onCommand: (c: Command) => void }) {
  const { t } = useTranslation()
  const blocked = (c: Command) => a.blockedCommands.find((b) => b.command === c)
  const offline = a.connection === 'offline'

  // Buttons by state (prototype): Auto+On → Switch to Manual · Manual+On → Turn Off, Return to Auto ·
  // Off → Turn On (+ Return to Auto when Manual)
  const buttons: { command: Command; primary?: boolean }[] =
    a.state === 'on'
      ? a.mode === 'auto'
        ? [{ command: 'set_manual' }]
        : [{ command: 'turn_off' }, { command: 'set_auto' }]
      : a.mode === 'auto'
        ? [{ command: 'turn_on', primary: true }]
        : [{ command: 'turn_on', primary: true }, { command: 'set_auto' }]
  const reasons = buttons.map((b) => blocked(b.command)?.reason).filter(Boolean)

  return (
    <div className="actuator">
      <div className="actuator-head">
        <span className="actuator-icon">{a.type === 'pump' ? <Droplets strokeWidth={1.75} aria-hidden="true" /> : <Fan strokeWidth={1.75} aria-hidden="true" />}</span>
        <div>
          <div className="strong">{a.name}</div>
          {a.spec && <div className="caption">{a.spec}</div>}
        </div>
      </div>
      <dl className="dl dl-3">
        <div>
          <dt>{t('actuator.state')}</dt>
          <dd>
            <span className="equip-state">
              <span className={cx('dot', a.state === 'on' && 'dot--normal', a.state === 'fault' && 'dot--critical')} />
              {t(`actuator.stateLabel.${a.state}`)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('actuator.mode')}</dt>
          <dd>
            {a.mode === 'auto' ? (
              t('actuator.modeLabel.auto')
            ) : (
              <>
                {t('actuator.modeLabel.manual')} <span className="caption">{t('actuator.override')}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          {a.mode === 'manual' && a.modeSince ? (
            <>
              <dt>{t('actuator.since')}</dt>
              <dd>{formatRecentTime(a.modeSince)}</dd>
            </>
          ) : a.state === 'on' ? (
            <>
              <dt>{t('actuator.runtimeToday')}</dt>
              <dd>{a.runtimeTodayH === null ? '—' : `${formatNumber(a.runtimeTodayH, 1)} h`}</dd>
            </>
          ) : (
            <>
              <dt>{t('actuator.lastRun')}</dt>
              <dd>{a.lastRunAt ? formatDayTime(a.lastRunAt) : '—'}</dd>
            </>
          )}
        </div>
      </dl>
      <div className="row">
        {buttons.map((b) => {
          const block = blocked(b.command)
          return (
            <button
              key={b.command}
              type="button"
              className={cx('btn btn--sm', b.primary ? 'btn--primary' : 'btn--outline')}
              disabled={busy || offline || !!block}
              title={block?.reason}
              onClick={() => onCommand(b.command)}
            >
              {t(`actuator.button.${b.command}`)}
            </button>
          )
        })}
      </div>
      {reasons.length > 0 && <span className="caption">{reasons.join(' · ')}</span>}
      {offline && <span className="caption">{t('actuator.offline')}</span>}
    </div>
  )
}
