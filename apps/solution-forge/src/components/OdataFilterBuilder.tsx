import { useCallback, useEffect, useState } from 'react'
import type {
  ColumnMeta,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterOperator,
  OptionLabel,
} from '../types/odataBrowser'
import {
  addToGroup,
  defaultOperatorFor,
  newCondition,
  newGroup,
  operatorDef,
  operatorsFor,
  removeNode,
  updateNode,
} from '../utils/odataFilter'

/**
 * Guided `$filter` builder.
 *
 * Every row offers only the operators that make sense for its column's type,
 * and choice columns get a real dropdown of their labels (read from
 * `stringmap`) instead of asking the user to know that "Active" is 0. Groups
 * nest, so `A and (B or C)` is expressible without touching the raw line.
 *
 * The component is fully controlled: it never holds a filter of its own, it
 * hands a new tree upwards on every edit. The tree helpers in
 * `utils/odataFilter` are pure and unit-tested; this file is only wiring.
 */
interface Props {
  root: FilterGroup
  /** Selectable columns of the current table. */
  columns: ColumnMeta[]
  onChange: (next: FilterGroup) => void
  /** Choice labels for a column; empty list = no labels available. */
  loadOptions: (column: ColumnMeta) => Promise<OptionLabel[]>
  disabled?: boolean
}

const CHOICE_KINDS = new Set(['choice', 'multichoice'])

export function OdataFilterBuilder({
  root,
  columns,
  onChange,
  loadOptions,
  disabled = false,
}: Props) {
  const byName = new Map(columns.map((c) => [c.selectName, c]))
  const [options, setOptions] = useState<Map<string, OptionLabel[]>>(new Map())

  /** Column names in the tree whose choice labels we still need. */
  const wanted = collectChoiceColumns(root, byName)
  const missing = wanted.filter((name) => !options.has(name))
  const missingKey = missing.join(',')

  const fetchOptions = useCallback(
    async (names: string[]) => {
      for (const name of names) {
        const column = byName.get(name)
        if (!column) continue
        const loaded = await loadOptions(column)
        setOptions((prev) => new Map(prev).set(name, loaded))
      }
    },
    // `byName` is rebuilt every render; the column list itself is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, loadOptions],
  )

  useEffect(() => {
    if (missingKey === '') return
    const timer = window.setTimeout(() => void fetchOptions(missingKey.split(',')), 0)
    return () => window.clearTimeout(timer)
  }, [missingKey, fetchOptions])

  const renderNode = (node: FilterNode, depth: number): React.ReactNode =>
    node.kind === 'group' ? (
      <div
        key={node.id}
        className={`odb-fgroup ${depth > 0 ? 'odb-fgroup--nested' : ''}`}
      >
        <div className="odb-fgroup-head">
          <select
            value={node.op}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                updateNode(root, node.id, (n) => ({
                  ...(n as FilterGroup),
                  op: e.target.value as 'and' | 'or',
                })),
              )
            }
            title="How the rows in this group combine"
          >
            <option value="and">all of (and)</option>
            <option value="or">any of (or)</option>
          </select>
          <button
            className="btn btn--small"
            disabled={disabled}
            onClick={() => onChange(addToGroup(root, node.id, freshCondition(columns)))}
          >
            + condition
          </button>
          <button
            className="btn btn--small"
            disabled={disabled}
            onClick={() => onChange(addToGroup(root, node.id, newGroup('or')))}
            title="A nested group — for “A and (B or C)”"
          >
            + group
          </button>
          {depth > 0 && (
            <button
              className="btn btn--small odb-frow-del"
              disabled={disabled}
              onClick={() => onChange(removeNode(root, node.id))}
              title="Remove this group"
            >
              ✕
            </button>
          )}
        </div>
        {node.children.length === 0 ? (
          <div className="muted odb-fempty">No conditions — all rows match.</div>
        ) : (
          node.children.map((child) => renderNode(child, depth + 1))
        )}
      </div>
    ) : (
      <ConditionRow
        key={node.id}
        condition={node}
        columns={columns}
        column={byName.get(node.column)}
        options={options.get(node.column) ?? []}
        disabled={disabled}
        onChange={(next) => onChange(updateNode(root, node.id, () => next))}
        onRemove={() => onChange(removeNode(root, node.id))}
      />
    )

  return <div className="odb-filter">{renderNode(root, 0)}</div>
}

interface RowProps {
  condition: FilterCondition
  columns: ColumnMeta[]
  column: ColumnMeta | undefined
  options: OptionLabel[]
  disabled: boolean
  onChange: (next: FilterCondition) => void
  onRemove: () => void
}

