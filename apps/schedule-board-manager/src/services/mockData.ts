import type {
  Board,
  BookingSetupRef,
  ColumnMeta,
  ConfigDetail,
  ConfigRef,
  PrincipalRef,
  RelationshipMeta,
  TableInfo,
  TimeZoneRef,
  ViewDefinition,
  ViewRef,
} from '../types/board'
import { CONFIG_TYPE, SHARE_TYPE } from '../types/board'
import { STARTER_CELL_TEMPLATE } from '../utils/templates'

/**
 * Fictional sample data shaped like a real URS environment (Project
 * Operations flavour: four schedule types incl. a custom one). Names and
 * people are invented — no customer data in the repo.
 */

const BS_NONE = '49bc77c5-3a9e-4a0b-a903-0a3a4d352f5d'
const BS_APPOINTMENT = '187989a1-41f1-e711-8130-000d3af982f3'
const BS_WORKORDER = 'd59df12a-aedb-4f82-b5b8-9a6eba4f1712'
const BS_PROJECT = 'a0b1c2d3-0000-4000-8000-000000000001'

const V = {
  bookingTooltip: '10000000-0000-4000-8000-000000000001',
  bookingDetails: '10000000-0000-4000-8000-000000000002',
  bookingCompact: '10000000-0000-4000-8000-000000000003',
  reqOpen: '20000000-0000-4000-8000-000000000001',
  reqInstall: '20000000-0000-4000-8000-000000000002',
  reqService: '20000000-0000-4000-8000-000000000003',
  reqDetails: '20000000-0000-4000-8000-000000000004',
  resTooltip: '30000000-0000-4000-8000-000000000001',
  resDetails: '30000000-0000-4000-8000-000000000002',
  ouTooltip: '40000000-0000-4000-8000-000000000001',
  alerts: '50000000-0000-4000-8000-000000000001',
  myReq: '60000000-0000-4000-8000-000000000001',
}

const C = {
  defaultFilter: '70000000-0000-4000-8000-000000000001',
  proFilter: '70000000-0000-4000-8000-000000000002',
  cellTemplate: '70000000-0000-4000-8000-000000000003',
  defaultQuery: '70000000-0000-4000-8000-000000000004',
  proQuery: '70000000-0000-4000-8000-000000000005',
  saFilter: '70000000-0000-4000-8000-000000000006',
  crewCell: '70000000-0000-4000-8000-000000000007',
}

const TZ_BERLIN = 'e64c2598-8880-4730-b622-a47bd25193cd'

/** Records saved in filter values. */
const R = {
  regionNord: '80000000-0000-4000-8000-000000000001',
  regionSued: '80000000-0000-4000-8000-000000000002',
  buService: '81000000-0000-4000-8000-000000000001',
}

/** Shape the board writes into msdyn_filtervalues for a picked record. */
const ufx = (id: string, entity: string) => ({ '@ufx-id': id, '@ufx-type': 'lookup', '@ufx-logicalname': entity })

/** Booking template from the MS Learn example (work order, account, incident type). */
const WORK_ORDER_TEMPLATE = `<div style="line-height: 13px; width: 99%; overflow: hidden; display: block; text-overflow: ellipsis;">
    WO: <b>{msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_name}</b><br/>
    Konto: <b>{msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_account_msdyn_workorder_ServiceAccount.name}</b><br/>
    Vorfall: <b>{msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_primaryincidenttype}</b><br/>
    Dauer: <b>{duration} Minuten</b>
</div>`

function slot(id: string, tooltip: string, template: string) {
  return {
    BookingSetupMetadataId: id,
    DefaultAvailabilityView: 'Grid',
    DetailsViewId: V.bookingDetails,
    RequirementDetailsPanelViewId: V.reqOpen,
    RequirementDetailsViewId: V.reqDetails,
    ScheduleAssistantFilterLayout: '<?xml version="1.0" encoding="utf-8" ?><filter><controls /></filter>',
    ScheduleAssistantFilterLayoutId: C.saFilter,
    ScheduleAssistantResourceCellTemplate: "<div class='resource-card-wrapper'>{{name}}</div>",
    ScheduleAssistantResourceCellTemplateId: C.cellTemplate,
    SlotTemplate: template,
    TooltipViewId: tooltip,
    UnschReqMapPinTooltipViewId: V.reqOpen,
  }
}

