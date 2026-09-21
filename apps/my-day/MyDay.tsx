import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Badge,
    Body1,
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
    Link,
    makeStyles,
    MessageBar,
    MessageBarBody,
    Option,
    shorthands,
    Spinner,
    Subtitle2,
    Switch,
    Tab,
    TableCellLayout,
    TabList,
    Text,
    Title3,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowClockwiseRegular,
    CalendarClockRegular,
    CalendarLtrRegular,
    CalendarQuestionMarkRegular,
    CalendarTodayRegular,
    CheckboxCheckedRegular,
    ClipboardTaskRegular,
    DocumentQuestionMarkRegular,
    FolderRegular,
    OpenRegular,
    PersonRegular,
    WarningRegular,
    WrenchRegular,
} from "@fluentui/react-icons";
import type { GeneratedComponentProps } from "./RuntimeTypes";

/* -------------------------------------------------------------------------
 * Domain model
 *
 * "My Day" puts everything a Waldmann sales rep owns on one screen:
 *
 *   Activities (bucketed by due date)
 *     appointment      — my open appointments (statecode Open or Scheduled)
 *     task             — my open tasks
 *     wal_projecttask  — my open project tasks (custom activity)
 *
 *   Records (my open ones, with an idle indicator)
 *     lead             — owner = me
 *     wal_project      — owner, area sales manager (GVL), KAM or project manager = me
 *     wal_projectinquiry — same roles plus responsible person
 *     msdyn_workorder  — owner or project manager = me, not completed/posted/canceled
 *
 * Column names come from RuntimeTypes.ts, generated against the Waldmann
 * environment. `_ownerid_value`, `modifiedon` and `createdon` are system
 * columns on the TableRow base, not listed in the per-table types.
 * ---------------------------------------------------------------------- */

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/** appointment/task/wal_projecttask prioritycode */
const PRIORITY_HIGH = 2;

/** lead_leadqualitycode */
const LEAD_HOT = 1;
const LEAD_WARM = 2;

/** msdyn_workorder_msdyn_systemstatus — "open" excludes these three. */
const WO_COMPLETED = 690970003;
const WO_POSTED = 690970004;
const WO_CANCELED = 690970005;

type ActivityBucket = "today" | "overdue" | "undated" | "upcoming";
type ActivityKind = "appointment" | "task" | "projecttask";
type ActivityKindFilter = ActivityKind | "all";
type RecordTab = "leads" | "projects" | "inquiries" | "workorders";
type Role = "owner" | "gvl" | "kam" | "pm" | "responsible";

type ActivityRow = {
    activityid?: string;
    subject?: string;
    scheduledend?: string;
    scheduledstart?: string;
    prioritycode?: number;
    _regardingobjectid_value?: string;
    wal_category_opt?: number;
    location?: string;
    [annotation: string]: unknown;
};

type LeadRow = {
    leadid?: string;
    firstname?: string;
    lastname?: string;
    companyname?: string;
    subject?: string;
    leadqualitycode?: number;
    statuscode?: number;
    modifiedon?: string;
    [annotation: string]: unknown;
};

type ProjectRow = {
    wal_projectid?: string;
    wal_projectsnumber_int?: string;
    wal_projectdesignation_txt?: string;
    wal_city_txt?: string;
    wal_projectpotential_cur?: number;
    wal_followupdate_dat?: string;
    wal_decisiondate_dat?: string;
    statuscode?: number;
    modifiedon?: string;
    _ownerid_value?: string;
    _wal_endcustomer_id_value?: string;
    _wal_areasalesmanager_id_value?: string;
    _wal_keyaccountmanager_id_value?: string;
    _wal_projectmanager_id_value?: string;
    [annotation: string]: unknown;
};

type InquiryRow = {
    wal_projectinquiryid?: string;
    wal_topic_txt?: string;
    wal_city_txt?: string;
    wal_projectpotential_cur?: number;
    wal_deadline_dat?: string;
    wal_resubmissiondate_dat?: string;
    wal_decisiondate_dat?: string;
    statuscode?: number;
    modifiedon?: string;
    _ownerid_value?: string;
    _wal_customer_id_value?: string;
    _wal_endcustomer_id_value?: string;
    _wal_areasalesmanager_id_value?: string;
    _wal_keyaccountmanager_id_value?: string;
    _wal_projectmanager_id_value?: string;
    _wal_responsibleperson_id_value?: string;
    [annotation: string]: unknown;
};

type WorkOrderRow = {
    msdyn_workorderid?: string;
    msdyn_name?: string;
    msdyn_workordersummary?: string;
    msdyn_systemstatus?: number;
    wal_projectdesignation_fx?: string;
    wal_startdatebooking_dat?: string;
    wal_installationpreferreddate_dat?: string;
    modifiedon?: string;
    _ownerid_value?: string;
    _msdyn_serviceaccount_value?: string;
    _msdyn_substatus_value?: string;
    _wal_project_id_value?: string;
    _wal_projectmanager_id_value?: string;
    [annotation: string]: unknown;
};

type ActivityItem = {
    id: string;
    entityName: string;
    kind: ActivityKind;
    subject: string;
    detail: string;
    regarding: string;
    dueOn: string | null;
    priority: number;
    priorityLabel: string;
    bucket: ActivityBucket;
};

type LeadItem = {
    id: string;
    name: string;
    company: string;
    topic: string;
    quality: number;
    qualityLabel: string;
    statusLabel: string;
    idleDays: number;
};

type ProjectItem = {
    id: string;
    number: string;
    name: string;
    customer: string;
    city: string;
    statusLabel: string;
    potentialLabel: string;
    followUpOn: string | null;
    decisionOn: string | null;
    roles: Role[];
    idleDays: number;
};

type InquiryItem = {
    id: string;
    name: string;
    customer: string;
    city: string;
    statusLabel: string;
    potentialLabel: string;
    deadlineOn: string | null;
    resubmissionOn: string | null;
    roles: Role[];
    idleDays: number;
};

type WorkOrderItem = {
    id: string;
    number: string;
    name: string;
    project: string;
    customer: string;
    statusLabel: string;
    substatusLabel: string;
    bookedOn: string | null;
    preferredOn: string | null;
    roles: Role[];
    idleDays: number;
};

type UserSettingsRow = {
    dateformatstring?: string;
    dateseparator?: string;
    [key: string]: unknown;
};

type Snapshot = {
    activities: ActivityItem[];
    leads: LeadItem[];
    projects: ProjectItem[];
    inquiries: InquiryItem[];
    workOrders: WorkOrderItem[];
    /** Logical names of tables whose query failed (partial load). */
    failed: string[];
};

type LoadState = Snapshot & {
    loading: boolean;
    error: string | null;
};

/* -------------------------------------------------------------------------
 * Localization — env has en-US (1033), de-DE (1031), fr-FR (1036)
 * ---------------------------------------------------------------------- */

type Language = { code: string; isRtl: boolean };

const LANGUAGES: Record<number, Language> = {
    1033: { code: "en-US", isRtl: false },
    1031: { code: "de-DE", isRtl: false },
    1036: { code: "fr-FR", isRtl: false },
};

