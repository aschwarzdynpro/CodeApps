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
    Tab,
    TableCellLayout,
    TabList,
    Text,
    Title3,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowClockwiseRegular,
    BriefcaseRegular,
    CalendarClockRegular,
    CalendarQuestionMarkRegular,
    CalendarTodayRegular,
    OpenRegular,
    PersonRegular,
    WarningRegular,
} from "@fluentui/react-icons";
import type { GeneratedComponentProps } from "./RuntimeTypes";

/* -------------------------------------------------------------------------
 * Domain model
 *
 * "Mein Tag" pulls three things a sales rep otherwise checks in three places:
 *   activitypointer — my open activities, bucketed by due date
 *   opportunity     — my open opportunities that have not moved in a while
 *   lead            — my open leads that have not moved in a while
 *
 * Column names come from RuntimeTypes.ts, generated against the target
 * environment. `_ownerid_value`, `modifiedon` and `createdon` are system
 * columns on the TableRow base, not listed in the per-table types.
 * ---------------------------------------------------------------------- */

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/** activitypointer_prioritycode */
const PRIORITY_HIGH = 2;

/** lead_leadqualitycode */
const LEAD_HOT = 1;
const LEAD_WARM = 2;

type ActivityBucket = "today" | "overdue" | "undated" | "upcoming";

type ActivityRow = {
    activityid?: string;
    subject?: string;
    activitytypecode?: string;
    scheduledend?: string;
    scheduledstart?: string;
    prioritycode?: number;
    _regardingobjectid_value?: string;
    [annotation: string]: unknown;
};

type OpportunityRow = {
    opportunityid?: string;
    name?: string;
    estimatedvalue?: number;
    estimatedclosedate?: string;
    closeprobability?: number;
    stepname?: string;
    salesstage?: number;
    _customerid_value?: string;
    modifiedon?: string;
    [annotation: string]: unknown;
};

type LeadRow = {
    leadid?: string;
    firstname?: string;
    lastname?: string;
    companyname?: string;
    subject?: string;
    leadqualitycode?: number;
    emailaddress1?: string;
    modifiedon?: string;
    createdon?: string;
    [annotation: string]: unknown;
};

type ActivityItem = {
    id: string;
    entityName: string;
    typeLabel: string;
    subject: string;
    regarding: string;
    dueOn: string | null;
    priority: number;
    priorityLabel: string;
    bucket: ActivityBucket;
};

type OpportunityItem = {
    id: string;
    name: string;
    customer: string;
    valueLabel: string;
    value: number;
    closeOn: string | null;
    stageLabel: string;
    modifiedOn: string | null;
    idleDays: number;
};

type LeadItem = {
    id: string;
    name: string;
    company: string;
    topic: string;
    quality: number;
    qualityLabel: string;
    modifiedOn: string | null;
    idleDays: number;
};

type UserSettingsRow = {
    dateformatstring?: string;
    dateseparator?: string;
    [key: string]: unknown;
};

type Snapshot = {
    activities: ActivityItem[];
    opportunities: OpportunityItem[];
    leads: LeadItem[];
};

type LoadState = Snapshot & {
    loading: boolean;
    error: string | null;
};

/* -------------------------------------------------------------------------
 * Window-backed cache (see references/data-caching.md)
 * ---------------------------------------------------------------------- */

const winAny = window as unknown as Record<string, unknown>;
const DATA_CACHE = "__genpage_meintag_data_v1";
const DATA_INFLIGHT = "__genpage_meintag_data_inflight_v1";
const SETTINGS_CACHE = "__genpage_meintag_usersettings_v1";
const SETTINGS_INFLIGHT = "__genpage_meintag_usersettings_inflight_v1";

/** Rows per query — one rep's open items stay well below this. */
const PAGE_SIZE = 200;
/** "Stale" thresholds offered in the filter, in days. */
const IDLE_OPTIONS = [7, 14, 30];
const DEFAULT_IDLE_DAYS = 14;

const EMPTY_SNAPSHOT: Snapshot = { activities: [], opportunities: [], leads: [] };

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