function settings(opts: {
  start: number
  end: number
  weekend: boolean
  panels: { Title: string; UnscheduledView: string }[]
  hideCancelled?: boolean
  rowHeight?: number
}): string {
  const s: Record<string, unknown> = {
    BookingAlertTemplate: '<b>Betreff: </b>{subject}<br /><b>Fällig: </b>{msdyn_nexttimetoshow}',
    CurrentTimelineColor: '2A8DD4',
    FilterResourcesSet: [],
    GroupResourcesBy: '-1',
    HideDefaultUnscheduledPanels: opts.panels.length > 0,
    ResourcePageSize: 40,
    RowHeight: 60,
    SAHideUnavailableResources: 1,
    SASearchForDefault: 2,
    SlotMetadataCollection: [
      slot(BS_NONE, V.bookingTooltip, '<div>{name}</div>'),
      slot(BS_APPOINTMENT, V.bookingTooltip, '<div>{name}<br />{starttime}</div>'),
      slot(BS_WORKORDER, V.bookingCompact, WORK_ORDER_TEMPLATE),
      slot(BS_PROJECT, V.bookingTooltip, '<div>{SchedulableEntityDisplayName} - {name}</div>'),
    ],
    TimeOffsetSetting: TZ_BERLIN,
    TimeResolution: 15,
    UnscheduledTabs: opts.panels.map((p) => ({ ...p, ViewType: 'msdyn_resourcerequirement' })),
    WorkDays: {
      Friday: true,
      Monday: true,
      Saturday: opts.weekend,
      Sunday: opts.weekend,
      Thursday: true,
      Tuesday: true,
      Wednesday: true,
    },
    WorkHours: { end: opts.end, start: opts.start },
    hideLegend: 1,
    hideRoutes: false,
    mapType: '',
    viewModeSpecific: {
      dayAndWeek: { RowHeight: 64, modeUnitsCount: 14 },
      hourAndDay: { RowHeight: opts.rowHeight ?? 80, modeUnitsCount: 8 },
      monthAndYear: { RowHeight: 33, modeUnitsCount: 12 },
      weekAndMonth: { RowHeight: 64, modeUnitsCount: 5 },
    },
    ViewMode: 'hourAndDay',
  }
  if (opts.hideCancelled) s.hideCancelled = 1
  return JSON.stringify(s)
}

const EMPTY_LOOKUP_NAMES = { msdyn_filterlayout: null, msdyn_resourcecelltemplate: null, msdyn_retrieveresourcesquery: null }

function columns(overrides: Record<string, string | number | boolean | null>) {
  return {
    msdyn_tabname: '',
    msdyn_sharetype: SHARE_TYPE.everyone,
    msdyn_ordernumber: 0,
    msdyn_schedulerresourcetooltipview: V.resTooltip,
    msdyn_organizationalunittooltipsviewid: V.ouTooltip,
    msdyn_unscheduledrequirementsviewid: V.reqOpen,
    msdyn_schedulerresourcedetailsview: V.resDetails,
    msdyn_organizationalunitviewid: null,
    msdyn_customtabname: null,
    msdyn_customtabwebresource: null,
    msdyn_saavailablecolor: '00A300',
    msdyn_saunavailablecolor: 'C8C8C8',
    msdyn_sapartiallyavailablecolor: 'F0C030',
    msdyn_bookbasedon: true,
    msdyn_saavailableicondefault: true,
    msdyn_saavailableicon: 'msdyn_/fps/ScheduleBoard/css/images/StatusIcons/Availability/Available.png',
    msdyn_saunavailableicondefault: true,
    msdyn_saunavailableicon: null,
    msdyn_sapartiallyavailableicondefault: true,
    msdyn_sapartiallyavailableicon: null,
    msdyn_fullybookedcolor: '0D62AA',
    msdyn_notbookedcolor: 'FFFFFF',
    msdyn_workinghourscolor: 'F0F0F0',
    msdyn_overbookedcolor: 'D9534F',
    msdyn_partiallybookedcolor: '8FC1E8',
    msdyn_unscheduledwopagereccount: 50,
    msdyn_scheduleralertsview: V.alerts,
    msdyn_hidecancelled: false,
    msdyn_issynchronizeresources: false,
    msdyn_mapviewtabplacement: true,
    msdyn_ispublic: false,
    ...overrides,
  }
}

