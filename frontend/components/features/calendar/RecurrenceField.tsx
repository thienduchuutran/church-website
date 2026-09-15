'use client'

import { useMemo, useState } from 'react'

// The Repeats control: a short list of presets built from the event's own date,
// plus a Custom panel for everything else.
//
// What this component produces is an RFC 5545 RRULE string - never a list of
// dates. Which dates a rule produces is decided once, server-side, in
// internal/service/rrule.go, and the server rejects any rule it cannot expand.
// So there is exactly one implementation of "what does every second Tuesday
// mean", and this file cannot disagree with it: the worst it can do is submit a
// rule and be told no.
//
// Presets are phrased with the actual date in them ("Monthly on the first
// Sunday") because "monthly" alone is ambiguous in precisely the way that
// produces a calendar nobody trusts.

export interface RecurrenceValue {
  // RRULE text, or '' for "does not repeat".
  rule: string
  // The "ends on" date (YYYY-MM-DD), or ''. Kept outside the rule because the
  // backend stores it in its own column - see migration 000015.
  until: string
}

export const NO_RECURRENCE: RecurrenceValue = { rule: '', until: '' }

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth']

// Parsing the date by hand rather than with `new Date(s)`: that constructor
// reads a bare YYYY-MM-DD as UTC midnight, which lands on the previous day for
// anyone west of Greenwich - the church is in Massachusetts, so every preset
// would name the wrong weekday.
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

// Which occurrence of its weekday this date is within its month, and whether it
// is the last one. "Last Sunday" is a different rule from "fourth Sunday" in
// any month with five, so the preset offers whichever the date actually is.
function weekdayPosition(d: Date): { nth: number; isLast: boolean } {
  const nth = Math.floor((d.getDate() - 1) / 7) + 1
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return { nth, isLast: d.getDate() + 7 > daysInMonth }
}

