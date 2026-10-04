import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Avatar,
    Badge,
    Body1,
    Body1Strong,
    Button,
    Caption1,
    createTableColumn,
    DataGrid,
    DataGridBody,
    DataGridCell,
    DataGridHeader,
    DataGridHeaderCell,
    DataGridRow,
    Dropdown,
    Field,
    Input,
    Link,
    makeStyles,
    mergeClasses,
    MessageBar,
    MessageBarActions,
    MessageBarBody,
    Option,
    SearchBox,
    shorthands,
    Spinner,
    Subtitle1,
    Subtitle2,
    Switch,
    Tab,
    TableCellLayout,
    TabList,
    Text,
    Title3,
    tokens,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import {
    AddRegular,
    ArrowClockwiseRegular,
    BriefcaseRegular,
    BuildingRegular,
    CalendarLtrRegular,
    CallRegular,
    CheckmarkRegular,
    ClipboardTaskRegular,
    DatabaseRegular,
    DismissRegular,
    GlobeRegular,
    LocationRegular,
    MailRegular,
    MoneyRegular,
    OpenRegular,
    OrganizationRegular,
    PeopleRegular,
    PersonCircleRegular,
    PersonRegular,
    SaveRegular,
    StarFilled,
    WarningRegular,
} from "@fluentui/react-icons";
import type { GeneratedComponentProps } from "./RuntimeTypes";

/* -------------------------------------------------------------------------
 * Domain model
 *
 * "Account 360" lives in the Accounts App of the ASC SFA CS Playground and
 * shows one account with everything that hangs off it:
 *
 *   Overview (left, loaded once)
 *     account            — all accounts, client-side search and filters
 *     task               — open tasks regarding an account, counted per account
 *
 *   Detail (right, loaded per selected account, cached per account id)
 *     account            — master data (retrieveRow)
 *     task               — all tasks regarding the account
 *     contact            — active contacts whose parent customer is the account
 *     pro_customaddress  — custom addresses (lookup pro_account)
 *     pro_elasticdemo    — elastic demo rows (lookup pro_account)
 *
 *   Writes
 *     task               — create (regarding = account), complete (state 1 / status 5)
 *     pro_customaddress  — create (pro_account = account)
 *
 * Two modes:
 *   Page      — opened from the sitemap: account list left, detail right.
 *   Embedded  — on an account form (form designer › Components › Generative
 *               page): the form passes the record as pageInput.recordId; the
 *               page shows KPIs and tabs for that account only, no list.
 *               Optional static input `data.tab` picks the first tab.
 *
 * Column names come from RuntimeTypes.ts, generated against the playground.
 * `_ownerid_value`, `modifiedon` and `createdon` are system columns on the
 * TableRow base, not listed in the per-table types.
 *
 * The environment only has en-US enabled; the UI is German on purpose.
 * Priority and task state are OOB codes and get German labels here; every
 * other choice label (industry, …) comes from the server as FormattedValue.
 * ---------------------------------------------------------------------- */

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/** task.statecode / task.statuscode — "Completed" is state 1 with status 5. */
const TASK_STATE_OPEN = 0;
const TASK_STATE_COMPLETED = 1;
const TASK_STATE_CANCELED = 2;
const TASK_STATUS_COMPLETED = 5;

/** task.prioritycode */
const PRIORITY_LOW = 0;
const PRIORITY_NORMAL = 1;
const PRIORITY_HIGH = 2;

/** statecode 1 is "Inactive" on account, contact and pro_customaddress. */
const STATE_INACTIVE = 1;

const PAGE_SIZE = 250;
const MAX_ACCOUNTS = 1000;
const MAX_OPEN_TASKS = 2000;
const MAX_RELATED = 500;

const ACCOUNT_DETAIL_COLUMNS = [
    "accountid",
    "name",
    "accountnumber",
    "telephone1",
    "emailaddress1",
    "websiteurl",
    "address1_line1",
    "address1_postalcode",
    "address1_city",
    "address1_country",
    "industrycode",
    "revenue",
    "numberofemployees",
    "description",
    "statecode",
    "modifiedon",
    "_primarycontactid_value",
    "_parentaccountid_value",
    "_ownerid_value",
];

const T = {
    title: "Account 360",
    subtitle: "Stammdaten, Kontakte, Aufgaben und Adressen eines Accounts auf einen Blick",
    refresh: "Aktualisieren",
    accounts: "Accounts",
    details: "Account-Details",
    masterData: "Stammdaten",
    search: "Accounts durchsuchen",
    searchPlaceholder: "Name, Nummer oder Ort",
    onlyMine: "Nur meine",
    showInactive: "Inaktive zeigen",
    inactive: "Inaktiv",
    loading: "Wird geladen …",
    loadingDetail: "Account wird geladen …",
    noAccounts: "Keine Accounts gefunden.",
    noAccountsFiltered: "Kein Account passt zu Suche oder Filter.",
    selectAccount: "Links einen Account auswählen.",
    embeddedUnsaved: "Account 360 erscheint, sobald der Account gespeichert ist.",
    embeddedWrongTable: (table: string) => `Account 360 ist für Accounts gedacht, nicht für „${table}“.`,
    truncated: `Es werden die ersten ${MAX_ACCOUNTS} Accounts angezeigt.`,
    errorLoad: "Die Accounts konnten nicht geladen werden.",
    errorDetail: "Der Account konnte nicht geladen werden.",
    partial: (tables: string) => `Nicht geladen: ${tables}. Der Rest der Seite ist vollständig.`,
    openForm: "Im Formular öffnen",
    open: "Öffnen",
    openRecord: (name: string) => `${name} öffnen`,
    unnamed: "(ohne Namen)",
    noSubject: "(ohne Betreff)",
    phone: "Telefon",
    email: "E-Mail",
    website: "Website",
    address: "Adresse",
    industry: "Branche",
    primaryContact: "Hauptkontakt",
    parentAccount: "Übergeordneter Account",
    owner: "Besitzer",
    revenue: "Jahresumsatz",
    employees: "Mitarbeiter",
    modifiedOn: "Geändert am",
    kpiContacts: "Kontakte",
    kpiOpenTasks: "Offene Aufgaben",
    kpiOverdue: "Überfällig",
    kpiAddresses: "Adressen",
    tabTasks: "Aufgaben",
    tabContacts: "Kontakte",
    tabAddresses: "Adressen",
    tabElastic: "Elastic Demo",
    showClosed: "Erledigte zeigen",
    newTask: "Neue Aufgabe",
    subject: "Betreff",
    dueOn: "Fällig am",
    priority: "Priorität",
    status: "Status",
    create: "Anlegen",
    cancel: "Abbrechen",
    complete: "Erledigt",
    completeTask: (subject: string) => `Aufgabe „${subject}“ als erledigt markieren`,
    taskCreated: "Aufgabe angelegt.",
    taskCompleted: (subject: string) => `„${subject}“ ist erledigt.`,
    taskCreateFailed: "Die Aufgabe konnte nicht angelegt werden:",
    taskCompleteFailed: "Die Aufgabe konnte nicht abgeschlossen werden:",
    noOpenTasks: "Keine offenen Aufgaben.",
    noTasks: "Keine Aufgaben.",
    stateOpen: "Offen",
    stateCompleted: "Erledigt",
    stateCanceled: "Abgebrochen",
    priorityLow: "Niedrig",
    priorityNormal: "Normal",
    priorityHigh: "Hoch",
    name: "Name",
    jobTitle: "Position",
    primaryBadge: "Hauptkontakt",
    noContacts: "Keine aktiven Kontakte.",
    newAddress: "Neue Adresse",
    addressName: "Bezeichnung",
    add: "Hinzufügen",
    addressCreated: "Adresse angelegt.",
    addressCreateFailed: "Die Adresse konnte nicht angelegt werden:",
    noAddresses: "Keine Custom Addresses.",
    noElastic: "Keine Elastic-Demo-Datensätze.",
    createdOn: "Angelegt am",
    dismiss: "Meldung schließen",
    tableTaskCounts: "Aufgaben-Zähler",
    tableTasks: "Aufgaben",
    tableContacts: "Kontakte",
    tableAddresses: "Custom Addresses",
    tableElastic: "Elastic Demo",
    openTasksBadge: (count: number) => `${count} offene Aufgaben`,
    overdueBadge: (count: number) => `${count} überfällig`,
};

const PRIORITY_OPTIONS: Array<[number, string]> = [
    [PRIORITY_LOW, T.priorityLow],
    [PRIORITY_NORMAL, T.priorityNormal],
    [PRIORITY_HIGH, T.priorityHigh],
];

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

type Row = Record<string, unknown>;

type AccountItem = {
    id: string;
    name: string;
    number: string;
    city: string;
    country: string;
    active: boolean;
    ownerId: string;
};

type TaskStats = { open: number; overdue: number };

type Overview = {
    accounts: AccountItem[];
    taskStats: Record<string, TaskStats>;
    failed: string[];
    truncated: boolean;
};

type AccountDetail = {
    id: string;
    name: string;
    number: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    industry: string;
    revenue: string;
    employees: string;
    primaryContactId: string;
    primaryContactName: string;
    parentId: string;
    parentName: string;
    ownerName: string;
    active: boolean;
    modifiedOn: string | null;
    description: string;
};