export function createMockBoards(): Board[] {
  const boards: Omit<Board, 'lookups'>[] = [
    {
      id: 'dd3e0b8d-5dd9-4546-b081-bbf5ac4a0fb9',
      name: 'Default',
      shareType: SHARE_TYPE.system,
      active: true,
      order: 0,
      ownerName: 'SYSTEM',
      ownerId: null,
      modifiedOn: '2025-11-19T09:32:00Z',
      version: 1001,
      content: {
        columns: columns({ msdyn_tabname: 'Default', msdyn_sharetype: SHARE_TYPE.system }),
        lookups: { msdyn_filterlayout: C.defaultFilter, msdyn_resourcecelltemplate: C.cellTemplate, msdyn_retrieveresourcesquery: C.defaultQuery },
        settings: settings({ start: 8, end: 17, weekend: false, panels: [] }),
        filterValues: null,
      },
      lookupNames: EMPTY_LOOKUP_NAMES,
    },
    {
      id: '94b98d9e-0000-4000-8000-000000000001',
      name: 'Initial public view',
      shareType: SHARE_TYPE.justMe,
      active: true,
      order: 0,
      ownerName: 'SYSTEM',
      ownerId: null,
      modifiedOn: '2024-09-03T13:54:00Z',
      version: 1002,
      content: {
        columns: { msdyn_tabname: 'Initial public view', msdyn_sharetype: SHARE_TYPE.justMe, msdyn_ordernumber: 0, msdyn_unscheduledwopagereccount: 50, msdyn_bookbasedon: true },
        lookups: { msdyn_filterlayout: null, msdyn_resourcecelltemplate: null, msdyn_retrieveresourcesquery: null },
        settings: null,
        filterValues: null,
      },
      lookupNames: EMPTY_LOOKUP_NAMES,
    },
    {
      id: '9acb2284-0000-4000-8000-000000000002',
      name: 'Disposition Nord',
      shareType: SHARE_TYPE.everyone,
      active: true,
      order: 1,
      ownerName: 'Mara Lindqvist',
      ownerId: 'b0000000-0000-4000-8000-000000000001',
      modifiedOn: '2026-03-11T10:49:00Z',
      version: 1003,
      content: {
        columns: columns({ msdyn_tabname: 'Disposition Nord', msdyn_ordernumber: 1 }),
        lookups: { msdyn_filterlayout: C.proFilter, msdyn_resourcecelltemplate: C.crewCell, msdyn_retrieveresourcesquery: C.proQuery },
        settings: settings({
          start: 6,
          end: 19,
          weekend: true,
          hideCancelled: true,
          panels: [
            { Title: 'Offene Anforderungen Projekt', UnscheduledView: V.reqOpen },
            { Title: 'Offene Anforderungen Montage', UnscheduledView: V.reqInstall },
            { Title: 'Offene Anforderungen Service', UnscheduledView: V.reqService },
          ],
        }),
        filterValues: JSON.stringify({ Territories: [ufx(R.regionNord, 'territory')], ResourceTypes: [3] }),
      },
      lookupNames: EMPTY_LOOKUP_NAMES,
    },
    {
      id: '4563578b-0000-4000-8000-000000000003',
      name: 'Disposition Süd',
      shareType: SHARE_TYPE.justMe,
      active: true,
      order: 2,
      ownerName: 'Jonas Feldmann',
      ownerId: 'b0000000-0000-4000-8000-000000000002',
      modifiedOn: '2026-09-21T11:58:00Z',
      version: 1004,
      content: {
        columns: columns({ msdyn_tabname: 'Disposition Süd', msdyn_sharetype: SHARE_TYPE.justMe, msdyn_ordernumber: 2, msdyn_notbookedcolor: 'FFFFFF' }),
        lookups: { msdyn_filterlayout: C.proFilter, msdyn_resourcecelltemplate: C.cellTemplate, msdyn_retrieveresourcesquery: C.proQuery },
        settings: settings({
          start: 7,
          end: 18,
          weekend: false,
          rowHeight: 64,
          panels: [
            { Title: 'Offene Anforderungen Projekt', UnscheduledView: V.reqOpen },
            { Title: 'Offene Anforderungen Service', UnscheduledView: V.reqService },
          ],
        }),
        filterValues: JSON.stringify({ Territories: [ufx(R.regionSued, 'territory')], BusinessUnits: [ufx(R.buService, 'businessunit')], ResourceTypes: [3] }),
      },
      lookupNames: EMPTY_LOOKUP_NAMES,
    },
    {
      id: 'c20e049d-0000-4000-8000-000000000004',
      name: 'Montage Großprojekte',
      shareType: SHARE_TYPE.specificPeople,
      active: true,
      order: 3,
      ownerName: 'Mara Lindqvist',
      ownerId: 'b0000000-0000-4000-8000-000000000001',
      modifiedOn: '2026-09-21T11:54:00Z',
      version: 1005,
      content: {
        columns: columns({ msdyn_tabname: 'Montage Großprojekte', msdyn_sharetype: SHARE_TYPE.specificPeople, msdyn_ordernumber: 3 }),
        lookups: { msdyn_filterlayout: C.proFilter, msdyn_resourcecelltemplate: C.cellTemplate, msdyn_retrieveresourcesquery: C.defaultQuery },
        settings: settings({ start: 6, end: 20, weekend: true, panels: [{ Title: 'Montage', UnscheduledView: V.reqInstall }] }),
        filterValues: null,
      },
      lookupNames: EMPTY_LOOKUP_NAMES,
    },
    {
      id: 'abee6d31-0000-4000-8000-000000000005',
      name: 'Agrar (alt)',
      shareType: SHARE_TYPE.justMe,
      active: false,
      order: 4,
      ownerName: 'SYSTEM',
      ownerId: null,
      modifiedOn: '2025-03-10T17:25:00Z',
      version: 1006,
      content: {
        columns: columns({ msdyn_tabname: 'Agrar (alt)', msdyn_sharetype: SHARE_TYPE.justMe, msdyn_ordernumber: 4 }),
        lookups: { msdyn_filterlayout: C.proFilter, msdyn_resourcecelltemplate: C.cellTemplate, msdyn_retrieveresourcesquery: C.proQuery },
        settings: settings({ start: 6, end: 19, weekend: true, panels: [{ Title: 'Agrar', UnscheduledView: V.myReq }] }),
        filterValues: null,
      },
      lookupNames: EMPTY_LOOKUP_NAMES,
    },
  ]
  return boards.map((b) => ({ ...b, lookups: { ...b.content.lookups } }))
}