export default function RecurrenceField({
  startDate,
  value,
  onChange,
  label = 'Repeats',
}: {
  startDate: string
  value: RecurrenceValue
  onChange: (v: RecurrenceValue) => void
  label?: string
}) {
  const start = useMemo(() => parseLocalDate(startDate), [startDate])

  const presets = useMemo(() => {
    if (!start) return []
    const dow = start.getDay()
    const { nth, isLast } = weekdayPosition(start)
    const monthlyOrdinal = isLast && nth >= 4 ? -1 : nth
    const monthlyWord = monthlyOrdinal === -1 ? 'last' : ORDINALS[monthlyOrdinal]
    return [
      { rule: '', label: 'Does not repeat' },
      { rule: 'FREQ=DAILY', label: 'Daily' },
      { rule: `FREQ=WEEKLY;BYDAY=${DAY_CODES[dow]}`, label: `Weekly on ${DAY_NAMES[dow]}` },
      { rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday (Mon to Fri)' },
      {
        rule: `FREQ=MONTHLY;BYDAY=${monthlyOrdinal}${DAY_CODES[dow]}`,
        label: `Monthly on the ${monthlyWord} ${DAY_NAMES[dow]}`,
      },
      {
        rule: 'FREQ=YEARLY',
        label: `Annually on ${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`,
      },
    ]
  }, [start])

  // Custom is sticky once chosen, so a rule that happens to equal a preset does
  // not snap the dropdown back and hide the panel the admin is still editing.
  const matchesPreset = presets.some((p) => p.rule === value.rule)
  const [customOpen, setCustomOpen] = useState(!matchesPreset && value.rule !== '')
  const showCustom = customOpen || (!matchesPreset && value.rule !== '')

  function selectPreset(rule: string) {
    if (rule === '__custom__') {
      setCustomOpen(true)
      // Seed Custom from the current selection so opening it never silently
      // discards what was already chosen.
      onChange({ ...value, rule: value.rule || 'FREQ=WEEKLY' })
      return
    }
    setCustomOpen(false)
    onChange(rule === '' ? NO_RECURRENCE : { ...value, rule })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="recurrence-preset" className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
        {label}
      </label>
      <select
        id="recurrence-preset"
        value={showCustom ? '__custom__' : value.rule}
        onChange={(e) => selectPreset(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {presets.map((p) => (
          <option key={p.rule || 'none'} value={p.rule}>
            {p.label}
          </option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>

      {showCustom && <CustomPanel value={value} onChange={onChange} startDate={startDate} />}

      {value.rule !== '' && !showCustom && (
        <EndsPanel value={value} onChange={onChange} startDate={startDate} />
      )}
    </div>
  )
}

// --- Custom -----------------------------------------------------------------

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

// Reading the parts back out of the rule string keeps this panel stateless
// about the rule itself. The string stays the single representation, so there
// is no second copy of the selection to drift out of sync with it.
function readRule(rule: string) {
  const parts = new Map<string, string>()
  for (const p of rule.split(';')) {
    const [k, v] = p.split('=')
    if (k && v) parts.set(k.toUpperCase(), v.toUpperCase())
  }
  const byDay = (parts.get('BYDAY') || '').split(',').filter(Boolean)
  return {
    freq: (parts.get('FREQ') as Freq) || 'WEEKLY',
    interval: Number(parts.get('INTERVAL') || '1') || 1,
    byDay,
    byMonthDay: Number(parts.get('BYMONTHDAY') || '0') || 0,
    count: Number(parts.get('COUNT') || '0') || 0,
  }
}

function buildRule(r: ReturnType<typeof readRule>): string {
  const parts = [`FREQ=${r.freq}`]
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`)
  if (r.freq === 'WEEKLY' && r.byDay.length > 0) parts.push(`BYDAY=${r.byDay.join(',')}`)
  if (r.freq === 'MONTHLY') {
    if (r.byDay.length === 1) parts.push(`BYDAY=${r.byDay[0]}`)
    else if (r.byMonthDay > 0) parts.push(`BYMONTHDAY=${r.byMonthDay}`)
  }
  if (r.count > 0) parts.push(`COUNT=${r.count}`)
  return parts.join(';')
}

function CustomPanel({
  value,
  onChange,
  startDate,
}: {
  value: RecurrenceValue
  onChange: (v: RecurrenceValue) => void
  startDate: string
}) {
  const r = readRule(value.rule)
  const start = parseLocalDate(startDate)
  const set = (next: Partial<ReturnType<typeof readRule>>) =>
    onChange({ ...value, rule: buildRule({ ...r, ...next }) })

  const monthlyMode = r.byDay.length === 1 ? 'weekday' : 'date'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/50 p-3">
      <div className="flex items-center gap-2">
        <span className="font-sans text-sm text-foreground">Repeat every</span>
        <input
          type="number"
          min={1}
          max={99}
          value={r.interval}
          onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <select
          value={r.freq}
          onChange={(e) => set({ freq: e.target.value as Freq, byDay: [], byMonthDay: 0 })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="DAILY">{r.interval > 1 ? 'days' : 'day'}</option>
          <option value="WEEKLY">{r.interval > 1 ? 'weeks' : 'week'}</option>
          <option value="MONTHLY">{r.interval > 1 ? 'months' : 'month'}</option>
          <option value="YEARLY">{r.interval > 1 ? 'years' : 'year'}</option>
        </select>
      </div>

      {r.freq === 'WEEKLY' && (
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">On</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_CODES.map((code, i) => {
              const on = r.byDay.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set({ byDay: on ? r.byDay.filter((d) => d !== code) : [...r.byDay, code] })
                  }
                  className={[
                    'rounded-full px-3 py-1 font-display text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    on ? 'bg-primary text-white' : 'border border-border text-muted hover:bg-surface',
                  ].join(' ')}
                >
                  {DAY_LABELS[i]}
                </button>
              )
            })}
          </div>
          {r.byDay.length === 0 && (
            <span className="font-sans text-xs text-muted">
              No day chosen - it will repeat on the same weekday as the event.
            </span>
          )}
        </div>
      )}

      {r.freq === 'MONTHLY' && start && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 font-sans text-sm text-foreground">
            <input
              type="radio"
              name="monthly-mode"
              checked={monthlyMode === 'date'}
              onChange={() => set({ byDay: [], byMonthDay: start.getDate() })}
              className="accent-primary"
            />
            On day {r.byMonthDay || start.getDate()} of the month
          </label>
          <label className="flex items-center gap-2 font-sans text-sm text-foreground">
            <input
              type="radio"
              name="monthly-mode"
              checked={monthlyMode === 'weekday'}
              onChange={() => {
                const { nth, isLast } = weekdayPosition(start)
                const ord = isLast && nth >= 4 ? -1 : nth
                set({ byDay: [`${ord}${DAY_CODES[start.getDay()]}`], byMonthDay: 0 })
              }}
              className="accent-primary"
            />
            On the{' '}
            {(() => {
              const { nth, isLast } = weekdayPosition(start)
              return isLast && nth >= 4 ? 'last' : ORDINALS[nth]
            })()}{' '}
            {DAY_NAMES[start.getDay()]}
          </label>
          <span className="font-sans text-xs text-muted">
            A day-of-month that a short month does not have moves to its last day, so nothing is
            silently skipped.
          </span>
        </div>
      )}

      <EndsPanel value={value} onChange={onChange} startDate={startDate} allowCount />
    </div>
  )
}

// --- Ends -------------------------------------------------------------------

function EndsPanel({
  value,
  onChange,
  startDate,
  allowCount = false,
}: {
  value: RecurrenceValue
  onChange: (v: RecurrenceValue) => void
  startDate: string
  allowCount?: boolean
}) {
  const r = readRule(value.rule)
  const mode = value.until !== '' ? 'on' : r.count > 0 ? 'after' : 'never'

  const setCount = (n: number) =>
    onChange({ ...value, until: '', rule: buildRule({ ...r, count: Math.max(1, n) }) })

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">Ends</span>

      <label className="flex items-center gap-2 font-sans text-sm text-foreground">
        <input
          type="radio"
          name="recurrence-ends"
          checked={mode === 'never'}
          onChange={() => onChange({ ...value, until: '', rule: buildRule({ ...r, count: 0 }) })}
          className="accent-primary"
        />
        Never
      </label>

      <label className="flex items-center gap-2 font-sans text-sm text-foreground">
        <input
          type="radio"
          name="recurrence-ends"
          checked={mode === 'on'}
          onChange={() =>
            onChange({ ...value, until: startDate, rule: buildRule({ ...r, count: 0 }) })
          }
          className="accent-primary"
        />
        On
        <input
          type="date"
          value={value.until}
          min={startDate || undefined}
          onChange={(e) =>
            onChange({ ...value, until: e.target.value, rule: buildRule({ ...r, count: 0 }) })
          }
          className="rounded-lg border border-border bg-background px-3 py-1.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      {allowCount && (
        <label className="flex items-center gap-2 font-sans text-sm text-foreground">
          <input
            type="radio"
            name="recurrence-ends"
            checked={mode === 'after'}
            onChange={() => setCount(r.count || 10)}
            className="accent-primary"
          />
          After
          <input
            type="number"
            min={1}
            max={500}
            value={r.count || 10}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
            className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          times
        </label>
      )}

      <span className="font-sans text-xs text-muted">
        {mode === 'never'
          ? 'Dates are created three years ahead. You will be warned before they run out.'
          : 'Dates are created up to this bound and no further.'}
      </span>
    </div>
  )
}