function ConditionRow({
  condition,
  columns,
  column,
  options,
  disabled,
  onChange,
  onRemove,
}: RowProps) {
  const kind = column?.kind ?? 'string'
  const operators = operatorsFor(kind)
  // A column change can invalidate the operator (contains on a number) — fall
  // back to the type's default rather than rendering an impossible row.
  const active = operators.some((o) => o.id === condition.operator)
    ? condition.operator
    : defaultOperatorFor(kind)
  const arity = operatorDef(active)?.arity ?? 1

  const setValue = (index: number, value: string) => {
    const values = [...condition.values]
    values[index] = value
    onChange({ ...condition, values })
  }

  return (
    <div className="odb-frow">
      <select
        className="odb-fcol"
        value={condition.column}
        disabled={disabled}
        onChange={(e) => {
          const next = columns.find((c) => c.selectName === e.target.value)
          onChange({
            ...condition,
            column: e.target.value,
            operator: next ? defaultOperatorFor(next.kind) : condition.operator,
            values: [],
          })
        }}
      >
        <option value="">Select a column…</option>
        {columns.map((c) => (
          <option key={c.selectName} value={c.selectName}>
            {c.displayName} ({c.selectName})
          </option>
        ))}
      </select>

      <select
        className="odb-fop"
        value={active}
        disabled={disabled || !condition.column}
        onChange={(e) =>
          onChange({
            ...condition,
            operator: e.target.value as FilterOperator,
            values: [],
          })
        }
      >
        {operators.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>

      {arity !== 0 && (
        <ValueEditor
          // Remounting on a column/operator switch resets the list editor's
          // local text — otherwise a stale "1,2" would linger in a new row.
          key={`${condition.column}|${active}`}
          kind={kind}
          arity={arity}
          options={options}
          values={condition.values}
          disabled={disabled || !condition.column}
          onChange={setValue}
          onList={(list) => onChange({ ...condition, values: list })}
        />
      )}

      <button
        className="btn btn--small odb-frow-del"
        disabled={disabled}
        onClick={onRemove}
        title="Remove this condition"
      >
        ✕
      </button>
    </div>
  )
}

interface ValueProps {
  kind: string
  arity: 0 | 1 | 2 | 'list'
  options: OptionLabel[]
  values: string[]
  disabled: boolean
  onChange: (index: number, value: string) => void
  onList: (values: string[]) => void
}

function ValueEditor({
  kind,
  arity,
  options,
  values,
  disabled,
  onChange,
  onList,
}: ValueProps) {
  if (arity === 'list')
    return (
      <ListEditor
        initial={values.join(', ')}
        options={options}
        disabled={disabled}
        onChange={onList}
      />
    )

  const single = (index: number) => {
    const value = values[index] ?? ''
    if (CHOICE_KINDS.has(kind) && options.length > 0)
      return (
        <select
          key={index}
          className="odb-fval"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(index, e.target.value)}
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label} ({o.value})
            </option>
          ))}
        </select>
      )
    if (kind === 'boolean')
      return (
        <select
          key={index}
          className="odb-fval"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(index, e.target.value)}
        >
          <option value="">Select…</option>
          <option value="true">Yes (true)</option>
          <option value="false">No (false)</option>
        </select>
      )
    return (
      <input
        key={index}
        className="odb-fval"
        type={
          kind === 'datetime' || kind === 'dateonly'
            ? 'date'
            : kind === 'number' || kind === 'money' || kind === 'choice'
              ? 'number'
              : 'text'
        }
        disabled={disabled}
        placeholder={kind === 'lookup' || kind === 'guid' ? 'GUID' : 'Value'}
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
      />
    )
  }

  return (
    <>
      {single(0)}
      {arity === 2 && (
        <>
          <span className="muted odb-fand">and</span>
          {single(1)}
        </>
      )}
    </>
  )
}

/**
 * Comma-separated value list. It keeps the typed text locally and only hands
 * the split values upwards — deriving the text back from the array would eat
 * the comma the moment you typed it.
 */
function ListEditor({
  initial,
  options,
  disabled,
  onChange,
}: {
  initial: string
  options: OptionLabel[]
  disabled: boolean
  onChange: (values: string[]) => void
}) {
  const [text, setText] = useState(initial)
  return (
    <input
      className="odb-fval"
      type="text"
      disabled={disabled}
      placeholder={
        options.length > 0
          ? `comma-separated, e.g. ${options.slice(0, 2).map((o) => o.value).join(',')}`
          : 'comma-separated values'
      }
      value={text}
      title={options.map((o) => `${o.value} = ${o.label}`).join('\n')}
      onChange={(e) => {
        setText(e.target.value)
        onChange(
          e.target.value
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v !== ''),
        )
      }}
    />
  )
}

/** The choice columns used anywhere in the tree — those need labels loaded. */
function collectChoiceColumns(
  node: FilterNode,
  byName: Map<string, ColumnMeta>,
): string[] {
  const out: string[] = []
  const walk = (n: FilterNode) => {
    if (n.kind === 'group') {
      n.children.forEach(walk)
      return
    }
    const column = byName.get(n.column)
    if (column && CHOICE_KINDS.has(column.kind) && !out.includes(n.column))
      out.push(n.column)
  }
  walk(node)
  return out.sort()
}

/**
 * A fresh condition starts on the primary name column with that type's default
 * operator — "contains" on text, which is what people almost always want.
 */
function freshCondition(columns: ColumnMeta[]): FilterCondition {
  const column = columns.find((c) => c.isPrimaryName) ?? columns[0]
  return newCondition(
    column?.selectName ?? '',
    defaultOperatorFor(column?.kind ?? 'string'),
  )
}