const translations: Record<string, Record<string, string>> = {
    "en-US": {
        title: "My Day",
        subtitle: "Activities, leads, projects, inquiries and work orders that belong to you",
        refresh: "Refresh",
        idleFrom: "Idle from",
        days: "{0} days",
        kpiToday: "Due today",
        kpiOverdue: "Overdue",
        kpiLeads: "Leads",
        kpiProjects: "Projects",
        kpiInquiries: "Project inquiries",
        kpiWorkOrders: "Work orders",
        activities: "Activities",
        bucketToday: "Today",
        bucketOverdue: "Overdue",
        bucketUpcoming: "Upcoming",
        bucketUndated: "No date",
        typeAll: "All types",
        typeAppointment: "Appointment",
        typeTask: "Task",
        typeProjectTask: "Project task",
        colSubject: "Subject",
        colType: "Type",
        colRegarding: "Regarding",
        colDue: "Due",
        colPriority: "Priority",
        open: "Open",
        openRecord: "Open {0}",
        noSubject: "No subject",
        noName: "No name",
        noCustomer: "No customer",
        priorityHigh: "High",
        loading: "Loading your day …",
        emptyToday: "Nothing is due today.",
        emptyOverdue: "Nothing is overdue.",
        emptyUpcoming: "Nothing is coming up.",
        emptyUndated: "Every activity has a date.",
        records: "My records",
        tabLeads: "Leads",
        tabProjects: "Projects",
        tabInquiries: "Inquiries",
        tabWorkOrders: "Work orders",
        staleOnly: "Idle only",
        emptyLeads: "You have no open leads.",
        emptyProjects: "You have no open projects.",
        emptyInquiries: "You have no open project inquiries.",
        emptyWorkOrders: "You have no open work orders.",
        emptyStale: "Nothing here has been idle for {0} days.",
        idleBadge: "{0} days idle",
        roleOwner: "Owner",
        roleGvl: "ASM",
        roleKam: "KAM",
        rolePm: "PM",
        roleResponsible: "Responsible",
        followUp: "Follow-up",
        decision: "Decision",
        deadline: "Deadline",
        resubmission: "Resubmission",
        booked: "Scheduled",
        preferred: "Preferred date",
        errorUser: "The signed-in user could not be determined.",
        errorLoad: "The data could not be loaded. Please try again.",
        errorPartial: "Not loaded: {0}",
    },
    "de-DE": {
        title: "Mein Tag",
        subtitle: "Aktivitäten, Leads, Projekte, Anfragen und Workorders, die dir gehören",
        refresh: "Aktualisieren",
        idleFrom: "Stillstand ab",
        days: "{0} Tage",
        kpiToday: "Heute fällig",
        kpiOverdue: "Überfällig",
        kpiLeads: "Leads",
        kpiProjects: "Projekte",
        kpiInquiries: "Projektanfragen",
        kpiWorkOrders: "Workorders",
        activities: "Aktivitäten",
        bucketToday: "Heute",
        bucketOverdue: "Überfällig",
        bucketUpcoming: "Demnächst",
        bucketUndated: "Ohne Termin",
        typeAll: "Alle Typen",
        typeAppointment: "Termin",
        typeTask: "Aufgabe",
        typeProjectTask: "Projektaufgabe",
        colSubject: "Betreff",
        colType: "Typ",
        colRegarding: "Bezug",
        colDue: "Fällig",
        colPriority: "Priorität",
        open: "Öffnen",
        openRecord: "{0} öffnen",
        noSubject: "Ohne Betreff",
        noName: "Ohne Namen",
        noCustomer: "Kein Kunde",
        priorityHigh: "Hoch",
        loading: "Dein Tag wird geladen …",
        emptyToday: "Heute ist nichts fällig.",
        emptyOverdue: "Nichts ist überfällig.",
        emptyUpcoming: "Nichts steht demnächst an.",
        emptyUndated: "Alle Aktivitäten haben einen Termin.",
        records: "Meine Datensätze",
        tabLeads: "Leads",
        tabProjects: "Projekte",
        tabInquiries: "Anfragen",
        tabWorkOrders: "Workorders",
        staleOnly: "Nur stille",
        emptyLeads: "Du hast keine offenen Leads.",
        emptyProjects: "Du hast keine offenen Projekte.",
        emptyInquiries: "Du hast keine offenen Projektanfragen.",
        emptyWorkOrders: "Du hast keine offenen Workorders.",
        emptyStale: "Hier steht nichts seit {0} Tagen still.",
        idleBadge: "{0} Tage still",
        roleOwner: "Besitzer",
        roleGvl: "GVL",
        roleKam: "KAM",
        rolePm: "PL",
        roleResponsible: "Verantwortlich",
        followUp: "Nachfass",
        decision: "Entscheidung",
        deadline: "Frist",
        resubmission: "Wiedervorlage",
        booked: "Einsatz",
        preferred: "Wunschtermin",
        errorUser: "Der angemeldete Benutzer konnte nicht ermittelt werden.",
        errorLoad: "Die Daten konnten nicht geladen werden. Bitte erneut versuchen.",
        errorPartial: "Nicht geladen: {0}",
    },
    "fr-FR": {
        title: "Ma journée",
        subtitle: "Activités, leads, projets, demandes et ordres de travail qui vous appartiennent",
        refresh: "Actualiser",
        idleFrom: "Inactif depuis",
        days: "{0} jours",
        kpiToday: "À faire aujourd'hui",
        kpiOverdue: "En retard",
        kpiLeads: "Leads",
        kpiProjects: "Projets",
        kpiInquiries: "Demandes de projet",
        kpiWorkOrders: "Ordres de travail",
        activities: "Activités",
        bucketToday: "Aujourd'hui",
        bucketOverdue: "En retard",
        bucketUpcoming: "À venir",
        bucketUndated: "Sans date",
        typeAll: "Tous les types",
        typeAppointment: "Rendez-vous",
        typeTask: "Tâche",
        typeProjectTask: "Tâche de projet",
        colSubject: "Objet",
        colType: "Type",
        colRegarding: "Concernant",
        colDue: "Échéance",
        colPriority: "Priorité",
        open: "Ouvrir",
        openRecord: "Ouvrir {0}",
        noSubject: "Sans objet",
        noName: "Sans nom",
        noCustomer: "Aucun client",
        priorityHigh: "Haute",
        loading: "Chargement de votre journée …",
        emptyToday: "Rien à faire aujourd'hui.",
        emptyOverdue: "Rien n'est en retard.",
        emptyUpcoming: "Rien à venir.",
        emptyUndated: "Toutes les activités ont une date.",
        records: "Mes enregistrements",
        tabLeads: "Leads",
        tabProjects: "Projets",
        tabInquiries: "Demandes",
        tabWorkOrders: "Ordres de travail",
        staleOnly: "Inactifs seulement",
        emptyLeads: "Vous n'avez aucun lead ouvert.",
        emptyProjects: "Vous n'avez aucun projet ouvert.",
        emptyInquiries: "Vous n'avez aucune demande de projet ouverte.",
        emptyWorkOrders: "Vous n'avez aucun ordre de travail ouvert.",
        emptyStale: "Rien ici n'est inactif depuis {0} jours.",
        idleBadge: "{0} jours inactif",
        roleOwner: "Propriétaire",
        roleGvl: "ASM",
        roleKam: "KAM",
        rolePm: "CP",
        roleResponsible: "Responsable",
        followUp: "Relance",
        decision: "Décision",
        deadline: "Échéance",
        resubmission: "Rappel",
        booked: "Intervention",
        preferred: "Date souhaitée",
        errorUser: "L'utilisateur connecté n'a pas pu être déterminé.",
        errorLoad: "Les données n'ont pas pu être chargées. Veuillez réessayer.",
        errorPartial: "Non chargé : {0}",
    },
};

type Translate = (key: string, ...args: Array<string | number>) => string;

function detectLanguage(): Language {
    const languageId =
        typeof Xrm !== "undefined" ? Xrm.Utility?.getGlobalContext()?.userSettings?.languageId : undefined;
    return (typeof languageId === "number" && LANGUAGES[languageId]) || LANGUAGES[1033];
}