export const MOCK_CONFIGS: ConfigRef[] = [
  { id: C.defaultFilter, name: 'Default Filter Layout', type: CONFIG_TYPE.filterLayout },
  { id: C.proFilter, name: 'Custom Filter Layout pro', type: CONFIG_TYPE.filterLayout },
  { id: C.cellTemplate, name: 'Default Resource Cell Template', type: CONFIG_TYPE.resourceCellTemplate },
  { id: C.crewCell, name: 'Custom Resource Cell Template pro (Crew)', type: CONFIG_TYPE.resourceCellTemplate },
  { id: C.defaultQuery, name: 'Default Retrieve Resources Query', type: CONFIG_TYPE.retrieveResourcesQuery },
  { id: C.proQuery, name: 'Custom Retrieve Resources Query pro', type: CONFIG_TYPE.retrieveResourcesQuery },
  { id: C.saFilter, name: 'Default Schedule Assistant Filter Layout', type: CONFIG_TYPE.saFilterLayout },
]

export const MOCK_VIEWS: ViewRef[] = [
  { id: V.bookingTooltip, name: 'Buchungs-Tooltip', entity: 'bookableresourcebooking', kind: 'system' },
  { id: V.bookingDetails, name: 'Buchungsdetails', entity: 'bookableresourcebooking', kind: 'system' },
  { id: V.bookingCompact, name: 'Buchung kompakt', entity: 'bookableresourcebooking', kind: 'system' },
  { id: V.reqOpen, name: 'Offene Anforderungen', entity: 'msdyn_resourcerequirement', kind: 'system' },
  { id: V.reqInstall, name: 'Offene Anforderungen Montage', entity: 'msdyn_resourcerequirement', kind: 'system' },
  { id: V.reqService, name: 'Offene Anforderungen Service', entity: 'msdyn_resourcerequirement', kind: 'system' },
  { id: V.reqDetails, name: 'Anforderungsdetails', entity: 'msdyn_resourcerequirement', kind: 'system' },
  { id: V.myReq, name: 'Meine Anforderungen', entity: 'msdyn_resourcerequirement', kind: 'personal' },
  { id: V.resTooltip, name: 'Ressourcen-Tooltip', entity: 'bookableresource', kind: 'system' },
  { id: V.resDetails, name: 'Ressourcendetails', entity: 'bookableresource', kind: 'system' },
  { id: V.ouTooltip, name: 'Org.-Einheit-Tooltip', entity: 'msdyn_organizationalunit', kind: 'system' },
  { id: V.alerts, name: 'Aktive Buchungswarnungen', entity: 'msdyn_bookingalert', kind: 'system' },
]

export const MOCK_BOOKING_SETUPS: BookingSetupRef[] = [
  { id: BS_NONE, entity: 'none' },
  { id: BS_APPOINTMENT, entity: 'appointment' },
  { id: BS_WORKORDER, entity: 'msdyn_workorder' },
  { id: BS_PROJECT, entity: 'msdyn_project' },
]

export const MOCK_TIME_ZONES: TimeZoneRef[] = [
  { id: TZ_BERLIN, name: '(GMT+01:00) Amsterdam, Berlin, Bern, Rom, Stockholm, Wien' },
  { id: 'a0000000-0000-4000-8000-000000000002', name: '(GMT+00:00) Dublin, Edinburgh, Lissabon, London' },
  { id: 'a0000000-0000-4000-8000-000000000003', name: '(GMT-05:00) Eastern Time (USA & Kanada)' },
]

export const MOCK_RECORDS: { id: string; entity: string; name: string }[] = [
  { id: R.regionNord, entity: 'territory', name: 'Region Nord' },
  { id: R.regionSued, entity: 'territory', name: 'Region Süd' },
  { id: R.buService, entity: 'businessunit', name: 'Service' },
]

export const MOCK_PRINCIPALS: PrincipalRef[] = [
  { id: 'b0000000-0000-4000-8000-000000000001', type: 'user', name: 'Mara Lindqvist', detail: 'mara.lindqvist@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000002', type: 'user', name: 'Jonas Feldmann', detail: 'jonas.feldmann@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000003', type: 'user', name: 'Aylin Demir', detail: 'aylin.demir@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000004', type: 'user', name: 'Per Andersen', detail: 'per.andersen@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000005', type: 'user', name: 'Jörg Albrecht', detail: 'joerg.albrecht@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000006', type: 'user', name: 'Jörn Brandt', detail: 'joern.brandt@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000007', type: 'user', name: 'Björn Ostermann', detail: 'bjoern.ostermann@contoso.example' },
  { id: 'b0000000-0000-4000-8000-000000000008', type: 'user', name: 'Brandt, Jörn (extern)', detail: 'ext.brandt@contoso.example' },
  { id: 'c0000000-0000-4000-8000-000000000001', type: 'team', name: 'Disposition Nord', detail: 'Team' },
  { id: 'c0000000-0000-4000-8000-000000000002', type: 'team', name: 'Montageleitung', detail: 'Team' },
  // Access teams can be shared with but cannot own records.
  { id: 'c0000000-0000-4000-8000-000000000003', type: 'team', name: 'Montage Zugriff', detail: 'Zugriffsteam' },
]