function startOfToday(now: number): number {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

function daysBetween(fromIso: string | null, now: number): number {
    if (!fromIso) return 0;
    const from = new Date(fromIso).getTime();
    if (Number.isNaN(from)) return 0;
    return Math.max(0, Math.floor((now - from) / 86400000));
}

function bucketFor(dueIso: string | null, now: number): ActivityBucket {
    if (!dueIso) return "undated";
    const due = new Date(dueIso).getTime();
    if (Number.isNaN(due)) return "undated";
    const todayStart = startOfToday(now);
    const tomorrowStart = todayStart + 86400000;
    if (due < todayStart) return "overdue";
    if (due < tomorrowStart) return "today";
    return "upcoming";
}

/** Formats a date with the signed-in user's Dataverse format, never a hardcoded one. */
function formatDate(iso: string | null, settings: UserSettingsRow | null): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
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
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toActivityItems(rows: ActivityRow[], now: number): ActivityItem[] {
    const items: ActivityItem[] = [];
    rows.forEach((row) => {
        if (!row.activityid || !row.activitytypecode) return;
        const dueOn = row.scheduledend ?? row.scheduledstart ?? null;
        items.push({
            id: row.activityid,
            entityName: row.activitytypecode,
            typeLabel: readFormatted(row, "activitytypecode") || row.activitytypecode,
            subject: row.subject || "Ohne Betreff",
            regarding: readFormatted(row, "_regardingobjectid_value"),
            dueOn,
            priority: row.prioritycode ?? 1,
            priorityLabel: readFormatted(row, "prioritycode"),
            bucket: bucketFor(dueOn, now),
        });
    });
    return items;
}

function toOpportunityItems(rows: OpportunityRow[], now: number): OpportunityItem[] {
    const items: OpportunityItem[] = [];
    rows.forEach((row) => {
        if (!row.opportunityid) return;
        items.push({
            id: row.opportunityid,
            name: row.name || "Ohne Namen",
            customer: readFormatted(row, "_customerid_value"),
            valueLabel: readFormatted(row, "estimatedvalue"),
            value: typeof row.estimatedvalue === "number" ? row.estimatedvalue : 0,
            closeOn: row.estimatedclosedate ?? null,
            stageLabel: row.stepname || readFormatted(row, "salesstage"),
            modifiedOn: row.modifiedon ?? null,
            idleDays: daysBetween(row.modifiedon ?? null, now),
        });
    });
    return items;
}

function toLeadItems(rows: LeadRow[], now: number): LeadItem[] {
    const items: LeadItem[] = [];
    rows.forEach((row) => {
        if (!row.leadid) return;
        const name = [row.firstname, row.lastname].filter((part) => !!part).join(" ");
        items.push({
            id: row.leadid,
            name: name || row.subject || "Ohne Namen",
            company: row.companyname ?? "",
            topic: row.subject ?? "",
            quality: row.leadqualitycode ?? LEAD_WARM,
            qualityLabel: readFormatted(row, "leadqualitycode"),
            modifiedOn: row.modifiedon ?? null,
            idleDays: daysBetween(row.modifiedon ?? null, now),
        });
    });
    return items;
}

/** Opens the record's main form inside the model-driven app. */
function openRecord(entityName: string, entityId: string): void {
    if (typeof Xrm === "undefined" || !Xrm.Navigation?.openForm) return;
    Xrm.Navigation.openForm({ entityName, entityId }).catch((navError: unknown) => {
        console.error("Datensatz konnte nicht geöffnet werden", navError);
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
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        ...shorthands.gap(tokens.spacingHorizontalM),
        "@media (max-width: 768px)": {
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
        minHeight: 0,
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
    listScroll: {
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "auto",
    },
    sidePane: {
        display: "flex",
        flexDirection: "column",
        width: "400px",
        flexShrink: 0,
        minHeight: 0,
        ...shorthands.gap(tokens.spacingVerticalM),
        "@media (max-width: 1024px)": {
            width: "auto",
        },
    },
    sideCard: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        flexBasis: 0,
        minHeight: "160px",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground1,
        overflow: "hidden",
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
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
    },
    sideItemBody: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...shorthands.gap(tokens.spacingVerticalXXS),
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

function IdleBadge(props: { days: number; threshold: number }): React.ReactElement {
    const { days, threshold } = props;
    const color = days >= threshold * 2 ? "danger" : "warning";
    return (
        <Badge appearance="tint" color={color}>
            {days} Tage still
        </Badge>
    );
}

function LeadQualityBadge(props: { quality: number; label: string }): React.ReactElement {
    const { quality, label } = props;
    const color = quality === LEAD_HOT ? "danger" : quality === LEAD_WARM ? "warning" : "informative";
    return (
        <Badge appearance="tint" color={color}>
            {label || "—"}
        </Badge>
    );
}

type OpportunityCardProps = {
    items: OpportunityItem[];
    threshold: number;
    settings: UserSettingsRow | null;
};

function StaleOpportunitiesCard(props: OpportunityCardProps): React.ReactElement {
    const styles = useStyles();
    const { items, threshold, settings } = props;
    return (
        <section className={styles.sideCard} aria-label="Stille Opportunities">
            <div className={styles.paneHeader}>
                <Subtitle2>Stille Opportunities</Subtitle2>
                <Caption1 className={styles.muted}>{`≥ ${threshold} Tage ohne Änderung`}</Caption1>
            </div>
            {items.length === 0 ? (
                <div className={styles.emptyState}>
                    <BriefcaseRegular fontSize={28} />
                    <Body1>Keine deiner Opportunities steht still.</Body1>
                </div>
            ) : (
                <div className={styles.sideList}>
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={styles.sideItem}
                            role="button"
                            tabIndex={0}
                            onClick={() => openRecord("opportunity", item.id)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    openRecord("opportunity", item.id);
                                }
                            }}
                        >
                            <div className={styles.sideItemBody}>
                                <Body1 className={styles.truncate} title={item.name}>
                                    {item.name}
                                </Body1>
                                <Caption1 className={styles.truncate} title={item.customer}>
                                    {item.customer || "Kein Kunde"}
                                    {item.stageLabel ? ` · ${item.stageLabel}` : ""}
                                </Caption1>
                                <Caption1 className={styles.muted}>
                                    {item.valueLabel || "—"}
                                    {item.closeOn ? ` · Abschluss ${formatDate(item.closeOn, settings)}` : ""}
                                </Caption1>
                            </div>
                            <IdleBadge days={item.idleDays} threshold={threshold} />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

type LeadCardProps = {
    items: LeadItem[];
    threshold: number;
};

function StaleLeadsCard(props: LeadCardProps): React.ReactElement {
    const styles = useStyles();
    const { items, threshold } = props;
    return (
        <section className={styles.sideCard} aria-label="Stille Leads">
            <div className={styles.paneHeader}>
                <Subtitle2>Stille Leads</Subtitle2>
                <Caption1 className={styles.muted}>{`≥ ${threshold} Tage ohne Änderung`}</Caption1>
            </div>
            {items.length === 0 ? (
                <div className={styles.emptyState}>
                    <PersonRegular fontSize={28} />
                    <Body1>Keiner deiner Leads steht still.</Body1>
                </div>
            ) : (
                <div className={styles.sideList}>
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={styles.sideItem}
                            role="button"
                            tabIndex={0}
                            onClick={() => openRecord("lead", item.id)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    openRecord("lead", item.id);
                                }
                            }}
                        >
                            <div className={styles.sideItemBody}>
                                <Body1 className={styles.truncate} title={item.name}>
                                    {item.name}
                                </Body1>
                                <Caption1 className={styles.truncate} title={item.company || item.topic}>
                                    {item.company || item.topic || "—"}
                                </Caption1>
                                <LeadQualityBadge quality={item.quality} label={item.qualityLabel} />
                            </div>
                            <IdleBadge days={item.idleDays} threshold={threshold} />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

/* -------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------- */

const GeneratedComponent = (props: GeneratedComponentProps) => {
    const { dataApi } = props;
    const styles = useStyles();

    // Never depend on `dataApi` itself — the host hands a new reference every render.
    const dataReady = !!dataApi;

    // Callback ref, so the portal mount node exists before any dropdown opens.
    const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
    const setContainer = useCallback((node: HTMLDivElement | null) => setMountNode(node), []);

    const [reloadKey, setReloadKey] = useState(0);
    const [bucket, setBucket] = useState<ActivityBucket>("today");
    const [idleDays, setIdleDays] = useState<number>(DEFAULT_IDLE_DAYS);

    const [settings, setSettings] = useState<UserSettingsRow | null>(
        () => (winAny[SETTINGS_CACHE] as UserSettingsRow | undefined) ?? null,
    );

    const [{ activities, opportunities, leads, loading, error }, setData] = useState<LoadState>(() => {
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
                console.error("Benutzereinstellungen konnten nicht geladen werden", fetchError);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady]);

    // --- Activities + opportunities + leads (one batched setState) ----------
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
            setData({
                ...EMPTY_SNAPSHOT,
                loading: false,
                error: "Der angemeldete Benutzer konnte nicht ermittelt werden.",
            });
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
                console.error("Mein Tag konnte nicht geladen werden", loadError);
                if (!cancelled) {
                    setData({
                        ...EMPTY_SNAPSHOT,
                        loading: false,
                        error: "Die Daten konnten nicht geladen werden. Bitte erneut versuchen.",
                    });
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady, reloadKey]);

    // --- Derived values — all memos above every early return ----------------
    const bucketCounts = useMemo(() => {
        const counts: Record<ActivityBucket, number> = { today: 0, overdue: 0, undated: 0, upcoming: 0 };
        activities.forEach((item) => {
            counts[item.bucket] += 1;
        });
        return counts;
    }, [activities]);

    const staleOpportunities = useMemo(
        () =>
            opportunities
                .filter((item) => item.idleDays >= idleDays)
                .sort((a, b) => b.idleDays - a.idleDays),
        [opportunities, idleDays],
    );

    const staleLeads = useMemo(
        () => leads.filter((item) => item.idleDays >= idleDays).sort((a, b) => b.idleDays - a.idleDays),
        [leads, idleDays],
    );

    const visibleActivities = useMemo(
        () =>
            activities
                .filter((item) => item.bucket === bucket)
                .sort((a, b) => {
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    return (a.dueOn ?? "").localeCompare(b.dueOn ?? "");
                }),
        [activities, bucket],
    );

    const columns = useMemo(
        () => [
            createTableColumn<ActivityItem>({
                columnId: "subject",
                compare: (a, b) => a.subject.localeCompare(b.subject),
                renderHeaderCell: () => "Betreff",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            title={item.subject}
                            style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontWeight: item.priority === PRIORITY_HIGH ? 600 : undefined,
                            }}
                        >
                            {item.subject}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "type",
                compare: (a, b) => a.typeLabel.localeCompare(b.typeLabel),
                renderHeaderCell: () => "Typ",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <Badge appearance="outline">{item.typeLabel}</Badge>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<ActivityItem>({
                columnId: "regarding",
                compare: (a, b) => a.regarding.localeCompare(b.regarding),
                renderHeaderCell: () => "Bezug",
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
                renderHeaderCell: () => "Fällig",
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
                renderHeaderCell: () => "Priorität",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        {item.priority === PRIORITY_HIGH ? (
                            <Badge appearance="tint" color="danger">
                                {item.priorityLabel || "Hoch"}
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
                            aria-label={`${item.subject} öffnen`}
                            onClick={(event: React.MouseEvent) => {
                                event.stopPropagation();
                                openRecord(item.entityName, item.id);
                            }}
                        >
                            <OpenRegular /> Öffnen
                        </Link>
                    </TableCellLayout>
                ),
            }),
        ],
        [settings],
    );

    const columnSizingOptions = useMemo(
        () => ({
            subject: { defaultWidth: 300, minWidth: 160, idealWidth: 300 },
            type: { defaultWidth: 110, minWidth: 90, idealWidth: 110 },
            regarding: { defaultWidth: 180, minWidth: 120, idealWidth: 180 },
            dueOn: { defaultWidth: 160, minWidth: 120, idealWidth: 160 },
            priority: { defaultWidth: 110, minWidth: 90, idealWidth: 110 },
            open: { defaultWidth: 100, minWidth: 90, idealWidth: 100 },
        }),
        [],
    );

    const handleRefresh = useCallback(() => {
        delete winAny[DATA_CACHE];
        setData({ ...EMPTY_SNAPSHOT, loading: true, error: null });
        setReloadKey((key) => key + 1);
    }, []);

    const todayLabel = formatDate(new Date().toISOString(), settings);

    // --- Render (every hook has been called by this point) ------------------
    return (
        <div ref={setContainer} className={styles.root}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <Title3>Mein Tag</Title3>
                    <Caption1>{`${todayLabel} · Aktivitäten, Opportunities und Leads, die dir gehören`}</Caption1>
                </div>
                <div className={styles.headerActions}>
                    <Field label="Stillstand ab" className={styles.idleField}>
                        <Dropdown
                            mountNode={mountNode}
                            selectedOptions={[String(idleDays)]}
                            value={`${idleDays} Tage`}
                            onOptionSelect={(_event, data) => {
                                const parsed = Number(data.optionValue);
                                if (Number.isFinite(parsed)) setIdleDays(parsed);
                            }}
                        >
                            {IDLE_OPTIONS.map((days) => (
                                <Option key={days} value={String(days)}>{`${days} Tage`}</Option>
                            ))}
                        </Dropdown>
                    </Field>
                    <Button
                        appearance="secondary"
                        icon={<ArrowClockwiseRegular />}
                        onClick={handleRefresh}
                        disabled={loading}
                    >
                        Aktualisieren
                    </Button>
                </div>
            </header>

            <div className={styles.statRow}>
                <StatCard icon={<CalendarTodayRegular />} label="Heute fällig" value={bucketCounts.today} />
                <StatCard
                    icon={<WarningRegular />}
                    label="Überfällig"
                    value={bucketCounts.overdue}
                    tone="danger"
                />
                <StatCard
                    icon={<BriefcaseRegular />}
                    label="Stille Opportunities"
                    value={staleOpportunities.length}
                    tone="warning"
                />
                <StatCard
                    icon={<PersonRegular />}
                    label="Stille Leads"
                    value={staleLeads.length}
                    tone="warning"
                />
            </div>

            {error ? (
                <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
            ) : null}

            <div className={styles.content}>
                <main className={styles.activityPane} aria-label="Meine Aktivitäten">
                    <div className={styles.paneHeader}>
                        <Subtitle2>Aktivitäten</Subtitle2>
                        <TabList
                            selectedValue={bucket}
                            onTabSelect={(_event, data) => setBucket(data.value as ActivityBucket)}
                            size="small"
                        >
                            <Tab value="today" icon={<CalendarTodayRegular />}>
                                {`Heute (${bucketCounts.today})`}
                            </Tab>
                            <Tab value="overdue" icon={<WarningRegular />}>
                                {`Überfällig (${bucketCounts.overdue})`}
                            </Tab>
                            <Tab value="upcoming" icon={<CalendarClockRegular />}>
                                {`Demnächst (${bucketCounts.upcoming})`}
                            </Tab>
                            <Tab value="undated" icon={<CalendarQuestionMarkRegular />}>
                                {`Ohne Termin (${bucketCounts.undated})`}
                            </Tab>
                        </TabList>
                    </div>
                    {loading ? (
                        <div className={styles.emptyState}>
                            <Spinner label="Dein Tag wird geladen …" />
                        </div>
                    ) : visibleActivities.length === 0 ? (
                        <div className={styles.emptyState}>
                            <CalendarTodayRegular fontSize={32} />
                            <Body1>
                                {bucket === "today"
                                    ? "Heute ist nichts fällig."
                                    : bucket === "overdue"
                                        ? "Nichts ist überfällig."
                                        : bucket === "upcoming"
                                            ? "Nichts steht demnächst an."
                                            : "Alle Aktivitäten haben einen Termin."}
                            </Body1>
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

                <aside className={styles.sidePane} aria-label="Stillstand">
                    <StaleOpportunitiesCard items={staleOpportunities} threshold={idleDays} settings={settings} />
                    <StaleLeadsCard items={staleLeads} threshold={idleDays} />
                </aside>
            </div>
        </div>
    );
};

/* -------------------------------------------------------------------------
 * Data loading
 * ---------------------------------------------------------------------- */

async function loadSnapshot(dataApi: unknown, currentUserId: string): Promise<Snapshot> {
    const api = dataApi as any;
    const mine = `_ownerid_value eq ${currentUserId} and statecode eq 0`;

    const [activityResult, opportunityResult, leadResult] = await Promise.all([
        api.queryTable("activitypointer", {
            select: [
                "activityid",
                "subject",
                "activitytypecode",
                "scheduledend",
                "scheduledstart",
                "prioritycode",
                "_regardingobjectid_value",
            ],
            filter: mine,
            orderBy: "scheduledend asc",
            pageSize: PAGE_SIZE,
        }),
        api.queryTable("opportunity", {
            select: [
                "opportunityid",
                "name",
                "estimatedvalue",
                "estimatedclosedate",
                "closeprobability",
                "stepname",
                "salesstage",
                "_customerid_value",
                "modifiedon",
            ],
            filter: mine,
            orderBy: "modifiedon asc",
            pageSize: PAGE_SIZE,
        }),
        api.queryTable("lead", {
            select: [
                "leadid",
                "firstname",
                "lastname",
                "companyname",
                "subject",
                "leadqualitycode",
                "emailaddress1",
                "modifiedon",
                "createdon",
            ],
            filter: mine,
            orderBy: "modifiedon asc",
            pageSize: PAGE_SIZE,
        }),
    ]);

    const now = Date.now();
    const snapshot: Snapshot = {
        activities: toActivityItems((activityResult?.rows ?? []) as ActivityRow[], now),
        opportunities: toOpportunityItems((opportunityResult?.rows ?? []) as OpportunityRow[], now),
        leads: toLeadItems((leadResult?.rows ?? []) as LeadRow[], now),
    };
    winAny[DATA_CACHE] = snapshot;
    return snapshot;
}

export default GeneratedComponent;