function makeTranslate(language: Language): Translate {
    return (key, ...args) => {
        const template = translations[language.code]?.[key] ?? translations["en-US"]?.[key] ?? key;
        return args.reduce<string>(
            (text, arg, index) => text.split(`{${index}}`).join(String(arg)),
            template,
        );
    };
}

/* -------------------------------------------------------------------------
 * Window-backed cache (see references/data-caching.md)
 * ---------------------------------------------------------------------- */

const winAny = window as unknown as Record<string, unknown>;
const DATA_CACHE = "__genpage_myday_data_v1";
const DATA_INFLIGHT = "__genpage_myday_data_inflight_v1";
const SETTINGS_CACHE = "__genpage_myday_usersettings_v1";
const SETTINGS_INFLIGHT = "__genpage_myday_usersettings_inflight_v1";

/** Rows per query — one rep's open items stay well below this. */
const PAGE_SIZE = 200;
/** "Idle" thresholds offered in the filter, in days. */
const IDLE_OPTIONS = [7, 14, 30];
const DEFAULT_IDLE_DAYS = 14;

const EMPTY_SNAPSHOT: Snapshot = {
    activities: [],
    leads: [],
    projects: [],
    inquiries: [],
    workOrders: [],
    failed: [],
};

/* -------------------------------------------------------------------------
 * Utilities (top-level functions, never nested)
 * ---------------------------------------------------------------------- */

function stripBraces(value: string): string {
    return value.replace("{", "").replace("}", "");
}

function readFormatted(row: Record<string, unknown>, column: string): string {
    const value = row[`${column}${FORMATTED}`];
    return typeof value === "string" ? value : "";
}

/** Lookup GUIDs come back in mixed case depending on the source — compare loosely. */
function sameId(a: unknown, b: string): boolean {
    return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

/**
 * Date-only columns arrive as "yyyy-MM-dd"; parsing that with `new Date`
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

function daysBetween(fromIso: string | null | undefined, now: number): number {
    const from = parseDate(fromIso);
    if (!from) return 0;
    return Math.max(0, Math.floor((now - from.getTime()) / 86400000));
}

function isPast(iso: string | null, now: number): boolean {
    const date = parseDate(iso);
    return !!date && date.getTime() < startOfToday(now);
}

function bucketFor(dueIso: string | null, now: number): ActivityBucket {
    const due = parseDate(dueIso);
    if (!due) return "undated";
    const todayStart = startOfToday(now);
    const tomorrowStart = todayStart + 86400000;
    if (due.getTime() < todayStart) return "overdue";
    if (due.getTime() < tomorrowStart) return "today";
    return "upcoming";
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

function formatTime(iso: string | null): string {
    if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const date = parseDate(iso);
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toActivityItems(rows: ActivityRow[], kind: ActivityKind, entityName: string, now: number): ActivityItem[] {
    const items: ActivityItem[] = [];
    rows.forEach((row) => {
        if (!row.activityid) return;
        // An appointment happens at its start; a task is due at its end.
        const dueOn =
            kind === "appointment"
                ? row.scheduledstart ?? row.scheduledend ?? null
                : row.scheduledend ?? row.scheduledstart ?? null;
        items.push({
            id: row.activityid,
            entityName,
            kind,
            subject: row.subject || "",
            detail: kind === "projecttask" ? readFormatted(row, "wal_category_opt") : row.location ?? "",
            regarding: readFormatted(row, "_regardingobjectid_value"),
            dueOn,
            priority: row.prioritycode ?? 1,
            priorityLabel: readFormatted(row, "prioritycode"),
            bucket: bucketFor(dueOn, now),
        });
    });
    return items;
}

function rolesFor(row: Record<string, unknown>, me: string, columns: Array<[string, Role]>): Role[] {
    const roles: Role[] = [];
    columns.forEach(([column, role]) => {
        if (sameId(row[column], me)) roles.push(role);
    });
    return roles;
}

function toLeadItems(rows: LeadRow[], now: number): LeadItem[] {
    const items: LeadItem[] = [];
    rows.forEach((row) => {
        if (!row.leadid) return;
        const name = [row.firstname, row.lastname].filter((part) => !!part).join(" ");
        items.push({
            id: row.leadid,
            name: name || row.subject || "",
            company: row.companyname ?? "",
            topic: row.subject ?? "",
            quality: row.leadqualitycode ?? LEAD_WARM,
            qualityLabel: readFormatted(row, "leadqualitycode"),
            statusLabel: readFormatted(row, "statuscode"),
            idleDays: daysBetween(row.modifiedon, now),
        });
    });
    return items;
}

function toProjectItems(rows: ProjectRow[], me: string, now: number): ProjectItem[] {
    const items: ProjectItem[] = [];
    rows.forEach((row) => {
        if (!row.wal_projectid) return;
        items.push({
            id: row.wal_projectid,
            number: row.wal_projectsnumber_int ?? "",
            name: row.wal_projectdesignation_txt || "",
            customer: readFormatted(row, "_wal_endcustomer_id_value"),
            city: row.wal_city_txt ?? "",
            statusLabel: readFormatted(row, "statuscode"),
            potentialLabel: readFormatted(row, "wal_projectpotential_cur"),
            followUpOn: row.wal_followupdate_dat ?? null,
            decisionOn: row.wal_decisiondate_dat ?? null,
            roles: rolesFor(row, me, [
                ["_wal_areasalesmanager_id_value", "gvl"],
                ["_wal_keyaccountmanager_id_value", "kam"],
                ["_wal_projectmanager_id_value", "pm"],
                ["_ownerid_value", "owner"],
            ]),
            idleDays: daysBetween(row.modifiedon, now),
        });
    });
    return items;
}

function toInquiryItems(rows: InquiryRow[], me: string, now: number): InquiryItem[] {
    const items: InquiryItem[] = [];
    rows.forEach((row) => {
        if (!row.wal_projectinquiryid) return;
        items.push({
            id: row.wal_projectinquiryid,
            name: row.wal_topic_txt || "",
            customer:
                readFormatted(row, "_wal_customer_id_value") || readFormatted(row, "_wal_endcustomer_id_value"),
            city: row.wal_city_txt ?? "",
            statusLabel: readFormatted(row, "statuscode"),
            potentialLabel: readFormatted(row, "wal_projectpotential_cur"),
            deadlineOn: row.wal_deadline_dat ?? row.wal_decisiondate_dat ?? null,
            resubmissionOn: row.wal_resubmissiondate_dat ?? null,
            roles: rolesFor(row, me, [
                ["_wal_areasalesmanager_id_value", "gvl"],
                ["_wal_keyaccountmanager_id_value", "kam"],
                ["_wal_projectmanager_id_value", "pm"],
                ["_wal_responsibleperson_id_value", "responsible"],
                ["_ownerid_value", "owner"],
            ]),
            idleDays: daysBetween(row.modifiedon, now),
        });
    });
    return items;
}

function toWorkOrderItems(rows: WorkOrderRow[], me: string, now: number): WorkOrderItem[] {
    const items: WorkOrderItem[] = [];
    rows.forEach((row) => {
        if (!row.msdyn_workorderid) return;
        items.push({
            id: row.msdyn_workorderid,
            number: row.msdyn_name ?? "",
            name: row.msdyn_workordersummary || row.wal_projectdesignation_fx || "",
            project: readFormatted(row, "_wal_project_id_value") || row.wal_projectdesignation_fx || "",
            customer: readFormatted(row, "_msdyn_serviceaccount_value"),
            statusLabel: readFormatted(row, "msdyn_systemstatus"),
            substatusLabel: readFormatted(row, "_msdyn_substatus_value"),
            bookedOn: row.wal_startdatebooking_dat ?? null,
            preferredOn: row.wal_installationpreferreddate_dat ?? null,
            roles: rolesFor(row, me, [
                ["_wal_projectmanager_id_value", "pm"],
                ["_ownerid_value", "owner"],
            ]),
            idleDays: daysBetween(row.modifiedon, now),
        });
    });
    return items;
}

/** Follow-up-style dates first (earliest on top, overdue included), undated last, then most idle. */
function compareByDateThenIdle(aDate: string | null, bDate: string | null, aIdle: number, bIdle: number): number {
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return bIdle - aIdle;
}

/** Opens the record's main form inside the model-driven app. */
function openRecord(entityName: string, entityId: string): void {
    if (typeof Xrm === "undefined" || !Xrm.Navigation?.openForm) return;
    Xrm.Navigation.openForm({ entityName, entityId }).catch((navError: unknown) => {
        console.error("Record could not be opened", navError);
    });
}

function kindLabel(kind: ActivityKind, t: Translate): string {
    switch (kind) {
        case "appointment": return t("typeAppointment");
        case "task": return t("typeTask");
        default: return t("typeProjectTask");
    }
}

function kindIcon(kind: ActivityKind): React.ReactElement {
    switch (kind) {
        case "appointment": return <CalendarLtrRegular />;
        case "task": return <CheckboxCheckedRegular />;
        default: return <ClipboardTaskRegular />;
    }
}

function roleLabel(role: Role, t: Translate): string {
    switch (role) {
        case "gvl": return t("roleGvl");
        case "kam": return t("roleKam");
        case "pm": return t("rolePm");
        case "responsible": return t("roleResponsible");
        default: return t("roleOwner");
    }
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
        ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
        ...shorthands.gap(tokens.spacingVerticalM),
        backgroundColor: tokens.colorNeutralBackground2,
    },
    header: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalM),
    },
    headerTitle: {
        display: "flex",
        flexDirection: "column",
    },
    headerActions: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalM),
    },
    idleField: {
        minWidth: "160px",
    },
    statRow: {
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        ...shorthands.gap(tokens.spacingHorizontalM),
        "@media (max-width: 1024px)": {
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        },
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
        backgroundColor: tokens.colorNeutralBackground1,
    },
    statLabel: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingHorizontalXS),
        color: tokens.colorNeutralForeground3,
    },
    content: {
        display: "flex",
        flexDirection: "row",
        flexGrow: 1,
        minHeight: 0,
        ...shorthands.gap(tokens.spacingHorizontalM),
        "@media (max-width: 1024px)": {
            flexDirection: "column",
        },
    },
    activityPane: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
        minHeight: "240px",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground1,
        overflow: "hidden",
    },
    paneHeader: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalS),
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    },
    paneHeaderControls: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalS),
    },
    kindDropdown: {
        minWidth: "150px",
    },
    listScroll: {
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "auto",
    },
    sidePane: {
        display: "flex",
        flexDirection: "column",
        width: "440px",
        flexShrink: 0,
        minHeight: "240px",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground1,
        overflow: "hidden",
        "@media (max-width: 1024px)": {
            width: "auto",
        },
    },
    sideList: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
    },
    sideItem: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        ...shorthands.gap(tokens.spacingHorizontalS),
        ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
        cursor: "pointer",
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
    },
    sideItemBody: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        flexGrow: 1,
        ...shorthands.gap(tokens.spacingVerticalXXS),
    },
    sideItemBadges: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        flexShrink: 0,
        ...shorthands.gap(tokens.spacingVerticalXXS),
    },
    badgeRow: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        ...shorthands.gap(tokens.spacingHorizontalXS),
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
    overdue: {
        color: tokens.colorPaletteRedForeground1,
    },
    selectableRow: {
        cursor: "pointer",
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
});