/** Initial shares: the "specific people" sample board is shared with two principals. */
export function createMockShares(): Map<string, { principalId: string; mask: number }[]> {
  return new Map([
    [
      'c20e049d-0000-4000-8000-000000000004',
      [
        { principalId: 'b0000000-0000-4000-8000-000000000003', mask: 1 },
        { principalId: 'c0000000-0000-4000-8000-000000000002', mask: 3 },
      ],
    ],
  ])
}

const DEFAULT_FILTER_LAYOUT = `<?xml version="1.0" encoding="utf-8" ?>
<filter>
  <controls>
    <control type="characteristic" key="Characteristics" label-id="ScheduleAssistant.West.Skills" />
    <control type="combo" source="entity" key="Roles" inactive-state="1" label-id="ScheduleAssistant.West.Roles" entity="bookableresourcecategory" multi="true" />
    <control type="combo" source="optionset" key="ResourceTypes" label-id="SB_FilterPanel_ResourceTypesFilter_Title" entity="bookableresource" attribute="resourcetype" multi="true" />
    <control type="combo" source="entity" key="BusinessUnits" label-id="SB_FilterPanel_BusinessUnitsFilter_Title" entity="businessunit" multi="true" />
    <control type="order" key="Orders" label-id="FilterControl_OrderLabel">
      <order name="name" entity="bookableresource" attribute="name" />
    </control>
  </controls>
</filter>`

const PRO_FILTER_LAYOUT = `<filter>
  <controls>
    <control type="combo" source="entity" key="Site" label-id="Niederlassung" entity="pro_site" multi="true" />
    <control type="combo" source="entity" key="PlanningTeam" label-id="Planungsteam" entity="pro_planningteam" multi="true" />
    <control type="combo" source="entity" key="Roles" inactive-state="1" label-id="ScheduleAssistant.West.Roles" entity="bookableresourcecategory" multi="true" />
    <control type="combo" source="optionset" key="ResourceTypes" label-id="SB_FilterPanel_ResourceTypesFilter_Title" entity="bookableresource" attribute="resourcetype" multi="true">
      <data>
          <value id="2" />
          <value id="3" />
        </data>
      </control>
    <control type="characteristic" key="Characteristics" label-id="ScheduleAssistant.West.Skills" />
    <control type="combo" source="optionset" key="WorkerType" label-id="Worker Type" entity="bookableresource" attribute="msdyn_workertype" multi="false" />
    <control type="combo" source="entity" key="Region" label-id="Region" entity="pro_region" multi="true" />
    <control type="order" key="Orders" label-id="FilterControl_OrderLabel">
      <order name="name" entity="bookableresource" attribute="name" />
    </control>
  </controls>
</filter>`

/** Column each key filters on in the sample queries (bookableresource unless linked). */
const KEY_COLUMN: Record<string, string> = {
  Site: 'pro_site_ref',
  WorkerType: 'msdyn_workertype',
  ResourceTypes: 'resourcetype',
  MustChooseFromResources: 'bookableresourceid',
  RestrictedResources: 'bookableresourceid',
  OrganizationalUnits: 'msdyn_organizationalunit',
  Shift: 'pro_shift',
}

/**
 * Crew membership in the board's date range — the MS Learn sample "Add crew
 * information to resource cells", feeding `crewname`/`crewcount` and the
 * bag flags `singleCrew`/`multipleCrews` to the cell template.
 */
const CREW_LINKS =
  `<link-entity name="bookableresourcegroup" from="childresource" to="bookableresourceid" alias="bgcount" link-type="outer">` +
  `<attribute name="name" aggregate="countcolumn" alias="crewcount" />` +
  `<filter type="and"><condition attribute="fromdate" operator="le"><ufx:value select="$input/ScheduleBoard/EndDate" attribute="value" /></condition>` +
  `<condition attribute="todate" operator="ge"><ufx:value select="$input/ScheduleBoard/StartDate" attribute="value" /></condition></filter>` +
  `</link-entity>` +
  `<link-entity name="bookableresourcegroup" from="childresource" to="bookableresourceid" alias="bg" link-type="outer">` +
  `<link-entity name="bookableresource" from="bookableresourceid" to="parentresource" alias="parentresource" link-type="outer">` +
  `<attribute name="name" alias="crewname" groupby="true" /></link-entity></link-entity>`

const CREW_BAG = `<bag><multipleCrews ufx:select="crewcount > 1" /><singleCrew ufx:select="crewcount = 1" /></bag>`

