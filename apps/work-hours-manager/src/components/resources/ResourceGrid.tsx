import { Badge, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Link, TableCellLayout, createTableColumn, type TableColumnDefinition, type TableRowId } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import { recordUrl } from '../../config'
import { S } from '../../strings'
import type { CalendarTree, Finding, Resource } from '../../types/calendar'
import { worstSeverity } from '../../utils/diagnostics'
import { timeZoneLabel } from '../../utils/timezones'

export interface ResourceRow {
  resource: Resource
  tree: CalendarTree | null
  findings: Finding[]
  /** Net working hours in the visible range. */
  hours: number
  capacityHours: number
}

interface Props {
  rows: ResourceRow[]
  selected: Set<TableRowId>
  onSelect: (ids: Set<TableRowId>) => void
  focusedId: string | null
  onFocus: (id: string) => void
  rangeLabel: string
}

const SEVERITY_COLOR: Record<Finding['severity'], 'danger' | 'warning' | 'informative'> = { error: 'danger', warning: 'warning', informative: 'informative' } as never

/** Sortable, multi-selectable resource list — the entry point of the mass actions. */
export function ResourceGrid({ rows, selected, onSelect, focusedId, onFocus, rangeLabel }: Props) {
  const columns: TableColumnDefinition<ResourceRow>[] = [
    createTableColumn<ResourceRow>({
      columnId: 'name',
      compare: (a, b) => a.resource.name.localeCompare(b.resource.name, 'de'),
      renderHeaderCell: () => S.resources.columns.name,
      renderCell: (row) => (
        <TableCellLayout truncate>
          <Link as="button" appearance="subtle" className="grid-name" onClick={() => onFocus(row.resource.id)} title={S.resources.showDetails}>
            {row.resource.name}
          </Link>
        </TableCellLayout>
      ),
    }),
    createTableColumn<ResourceRow>({
      columnId: 'type',
      compare: (a, b) => a.resource.type.localeCompare(b.resource.type),
      renderHeaderCell: () => S.resources.columns.type,
      renderCell: (row) => S.resourceTypes[row.resource.type],
    }),
    createTableColumn<ResourceRow>({
      columnId: 'unit',
      compare: (a, b) => (a.resource.orgUnit?.name ?? '').localeCompare(b.resource.orgUnit?.name ?? '', 'de'),
      renderHeaderCell: () => S.resources.columns.unit,
      renderCell: (row) => row.resource.orgUnit?.name ?? '—',
    }),
    createTableColumn<ResourceRow>({
      columnId: 'categories',
      renderHeaderCell: () => S.resources.columns.categories,
      renderCell: (row) => (
        <TableCellLayout truncate>
          {row.resource.categories.map((c) => c.name).join(', ') || '—'}
        </TableCellLayout>
      ),
    }),
    createTableColumn<ResourceRow>({
      columnId: 'zone',
      compare: (a, b) => a.resource.timeZoneCode - b.resource.timeZoneCode,
      renderHeaderCell: () => S.resources.columns.zone,
      renderCell: (row) => {
        const mismatch = row.findings.some((f) => f.kind === 'timeZoneMismatch')
        return (
          <span className={mismatch ? 'text-warn' : undefined} title={mismatch ? S.findings.timeZoneMismatch : undefined}>
            {timeZoneLabel(row.resource.timeZoneCode)}
          </span>
        )
      },
    }),
    createTableColumn<ResourceRow>({
      columnId: 'hours',
      compare: (a, b) => a.hours - b.hours,
      renderHeaderCell: () => `${S.resources.columns.week} (${rangeLabel})`,
      renderCell: (row) => (
        <span className={row.hours === 0 ? 'text-danger' : undefined} title={row.capacityHours !== row.hours ? S.resources.capacity(row.capacityHours) : undefined}>
          {row.resource.calendarId ? S.resources.hoursInRange(row.hours) : S.resources.noCalendar}
        </span>
      ),
    }),
    createTableColumn<ResourceRow>({
      columnId: 'rules',
      compare: (a, b) => (a.tree?.blocks.length ?? 0) - (b.tree?.blocks.length ?? 0),
      renderHeaderCell: () => S.resources.columns.rules,
      renderCell: (row) => (row.tree ? S.resources.rulesCount(row.tree.blocks.length) : '—'),
    }),
    createTableColumn<ResourceRow>({
      columnId: 'status',
      compare: (a, b) => Number(b.resource.active) - Number(a.resource.active),
      renderHeaderCell: () => S.resources.columns.status,
      renderCell: (row) => (
        <Badge appearance="tint" color={row.resource.active ? 'success' : 'subtle'} size="small">
          {row.resource.active ? S.resources.active : S.resources.inactive}
        </Badge>
      ),
    }),
    createTableColumn<ResourceRow>({
      columnId: 'findings',
      compare: (a, b) => b.findings.length - a.findings.length,
      renderHeaderCell: () => S.resources.columns.findings,
      renderCell: (row) => {
        const worst = worstSeverity(row.findings)
        if (!worst) return <span className="muted">—</span>
        return (
          <span className="finding-badges" title={row.findings.map((f) => S.findings[f.kind]).join(' · ')}>
            <Badge appearance="filled" color={SEVERITY_COLOR[worst]} size="small" shape="rounded">
              {row.findings.length}
            </Badge>
            <span className="finding-badges__text">{S.findings[row.findings[0].kind]}</span>
          </span>
        )
      },
    }),
    createTableColumn<ResourceRow>({
      columnId: 'open',
      renderHeaderCell: () => '',
      renderCell: (row) => {
        const url = recordUrl('bookableresource', row.resource.id)
        return url ? (
          <Link href={url} target="_blank" rel="noreferrer" title={S.resources.openForm} aria-label={S.resources.openForm}>
            <OpenRegular />
          </Link>
        ) : null
      },
    }),
  ]

  return (
    <DataGrid
      items={rows}
      columns={columns}
      sortable
      resizableColumns
      selectionMode="multiselect"
      selectedItems={selected}
      onSelectionChange={(_, d) => onSelect(d.selectedItems)}
      getRowId={(row) => row.resource.id}
      focusMode="composite"
      size="small"
      className="resource-grid"
      columnSizingOptions={{
        name: { minWidth: 160, defaultWidth: 240, idealWidth: 240 },
        type: { minWidth: 80, defaultWidth: 100 },
        unit: { minWidth: 100, defaultWidth: 140 },
        categories: { minWidth: 100, defaultWidth: 160 },
        zone: { minWidth: 150, defaultWidth: 190 },
        hours: { minWidth: 120, defaultWidth: 150 },
        rules: { minWidth: 90, defaultWidth: 110 },
        status: { minWidth: 70, defaultWidth: 90 },
        findings: { minWidth: 140, defaultWidth: 240 },
        open: { minWidth: 36, defaultWidth: 40 },
      }}
    >
      <DataGridHeader>
        <DataGridRow selectionCell={{ checkboxIndicator: { 'aria-label': S.resources.selectAll } }}>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
      </DataGridHeader>
      <DataGridBody<ResourceRow>>
        {({ item, rowId }) => (
          <DataGridRow<ResourceRow> key={rowId} selectionCell={{ checkboxIndicator: { 'aria-label': S.resources.selectRow } }} className={focusedId === item.resource.id ? 'is-focused' : undefined}>
            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
  )
}