/* -------------------------------------------------------------------------
 * Sub-components (top-level functions)
 * ---------------------------------------------------------------------- */

type StatCardProps = {
    icon: React.ReactElement;
    label: string;
    value: number;
    tone?: "default" | "warning" | "danger";
};

function StatCard(props: StatCardProps): React.ReactElement {
    const styles = useStyles();
    const { icon, label, value, tone = "default" } = props;
    const color =
        tone === "danger"
            ? tokens.colorPaletteRedForeground1
            : tone === "warning"
                ? tokens.colorPaletteDarkOrangeForeground1
                : tokens.colorNeutralForeground1;
    return (
        <section className={styles.statCard} aria-label={label}>
            <span className={styles.statLabel}>
                {icon}
                <Caption1>{label}</Caption1>
            </span>
            <Text size={700} weight="semibold" style={{ color }}>
                {value}
            </Text>
        </section>
    );
}

function IdleBadge(props: { days: number; threshold: number; t: Translate }): React.ReactElement | null {
    const { days, threshold, t } = props;
    if (days < threshold) return null;
    const color = days >= threshold * 2 ? "danger" : "warning";
    return (
        <Badge appearance="tint" color={color}>
            {t("idleBadge", days)}
        </Badge>
    );
}

function RoleBadges(props: { roles: Role[]; t: Translate }): React.ReactElement | null {
    const { roles, t } = props;
    if (roles.length === 0) return null;
    return (
        <>
            {roles.map((role) => (
                <Badge key={role} appearance="outline" size="small">
                    {roleLabel(role, t)}
                </Badge>
            ))}
        </>
    );
}

function DateLine(props: {
    label: string;
    iso: string | null;
    settings: UserSettingsRow | null;
    now: number;
    highlightPast?: boolean;
}): React.ReactElement | null {
    const styles = useStyles();
    const { label, iso, settings, now, highlightPast = false } = props;
    if (!iso) return null;
    const past = highlightPast && isPast(iso, now);
    return (
        <span className={past ? styles.overdue : undefined}>
            {`${label} ${formatDate(iso, settings)}`}
        </span>
    );
}

type RecordCardProps = {
    entityName: string;
    id: string;
    title: string;
    subtitle: string;
    meta: React.ReactNode;
    badges: React.ReactNode;
    idleDays: number;
    threshold: number;
    t: Translate;
};

function RecordCard(props: RecordCardProps): React.ReactElement {
    const styles = useStyles();
    const { entityName, id, title, subtitle, meta, badges, idleDays, threshold, t } = props;
    return (
        <div
            className={styles.sideItem}
            role="button"
            tabIndex={0}
            aria-label={t("openRecord", title)}
            onClick={() => openRecord(entityName, id)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openRecord(entityName, id);
                }
            }}
        >
            <div className={styles.sideItemBody}>
                <Body1 className={styles.truncate} title={title}>
                    {title}
                </Body1>
                {subtitle ? (
                    <Caption1 className={styles.truncate} title={subtitle}>
                        {subtitle}
                    </Caption1>
                ) : null}
                <Caption1 className={styles.muted}>{meta}</Caption1>
                <div className={styles.badgeRow}>{badges}</div>
            </div>
            <div className={styles.sideItemBadges}>
                <IdleBadge days={idleDays} threshold={threshold} t={t} />
            </div>
        </div>
    );
}

function joinMeta(parts: Array<React.ReactNode>): React.ReactNode {
    const present = parts.filter((part) => part !== null && part !== undefined && part !== "");
    if (present.length === 0) return "—";
    return present.map((part, index) => (
        <React.Fragment key={index}>
            {index > 0 ? " · " : ""}
            {part}
        </React.Fragment>
    ));
}