const query = (keys: string[], crew = false) =>
  `<fetch mapping="logical"><entity name="bookableresource">` +
  `<attribute name="name" /><attribute name="bookableresourceid" />` +
  `<filter type="and">` +
  keys
    .filter((k) => KEY_COLUMN[k])
    .map(
      (k) =>
        `<condition ufx:if="$input/${k}/bag" attribute="${KEY_COLUMN[k]}" operator="${k === 'RestrictedResources' ? 'not-in' : 'in'}">` +
        `<ufx:apply select="$input/${k}/bag"><value><ufx:value select="@ufx-id" /></value></ufx:apply></condition>`,
    )
    .join('') +
  `</filter>` +
  (keys.includes('PlanningTeam')
    ? `<link-entity name="pro_planningteammember" from="pro_resource_ref" to="bookableresourceid" ufx:if="$input/PlanningTeam/bag">` +
      `<filter><condition attribute="pro_planningteam_ref" operator="in"><ufx:apply select="$input/PlanningTeam/bag"><value><ufx:value select="@ufx-id" /></value></ufx:apply></condition></filter></link-entity>`
    : '') +
  keys
    .filter((k) => !KEY_COLUMN[k] && k !== 'PlanningTeam')
    .map((k) => `<!-- ${k} --><filter ufx:if="$input/${k}" />`)
    .join('') +
  (crew ? CREW_LINKS : '') +
  `</entity>` +
  (crew ? CREW_BAG : '') +
  `</fetch>`

/** The MS crew sample built on the starter cell template. */
const CREW_CELL_TEMPLATE = STARTER_CELL_TEMPLATE.replace(
  "<div class='resource-name primary-text ellipsis' title='{{name}}'>{{name}}</div>",
  `<div class='resource-name primary-text ellipsis' title='{{name}}'>{{name}}</div>
    <!-- Crew-Information -->
    {{#if singleCrew}}
    <div class='resource-name primary-text ellipsis' title='{{crewname}}' style="color:blue"><i class="fa fa-users"></i> {{crewname}}</div>
    {{/if}}
    {{#if multipleCrews}}
    <div class='resource-name primary-text ellipsis' title='{{crewcount}}' style="color:blue"><i class="fa fa-users"></i> In {{crewcount}} Crews</div>
    {{/if}}`,
)

/** Payloads for the configuration rows above (filter layouts and queries). */
export function createMockConfigDetails(): ConfigDetail[] {
  const value: Record<string, string> = {
    [C.defaultFilter]: DEFAULT_FILTER_LAYOUT,
    [C.proFilter]: PRO_FILTER_LAYOUT,
    [C.cellTemplate]: STARTER_CELL_TEMPLATE,
    [C.crewCell]: CREW_CELL_TEMPLATE,
    [C.defaultQuery]: query(['Characteristics', 'Roles', 'ResourceTypes', 'BusinessUnits', 'Orders']),
    // "Region" is deliberately missing — the editor warns about it.
    [C.proQuery]: query([
      'Site',
      'PlanningTeam',
      'Characteristics',
      'Roles',
      'ResourceTypes',
      'WorkerType',
      'BusinessUnits',
      'Orders',
      'MustChooseFromResources',
      'RestrictedResources',
      'OrganizationalUnits',
      'Shift',
      'DisplayOnScheduleBoard',
    ], true),
  }
  return MOCK_CONFIGS.map((c) => ({ ...c, value: value[c.id] ?? '', version: 1 }))
}

const col = (logicalName: string, displayName: string, kind: ColumnMeta['kind'] = 'other', target?: string): ColumnMeta => ({
  logicalName,
  displayName,
  kind,
  target,
})

const rel = (schemaName: string, attribute: string, target: string): RelationshipMeta => ({ schemaName, attribute, target })

