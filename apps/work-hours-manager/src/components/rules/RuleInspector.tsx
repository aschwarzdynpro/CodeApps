import { Badge, DrawerBody, DrawerHeader, DrawerHeaderTitle, InfoLabel, InlineDrawer, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Textarea, Tree, TreeItem, TreeItemLayout, type TreeItemValue } from '@fluentui/react-components'
import { BranchRegular, CalendarAgendaRegular, DismissRegular, DocumentOnePageRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import { S } from '../../strings'
import type { CalendarTree, LeafRule, RuleBlock } from '../../types/calendar'
import { formatDate, formatTime } from '../../utils/dates'
import { describeBlock, groupBlocks, isRecurrence } from '../../utils/rules'
import { timeZoneLabel } from '../../utils/timezones'
import { Btn } from '../ui'
import type { EditorRequest } from './RuleEditorDialog'

interface Props {
  open: boolean
  title: string
  subtitle?: string
  tree: CalendarTree | null | undefined
  resourceTimeZoneCode?: number
  /** Block to expand and highlight (inner calendar id or root rule id). */
  focusBlockId: string | null
  onClose: () => void
  /** Editing; null = read-only (no calendar, no privilege). */
  onEdit: ((request: EditorRequest) => void) | null
  today: string
}

const KIND_COLOR: Record<RuleBlock['kind'], 'brand' | 'warning' | 'danger' | 'subtle' | 'informative' | 'important'> = {
  work: 'brand',
  break: 'subtle',
  nonwork: 'subtle',
  timeoff: 'warning',
  closure: 'danger',
  unknown: 'informative',
}

const blockKey = (b: RuleBlock) => b.innerCalendarId ?? b.rootRuleId

const leafLabel = (l: LeafRule) => `${S.kinds[l.kind]} ${formatTime(l.startMin)}–${l.startMin + l.duration >= 1440 && (l.startMin + l.duration) % 1440 === 0 ? '24:00' : formatTime((l.startMin + l.duration) % 1440)}${l.duration > 1440 ? ` (+${Math.floor(l.duration / 1440)} Tage)` : ''}`

/** Read-only tree of the calendar: blocks (grouped when varied) → inner calendar → leaf rules, with fields and raw JSON. */
export function RuleInspector({ open, title, subtitle, tree, resourceTimeZoneCode, focusBlockId, onClose, onEdit, today }: Props) {
  const [openItems, setOpenItems] = useState<Set<TreeItemValue>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [raw, setRaw] = useState(false)
  const [lastFocus, setLastFocus] = useState<string | null>(null)

  // Deep link from the calendar: expand and select the block once per focus change (derived during render, no effect).
  if (focusBlockId !== lastFocus) {
    setLastFocus(focusBlockId)
    if (focusBlockId) {
      setSelected(focusBlockId)
      setOpenItems(new Set([...openItems, focusBlockId]))
    }
  }

  const blocks = tree?.blocks ?? []
  const selectedBlock = blocks.find((b) => blockKey(b).toLowerCase() === selected?.toLowerCase()) ?? null

  const renderBlock = (b: RuleBlock) => {
    const key = blockKey(b)
    const mismatch = resourceTimeZoneCode !== undefined && b.kind !== 'closure' && b.timeZoneCode !== resourceTimeZoneCode
    return (
      <TreeItem key={key} itemType="branch" value={key}>
        <TreeItemLayout
          iconBefore={<CalendarAgendaRegular />}
          className={selected?.toLowerCase() === key.toLowerCase() ? 'is-selected' : undefined}
          onClick={() => setSelected(key)}
          aside={
            <span className="tree-aside">
              <Badge size="small" appearance="tint" color={KIND_COLOR[b.kind]}>
                {S.kinds[b.kind]}
              </Badge>
              <Badge size="small" appearance="outline" title={b.rank === 0 ? S.rules.rank0 : S.rules.rank1}>
                {S.inspector.rank} {b.rank}
              </Badge>
              {mismatch ? (
                <Badge size="small" appearance="tint" color="warning" title={S.rules.zoneMismatch(timeZoneLabel(b.timeZoneCode), timeZoneLabel(resourceTimeZoneCode))}>
                  {timeZoneLabel(b.timeZoneCode)}
                </Badge>
              ) : null}
            </span>
          }
        >
          {describeBlock(b)}
        </TreeItemLayout>
        <Tree>
          <TreeItem itemType="branch" value={`${key}/inner`}>
            <TreeItemLayout iconBefore={<BranchRegular />}>
              {b.innerCalendarId ? `${S.inspector.innerCalendar} ${b.innerCalendarId}` : S.rules.root} · {S.inspector.leaves(b.leaves.length)}
            </TreeItemLayout>
            <Tree>
              {b.leaves.map((l) => (
                <TreeItem key={l.id} itemType="leaf" value={l.id}>
                  <TreeItemLayout iconBefore={<DocumentOnePageRegular />} aside={<span className="muted small">{S.inspector.codes(l.timeCode, l.subCode)}{l.effort !== null && l.effort !== 1 ? ` · ${S.inspector.effort} ${l.effort}` : ''}</span>}>
                    {leafLabel(l)}
                  </TreeItemLayout>
                </TreeItem>
              ))}
            </Tree>
          </TreeItem>
        </Tree>
      </TreeItem>
    )
  }

  return (
    <InlineDrawer open={open} position="end" size="medium" separator className="inspector">
      <DrawerHeader>
        <DrawerHeaderTitle action={<Btn kind="ghost" aria-label={S.inspector.close} icon={<DismissRegular />} onClick={onClose} />}>{S.inspector.title}</DrawerHeaderTitle>
        <div className="inspector__sub">
          <strong>{title}</strong>
          {subtitle ? <span className="muted small">{subtitle}</span> : null}
          {tree ? (
            <span className="muted small">
              {S.inspector.calendar} {tree.calendarId} · {S.inspector.blocks(tree.blocks.length)}
              {resourceTimeZoneCode !== undefined ? ` · ${S.inspector.resourceZone}: ${timeZoneLabel(resourceTimeZoneCode)}` : ''}
            </span>
          ) : null}
        </div>
      </DrawerHeader>
      <DrawerBody className="inspector__body">
        {tree && onEdit ? (
          <div className="inspector__actions">
            <Btn small kind="primary" onClick={() => onEdit({ op: 'create', kind: 'work', date: today })}>
              {S.inspector.actions.newWork}
            </Btn>
            <Btn small onClick={() => onEdit({ op: 'create', kind: 'timeoff', date: today })}>
              {S.inspector.actions.newAbsence}
            </Btn>
            <Btn small onClick={() => onEdit({ op: 'create', kind: 'nonwork', date: today })}>
              {S.inspector.actions.newNonwork}
            </Btn>
          </div>
        ) : tree ? (
          <p className="muted small">{S.inspector.actions.readOnly}</p>
        ) : null}
        {!tree ? (
          <p className="muted">{S.inspector.noTree}</p>
        ) : blocks.length === 0 ? (
          <p className="muted">{S.inspector.noBlocks}</p>
        ) : (
          <Tree aria-label={S.inspector.treeLabel} openItems={openItems} onOpenChange={(_, d) => setOpenItems(d.openItems)} size="small">
            {groupBlocks(blocks).map((group) =>
              group.length === 1 ? (
                renderBlock(group[0])
              ) : (
                <TreeItem key={group[0].groupId!} itemType="branch" value={group[0].groupId!}>
                  <TreeItemLayout iconBefore={<CalendarAgendaRegular />} aside={<Badge size="small" appearance="tint">{S.rules.varied}</Badge>}>
                    {S.inspector.group(group.length)}
                  </TreeItemLayout>
                  <Tree>{group.map(renderBlock)}</Tree>
                </TreeItem>
              ),
            )}
          </Tree>
        )}
        {tree && tree.orphanInnerCalendars.length ? (
          <p className="text-warn small">
            {S.inspector.orphans(tree.orphanInnerCalendars.length)}: {tree.orphanInnerCalendars.map((c) => c.calendarid).join(', ')}
          </p>
        ) : null}
        {tree && tree.unparsed.length ? (
          <p className="text-warn small">
            {S.inspector.unparsed(tree.unparsed.length)}: {tree.unparsed.map((r) => r.calendarruleid).join(', ')}
          </p>
        ) : null}

        {selectedBlock ? (
          <section className="inspector__fields">
            <div className="inspector__fields-head">
              <h3>{S.inspector.fields}</h3>
              <Switch label={S.inspector.rawJson} checked={raw} onChange={(_, d) => setRaw(d.checked)} />
            </div>
            {onEdit && selectedBlock.kind !== 'closure' && selectedBlock.innerCalendarId ? (
              <div className="inspector__actions">
                <Btn small onClick={() => onEdit({ op: 'edit', block: selectedBlock })}>
                  {S.inspector.actions.edit}
                </Btn>
                {isRecurrence(selectedBlock) ? (
                  <>
                    <Btn small onClick={() => onEdit({ op: 'editDay', block: selectedBlock, date: today })}>
                      {S.inspector.actions.editDay}
                    </Btn>
                    <Btn small onClick={() => onEdit({ op: 'end', block: selectedBlock })}>
                      {S.inspector.actions.end}
                    </Btn>
                  </>
                ) : null}
                <Btn small kind="danger" onClick={() => onEdit({ op: 'delete', block: selectedBlock })}>
                  {S.inspector.actions.delete}
                </Btn>
              </div>
            ) : null}
            {raw ? (
              <Textarea readOnly resize="vertical" className="inspector__raw" value={JSON.stringify(selectedBlock.raw, null, 2)} />
            ) : (
              <Table size="extra-small" aria-label={S.inspector.fields}>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{S.inspector.field}</TableHeaderCell>
                    <TableHeaderCell>{S.inspector.value}</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FieldRow label={S.inspector.rootRule} value={selectedBlock.rootRuleId} />
                  <FieldRow label={S.inspector.innerCalendar} value={selectedBlock.innerCalendarId ?? '—'} />
                  <FieldRow label={<InfoLabel info={selectedBlock.rank === 0 ? S.rules.rank0 : S.rules.rank1}>{S.inspector.rank}</InfoLabel>} value={String(selectedBlock.rank)} />
                  <FieldRow label={S.inspector.pattern} value={selectedBlock.pattern ?? (isRecurrence(selectedBlock) ? '' : S.rules.once)} />
                  <FieldRow label={S.inspector.interval} value={`${formatDate(selectedBlock.start)} – ${selectedBlock.end ? formatDate(selectedBlock.end) : S.rules.openEnd}`} />
                  <FieldRow label={S.inspector.zone} value={`${selectedBlock.timeZoneCode} · ${timeZoneLabel(selectedBlock.timeZoneCode)}`} />
                  <FieldRow label="extentcode" value={String(selectedBlock.raw.root.extentcode ?? '—')} />
                  <FieldRow label="groupdesignator" value={selectedBlock.groupId ?? '—'} />
                  <FieldRow label={S.inspector.modified} value={selectedBlock.modifiedOn ? new Date(selectedBlock.modifiedOn).toLocaleString('de-DE') : '—'} />
                </TableBody>
              </Table>
            )}
          </section>
        ) : tree && blocks.length ? (
          <p className="muted small">{S.inspector.selectBlock}</p>
        ) : null}
      </DrawerBody>
    </InlineDrawer>
  )
}

function FieldRow({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="mono">{value}</TableCell>
    </TableRow>
  )
}