/* -------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------- */

const GeneratedComponent = (props: GeneratedComponentProps) => {
    const { dataApi } = props;
    const styles = useStyles();

    // Never depend on `dataApi` itself — the host hands a new reference every render.
    const dataReady = !!dataApi;

    const language = useMemo(() => detectLanguage(), []);
    const t = useMemo(() => makeTranslate(language), [language]);

    // Callback ref, so the portal mount node exists before any dropdown opens.
    const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
    const setContainer = useCallback((node: HTMLDivElement | null) => setMountNode(node), []);

    const [reloadKey, setReloadKey] = useState(0);
    const [bucket, setBucket] = useState<ActivityBucket>("today");
    const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");
    const [recordTab, setRecordTab] = useState<RecordTab>("projects");
    const [staleOnly, setStaleOnly] = useState(false);
    const [idleDays, setIdleDays] = useState<number>(DEFAULT_IDLE_DAYS);

    const [settings, setSettings] = useState<UserSettingsRow | null>(
        () => (winAny[SETTINGS_CACHE] as UserSettingsRow | undefined) ?? null,
    );

    const [{ activities, leads, projects, inquiries, workOrders, failed, loading, error }, setData] =
        useState<LoadState>(() => {
            const cached = winAny[DATA_CACHE] as Snapshot | undefined;
            return { ...(cached ?? EMPTY_SNAPSHOT), loading: cached === undefined, error: null };
        });

    // --- User formatting preferences (own effect, own single setState) ------
    useEffect(() => {
        if (!dataReady) return;
        const cached = winAny[SETTINGS_CACHE] as UserSettingsRow | undefined;
        if (cached !== undefined) {
            setSettings(cached);
            return;
        }
        const rawUserId =
            typeof Xrm !== "undefined" ? Xrm.Utility?.getGlobalContext()?.userSettings?.userId : "";
        if (!rawUserId) return;
        const currentUserId = stripBraces(rawUserId);
        let cancelled = false;

        let pending = winAny[SETTINGS_INFLIGHT] as Promise<UserSettingsRow> | undefined;
        if (!pending) {
            // Typed intermediate: `dataApi as any` would widen the chain to `any`,
            // which stops TypeScript narrowing `pending` away from `undefined`.
            const fetchSettings: Promise<UserSettingsRow> = (dataApi as any)
                .retrieveRow("usersettings", {
                    id: currentUserId,
                    select: ["uilanguageid", "localeid", "dateformatstring", "dateseparator"],
                })
                .then((row: UserSettingsRow) => {
                    winAny[SETTINGS_CACHE] = row;
                    return row;
                })
                .finally(() => {
                    if (winAny[SETTINGS_INFLIGHT] === fetchSettings) delete winAny[SETTINGS_INFLIGHT];
                });
            winAny[SETTINGS_INFLIGHT] = fetchSettings;
            pending = fetchSettings;
        }

        pending
            .then((row: UserSettingsRow) => {
                if (!cancelled) setSettings(row);
            })
            .catch((fetchError: unknown) => {
                console.error("User settings could not be loaded", fetchError);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady]);

    // --- Activities + records (one batched setState) --------------------------
    useEffect(() => {
        if (!dataReady) return;

        const cached = winAny[DATA_CACHE] as Snapshot | undefined;
        if (cached !== undefined && reloadKey === 0) {
            if (activities !== cached.activities) setData({ ...cached, loading: false, error: null });
            return;
        }

        const rawUserId =
            typeof Xrm !== "undefined" ? Xrm.Utility?.getGlobalContext()?.userSettings?.userId : "";
        if (!rawUserId) {
            setData({ ...EMPTY_SNAPSHOT, loading: false, error: t("errorUser") });
            return;
        }
        const currentUserId = stripBraces(rawUserId);
        let cancelled = false;

        let inflight = winAny[DATA_INFLIGHT] as Promise<Snapshot> | undefined;
        if (!inflight) {
            inflight = loadSnapshot(dataApi, currentUserId).finally(() => {
                if (winAny[DATA_INFLIGHT] === inflight) delete winAny[DATA_INFLIGHT];
            });
            winAny[DATA_INFLIGHT] = inflight;
        }

        inflight
            .then((snapshot) => {
                if (!cancelled) setData({ ...snapshot, loading: false, error: null });
            })
            .catch((loadError: unknown) => {
                console.error("My Day could not be loaded", loadError);
                if (!cancelled) setData({ ...EMPTY_SNAPSHOT, loading: false, error: t("errorLoad") });
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady, reloadKey]);

    // --- Derived values — all memos above every early return ----------------
    const now = Date.now();

    const bucketCounts = useMemo(() => {
        const counts: Record<ActivityBucket, number> = { today: 0, overdue: 0, undated: 0, upcoming: 0 };
        activities.forEach((item) => {
            if (kindFilter !== "all" && item.kind !== kindFilter) return;
            counts[item.bucket] += 1;
        });
        return counts;
    }, [activities, kindFilter]);

    const totalCounts = useMemo(() => {
        const counts: Record<ActivityBucket, number> = { today: 0, overdue: 0, undated: 0, upcoming: 0 };
        activities.forEach((item) => {
            counts[item.bucket] += 1;
        });
        return counts;
    }, [activities]);

    const visibleActivities = useMemo(
        () =>
            activities
                .filter((item) => item.bucket === bucket && (kindFilter === "all" || item.kind === kindFilter))
                .sort((a, b) => {
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    return (a.dueOn ?? "").localeCompare(b.dueOn ?? "");
                }),
        [activities, bucket, kindFilter],
    );

    const visibleLeads = useMemo(
        () =>
            leads
                .filter((item) => !staleOnly || item.idleDays >= idleDays)
                .sort((a, b) => b.idleDays - a.idleDays),
        [leads, staleOnly, idleDays],
    );

    const visibleProjects = useMemo(
        () =>
            projects
                .filter((item) => !staleOnly || item.idleDays >= idleDays)
                .sort((a, b) => compareByDateThenIdle(a.followUpOn, b.followUpOn, a.idleDays, b.idleDays)),
        [projects, staleOnly, idleDays],
    );

    const visibleInquiries = useMemo(
        () =>
            inquiries
                .filter((item) => !staleOnly || item.idleDays >= idleDays)
                .sort((a, b) =>
                    compareByDateThenIdle(
                        a.resubmissionOn ?? a.deadlineOn,
                        b.resubmissionOn ?? b.deadlineOn,
                        a.idleDays,
                        b.idleDays,
                    ),
                ),
        [inquiries, staleOnly, idleDays],
    );

    const visibleWorkOrders = useMemo(
        () =>
            workOrders
                .filter((item) => !staleOnly || item.idleDays >= idleDays)
                .sort((a, b) =>
                    compareByDateThenIdle(
                        a.bookedOn ?? a.preferredOn,
                        b.bookedOn ?? b.preferredOn,
                        a.idleDays,
                        b.idleDays,
                    ),
                ),
        [workOrders, staleOnly, idleDays],
    );

    const columns = useMemo(
        () => [
            createTableColumn<ActivityItem>({
                columnId: "subject",
                compare: (a, b) => a.subject.localeCompare(b.subject),
                renderHeaderCell: () => t("colSubject"),
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            title={item.subject || t("noSubject")}
                            style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontWeight: item.priority === PRIORITY_HIGH ? 600 : undefined,
                            }}
                        >
                            {item.subject || t("noSubject")}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "type",
                compare: (a, b) => kindLabel(a.kind, t).localeCompare(kindLabel(b.kind, t)),
                renderHeaderCell: () => t("colType"),
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            title={item.detail}
                            style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: "2px" }}
                        >
                            <Badge appearance="outline" icon={kindIcon(item.kind)}>
                                {kindLabel(item.kind, t)}
                            </Badge>
                            {item.detail ? (
                                <Caption1
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        color: tokens.colorNeutralForeground3,
                                    }}
                                >
                                    {item.detail}
                                </Caption1>
                            ) : null}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "regarding",
                compare: (a, b) => a.regarding.localeCompare(b.regarding),
                renderHeaderCell: () => t("colRegarding"),
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            title={item.regarding}
                            style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {item.regarding || "—"}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "dueOn",
                compare: (a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""),
                renderHeaderCell: () => t("colDue"),
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            style={{
                                color: item.bucket === "overdue" ? tokens.colorPaletteRedForeground1 : undefined,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {item.dueOn
                                ? `${formatDate(item.dueOn, settings)} ${formatTime(item.dueOn)}`.trim()
                                : "—"}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "priority",
                compare: (a, b) => b.priority - a.priority,
                renderHeaderCell: () => t("colPriority"),
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        {item.priority === PRIORITY_HIGH ? (
                            <Badge appearance="tint" color="danger">
                                {item.priorityLabel || t("priorityHigh")}
                            </Badge>
                        ) : (
                            <span>{item.priorityLabel || "—"}</span>
                        )}
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "open",
                compare: () => 0,
                renderHeaderCell: () => "",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <Link
                            as="button"
                            aria-label={t("openRecord", item.subject || t("noSubject"))}
                            onClick={(event: React.MouseEvent) => {
                                event.stopPropagation();
                                openRecord(item.entityName, item.id);
                            }}
                        >
                            <OpenRegular /> {t("open")}
                        </Link>
                    </TableCellLayout>
                ),
            }),
        ],
        [settings, t],
    );

    const columnSizingOptions = useMemo(
        () => ({
            subject: { defaultWidth: 280, minWidth: 160, idealWidth: 280 },
            type: { defaultWidth: 150, minWidth: 110, idealWidth: 150 },
            regarding: { defaultWidth: 180, minWidth: 120, idealWidth: 180 },
            dueOn: { defaultWidth: 150, minWidth: 120, idealWidth: 150 },
            priority: { defaultWidth: 100, minWidth: 90, idealWidth: 100 },
            open: { defaultWidth: 100, minWidth: 90, idealWidth: 100 },
        }),
        [],
    );

    const handleRefresh = useCallback(() => {
        delete winAny[DATA_CACHE];
        setData({ ...EMPTY_SNAPSHOT, loading: true, error: null });
        setReloadKey((key) => key + 1);
    }, []);

    const todayLabel = formatDate(new Date(now).toISOString(), settings);

    const kindOptions: Array<[ActivityKindFilter, string]> = [
        ["all", t("typeAll")],
        ["appointment", t("typeAppointment")],
        ["task", t("typeTask")],
        ["projecttask", t("typeProjectTask")],
    ];
    const kindValue = kindOptions.find(([value]) => value === kindFilter)?.[1] ?? t("typeAll");

    const activityEmptyText =
        bucket === "today"
            ? t("emptyToday")
            : bucket === "overdue"
                ? t("emptyOverdue")
                : bucket === "upcoming"
                    ? t("emptyUpcoming")
                    : t("emptyUndated");

    const recordEmptyText = (all: number, visible: number, emptyKey: string): string =>
        all > 0 && visible === 0 ? t("emptyStale", idleDays) : t(emptyKey);

    // --- Render (every hook has been called by this point) ------------------
    return (
        <div ref={setContainer} className={styles.root} dir={language.isRtl ? "rtl" : "ltr"}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <Title3>{t("title")}</Title3>
                    <Caption1>{`${todayLabel} · ${t("subtitle")}`}</Caption1>
                </div>
                <div className={styles.headerActions}>
                    <Field label={t("idleFrom")} className={styles.idleField}>
                        <Dropdown
                            mountNode={mountNode}
                            selectedOptions={[String(idleDays)]}
                            value={t("days", idleDays)}
                            onOptionSelect={(_event, data) => {
                                const parsed = Number(data.optionValue);
                                if (Number.isFinite(parsed)) setIdleDays(parsed);
                            }}
                        >
                            {IDLE_OPTIONS.map((days) => (
                                <Option key={days} value={String(days)}>
                                    {t("days", days)}
                                </Option>
                            ))}
                        </Dropdown>
                    </Field>
                    <Button
                        appearance="secondary"
                        icon={<ArrowClockwiseRegular />}
                        onClick={handleRefresh}
                        disabled={loading}
                    >
                        {t("refresh")}
                    </Button>
                </div>
            </header>

            <div className={styles.statRow}>
                <StatCard icon={<CalendarTodayRegular />} label={t("kpiToday")} value={totalCounts.today} />
                <StatCard
                    icon={<WarningRegular />}
                    label={t("kpiOverdue")}
                    value={totalCounts.overdue}
                    tone="danger"
                />
                <StatCard icon={<PersonRegular />} label={t("kpiLeads")} value={leads.length} />
                <StatCard icon={<FolderRegular />} label={t("kpiProjects")} value={projects.length} />
                <StatCard
                    icon={<DocumentQuestionMarkRegular />}
                    label={t("kpiInquiries")}
                    value={inquiries.length}
                />
                <StatCard icon={<WrenchRegular />} label={t("kpiWorkOrders")} value={workOrders.length} />
            </div>

            {error ? (
                <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
            ) : failed.length > 0 ? (
                <MessageBar intent="warning">
                    <MessageBarBody>{t("errorPartial", failed.join(", "))}</MessageBarBody>
                </MessageBar>
            ) : null}

            <div className={styles.content}>
                <main className={styles.activityPane} aria-label={t("activities")}>
                    <div className={styles.paneHeader}>
                        <Subtitle2>{t("activities")}</Subtitle2>
                        <div className={styles.paneHeaderControls}>
                            <TabList
                                selectedValue={bucket}
                                onTabSelect={(_event, data) => setBucket(data.value as ActivityBucket)}
                                size="small"
                            >
                                <Tab value="today" icon={<CalendarTodayRegular />}>
                                    {`${t("bucketToday")} (${bucketCounts.today})`}
                                </Tab>
                                <Tab value="overdue" icon={<WarningRegular />}>
                                    {`${t("bucketOverdue")} (${bucketCounts.overdue})`}
                                </Tab>
                                <Tab value="upcoming" icon={<CalendarClockRegular />}>
                                    {`${t("bucketUpcoming")} (${bucketCounts.upcoming})`}
                                </Tab>
                                <Tab value="undated" icon={<CalendarQuestionMarkRegular />}>
                                    {`${t("bucketUndated")} (${bucketCounts.undated})`}
                                </Tab>
                            </TabList>
                            <Dropdown
                                className={styles.kindDropdown}
                                size="small"
                                mountNode={mountNode}
                                aria-label={t("colType")}
                                selectedOptions={[kindFilter]}
                                value={kindValue}
                                onOptionSelect={(_event, data) => {
                                    if (data.optionValue) setKindFilter(data.optionValue as ActivityKindFilter);
                                }}
                            >
                                {kindOptions.map(([value, label]) => (
                                    <Option key={value} value={value}>
                                        {label}
                                    </Option>
                                ))}
                            </Dropdown>
                        </div>
                    </div>
                    {loading ? (
                        <div className={styles.emptyState}>
                            <Spinner label={t("loading")} />
                        </div>
                    ) : visibleActivities.length === 0 ? (
                        <div className={styles.emptyState}>
                            <CalendarTodayRegular fontSize={32} />
                            <Body1>{activityEmptyText}</Body1>
                        </div>
                    ) : (
                        <div className={styles.listScroll}>
                            <DataGrid
                                items={visibleActivities}
                                columns={columns}
                                sortable
                                resizableColumns
                                columnSizingOptions={columnSizingOptions}
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
                                <DataGridBody<ActivityItem>>
                                    {({ item, rowId }) => (
                                        <DataGridRow<ActivityItem>
                                            key={rowId}
                                            className={styles.selectableRow}
                                            onClick={() => openRecord(item.entityName, item.id)}
                                        >
                                            {({ renderCell }) => (
                                                <DataGridCell>{renderCell(item)}</DataGridCell>
                                            )}
                                        </DataGridRow>
                                    )}
                                </DataGridBody>
                            </DataGrid>
                        </div>
                    )}
                </main>

                <aside className={styles.sidePane} aria-label={t("records")}>
                    <div className={styles.paneHeader}>
                        <TabList
                            selectedValue={recordTab}
                            onTabSelect={(_event, data) => setRecordTab(data.value as RecordTab)}
                            size="small"
                        >
                            <Tab value="leads" icon={<PersonRegular />}>
                                {`${t("tabLeads")} (${visibleLeads.length})`}
                            </Tab>
                            <Tab value="projects" icon={<FolderRegular />}>
                                {`${t("tabProjects")} (${visibleProjects.length})`}
                            </Tab>
                            <Tab value="inquiries" icon={<DocumentQuestionMarkRegular />}>
                                {`${t("tabInquiries")} (${visibleInquiries.length})`}
                            </Tab>
                            <Tab value="workorders" icon={<WrenchRegular />}>
                                {`${t("tabWorkOrders")} (${visibleWorkOrders.length})`}
                            </Tab>
                        </TabList>
                        <Switch
                            label={t("staleOnly")}
                            checked={staleOnly}
                            onChange={(_event, data) => setStaleOnly(data.checked)}
                        />
                    </div>
                    {loading ? (
                        <div className={styles.emptyState}>
                            <Spinner />
                        </div>
                    ) : recordTab === "leads" ? (
                        visibleLeads.length === 0 ? (
                            <div className={styles.emptyState}>
                                <PersonRegular fontSize={28} />
                                <Body1>{recordEmptyText(leads.length, visibleLeads.length, "emptyLeads")}</Body1>
                            </div>
                        ) : (
                            <div className={styles.sideList}>
                                {visibleLeads.map((item) => (
                                    <RecordCard
                                        key={item.id}
                                        entityName="lead"
                                        id={item.id}
                                        title={item.name || t("noName")}
                                        subtitle={item.company || item.topic}
                                        meta={joinMeta([item.statusLabel])}
                                        badges={
                                            <Badge
                                                appearance="tint"
                                                color={
                                                    item.quality === LEAD_HOT
                                                        ? "danger"
                                                        : item.quality === LEAD_WARM
                                                            ? "warning"
                                                            : "informative"
                                                }
                                            >
                                                {item.qualityLabel || "—"}
                                            </Badge>
                                        }
                                        idleDays={item.idleDays}
                                        threshold={idleDays}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )
                    ) : recordTab === "projects" ? (
                        visibleProjects.length === 0 ? (
                            <div className={styles.emptyState}>
                                <FolderRegular fontSize={28} />
                                <Body1>
                                    {recordEmptyText(projects.length, visibleProjects.length, "emptyProjects")}
                                </Body1>
                            </div>
                        ) : (
                            <div className={styles.sideList}>
                                {visibleProjects.map((item) => (
                                    <RecordCard
                                        key={item.id}
                                        entityName="wal_project"
                                        id={item.id}
                                        title={
                                            item.number
                                                ? `${item.number} · ${item.name || t("noName")}`
                                                : item.name || t("noName")
                                        }
                                        subtitle={[item.customer || t("noCustomer"), item.city]
                                            .filter((part) => !!part)
                                            .join(" · ")}
                                        meta={joinMeta([
                                            item.potentialLabel,
                                            <DateLine
                                                key="followup"
                                                label={t("followUp")}
                                                iso={item.followUpOn}
                                                settings={settings}
                                                now={now}
                                                highlightPast
                                            />,
                                            <DateLine
                                                key="decision"
                                                label={t("decision")}
                                                iso={item.decisionOn}
                                                settings={settings}
                                                now={now}
                                            />,
                                        ])}
                                        badges={
                                            <>
                                                {item.statusLabel ? (
                                                    <Badge appearance="tint" color="brand">
                                                        {item.statusLabel}
                                                    </Badge>
                                                ) : null}
                                                <RoleBadges roles={item.roles} t={t} />
                                            </>
                                        }
                                        idleDays={item.idleDays}
                                        threshold={idleDays}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )
                    ) : recordTab === "inquiries" ? (
                        visibleInquiries.length === 0 ? (
                            <div className={styles.emptyState}>
                                <DocumentQuestionMarkRegular fontSize={28} />
                                <Body1>
                                    {recordEmptyText(inquiries.length, visibleInquiries.length, "emptyInquiries")}
                                </Body1>
                            </div>
                        ) : (
                            <div className={styles.sideList}>
                                {visibleInquiries.map((item) => (
                                    <RecordCard
                                        key={item.id}
                                        entityName="wal_projectinquiry"
                                        id={item.id}
                                        title={item.name || t("noName")}
                                        subtitle={[item.customer || t("noCustomer"), item.city]
                                            .filter((part) => !!part)
                                            .join(" · ")}
                                        meta={joinMeta([
                                            item.potentialLabel,
                                            <DateLine
                                                key="resubmission"
                                                label={t("resubmission")}
                                                iso={item.resubmissionOn}
                                                settings={settings}
                                                now={now}
                                                highlightPast
                                            />,
                                            <DateLine
                                                key="deadline"
                                                label={t("deadline")}
                                                iso={item.deadlineOn}
                                                settings={settings}
                                                now={now}
                                                highlightPast
                                            />,
                                        ])}
                                        badges={
                                            <>
                                                {item.statusLabel ? (
                                                    <Badge appearance="tint" color="brand">
                                                        {item.statusLabel}
                                                    </Badge>
                                                ) : null}
                                                <RoleBadges roles={item.roles} t={t} />
                                            </>
                                        }
                                        idleDays={item.idleDays}
                                        threshold={idleDays}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )
                    ) : visibleWorkOrders.length === 0 ? (
                        <div className={styles.emptyState}>
                            <WrenchRegular fontSize={28} />
                            <Body1>
                                {recordEmptyText(workOrders.length, visibleWorkOrders.length, "emptyWorkOrders")}
                            </Body1>
                        </div>
                    ) : (
                        <div className={styles.sideList}>
                            {visibleWorkOrders.map((item) => (
                                <RecordCard
                                    key={item.id}
                                    entityName="msdyn_workorder"
                                    id={item.id}
                                    title={
                                        item.number
                                            ? `${item.number} · ${item.name || t("noName")}`
                                            : item.name || t("noName")
                                    }
                                    subtitle={[item.customer || t("noCustomer"), item.project]
                                        .filter((part) => !!part)
                                        .join(" · ")}
                                    meta={joinMeta([
                                        item.substatusLabel,
                                        <DateLine
                                            key="booked"
                                            label={t("booked")}
                                            iso={item.bookedOn}
                                            settings={settings}
                                            now={now}
                                        />,
                                        item.bookedOn ? null : (
                                            <DateLine
                                                key="preferred"
                                                label={t("preferred")}
                                                iso={item.preferredOn}
                                                settings={settings}
                                                now={now}
                                                highlightPast
                                            />
                                        ),
                                    ])}
                                    badges={
                                        <>
                                            {item.statusLabel ? (
                                                <Badge appearance="tint" color="brand">
                                                    {item.statusLabel}
                                                </Badge>
                                            ) : null}
                                            <RoleBadges roles={item.roles} t={t} />
                                        </>
                                    }
                                    idleDays={item.idleDays}
                                    threshold={idleDays}
                                    t={t}
                                />
                            ))}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

/* -------------------------------------------------------------------------
 * Data loading
 * ---------------------------------------------------------------------- */

type QueryResult = { rows?: unknown[] };

type Settled<T> = { ok: true; value: T } | { ok: false; reason: unknown };

/** Promise.allSettled without relying on the ES2020 lib being present in the host. */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
    return promise.then(
        (value): Settled<T> => ({ ok: true, value }),
        (reason: unknown): Settled<T> => ({ ok: false, reason }),
    );
}

async function loadSnapshot(dataApi: unknown, me: string): Promise<Snapshot> {
    const api = dataApi as any;
    const owned = `_ownerid_value eq ${me}`;
    // Team roles on Waldmann projects: GVL (area sales manager), KAM, project manager.
    const projectTeam =
        `${owned} or _wal_areasalesmanager_id_value eq ${me}` +
        ` or _wal_keyaccountmanager_id_value eq ${me} or _wal_projectmanager_id_value eq ${me}`;

    const queries: Array<[string, Promise<QueryResult>]> = [
        [
            "appointment",
            api.queryTable("appointment", {
                select: ["activityid", "subject", "scheduledstart", "scheduledend", "prioritycode", "location", "_regardingobjectid_value"],
                filter: `${owned} and (statecode eq 0 or statecode eq 3)`,
                orderBy: "scheduledstart asc",
                pageSize: PAGE_SIZE,
            }),
        ],
        [
            "task",
            api.queryTable("task", {
                select: ["activityid", "subject", "scheduledstart", "scheduledend", "prioritycode", "_regardingobjectid_value"],
                filter: `${owned} and statecode eq 0`,
                orderBy: "scheduledend asc",
                pageSize: PAGE_SIZE,
            }),
        ],
        [
            "wal_projecttask",
            api.queryTable("wal_projecttask", {
                select: ["activityid", "subject", "scheduledstart", "scheduledend", "prioritycode", "wal_category_opt", "_regardingobjectid_value"],
                filter: `${owned} and (statecode eq 0 or statecode eq 3)`,
                orderBy: "scheduledend asc",
                pageSize: PAGE_SIZE,
            }),
        ],
        [
            "lead",
            api.queryTable("lead", {
                select: ["leadid", "firstname", "lastname", "companyname", "subject", "leadqualitycode", "statuscode", "modifiedon"],
                filter: `${owned} and statecode eq 0`,
                orderBy: "modifiedon asc",
                pageSize: PAGE_SIZE,
            }),
        ],
        [
            "wal_project",
            api.queryTable("wal_project", {
                select: [
                    "wal_projectid",
                    "wal_projectsnumber_int",
                    "wal_projectdesignation_txt",
                    "wal_city_txt",
                    "wal_projectpotential_cur",
                    "wal_followupdate_dat",
                    "wal_decisiondate_dat",
                    "statuscode",
                    "modifiedon",
                    "_ownerid_value",
                    "_wal_endcustomer_id_value",
                    "_wal_areasalesmanager_id_value",
                    "_wal_keyaccountmanager_id_value",
                    "_wal_projectmanager_id_value",
                ],
                filter: `statecode eq 0 and (${projectTeam})`,
                orderBy: "wal_followupdate_dat asc",
                pageSize: PAGE_SIZE,
            }),
        ],
        [
            "wal_projectinquiry",
            api.queryTable("wal_projectinquiry", {
                select: [
                    "wal_projectinquiryid",
                    "wal_topic_txt",
                    "wal_city_txt",
                    "wal_projectpotential_cur",
                    "wal_deadline_dat",
                    "wal_resubmissiondate_dat",
                    "wal_decisiondate_dat",
                    "statuscode",
                    "modifiedon",
                    "_ownerid_value",
                    "_wal_customer_id_value",
                    "_wal_endcustomer_id_value",
                    "_wal_areasalesmanager_id_value",
                    "_wal_keyaccountmanager_id_value",
                    "_wal_projectmanager_id_value",
                    "_wal_responsibleperson_id_value",
                ],
                filter: `statecode eq 0 and (${projectTeam} or _wal_responsibleperson_id_value eq ${me})`,
                orderBy: "modifiedon asc",
                pageSize: PAGE_SIZE,
            }),
        ],
        [
            "msdyn_workorder",
            api.queryTable("msdyn_workorder", {
                select: [
                    "msdyn_workorderid",
                    "msdyn_name",
                    "msdyn_workordersummary",
                    "msdyn_systemstatus",
                    "wal_projectdesignation_fx",
                    "wal_startdatebooking_dat",
                    "wal_installationpreferreddate_dat",
                    "modifiedon",
                    "_ownerid_value",
                    "_msdyn_serviceaccount_value",
                    "_msdyn_substatus_value",
                    "_wal_project_id_value",
                    "_wal_projectmanager_id_value",
                ],
                filter:
                    `statecode eq 0 and (${owned} or _wal_projectmanager_id_value eq ${me})` +
                    ` and msdyn_systemstatus ne ${WO_COMPLETED}` +
                    ` and msdyn_systemstatus ne ${WO_POSTED}` +
                    ` and msdyn_systemstatus ne ${WO_CANCELED}`,
                orderBy: "wal_startdatebooking_dat asc",
                pageSize: PAGE_SIZE,
            }),
        ],
    ];

    // Settle every query: one table without read rights must not blank the whole page.
    const settled = await Promise.all(queries.map(([, promise]) => settle(promise)));
    const failed: string[] = [];
    const rowsOf = (index: number): unknown[] => {
        const result = settled[index];
        if (result.ok) return result.value?.rows ?? [];
        console.error(`My Day: ${queries[index][0]} could not be loaded`, result.reason);
        failed.push(queries[index][0]);
        return [];
    };

    const appointmentRows = rowsOf(0) as ActivityRow[];
    const taskRows = rowsOf(1) as ActivityRow[];
    const projectTaskRows = rowsOf(2) as ActivityRow[];
    const leadRows = rowsOf(3) as LeadRow[];
    const projectRows = rowsOf(4) as ProjectRow[];
    const inquiryRows = rowsOf(5) as InquiryRow[];
    const workOrderRows = rowsOf(6) as WorkOrderRow[];

    if (failed.length === queries.length) {
        throw new Error("All queries failed");
    }

    const now = Date.now();
    const snapshot: Snapshot = {
        activities: [
            ...toActivityItems(appointmentRows, "appointment", "appointment", now),
            ...toActivityItems(taskRows, "task", "task", now),
            ...toActivityItems(projectTaskRows, "projecttask", "wal_projecttask", now),
        ],
        leads: toLeadItems(leadRows, now),
        projects: toProjectItems(projectRows, me, now),
        inquiries: toInquiryItems(inquiryRows, me, now),
        workOrders: toWorkOrderItems(workOrderRows, me, now),
        failed,
    };
    winAny[DATA_CACHE] = snapshot;
    return snapshot;
}

export default GeneratedComponent;