/** Fictional metadata for the picker — standard tables plus invented `pro_` ones. */
export const MOCK_TABLES: TableInfo[] = [
  {
    logicalName: 'bookableresource',
    displayName: 'Buchbare Ressource',
    columns: [
      col('bookableresourceid', 'Buchbare Ressource'),
      col('name', 'Name'),
      col('resourcetype', 'Ressourcentyp', 'picklist'),
      col('msdyn_workertype', 'Worker Type', 'picklist'),
      col('pro_shift', 'Schicht', 'picklist'),
      col('pro_site_ref', 'Niederlassung', 'lookup', 'pro_site'),
      col('msdyn_organizationalunit', 'Organisationseinheit', 'lookup', 'msdyn_organizationalunit'),
      col('userid', 'Benutzer', 'lookup', 'systemuser'),
      col('timezone', 'Zeitzone'),
      col('msdyn_primaryemail', 'Primäre E-Mail'),
    ],
    relationships: [
      rel('msdyn_msdyn_organizationalunit_bookableresource_organizationalunit', 'msdyn_organizationalunit', 'msdyn_organizationalunit'),
      rel('pro_pro_site_bookableresource_site_ref', 'pro_site_ref', 'pro_site'),
      rel('systemuser_bookableresource_UserId', 'userid', 'systemuser'),
    ],
  },
  {
    logicalName: 'bookableresourcebooking',
    displayName: 'Buchung einer buchbaren Ressource',
    columns: [
      col('name', 'Name'),
      col('starttime', 'Startzeit'),
      col('endtime', 'Endzeit'),
      col('duration', 'Dauer'),
      col('msdyn_estimatedtravelduration', 'Geschätzte Reisedauer'),
      col('msdyn_estimatedarrivaltime', 'Geschätzte Ankunftszeit'),
      col('bookingstatus', 'Buchungsstatus', 'lookup', 'bookingstatus'),
      col('resource', 'Ressource', 'lookup', 'bookableresource'),
      col('msdyn_workorder', 'Arbeitsauftrag', 'lookup', 'msdyn_workorder'),
      col('msdyn_resourcerequirement', 'Ressourcenanforderung', 'lookup', 'msdyn_resourcerequirement'),
      col('ownerid', 'Besitzer', 'lookup', 'systemuser'),
    ],
    relationships: [
      rel('bookableresource_bookableresourcebooking_Resource', 'resource', 'bookableresource'),
      rel('bookingstatus_bookableresourcebooking_BookingStatus', 'bookingstatus', 'bookingstatus'),
      rel('msdyn_msdyn_resourcerequirement_bookableresourcebooking_ResourceRequirement', 'msdyn_resourcerequirement', 'msdyn_resourcerequirement'),
      rel('msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder', 'msdyn_workorder', 'msdyn_workorder'),
    ],
  },
  {
    logicalName: 'msdyn_workorder',
    displayName: 'Arbeitsauftrag',
    columns: [
      col('msdyn_name', 'Arbeitsauftragsnummer'),
      col('msdyn_serviceaccount', 'Dienstkonto', 'lookup', 'account'),
      col('msdyn_primaryincidenttype', 'Primärer Vorfalltyp', 'lookup', 'msdyn_incidenttype'),
      col('msdyn_workordertype', 'Arbeitsauftragstyp'),
      col('msdyn_systemstatus', 'Systemstatus', 'picklist'),
      col('msdyn_instructions', 'Anweisungen'),
      col('msdyn_address1', 'Straße 1'),
      col('msdyn_postalcode', 'Postleitzahl'),
      col('msdyn_city', 'Ort'),
    ],
    relationships: [
      rel('msdyn_account_msdyn_workorder_ServiceAccount', 'msdyn_serviceaccount', 'account'),
      rel('msdyn_msdyn_incidenttype_msdyn_workorder_PrimaryIncidentType', 'msdyn_primaryincidenttype', 'msdyn_incidenttype'),
    ],
  },
  {
    logicalName: 'account',
    displayName: 'Firma',
    columns: [col('name', 'Firmenname'), col('address1_city', 'Ort'), col('telephone1', 'Telefon'), col('emailaddress1', 'E-Mail')],
    relationships: [],
  },
  { logicalName: 'msdyn_incidenttype', displayName: 'Vorfalltyp', columns: [col('msdyn_name', 'Name')], relationships: [] },
  { logicalName: 'bookingstatus', displayName: 'Buchungsstatus', columns: [col('name', 'Name'), col('status', 'Status', 'picklist')], relationships: [] },
  {
    logicalName: 'msdyn_resourcerequirement',
    displayName: 'Ressourcenanforderung',
    columns: [
      col('msdyn_name', 'Name'),
      col('msdyn_fromdate', 'Von'),
      col('msdyn_todate', 'Bis'),
      col('msdyn_duration', 'Dauer'),
      col('msdyn_effort', 'Aufwand'),
      col('msdyn_city', 'Ort'),
      col('msdyn_workorder', 'Arbeitsauftrag', 'lookup', 'msdyn_workorder'),
      col('msdyn_organizationalunit', 'Organisationseinheit', 'lookup', 'msdyn_organizationalunit'),
    ],
    relationships: [rel('msdyn_msdyn_workorder_msdyn_resourcerequirement_WorkOrder', 'msdyn_workorder', 'msdyn_workorder')],
  },
  {
    logicalName: 'msdyn_bookingalert',
    displayName: 'Buchungswarnung',
    columns: [col('subject', 'Betreff'), col('description', 'Beschreibung'), col('msdyn_time', 'Zeit')],
    relationships: [],
  },
  {
    logicalName: 'msdyn_bookingalertstatus',
    displayName: 'Status der Buchungswarnung',
    columns: [col('msdyn_name', 'Name'), col('msdyn_nexttimetoshow', 'Nächste Anzeige'), col('msdyn_bookingalert', 'Buchungswarnung', 'lookup', 'msdyn_bookingalert')],
    relationships: [rel('msdyn_msdyn_bookingalert_msdyn_bookingalertstatus_BookingAlert', 'msdyn_bookingalert', 'msdyn_bookingalert')],
  },
  {
    logicalName: 'pro_planningteammember',
    displayName: 'Planungsteam-Mitglied',
    columns: [col('pro_planningteam_ref', 'Planungsteam', 'lookup', 'pro_planningteam'), col('pro_resource_ref', 'Ressource', 'lookup', 'bookableresource')],
    isCustom: true,
  },
  { logicalName: 'pro_site', displayName: 'Niederlassung', columns: [col('pro_name', 'Name')], isCustom: true },
  { logicalName: 'pro_planningteam', displayName: 'Planungsteam', columns: [col('pro_name', 'Name')], isCustom: true },
  { logicalName: 'pro_region', displayName: 'Region', columns: [col('pro_name', 'Name')], isCustom: true },
  { logicalName: 'bookableresourcecategory', displayName: 'Ressourcenrolle', columns: [col('name', 'Name')] },
  {
    logicalName: 'msdyn_organizationalunit',
    displayName: 'Organisationseinheit',
    columns: [col('msdyn_name', 'Name'), col('msdyn_description', 'Beschreibung'), col('msdyn_latitude', 'Breitengrad'), col('msdyn_longitude', 'Längengrad')],
  },
  { logicalName: 'businessunit', displayName: 'Unternehmenseinheit', columns: [col('name', 'Name')] },
  { logicalName: 'team', displayName: 'Team', columns: [col('name', 'Name'), col('teamtype', 'Teamtyp', 'picklist')] },
  { logicalName: 'territory', displayName: 'Gebiet', columns: [col('name', 'Name')] },
  { logicalName: 'systemuser', displayName: 'Benutzer', columns: [col('fullname', 'Vollständiger Name')] },
]