type TaskItem = {
    id: string;
    subject: string;
    dueOn: string | null;
    priority: number;
    state: number;
    open: boolean;
    overdue: boolean;
    ownerName: string;
    closedOn: string | null;
};

type ContactItem = {
    id: string;
    fullName: string;
    jobTitle: string;
    email: string;
    phone: string;
    isPrimary: boolean;
};

type SimpleItem = {
    id: string;
    name: string;
    createdOn: string | null;
    active: boolean;
};

type Detail = {
    account: AccountDetail;
    tasks: TaskItem[];
    contacts: ContactItem[];
    addresses: SimpleItem[];
    elastic: SimpleItem[];
    failed: string[];
};

type OverviewState = {
    overview: Overview;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
};

type DetailState = {
    accountId: string | null;
    detail: Detail | null;
    error: string | null;
    refreshing: boolean;
};

type TaskDraft = { subject: string; due: string; priority: number };

type EditMessage = { intent: "success" | "error"; text: string };

type EditState = {
    /** Key of the running write ("createTask", "createAddress", "task:<id>"), or null. */
    busy: string | null;
    message: EditMessage | null;
    taskDraft: TaskDraft | null;
    addressDraft: string;
};

type DetailTab = "tasks" | "contacts" | "addresses" | "elastic";

const DETAIL_TABS: DetailTab[] = ["tasks", "contacts", "addresses", "elastic"];

/**
 * Host input. The generated GeneratedComponentProps only declares dataApi;
 * the host still passes pageInput (record context on a form, data from
 * navigateTo or static form inputs).
 */
type PageInput = {
    entityName?: string;
    recordId?: string;
    data?: Record<string, unknown>;
};

type PageProps = GeneratedComponentProps & { pageInput?: PageInput };

type UserSettingsRow = {
    dateformatstring?: string | null;
    dateseparator?: string | null;
};

type DataPage = {
    rows?: unknown[];
    hasMoreRows?: boolean;
    loadMoreRows?: () => Promise<DataPage>;
};

type Collected = { rows: Row[]; truncated: boolean };

type Settled<T> = { ok: true; value: T } | { ok: false; reason: unknown };

/* -------------------------------------------------------------------------
 * Window cache (survives the host's double mount and module re-evaluation)
 * ---------------------------------------------------------------------- */

const winAny = window as unknown as Record<string, unknown>;
const OVERVIEW_CACHE = "__genpage_account360_overview_v1";
const OVERVIEW_INFLIGHT = "__genpage_account360_overview_inflight_v1";
const OVERVIEW_GEN = "__genpage_account360_overview_gen_v1";
const DETAIL_CACHE = "__genpage_account360_detail_v1";
const DETAIL_INFLIGHT = "__genpage_account360_detail_inflight_v1";
const DETAIL_GEN = "__genpage_account360_detail_gen_v1";
const SETTINGS_CACHE = "__genpage_account360_usersettings_v1";
const SETTINGS_INFLIGHT = "__genpage_account360_usersettings_inflight_v1";

const EMPTY_OVERVIEW: Overview = { accounts: [], taskStats: {}, failed: [], truncated: false };
const EMPTY_EDIT: EditState = { busy: null, message: null, taskDraft: null, addressDraft: "" };

function detailCache(): Map<string, Detail> {
    let cache = winAny[DETAIL_CACHE] as Map<string, Detail> | undefined;
    if (!cache) {
        cache = new Map();
        winAny[DETAIL_CACHE] = cache;
    }
    return cache;
}

function detailInflight(): Map<string, Promise<Detail>> {
    let inflight = winAny[DETAIL_INFLIGHT] as Map<string, Promise<Detail>> | undefined;
    if (!inflight) {
        inflight = new Map();
        winAny[DETAIL_INFLIGHT] = inflight;
    }
    return inflight;
}

function generation(key: string): number {
    const value = winAny[key];
    return typeof value === "number" ? value : 0;
}

/** Drops the overview; a load still in flight from before must not refill it. */
function invalidateOverview(): void {
    winAny[OVERVIEW_GEN] = generation(OVERVIEW_GEN) + 1;
    delete winAny[OVERVIEW_CACHE];
    delete winAny[OVERVIEW_INFLIGHT];
}

/** Drops one account's detail, or all of them when no id is given. */
function invalidateDetail(accountId?: string): void {
    winAny[DETAIL_GEN] = generation(DETAIL_GEN) + 1;
    if (accountId) {
        detailCache().delete(accountId);
        detailInflight().delete(accountId);
    } else {
        detailCache().clear();
        detailInflight().clear();
    }
}

/* -------------------------------------------------------------------------
 * Utilities (top-level functions, never nested)
 * ---------------------------------------------------------------------- */

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Lookup values arrive as bare GUIDs, with braces or as "/table(guid)" — keep only the GUID. */
function normalizeId(value: unknown): string {
    if (typeof value !== "string") return "";
    const match = GUID.exec(value);
    return match ? match[0].toLowerCase() : "";
}

function readString(row: Row, column: string): string {
    const value = row[column];
    return typeof value === "string" ? value : "";
}