// ---------------------------------------------------------------------------
// View layouts (tooltip/details preview)
// ---------------------------------------------------------------------------

const layout = (entity: string, cells: string[], links: { alias: string; name: string }[] = []) => ({
  layoutXml:
    `<grid name="resultset" object="0" jump="name" select="1" icon="1" preview="1"><row name="result" id="${entity}id">` +
    cells.map((c) => `<cell name="${c}" width="150" />`).join('') +
    `</row></grid>`,
  fetchXml:
    `<fetch version="1.0" mapping="logical"><entity name="${entity}">` +
    cells.filter((c) => !c.includes('.')).map((c) => `<attribute name="${c}" />`).join('') +
    links
      .map(
        (l) =>
          `<link-entity name="${l.name}" from="${l.name}id" to="${l.name}" alias="${l.alias}" link-type="outer">` +
          cells
            .filter((c) => c.startsWith(`${l.alias}.`))
            .map((c) => `<attribute name="${c.slice(l.alias.length + 1)}" />`)
            .join('') +
          `</link-entity>`,
      )
      .join('') +
    `</entity></fetch>`,
})

const WO_LINK = { alias: 'a_7f3e', name: 'msdyn_workorder' }

const VIEW_LAYOUTS: Record<string, { layoutXml: string; fetchXml: string }> = {
  [V.bookingTooltip]: layout('bookableresourcebooking', ['name', 'starttime', 'endtime', 'duration', 'bookingstatus', 'resource', 'a_7f3e.msdyn_serviceaccount'], [WO_LINK]),
  [V.bookingDetails]: layout(
    'bookableresourcebooking',
    ['name', 'bookingstatus', 'starttime', 'endtime', 'duration', 'msdyn_estimatedtravelduration', 'resource', 'msdyn_workorder', 'a_7f3e.msdyn_primaryincidenttype', 'a_7f3e.msdyn_instructions'],
    [WO_LINK],
  ),
  [V.bookingCompact]: layout('bookableresourcebooking', ['name', 'starttime', 'bookingstatus']),
  [V.reqOpen]: layout('msdyn_resourcerequirement', ['msdyn_name', 'msdyn_fromdate', 'msdyn_todate', 'msdyn_duration', 'msdyn_workorder', 'msdyn_city']),
  [V.reqInstall]: layout('msdyn_resourcerequirement', ['msdyn_name', 'msdyn_fromdate', 'msdyn_duration', 'msdyn_organizationalunit']),
  [V.reqService]: layout('msdyn_resourcerequirement', ['msdyn_name', 'msdyn_fromdate', 'msdyn_duration', 'msdyn_city']),
  [V.reqDetails]: layout('msdyn_resourcerequirement', ['msdyn_name', 'msdyn_workorder', 'msdyn_fromdate', 'msdyn_todate', 'msdyn_duration', 'msdyn_effort', 'msdyn_organizationalunit', 'msdyn_city']),
  [V.myReq]: layout('msdyn_resourcerequirement', ['msdyn_name', 'msdyn_fromdate']),
  [V.resTooltip]: layout('bookableresource', ['name', 'resourcetype', 'msdyn_organizationalunit', 'pro_site_ref']),
  [V.resDetails]: layout('bookableresource', ['name', 'resourcetype', 'msdyn_organizationalunit', 'userid', 'msdyn_primaryemail', 'timezone']),
  [V.ouTooltip]: layout('msdyn_organizationalunit', ['msdyn_name', 'msdyn_description']),
  [V.alerts]: layout('msdyn_bookingalert', ['subject', 'msdyn_time', 'description']),
}

export function mockViewDefinition(id: string): ViewDefinition | null {
  const view = MOCK_VIEWS.find((v) => v.id.toLowerCase() === id.toLowerCase())
  const def = view ? VIEW_LAYOUTS[view.id] : undefined
  return view && def ? { ...view, ...def } : null
}