function readNumber(row: Row, column: string): number | null {
    const value = row[column];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFormatted(row: Row, column: string): string {
    const value = row[`${column}${FORMATTED}`];
    return typeof value === "string" ? value : "";
}

function readDate(row: Row, column: string): string | null {
    const value = row[column];
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    return typeof value === "string" && value ? value : null;
}

function joinParts(parts: string[], separator: string): string {
    return parts.filter((part) => !!part).join(separator);
}

/**
 * Date-only values arrive as "yyyy-MM-dd"; parsing that with `new Date`
 * yields UTC midnight, which can shift the day in negative-offset zones.
 */
function parseDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(now: number): number {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

/** Overdue means due on a day before today — same rule as "My Day". */
function isPast(iso: string | null, now: number): boolean {
    const date = parseDate(iso);
    return !!date && date.getTime() < startOfToday(now);
}

/** Formats a date with the signed-in user's Dataverse format, never a hardcoded one. */
function formatDate(iso: string | null, settings: UserSettingsRow | null): string {
    const date = parseDate(iso);
    if (!date) return "—";
    const pattern = settings?.dateformatstring;
    const separator = settings?.dateseparator;
    if (typeof pattern !== "string" || typeof separator !== "string" || !pattern || !separator) {
        return date.toLocaleDateString();
    }
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return pattern
        .replace(/[/\-.]/g, separator)
        .replace(/yyyy|yy|MM|M|dd|d/g, (token: string) => {
            switch (token) {
                case "yyyy": return String(year);
                case "yy": return String(year).slice(-2);
                case "MM": return String(month).padStart(2, "0");
                case "M": return String(month);
                case "dd": return String(day).padStart(2, "0");
                case "d": return String(day);
                default: return token;
            }
        });
}

function formatDateTime(iso: string | null, settings: UserSettingsRow | null): string {
    if (!iso) return "—";
    const date = parseDate(iso);
    if (!date) return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDate(iso, settings);
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${formatDate(iso, settings)} ${time}`;
}

/**
 * "yyyy-MM-dd" from a date input → local noon. Noon keeps the calendar day
 * stable even if the user's Dataverse time zone differs from the browser's.
 */
function parseDateInput(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function normalizeUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function priorityLabel(priority: number): string {
    switch (priority) {
        case PRIORITY_LOW: return T.priorityLow;
        case PRIORITY_HIGH: return T.priorityHigh;
        default: return T.priorityNormal;
    }
}

function stateLabel(state: number): string {
    switch (state) {
        case TASK_STATE_COMPLETED: return T.stateCompleted;
        case TASK_STATE_CANCELED: return T.stateCanceled;
        default: return T.stateOpen;
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
        return (error as { message: string }).message;
    }
    return String(error);
}

/** Static form input `tab` (e.g. "contacts") picks the first tab; anything else falls back to tasks. */
function initialTab(pageInput: PageInput | undefined): DetailTab {
    const value = pageInput?.data?.tab;
    return typeof value === "string" && (DETAIL_TABS as string[]).includes(value) ? (value as DetailTab) : "tasks";
}

function currentUserId(): string {
    try {
        return typeof Xrm !== "undefined"
            ? normalizeId(Xrm.Utility?.getGlobalContext()?.userSettings?.userId)
            : "";
    } catch {
        return "";
    }
}

function openRecord(entityName: string, entityId: string): void {
    if (typeof Xrm === "undefined" || !Xrm.Navigation?.openForm) return;
    Xrm.Navigation.openForm({ entityName, entityId }).catch((navError: unknown) => {
        console.error("Record could not be opened", navError);
    });
}

/** Promise.allSettled without relying on the ES2020 lib being present in the host. */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
    return promise.then(
        (value): Settled<T> => ({ ok: true, value }),
        (reason: unknown): Settled<T> => ({ ok: false, reason }),
    );
}

function compareTasks(a: TaskItem, b: TaskItem): number {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (!a.open) return (b.closedOn ?? "").localeCompare(a.closedOn ?? "");
    if (!a.dueOn && !b.dueOn) return a.subject.localeCompare(b.subject);
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    return a.dueOn.localeCompare(b.dueOn);
}

/* -------------------------------------------------------------------------
 * Row mapping
 * ---------------------------------------------------------------------- */

function toAccountItem(row: Row): AccountItem | null {
    const id = normalizeId(row.accountid);
    if (!id) return null;
    return {
        id,
        name: readString(row, "name") || T.unnamed,
        number: readString(row, "accountnumber"),
        city: readString(row, "address1_city"),
        country: readString(row, "address1_country"),
        active: readNumber(row, "statecode") !== STATE_INACTIVE,
        ownerId: normalizeId(row._ownerid_value),
    };
}

/** Counts open tasks per account; tasks regarding anything but a loaded account are ignored. */
function toTaskStats(rows: Row[], accounts: AccountItem[], now: number): Record<string, TaskStats> {
    const accountIds = new Set(accounts.map((account) => account.id));
    const stats: Record<string, TaskStats> = {};
    rows.forEach((row) => {
        const accountId = normalizeId(row._regardingobjectid_value);
        if (!accountId || !accountIds.has(accountId)) return;
        const entry = stats[accountId] ?? (stats[accountId] = { open: 0, overdue: 0 });
        entry.open += 1;
        if (isPast(readDate(row, "scheduledend") ?? readDate(row, "scheduledstart"), now)) entry.overdue += 1;
    });
    return stats;
}

function toAccountDetail(row: Row, fallbackId: string): AccountDetail {
    const employees = readNumber(row, "numberofemployees");
    const cityLine = joinParts([readString(row, "address1_postalcode"), readString(row, "address1_city")], " ");
    return {
        id: normalizeId(row.accountid) || fallbackId,
        name: readString(row, "name") || T.unnamed,
        number: readString(row, "accountnumber"),
        phone: readString(row, "telephone1"),
        email: readString(row, "emailaddress1"),
        website: readString(row, "websiteurl"),
        address: joinParts([readString(row, "address1_line1"), cityLine, readString(row, "address1_country")], ", "),
        industry: readFormatted(row, "industrycode"),
        revenue: readFormatted(row, "revenue"),
        employees: employees === null ? "" : employees.toLocaleString(),
        primaryContactId: normalizeId(row._primarycontactid_value),
        primaryContactName: readFormatted(row, "_primarycontactid_value"),
        parentId: normalizeId(row._parentaccountid_value),
        parentName: readFormatted(row, "_parentaccountid_value"),
        ownerName: readFormatted(row, "_ownerid_value"),
        active: readNumber(row, "statecode") !== STATE_INACTIVE,
        modifiedOn: readDate(row, "modifiedon"),
        description: readString(row, "description"),
    };
}

function toTaskItem(row: Row, now: number): TaskItem | null {
    const id = normalizeId(row.activityid);
    if (!id) return null;
    const state = readNumber(row, "statecode") ?? TASK_STATE_OPEN;
    const open = state === TASK_STATE_OPEN;
    const dueOn = readDate(row, "scheduledend") ?? readDate(row, "scheduledstart");
    return {
        id,
        subject: readString(row, "subject"),
        dueOn,
        priority: readNumber(row, "prioritycode") ?? PRIORITY_NORMAL,
        state,
        open,
        overdue: open && isPast(dueOn, now),
        ownerName: readFormatted(row, "_ownerid_value"),
        closedOn: open ? null : readDate(row, "actualend") ?? readDate(row, "modifiedon"),
    };
}

function toContactItem(row: Row, primaryContactId: string): ContactItem | null {
    const id = normalizeId(row.contactid);
    if (!id) return null;
    return {
        id,
        fullName:
            readString(row, "fullname") ||
            joinParts([readString(row, "firstname"), readString(row, "lastname")], " ") ||
            T.unnamed,
        jobTitle: readString(row, "jobtitle"),
        email: readString(row, "emailaddress1"),
        phone: readString(row, "telephone1") || readString(row, "mobilephone"),
        isPrimary: !!primaryContactId && id === primaryContactId,
    };
}

function toSimpleItem(row: Row, idColumn: string): SimpleItem | null {
    const id = normalizeId(row[idColumn]);
    if (!id) return null;
    return {
        id,
        name: readString(row, "pro_name") || T.unnamed,
        createdOn: readDate(row, "createdon"),
        active: readNumber(row, "statecode") !== STATE_INACTIVE,
    };
}

function isPresent<T>(value: T | null): value is T {
    return value !== null;
}

/* -------------------------------------------------------------------------
 * Data access
 * ---------------------------------------------------------------------- */

/** Reads up to `limit` rows across pages; de-dupes by id in case a page repeats rows. */
async function queryAll(
    api: any,
    table: string,
    idColumn: string,
    options: Record<string, unknown>,
    limit: number,
): Promise<Collected> {
    const seen = new Set<string>();
    const rows: Row[] = [];
    const collect = (page: DataPage | undefined): void => {
        (page?.rows ?? []).forEach((raw) => {
            const row = raw as Row;
            const id = normalizeId(row[idColumn]);
            if (!id || seen.has(id)) return;
            seen.add(id);
            rows.push(row);
        });
    };
    let page: DataPage | undefined = await api.queryTable(table, { ...options, pageSize: PAGE_SIZE });
    collect(page);
    while (page?.hasMoreRows && typeof page.loadMoreRows === "function" && rows.length < limit) {
        page = await page.loadMoreRows();
        collect(page);
    }
    return { rows: rows.slice(0, limit), truncated: rows.length > limit || !!page?.hasMoreRows };
}

async function loadOverview(dataApi: unknown): Promise<Overview> {
    const api = dataApi as any;
    const [accountsResult, tasksResult] = await Promise.all([
        settle(
            queryAll(
                api,
                "account",
                "accountid",
                {
                    select: ["accountid", "name", "accountnumber", "address1_city", "address1_country", "statecode", "_ownerid_value"],
                    orderBy: "name asc",
                },
                MAX_ACCOUNTS,
            ),
        ),
        settle(
            queryAll(
                api,
                "task",
                "activityid",
                {
                    // Only statecode on the server; tasks regarding other tables are dropped
                    // when matched to the loaded accounts (toTaskStats).
                    select: ["activityid", "_regardingobjectid_value", "scheduledend", "scheduledstart"],
                    filter: `statecode eq ${TASK_STATE_OPEN}`,
                },
                MAX_OPEN_TASKS,
            ),
        ),
    ]);

    // Without accounts there is no page; missing task counts are only a warning.
    if (!accountsResult.ok) throw accountsResult.reason;
    const failed: string[] = [];
    if (!tasksResult.ok) {
        console.error("Account 360: open task counts could not be loaded", tasksResult.reason);
        failed.push(T.tableTaskCounts);
    }

    const accounts = accountsResult.value.rows.map((row) => toAccountItem(row)).filter(isPresent);
    return {
        accounts,
        taskStats: tasksResult.ok ? toTaskStats(tasksResult.value.rows, accounts, Date.now()) : {},
        failed,
        truncated: accountsResult.value.truncated,
    };
}

async function loadDetail(dataApi: unknown, accountId: string): Promise<Detail> {
    const api = dataApi as any;
    const [accountResult, tasksResult, contactsResult, addressesResult, elasticResult] = await Promise.all([
        settle<Row>(api.retrieveRow("account", { id: accountId, select: ACCOUNT_DETAIL_COLUMNS })),
        settle(
            queryAll(
                api,
                "task",
                "activityid",
                {
                    select: [
                        "activityid",
                        "subject",
                        "scheduledstart",
                        "scheduledend",
                        "prioritycode",
                        "statecode",
                        "actualend",
                        "modifiedon",
                        "_ownerid_value",
                    ],
                    filter: `_regardingobjectid_value eq ${accountId}`,
                    orderBy: "scheduledend asc",
                },
                MAX_RELATED,
            ),
        ),
        settle(
            queryAll(
                api,
                "contact",
                "contactid",
                {
                    select: ["contactid", "fullname", "firstname", "lastname", "jobtitle", "emailaddress1", "telephone1", "mobilephone"],
                    filter: `_parentcustomerid_value eq ${accountId} and statecode eq 0`,
                    orderBy: "fullname asc",
                },
                MAX_RELATED,
            ),
        ),
        settle(
            queryAll(
                api,
                "pro_customaddress",
                "pro_customaddressid",
                {
                    select: ["pro_customaddressid", "pro_name", "statecode", "createdon"],
                    filter: `_pro_account_value eq ${accountId}`,
                    orderBy: "pro_name asc",
                },
                MAX_RELATED,
            ),
        ),
        // Elastic table: no orderBy, sorted on the client.
        settle(
            queryAll(
                api,
                "pro_elasticdemo",
                "pro_elasticdemoid",
                {
                    select: ["pro_elasticdemoid", "pro_name", "createdon"],
                    filter: `_pro_account_value eq ${accountId}`,
                },
                MAX_RELATED,
            ),
        ),
    ]);

    if (!accountResult.ok) throw accountResult.reason;

    // Each related table is settled on its own: one missing read right must not blank the page.
    const failed: string[] = [];
    const rowsOf = (result: Settled<Collected>, label: string): Row[] => {
        if (result.ok) return result.value.rows;
        console.error(`Account 360: ${label} could not be loaded`, result.reason);
        failed.push(label);
        return [];
    };

    const account = toAccountDetail(accountResult.value ?? {}, accountId);
    const now = Date.now();
    const tasks = rowsOf(tasksResult, T.tableTasks)
        .map((row) => toTaskItem(row, now))
        .filter(isPresent)
        .sort(compareTasks);
    const contacts = rowsOf(contactsResult, T.tableContacts)
        .map((row) => toContactItem(row, account.primaryContactId))
        .filter(isPresent)
        .sort((a, b) => (a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : a.fullName.localeCompare(b.fullName)));
    const addresses = rowsOf(addressesResult, T.tableAddresses)
        .map((row) => toSimpleItem(row, "pro_customaddressid"))
        .filter(isPresent);
    const elastic = rowsOf(elasticResult, T.tableElastic)
        .map((row) => toSimpleItem(row, "pro_elasticdemoid"))
        .filter(isPresent)
        .sort((a, b) => a.name.localeCompare(b.name));

    return { account, tasks, contacts, addresses, elastic, failed };
}

async function completeTask(dataApi: unknown, taskId: string): Promise<void> {
    await (dataApi as any).updateRow("task", taskId, {
        statecode: TASK_STATE_COMPLETED,
        statuscode: TASK_STATUS_COMPLETED,
    });
}

async function createTask(dataApi: unknown, accountId: string, draft: TaskDraft): Promise<void> {
    // Lookups are written as "_x_value": "/table(id)" — the DataAPI drops @odata.bind silently.
    const row: Row = {
        subject: draft.subject.trim(),
        prioritycode: draft.priority,
        _regardingobjectid_value: `/account(${accountId})`,
    };
    const due = parseDateInput(draft.due);
    if (due) row.scheduledend = due;
    await (dataApi as any).createRow("task", row);
}

async function createAddress(dataApi: unknown, accountId: string, name: string): Promise<void> {
    await (dataApi as any).createRow("pro_customaddress", {
        pro_name: name.trim(),
        _pro_account_value: `/account(${accountId})`,
    });
}

/* -------------------------------------------------------------------------
 * Styles
 * ---------------------------------------------------------------------- */

const useStyles = makeStyles({
    root: {
        position: "relative",
        contain: "layout",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        color: tokens.colorNeutralForeground1,
        backgroundColor: tokens.colorNeutralBackground2,
        ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
        ...shorthands.gap(tokens.spacingVerticalM),
    },
    /** On a form the page grows with its content; the form scrolls, not the page. */
    rootEmbedded: {
        height: "auto",
        overflow: "visible",
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.padding("0"),
    },
    header: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalM),
    },
    embeddedContent: {
        ...shorthands.padding("0"),
    },
    headerTitle: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
    },
    body: {
        display: "flex",
        flexDirection: "row",
        flexGrow: 1,
        minHeight: 0,
        ...shorthands.gap(tokens.spacingHorizontalM),
        "@media (max-width: 768px)": {
            flexDirection: "column",
        },
    },
    pane: {
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground1,
        overflow: "hidden",
    },
    listPane: {
        width: "320px",
        flexShrink: 0,
        "@media (max-width: 768px)": {
            width: "auto",
            maxHeight: "45%",
        },
    },
    listHeader: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalS),
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    },
    listTitleRow: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingHorizontalS),
    },
    switchRow: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalS),
    },
    listScroll: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
    },
    listFooter: {
        color: tokens.colorNeutralForeground3,
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
        ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
    },
    accountItem: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
        flexShrink: 0,
        ...shorthands.gap(tokens.spacingHorizontalS),
        ...shorthands.margin("0"),
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
        ...shorthands.borderStyle("none"),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
        backgroundColor: "transparent",
        color: tokens.colorNeutralForeground1,
        fontFamily: tokens.fontFamilyBase,
        fontSize: tokens.fontSizeBase300,
        textAlign: "left",
        cursor: "pointer",
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
        ":focus-visible": {
            outlineStyle: "solid",
            outlineWidth: "2px",
            outlineColor: tokens.colorStrokeFocus2,
            outlineOffset: "-2px",
        },
    },
    accountItemSelected: {
        backgroundColor: tokens.colorNeutralBackground1Selected,
        boxShadow: `inset 3px 0 0 ${tokens.colorBrandStroke1}`,
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Selected,
        },
    },
    accountItemBody: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
    },
    accountItemBadges: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
        ...shorthands.gap(tokens.spacingHorizontalXS),
    },
    detailPane: {
        flexGrow: 1,
        minWidth: 0,
        overflowY: "auto",
    },
    detailContent: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalL),
        ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    },
    detailHeader: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalM),
    },
    detailHeaderText: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
        ...shorthands.gap(tokens.spacingVerticalXS),
    },
    badgeRow: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingHorizontalXS),
    },
    factGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    },
    fact: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        minWidth: 0,
        ...shorthands.gap(tokens.spacingHorizontalS),
    },
    factIcon: {
        display: "flex",
        flexShrink: 0,
        paddingTop: "2px",
        fontSize: "20px",
        color: tokens.colorNeutralForeground3,
    },
    factBody: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
    },
    description: {
        display: "block",
        maxHeight: "6em",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        color: tokens.colorNeutralForeground2,
    },
    statRow: {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        ...shorthands.gap(tokens.spacingHorizontalM),
        "@media (max-width: 640px)": {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        },
    },
    statCard: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalXXS),
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground2,
    },
    statLabel: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingHorizontalXS),
        color: tokens.colorNeutralForeground3,
    },
    tabSection: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalM),
    },
    tabBar: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalS),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    },
    tabTools: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalS),
        ...shorthands.padding(tokens.spacingVerticalXS, "0"),
    },
    tabPanel: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalM),
    },
    composer: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-end",
        ...shorthands.gap(tokens.spacingHorizontalM),
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground2,
    },
    composerGrow: {
        flexGrow: 1,
        minWidth: "220px",
    },
    composerPriority: {
        minWidth: "140px",
    },
    composerActions: {
        display: "flex",
        flexDirection: "row",
        ...shorthands.gap(tokens.spacingHorizontalS),
    },
    gridWrap: {
        overflowX: "auto",
    },
    actionCell: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingHorizontalS),
    },
    simpleList: {
        display: "flex",
        flexDirection: "column",
        listStyleType: "none",
        ...shorthands.margin("0"),
        ...shorthands.padding("0"),
    },
    simpleItem: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        ...shorthands.gap(tokens.spacingHorizontalS),
        ...shorthands.padding(tokens.spacingVerticalS, "0"),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
    },
    simpleItemBody: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
    },
    truncate: {
        display: "block",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    muted: {
        color: tokens.colorNeutralForeground3,
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexGrow: 1,
        ...shorthands.gap(tokens.spacingVerticalS),
        ...shorthands.padding(tokens.spacingVerticalXL, tokens.spacingHorizontalL),
        color: tokens.colorNeutralForeground3,
        textAlign: "center",
    },
    paddedMessage: {
        ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    },
});

/* -------------------------------------------------------------------------
 * Grid columns
 * ---------------------------------------------------------------------- */

const cellLayoutStyle: React.CSSProperties = { overflow: "hidden", minWidth: 0 };
const ellipsisStyle: React.CSSProperties = {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const TASK_COLUMN_SIZES = {
    subject: { defaultWidth: 220, minWidth: 140, idealWidth: 220 },
    dueOn: { defaultWidth: 140, minWidth: 110, idealWidth: 140 },
    priority: { defaultWidth: 90, minWidth: 80, idealWidth: 90 },
    status: { defaultWidth: 100, minWidth: 90, idealWidth: 100 },
    owner: { defaultWidth: 140, minWidth: 100, idealWidth: 140 },
    actions: { defaultWidth: 90, minWidth: 80, idealWidth: 90 },
};

const CONTACT_COLUMN_SIZES = {
    name: { defaultWidth: 230, minWidth: 150, idealWidth: 230 },
    jobTitle: { defaultWidth: 150, minWidth: 100, idealWidth: 150 },
    email: { defaultWidth: 200, minWidth: 130, idealWidth: 200 },
    phone: { defaultWidth: 130, minWidth: 100, idealWidth: 130 },
    open: { defaultWidth: 60, minWidth: 50, idealWidth: 60 },
};

type TaskColumnContext = {
    settings: UserSettingsRow | null;
    busy: string | null;
    onComplete: (task: TaskItem) => void;
};

/** Built per render: the complete handler closes over the current account and dataApi. */
function buildTaskColumns(ctx: TaskColumnContext): TableColumnDefinition<TaskItem>[] {
    return [
        createTableColumn<TaskItem>({
            columnId: "subject",
            compare: (a, b) => a.subject.localeCompare(b.subject),
            renderHeaderCell: () => T.subject,
            renderCell: (item) => (
                <TableCellLayout style={cellLayoutStyle}>
                    <span
                        title={item.subject || T.noSubject}
                        style={{
                            ...ellipsisStyle,
                            fontWeight: item.open && item.priority === PRIORITY_HIGH ? 600 : undefined,
                            color: item.open ? undefined : tokens.colorNeutralForeground3,
                            textDecorationLine: item.open ? undefined : "line-through",
                        }}
                    >
                        {item.subject || T.noSubject}
                    </span>
                </TableCellLayout>
            ),
        }),
        createTableColumn<TaskItem>({
            columnId: "dueOn",
            compare: (a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"),
            renderHeaderCell: () => T.dueOn,
            renderCell: (item) => (
                <TableCellLayout style={cellLayoutStyle}>
                    <span
                        style={{
                            whiteSpace: "nowrap",
                            color: item.overdue ? tokens.colorPaletteRedForeground1 : undefined,
                            fontWeight: item.overdue ? 600 : undefined,
                        }}
                    >
                        {formatDateTime(item.dueOn, ctx.settings)}
                    </span>
                </TableCellLayout>
            ),
        }),
        createTableColumn<TaskItem>({
            columnId: "priority",
            compare: (a, b) => b.priority - a.priority,
            renderHeaderCell: () => T.priority,
            renderCell: (item) => (
                <TableCellLayout style={cellLayoutStyle}>
                    {item.priority === PRIORITY_HIGH ? (
                        <Badge appearance="tint" color="danger">
                            {T.priorityHigh}
                        </Badge>
                    ) : (
                        <span>{priorityLabel(item.priority)}</span>
                    )}
                </TableCellLayout>
            ),
        }),
        createTableColumn<TaskItem>({
            columnId: "status",
            compare: (a, b) => a.state - b.state,
            renderHeaderCell: () => T.status,
            renderCell: (item) => (
                <TableCellLayout style={cellLayoutStyle}>
                    <Badge
                        appearance={item.open ? "outline" : "tint"}
                        color={item.state === TASK_STATE_COMPLETED ? "success" : item.open ? "informative" : "subtle"}
                    >
                        {stateLabel(item.state)}
                    </Badge>
                </TableCellLayout>
            ),
        }),
        createTableColumn<TaskItem>({
            columnId: "owner",
            compare: (a, b) => a.ownerName.localeCompare(b.ownerName),
            renderHeaderCell: () => T.owner,
            renderCell: (item) => (
                <TableCellLayout style={cellLayoutStyle}>
                    <span title={item.ownerName} style={ellipsisStyle}>
                        {item.ownerName || "—"}
                    </span>
                </TableCellLayout>
            ),
        }),
        createTableColumn<TaskItem>({
            columnId: "actions",
            compare: () => 0,
            renderHeaderCell: () => "",
            renderCell: (item) => (
                <TableCellLayout style={cellLayoutStyle}>
                    <span style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                        {item.open ? (
                            <Button
                                size="small"
                                appearance="subtle"
                                icon={ctx.busy === `task:${item.id}` ? <Spinner size="extra-tiny" /> : <CheckmarkRegular />}
                                disabled={!!ctx.busy}
                                aria-label={T.completeTask(item.subject || T.noSubject)}
                                title={T.complete}
                                onClick={() => ctx.onComplete(item)}
                            />
                        ) : null}
                        <Button
                            size="small"
                            appearance="subtle"
                            icon={<OpenRegular />}
                            aria-label={T.openRecord(item.subject || T.noSubject)}
                            title={T.open}
                            onClick={() => openRecord("task", item.id)}
                        />
                    </span>
                </TableCellLayout>
            ),
        }),
    ];
}

const CONTACT_COLUMNS: TableColumnDefinition<ContactItem>[] = [
    createTableColumn<ContactItem>({
        columnId: "name",
        compare: (a, b) => a.fullName.localeCompare(b.fullName),
        renderHeaderCell: () => T.name,
        renderCell: (item) => (
            <TableCellLayout
                style={cellLayoutStyle}
                media={<Avatar name={item.fullName} size={24} color="colorful" aria-hidden="true" />}
            >
                <span style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, minWidth: 0 }}>
                    <span title={item.fullName} style={ellipsisStyle}>
                        {item.fullName}
                    </span>
                    {item.isPrimary ? (
                        <Badge appearance="tint" color="brand" size="small" icon={<StarFilled />}>
                            {T.primaryBadge}
                        </Badge>
                    ) : null}
                </span>
            </TableCellLayout>
        ),
    }),
    createTableColumn<ContactItem>({
        columnId: "jobTitle",
        compare: (a, b) => a.jobTitle.localeCompare(b.jobTitle),
        renderHeaderCell: () => T.jobTitle,
        renderCell: (item) => (
            <TableCellLayout style={cellLayoutStyle}>
                <span title={item.jobTitle} style={ellipsisStyle}>
                    {item.jobTitle || "—"}
                </span>
            </TableCellLayout>
        ),
    }),
    createTableColumn<ContactItem>({
        columnId: "email",
        compare: (a, b) => a.email.localeCompare(b.email),
        renderHeaderCell: () => T.email,
        renderCell: (item) => (
            <TableCellLayout style={cellLayoutStyle}>
                {item.email ? (
                    <Link href={`mailto:${item.email}`} title={item.email} style={ellipsisStyle}>
                        {item.email}
                    </Link>
                ) : (
                    "—"
                )}
            </TableCellLayout>
        ),
    }),
    createTableColumn<ContactItem>({
        columnId: "phone",
        compare: (a, b) => a.phone.localeCompare(b.phone),
        renderHeaderCell: () => T.phone,
        renderCell: (item) => (
            <TableCellLayout style={cellLayoutStyle}>
                {item.phone ? (
                    <Link href={`tel:${item.phone}`} style={ellipsisStyle}>
                        {item.phone}
                    </Link>
                ) : (
                    "—"
                )}
            </TableCellLayout>
        ),
    }),
    createTableColumn<ContactItem>({
        columnId: "open",
        compare: () => 0,
        renderHeaderCell: () => "",
        renderCell: (item) => (
            <TableCellLayout style={cellLayoutStyle}>
                <Button
                    size="small"
                    appearance="subtle"
                    icon={<OpenRegular />}
                    aria-label={T.openRecord(item.fullName)}
                    title={T.open}
                    onClick={() => openRecord("contact", item.id)}
                />
            </TableCellLayout>
        ),
    }),
];

/* -------------------------------------------------------------------------
 * Sub-components (top-level functions)
 * ---------------------------------------------------------------------- */

function EmptyState(props: { icon: React.ReactElement; text: string }): React.ReactElement {
    const styles = useStyles();
    return (
        <div className={styles.emptyState}>
            <span style={{ fontSize: "32px", display: "flex" }} aria-hidden="true">
                {props.icon}
            </span>
            <Body1>{props.text}</Body1>
        </div>
    );
}

function StatTile(props: {
    icon: React.ReactElement;
    label: string;
    value: number;
    danger?: boolean;
}): React.ReactElement {
    const styles = useStyles();
    const { icon, label, value, danger = false } = props;
    return (
        <section className={styles.statCard} aria-label={`${label}: ${value}`}>
            <span className={styles.statLabel}>
                {icon}
                <Caption1>{label}</Caption1>
            </span>
            <Text
                size={600}
                weight="semibold"
                style={{ color: danger ? tokens.colorPaletteRedForeground1 : tokens.colorNeutralForeground1 }}
            >
                {value}
            </Text>
        </section>
    );
}

function Fact(props: { icon: React.ReactElement; label: string; children: React.ReactNode }): React.ReactElement {
    const styles = useStyles();
    return (
        <div className={styles.fact}>
            <span className={styles.factIcon} aria-hidden="true">
                {props.icon}
            </span>
            <div className={styles.factBody}>
                <Caption1 className={styles.muted}>{props.label}</Caption1>
                <Body1 className={styles.truncate}>{props.children}</Body1>
            </div>
        </div>
    );
}

function AccountListItem(props: {
    account: AccountItem;
    stats: TaskStats | undefined;
    selected: boolean;
    onSelect: (id: string) => void;
}): React.ReactElement {
    const styles = useStyles();
    const { account, stats, selected, onSelect } = props;
    const meta = joinParts([account.number, account.city], " · ");
    return (
        <button
            type="button"
            className={mergeClasses(styles.accountItem, selected && styles.accountItemSelected)}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(account.id)}
        >
            <Avatar name={account.name} shape="square" size={32} color="colorful" aria-hidden="true" />
            <span className={styles.accountItemBody}>
                <Body1Strong className={styles.truncate} title={account.name}>
                    {account.name}
                </Body1Strong>
                <Caption1 className={mergeClasses(styles.truncate, styles.muted)}>{meta || "—"}</Caption1>
            </span>
            <span className={styles.accountItemBadges}>
                {!account.active ? (
                    <Badge appearance="outline" size="small">
                        {T.inactive}
                    </Badge>
                ) : null}
                {stats && stats.overdue > 0 ? (
                    <Badge appearance="filled" color="danger" size="small" aria-label={T.overdueBadge(stats.overdue)}>
                        {stats.overdue}
                    </Badge>
                ) : null}
                {stats && stats.open > 0 ? (
                    <Badge
                        appearance="tint"
                        color="informative"
                        size="small"
                        icon={<ClipboardTaskRegular />}
                        aria-label={T.openTasksBadge(stats.open)}
                    >
                        {stats.open}
                    </Badge>
                ) : null}
            </span>
        </button>
    );
}

function SimpleList(props: {
    items: SimpleItem[];
    entityName: string;
    settings: UserSettingsRow | null;
}): React.ReactElement {
    const styles = useStyles();
    const { items, entityName, settings } = props;
    return (
        <ul className={styles.simpleList}>
            {items.map((item) => (
                <li key={item.id} className={styles.simpleItem}>
                    <div className={styles.simpleItemBody}>
                        <Body1 className={styles.truncate} title={item.name}>
                            {item.name}
                        </Body1>
                        <Caption1 className={styles.muted}>
                            {joinParts(
                                [
                                    item.createdOn ? `${T.createdOn} ${formatDate(item.createdOn, settings)}` : "",
                                    item.active ? "" : T.inactive,
                                ],
                                " · ",
                            ) || "—"}
                        </Caption1>
                    </div>
                    <Link as="button" aria-label={T.openRecord(item.name)} onClick={() => openRecord(entityName, item.id)}>
                        {T.open}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

type DetailViewProps = {
    detail: Detail;
    /** On a form: no account header and master data (the form shows those), refresh button instead. */
    embedded: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    settings: UserSettingsRow | null;
    tab: DetailTab;
    onTabChange: (tab: DetailTab) => void;
    showClosed: boolean;
    onShowClosedChange: (value: boolean) => void;
    edit: EditState;
    onEditChange: (patch: Partial<EditState>) => void;
    onDraftChange: (patch: Partial<TaskDraft>) => void;
    onCompleteTask: (task: TaskItem) => void;
    onCreateTask: () => void;
    onCreateAddress: () => void;
    onOpenParent: () => void;
    mountNode: HTMLElement | null;
};

function AccountDetailView(props: DetailViewProps): React.ReactElement {
    const styles = useStyles();
    const {
        detail,
        embedded,
        refreshing,
        onRefresh,
        settings,
        tab,
        onTabChange,
        showClosed,
        onShowClosedChange,
        edit,
        onEditChange,
        onDraftChange,
        onCompleteTask,
        onCreateTask,
        onCreateAddress,
        onOpenParent,
        mountNode,
    } = props;
    const { account } = detail;

    const openTasks = useMemo(() => detail.tasks.filter((task) => task.open), [detail.tasks]);
    const overdueCount = useMemo(() => openTasks.filter((task) => task.overdue).length, [openTasks]);
    const visibleTasks = showClosed ? detail.tasks : openTasks;
    const taskColumns = buildTaskColumns({ settings, busy: edit.busy, onComplete: onCompleteTask });
    const draft = edit.taskDraft;

    return (
        <div className={mergeClasses(styles.detailContent, embedded && styles.embeddedContent)}>
            {embedded ? (
                <div className={styles.header}>
                    <Subtitle2>{T.title}</Subtitle2>
                    <Button
                        appearance="subtle"
                        size="small"
                        icon={refreshing ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
                        disabled={refreshing}
                        onClick={onRefresh}
                    >
                        {T.refresh}
                    </Button>
                </div>
            ) : (
                <>
                    <section className={styles.detailHeader} aria-labelledby="account360-name">
                        <Avatar name={account.name} shape="square" size={56} color="colorful" aria-hidden="true" />
                        <div className={styles.detailHeaderText}>
                            <Subtitle1 id="account360-name" className={styles.truncate} title={account.name}>
                                {account.name}
                            </Subtitle1>
                            <div className={styles.badgeRow}>
                                {account.number ? <Badge appearance="outline">{account.number}</Badge> : null}
                                {account.industry ? (
                                    <Badge appearance="tint" color="brand">
                                        {account.industry}
                                    </Badge>
                                ) : null}
                                {!account.active ? (
                                    <Badge appearance="tint" color="warning">
                                        {T.inactive}
                                    </Badge>
                                ) : null}
                            </div>
                        </div>
                        <Button appearance="primary" icon={<OpenRegular />} onClick={() => openRecord("account", account.id)}>
                            {T.openForm}
                        </Button>
                    </section>

                    <section className={styles.factGrid} aria-label={T.masterData}>
                        <Fact icon={<CallRegular />} label={T.phone}>
                            {account.phone ? <Link href={`tel:${account.phone}`}>{account.phone}</Link> : "—"}
                        </Fact>
                        <Fact icon={<MailRegular />} label={T.email}>
                            {account.email ? (
                                <Link href={`mailto:${account.email}`} title={account.email}>
                                    {account.email}
                                </Link>
                            ) : (
                                "—"
                            )}
                        </Fact>
                        <Fact icon={<GlobeRegular />} label={T.website}>
                            {account.website ? (
                                <Link
                                    href={normalizeUrl(account.website)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={account.website}
                                >
                                    {account.website}
                                </Link>
                            ) : (
                                "—"
                            )}
                        </Fact>
                        <Fact icon={<LocationRegular />} label={T.address}>
                            <span title={account.address}>{account.address || "—"}</span>
                        </Fact>
                        <Fact icon={<PersonRegular />} label={T.primaryContact}>
                            {account.primaryContactId ? (
                                <Link as="button" onClick={() => openRecord("contact", account.primaryContactId)}>
                                    {account.primaryContactName || T.open}
                                </Link>
                            ) : (
                                "—"
                            )}
                        </Fact>
                        <Fact icon={<OrganizationRegular />} label={T.parentAccount}>
                            {account.parentId ? (
                                <Link as="button" onClick={onOpenParent}>
                                    {account.parentName || T.open}
                                </Link>
                            ) : (
                                "—"
                            )}
                        </Fact>
                        <Fact icon={<BriefcaseRegular />} label={T.industry}>
                            {account.industry || "—"}
                        </Fact>
                        <Fact icon={<MoneyRegular />} label={T.revenue}>
                            {account.revenue || "—"}
                        </Fact>
                        <Fact icon={<PeopleRegular />} label={T.employees}>
                            {account.employees || "—"}
                        </Fact>
                        <Fact icon={<PersonCircleRegular />} label={T.owner}>
                            {account.ownerName || "—"}
                        </Fact>
                        <Fact icon={<CalendarLtrRegular />} label={T.modifiedOn}>
                            {formatDateTime(account.modifiedOn, settings)}
                        </Fact>
                    </section>

                    {account.description ? <Body1 className={styles.description}>{account.description}</Body1> : null}
                </>
            )}

            <div className={styles.statRow}>
                <StatTile icon={<PeopleRegular />} label={T.kpiContacts} value={detail.contacts.length} />
                <StatTile icon={<ClipboardTaskRegular />} label={T.kpiOpenTasks} value={openTasks.length} />
                <StatTile icon={<WarningRegular />} label={T.kpiOverdue} value={overdueCount} danger={overdueCount > 0} />
                <StatTile icon={<LocationRegular />} label={T.kpiAddresses} value={detail.addresses.length} />
            </div>

            {detail.failed.length > 0 ? (
                <MessageBar intent="warning">
                    <MessageBarBody>{T.partial(detail.failed.join(", "))}</MessageBarBody>
                </MessageBar>
            ) : null}

            {edit.message ? (
                <MessageBar intent={edit.message.intent}>
                    <MessageBarBody>{edit.message.text}</MessageBarBody>
                    <MessageBarActions
                        containerAction={
                            <Button
                                appearance="transparent"
                                size="small"
                                aria-label={T.dismiss}
                                icon={<DismissRegular />}
                                onClick={() => onEditChange({ message: null })}
                            />
                        }
                    />
                </MessageBar>
            ) : null}

            <section className={styles.tabSection}>
                <div className={styles.tabBar}>
                    <TabList selectedValue={tab} onTabSelect={(_event, data) => onTabChange(data.value as DetailTab)}>
                        <Tab value="tasks" icon={<ClipboardTaskRegular />}>
                            {`${T.tabTasks} (${openTasks.length})`}
                        </Tab>
                        <Tab value="contacts" icon={<PeopleRegular />}>
                            {`${T.tabContacts} (${detail.contacts.length})`}
                        </Tab>
                        <Tab value="addresses" icon={<LocationRegular />}>
                            {`${T.tabAddresses} (${detail.addresses.length})`}
                        </Tab>
                        <Tab value="elastic" icon={<DatabaseRegular />}>
                            {`${T.tabElastic} (${detail.elastic.length})`}
                        </Tab>
                    </TabList>
                    {tab === "tasks" ? (
                        <div className={styles.tabTools}>
                            <Switch
                                label={T.showClosed}
                                checked={showClosed}
                                onChange={(_event, data) => onShowClosedChange(data.checked)}
                            />
                            <Button
                                icon={<AddRegular />}
                                disabled={!!draft || !!edit.busy}
                                onClick={() =>
                                    onEditChange({
                                        taskDraft: { subject: "", due: "", priority: PRIORITY_NORMAL },
                                        message: null,
                                    })
                                }
                            >
                                {T.newTask}
                            </Button>
                        </div>
                    ) : null}
                </div>

                <div className={styles.tabPanel} role="tabpanel">
                    {tab === "tasks" ? (
                        <>
                            {draft ? (
                                <form
                                    className={styles.composer}
                                    aria-label={T.newTask}
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        onCreateTask();
                                    }}
                                >
                                    <Field label={T.subject} required className={styles.composerGrow}>
                                        <Input
                                            value={draft.subject}
                                            onChange={(_event, data) => onDraftChange({ subject: data.value })}
                                        />
                                    </Field>
                                    <Field label={T.dueOn}>
                                        <Input
                                            type="date"
                                            value={draft.due}
                                            onChange={(_event, data) => onDraftChange({ due: data.value })}
                                        />
                                    </Field>
                                    <Field label={T.priority} className={styles.composerPriority}>
                                        <Dropdown
                                            mountNode={mountNode}
                                            selectedOptions={[String(draft.priority)]}
                                            value={priorityLabel(draft.priority)}
                                            onOptionSelect={(_event, data) => {
                                                const parsed = Number(data.optionValue);
                                                if (Number.isFinite(parsed)) onDraftChange({ priority: parsed });
                                            }}
                                        >
                                            {PRIORITY_OPTIONS.map(([value, label]) => (
                                                <Option key={value} value={String(value)}>
                                                    {label}
                                                </Option>
                                            ))}
                                        </Dropdown>
                                    </Field>
                                    <div className={styles.composerActions}>
                                        <Button
                                            type="submit"
                                            appearance="primary"
                                            icon={edit.busy === "createTask" ? <Spinner size="tiny" /> : <SaveRegular />}
                                            disabled={!draft.subject.trim() || !!edit.busy}
                                        >
                                            {T.create}
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={edit.busy === "createTask"}
                                            onClick={() => onEditChange({ taskDraft: null })}
                                        >
                                            {T.cancel}
                                        </Button>
                                    </div>
                                </form>
                            ) : null}
                            {visibleTasks.length === 0 ? (
                                <EmptyState
                                    icon={<ClipboardTaskRegular />}
                                    text={showClosed ? T.noTasks : T.noOpenTasks}
                                />
                            ) : (
                                <div className={styles.gridWrap}>
                                    <DataGrid
                                        items={visibleTasks}
                                        columns={taskColumns}
                                        sortable
                                        resizableColumns
                                        columnSizingOptions={TASK_COLUMN_SIZES}
                                        getRowId={(item) => item.id}
                                        focusMode="composite"
                                    >
                                        <DataGridHeader>
                                            <DataGridRow>
                                                {({ renderHeaderCell }) => (
                                                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                                                )}
                                            </DataGridRow>
                                        </DataGridHeader>
                                        <DataGridBody<TaskItem>>
                                            {({ item, rowId }) => (
                                                <DataGridRow<TaskItem> key={rowId}>
                                                    {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                                                </DataGridRow>
                                            )}
                                        </DataGridBody>
                                    </DataGrid>
                                </div>
                            )}
                        </>
                    ) : tab === "contacts" ? (
                        detail.contacts.length === 0 ? (
                            <EmptyState icon={<PeopleRegular />} text={T.noContacts} />
                        ) : (
                            <div className={styles.gridWrap}>
                                <DataGrid
                                    items={detail.contacts}
                                    columns={CONTACT_COLUMNS}
                                    sortable
                                    resizableColumns
                                    columnSizingOptions={CONTACT_COLUMN_SIZES}
                                    getRowId={(item) => item.id}
                                    focusMode="composite"
                                >
                                    <DataGridHeader>
                                        <DataGridRow>
                                            {({ renderHeaderCell }) => (
                                                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                                            )}
                                        </DataGridRow>
                                    </DataGridHeader>
                                    <DataGridBody<ContactItem>>
                                        {({ item, rowId }) => (
                                            <DataGridRow<ContactItem> key={rowId}>
                                                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                                            </DataGridRow>
                                        )}
                                    </DataGridBody>
                                </DataGrid>
                            </div>
                        )
                    ) : tab === "addresses" ? (
                        <>
                            <form
                                className={styles.composer}
                                aria-label={T.newAddress}
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    onCreateAddress();
                                }}
                            >
                                <Field label={T.newAddress} className={styles.composerGrow}>
                                    <Input
                                        placeholder={T.addressName}
                                        value={edit.addressDraft}
                                        onChange={(_event, data) => onEditChange({ addressDraft: data.value })}
                                    />
                                </Field>
                                <Button
                                    type="submit"
                                    icon={edit.busy === "createAddress" ? <Spinner size="tiny" /> : <AddRegular />}
                                    disabled={!edit.addressDraft.trim() || !!edit.busy}
                                >
                                    {T.add}
                                </Button>
                            </form>
                            {detail.addresses.length === 0 ? (
                                <EmptyState icon={<LocationRegular />} text={T.noAddresses} />
                            ) : (
                                <SimpleList items={detail.addresses} entityName="pro_customaddress" settings={settings} />
                            )}
                        </>
                    ) : detail.elastic.length === 0 ? (
                        <EmptyState icon={<DatabaseRegular />} text={T.noElastic} />
                    ) : (
                        <SimpleList items={detail.elastic} entityName="pro_elasticdemo" settings={settings} />
                    )}
                </div>
            </section>
        </div>
    );
}

/* -------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------- */

const GeneratedComponent = (props: PageProps) => {
    const { dataApi, pageInput } = props;
    const styles = useStyles();

    // Never depend on `dataApi` itself — the host hands a new reference every render.
    const dataReady = !!dataApi;

    // Record context, derived synchronously from props (no state → no extra render).
    // A form passes entityName/recordId; an unsaved record has no recordId yet.
    const embedded = !!pageInput && (!!pageInput.entityName || !!pageInput.recordId);
    const embeddedEntity = (pageInput?.entityName ?? "account").toLowerCase();
    const embeddedId = embedded && embeddedEntity === "account" ? normalizeId(pageInput?.recordId) : "";

    // Callback ref, so the portal mount node exists before any dropdown opens.
    const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
    const setContainer = useCallback((node: HTMLDivElement | null) => setMountNode(node), []);

    const me = useMemo(() => currentUserId(), []);

    const [reload, setReload] = useState({ overview: 0, detail: 0 });
    const [search, setSearch] = useState("");
    const [onlyMine, setOnlyMine] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<DetailTab>(() => initialTab(pageInput));
    const [showClosed, setShowClosed] = useState(false);
    const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);

    const [settings, setSettings] = useState<UserSettingsRow | null>(
        () => (winAny[SETTINGS_CACHE] as UserSettingsRow | undefined) ?? null,
    );

    const [{ overview, loading, refreshing, error }, setOverviewState] = useState<OverviewState>(() => {
        const cached = winAny[OVERVIEW_CACHE] as Overview | undefined;
        return { overview: cached ?? EMPTY_OVERVIEW, loading: cached === undefined, refreshing: false, error: null };
    });

    const [detailState, setDetailState] = useState<DetailState>({
        accountId: null,
        detail: null,
        error: null,
        refreshing: false,
    });

    // --- User formatting preferences (own effect, own single setState) ------
    useEffect(() => {
        if (!dataReady) return;
        const cached = winAny[SETTINGS_CACHE] as UserSettingsRow | undefined;
        if (cached !== undefined) {
            if (settings !== cached) setSettings(cached);
            return;
        }
        if (!me) return;
        let cancelled = false;

        let pending = winAny[SETTINGS_INFLIGHT] as Promise<UserSettingsRow> | undefined;
        if (!pending) {
            const started: Promise<UserSettingsRow> = (dataApi as any)
                .retrieveRow("usersettings", { id: me, select: ["dateformatstring", "dateseparator"] })
                .then((row: UserSettingsRow) => {
                    winAny[SETTINGS_CACHE] = row;
                    return row;
                })
                .finally(() => {
                    if (winAny[SETTINGS_INFLIGHT] === started) delete winAny[SETTINGS_INFLIGHT];
                });
            winAny[SETTINGS_INFLIGHT] = started;
            pending = started;
        }

        pending
            .then((row) => {
                if (!cancelled) setSettings(row);
            })
            .catch((fetchError: unknown) => {
                console.error("Account 360: user settings could not be loaded", fetchError);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady]);

    // --- Account list + open task counts (one batched setState) -------------
    // Not needed on a form: there the record comes from pageInput.
    useEffect(() => {
        if (!dataReady || embedded) return;

        const cached = winAny[OVERVIEW_CACHE] as Overview | undefined;
        if (cached !== undefined) {
            if (overview !== cached || loading || refreshing) {
                setOverviewState({ overview: cached, loading: false, refreshing: false, error: null });
            }
            return;
        }
        let cancelled = false;

        let inflight = winAny[OVERVIEW_INFLIGHT] as Promise<Overview> | undefined;
        if (!inflight) {
            const gen = generation(OVERVIEW_GEN);
            const started: Promise<Overview> = loadOverview(dataApi)
                .then((loaded) => {
                    if (generation(OVERVIEW_GEN) === gen) winAny[OVERVIEW_CACHE] = loaded;
                    return loaded;
                })
                .finally(() => {
                    if (winAny[OVERVIEW_INFLIGHT] === started) delete winAny[OVERVIEW_INFLIGHT];
                });
            winAny[OVERVIEW_INFLIGHT] = started;
            inflight = started;
        }

        inflight
            .then((loaded) => {
                if (!cancelled) setOverviewState({ overview: loaded, loading: false, refreshing: false, error: null });
            })
            .catch((loadError: unknown) => {
                console.error("Account 360: accounts could not be loaded", loadError);
                if (!cancelled) {
                    setOverviewState((prev) => ({ ...prev, loading: false, refreshing: false, error: T.errorLoad }));
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady, embedded, reload.overview]);

    // --- Derived list + selection — all memos above every early return ------
    const visibleAccounts = useMemo(() => {
        const term = search.trim().toLowerCase();
        return overview.accounts.filter((account) => {
            if (!showInactive && !account.active) return false;
            if (onlyMine && account.ownerId !== me) return false;
            if (!term) return true;
            return (
                account.name.toLowerCase().includes(term) ||
                account.number.toLowerCase().includes(term) ||
                account.city.toLowerCase().includes(term)
            );
        });
    }, [overview.accounts, search, onlyMine, showInactive, me]);

    // On a form the record is fixed; on the page the selection falls back to the
    // first visible account, so the page never opens empty.
    const activeId = useMemo(() => {
        if (embedded) return embeddedId || null;
        if (selectedId && visibleAccounts.some((account) => account.id === selectedId)) return selectedId;
        return visibleAccounts.length > 0 ? visibleAccounts[0].id : null;
    }, [embedded, embeddedId, selectedId, visibleAccounts]);

    // --- Detail of the active account (cached per id, one setState) ---------
    useEffect(() => {
        if (!dataReady || !activeId) return;
        const accountId = activeId;

        const hit = detailCache().get(accountId);
        if (hit !== undefined) {
            if (detailState.detail !== hit || detailState.accountId !== accountId || detailState.refreshing) {
                setDetailState({ accountId, detail: hit, error: null, refreshing: false });
            }
            return;
        }
        let cancelled = false;

        const inflightMap = detailInflight();
        let pending = inflightMap.get(accountId);
        if (!pending) {
            const gen = generation(DETAIL_GEN);
            const started: Promise<Detail> = loadDetail(dataApi, accountId)
                .then((loaded) => {
                    if (generation(DETAIL_GEN) === gen) detailCache().set(accountId, loaded);
                    return loaded;
                })
                .finally(() => {
                    if (inflightMap.get(accountId) === started) inflightMap.delete(accountId);
                });
            inflightMap.set(accountId, started);
            pending = started;
        }

        pending
            .then((loaded) => {
                if (!cancelled) setDetailState({ accountId, detail: loaded, error: null, refreshing: false });
            })
            .catch((loadError: unknown) => {
                console.error("Account 360: account detail could not be loaded", loadError);
                if (!cancelled) setDetailState({ accountId, detail: null, error: T.errorDetail, refreshing: false });
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady, activeId, reload.detail]);

    // A stale detail of the previous account is never shown for the new one.
    const detail = detailState.accountId === activeId ? detailState.detail : null;
    const detailError = detailState.accountId === activeId ? detailState.error : null;

    // --- Handlers (plain functions: they close over the current dataApi) ----
    const handleRefresh = () => {
        invalidateOverview();
        invalidateDetail();
        setOverviewState((prev) => ({ ...prev, refreshing: true, error: null }));
        setReload((prev) => ({ overview: prev.overview + 1, detail: prev.detail + 1 }));
    };

    /** Form mode: reload only this account's detail; the current data stays visible meanwhile. */
    const handleDetailRefresh = () => {
        if (!activeId) return;
        invalidateDetail(activeId);
        setDetailState((prev) => ({ ...prev, refreshing: true }));
        setReload((prev) => ({ ...prev, detail: prev.detail + 1 }));
    };

    const handleSelect = (accountId: string) => {
        setSelectedId(accountId);
        setEdit(EMPTY_EDIT);
    };

    const handleEditChange = (patch: Partial<EditState>) => setEdit((prev) => ({ ...prev, ...patch }));

    const handleDraftChange = (patch: Partial<TaskDraft>) =>
        setEdit((prev) => (prev.taskDraft ? { ...prev, taskDraft: { ...prev.taskDraft, ...patch } } : prev));

    const runWrite = (key: string, work: () => Promise<void>, successText: string, failText: string, reset: Partial<EditState>) => {
        if (edit.busy || !activeId) return;
        const accountId = activeId;
        setEdit((prev) => ({ ...prev, busy: key, message: null }));
        work()
            .then(() => {
                // Task counts in the list and the account's detail both changed.
                invalidateOverview();
                invalidateDetail(accountId);
                setEdit((prev) => ({ ...prev, ...reset, busy: null, message: { intent: "success", text: successText } }));
                setReload((prev) => ({ overview: prev.overview + 1, detail: prev.detail + 1 }));
            })
            .catch((writeError: unknown) => {
                console.error(`Account 360: ${failText}`, writeError);
                setEdit((prev) => ({
                    ...prev,
                    busy: null,
                    message: { intent: "error", text: `${failText} ${errorMessage(writeError)}` },
                }));
            });
    };

    const handleCompleteTask = (task: TaskItem) =>
        runWrite(
            `task:${task.id}`,
            () => completeTask(dataApi, task.id),
            T.taskCompleted(task.subject || T.noSubject),
            T.taskCompleteFailed,
            {},
        );

    const handleCreateTask = () => {
        const draft = edit.taskDraft;
        if (!draft || !draft.subject.trim() || !activeId) return;
        const accountId = activeId;
        runWrite("createTask", () => createTask(dataApi, accountId, draft), T.taskCreated, T.taskCreateFailed, {
            taskDraft: null,
        });
    };

    const handleCreateAddress = () => {
        const name = edit.addressDraft.trim();
        if (!name || !activeId) return;
        const accountId = activeId;
        runWrite("createAddress", () => createAddress(dataApi, accountId, name), T.addressCreated, T.addressCreateFailed, {
            addressDraft: "",
        });
    };

    // Parent in the list → select it here; otherwise open its form.
    const handleOpenParent = () => {
        const parentId = detail?.account.parentId;
        if (!parentId) return;
        if (visibleAccounts.some((account) => account.id === parentId)) handleSelect(parentId);
        else openRecord("account", parentId);
    };

    const listEmptyText = overview.accounts.length === 0 ? T.noAccounts : T.noAccountsFiltered;

    // Shared by both modes; only rendered once an account is active.
    const detailBody = detail ? (
        <AccountDetailView
            detail={detail}
            embedded={embedded}
            refreshing={detailState.refreshing}
            onRefresh={handleDetailRefresh}
            settings={settings}
            tab={tab}
            onTabChange={setTab}
            showClosed={showClosed}
            onShowClosedChange={setShowClosed}
            edit={edit}
            onEditChange={handleEditChange}
            onDraftChange={handleDraftChange}
            onCompleteTask={handleCompleteTask}
            onCreateTask={handleCreateTask}
            onCreateAddress={handleCreateAddress}
            onOpenParent={handleOpenParent}
            mountNode={mountNode}
        />
    ) : detailError ? (
        <div className={styles.paddedMessage}>
            <MessageBar intent="error">
                <MessageBarBody>{detailError}</MessageBarBody>
            </MessageBar>
        </div>
    ) : (
        <div className={styles.emptyState}>
            <Spinner label={T.loadingDetail} />
        </div>
    );

    // --- Render (every hook has been called by this point) ------------------
    if (embedded) {
        return (
            <div ref={setContainer} className={mergeClasses(styles.root, styles.rootEmbedded)}>
                {embeddedEntity !== "account" ? (
                    <EmptyState icon={<BuildingRegular />} text={T.embeddedWrongTable(embeddedEntity)} />
                ) : !activeId ? (
                    <EmptyState icon={<BuildingRegular />} text={T.embeddedUnsaved} />
                ) : (
                    detailBody
                )}
            </div>
        );
    }

    return (
        <div ref={setContainer} className={styles.root}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <Title3>{T.title}</Title3>
                    <Caption1 className={styles.muted}>{T.subtitle}</Caption1>
                </div>
                <Button
                    appearance="secondary"
                    icon={refreshing ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
                    onClick={handleRefresh}
                    disabled={loading || refreshing}
                >
                    {T.refresh}
                </Button>
            </header>

            {error ? (
                <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
            ) : overview.failed.length > 0 ? (
                <MessageBar intent="warning">
                    <MessageBarBody>{T.partial(overview.failed.join(", "))}</MessageBarBody>
                </MessageBar>
            ) : null}

            <div className={styles.body}>
                <nav className={mergeClasses(styles.pane, styles.listPane)} aria-label={T.accounts}>
                    <div className={styles.listHeader}>
                        <div className={styles.listTitleRow}>
                            <Subtitle2>{T.accounts}</Subtitle2>
                            <Badge appearance="tint" color="informative">
                                {visibleAccounts.length}
                            </Badge>
                        </div>
                        <SearchBox
                            aria-label={T.search}
                            placeholder={T.searchPlaceholder}
                            value={search}
                            onChange={(_event, data) => setSearch(data.value)}
                        />
                        <div className={styles.switchRow}>
                            <Switch
                                label={T.onlyMine}
                                checked={onlyMine}
                                disabled={!me}
                                onChange={(_event, data) => setOnlyMine(data.checked)}
                            />
                            <Switch
                                label={T.showInactive}
                                checked={showInactive}
                                onChange={(_event, data) => setShowInactive(data.checked)}
                            />
                        </div>
                    </div>
                    <div className={styles.listScroll}>
                        {loading ? (
                            <div className={styles.emptyState}>
                                <Spinner label={T.loading} />
                            </div>
                        ) : visibleAccounts.length === 0 ? (
                            <EmptyState icon={<BuildingRegular />} text={listEmptyText} />
                        ) : (
                            visibleAccounts.map((account) => (
                                <AccountListItem
                                    key={account.id}
                                    account={account}
                                    stats={overview.taskStats[account.id]}
                                    selected={account.id === activeId}
                                    onSelect={handleSelect}
                                />
                            ))
                        )}
                    </div>
                    {overview.truncated ? <Caption1 className={styles.listFooter}>{T.truncated}</Caption1> : null}
                </nav>

                <main className={mergeClasses(styles.pane, styles.detailPane)} aria-label={T.details}>
                    {loading ? (
                        <div className={styles.emptyState}>
                            <Spinner label={T.loading} />
                        </div>
                    ) : !activeId ? (
                        <EmptyState icon={<BuildingRegular />} text={overview.accounts.length === 0 ? T.noAccounts : T.selectAccount} />
                    ) : (
                        detailBody
                    )}
                </main>
            </div>
        </div>
    );
};

export default GeneratedComponent;
