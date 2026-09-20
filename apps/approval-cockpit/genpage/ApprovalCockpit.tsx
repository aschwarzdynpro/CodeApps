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
    Divider,
    Dropdown,
    Field,
    Input,
    Link,
    makeStyles,
    MessageBar,
    MessageBarBody,
    Option,
    shorthands,
    Spinner,
    Subtitle2,
    TableCellLayout,
    Text,
    Title3,
    tokens,
} from "@fluentui/react-components";
import {
    AlertRegular,
    ArrowClockwiseRegular,
    CalendarLtrRegular,
    ClipboardTaskListLtrRegular,
    ClockRegular,
    HourglassRegular,
    OpenRegular,
    SearchRegular,
    WarningRegular,
} from "@fluentui/react-icons";
import type { GeneratedComponentProps } from "./RuntimeTypes";

/* -------------------------------------------------------------------------
 * Domain model
 *
 * Reads the Power Automate approval tables:
 *   msdyn_flow_approvalrequest — one row per approver ("my inbox")
 *   msdyn_flow_approval        — the approval itself (title, details, priority)
 *
 * Column names are the documented logical names of both tables. Run
 * `pac model genpage generate-types` before deploying to confirm them against
 * the target environment.
 * ---------------------------------------------------------------------- */

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/** Priority option-set values of msdyn_flow_approval_priority. */
const PRIORITY_URGENT = 192350000;
const PRIORITY_IMPORTANT = 192350001;
const PRIORITY_MEDIUM = 192350002;
const PRIORITY_LOW = 192350003;

/** Filter labels — never derived from the loaded rows, which may not cover every value. */
const PRIORITY_FILTER_LABELS: Record<string, string> = {
    all: "Alle",
    [String(PRIORITY_URGENT)]: "Dringend",
    [String(PRIORITY_IMPORTANT)]: "Wichtig",
    [String(PRIORITY_MEDIUM)]: "Mittel",
    [String(PRIORITY_LOW)]: "Niedrig",
};

/** Sort order for the priority column — urgent first. */
const PRIORITY_RANK: Record<number, number> = {
    [PRIORITY_URGENT]: 0,
    [PRIORITY_IMPORTANT]: 1,
    [PRIORITY_MEDIUM]: 2,
    [PRIORITY_LOW]: 3,
};

type ApprovalRequestRow = {
    msdyn_flow_approvalrequestid?: string;
    msdyn_flow_approvalrequest_name?: string;
    msdyn_flow_approvalrequest_dueon?: string;
    msdyn_flow_approvalrequest_expireson?: string;
    msdyn_flow_approvalrequest_responseoptions?: string;
    _msdyn_flow_approvalrequest_approval_value?: string;
    createdon?: string;
    statuscode?: number;
    [annotation: string]: unknown;
};

type ApprovalRow = {
    msdyn_flow_approvalid?: string;
    msdyn_flow_approval_title?: string;
    msdyn_flow_approval_details?: string;
    msdyn_flow_approval_category?: string;
    msdyn_flow_approval_priority?: number;
    msdyn_flow_approval_itemlink?: string;
    msdyn_flow_approval_itemlinkdescription?: string;
    msdyn_flow_approval_dueon?: string;
    msdyn_flow_approval_expireson?: string;
    msdyn_flow_approval_name?: string;
    _createdby_value?: string;
    createdon?: string;
    statuscode?: number;
    [annotation: string]: unknown;
};

/** One row of the cockpit list — a request joined with its approval. */
type InboxItem = {
    id: string;
    title: string;
    details: string;
    category: string;
    source: string;
    createdBy: string;
    priority: number;
    priorityLabel: string;
    statusLabel: string;
    responseOptions: string[];
    itemLink: string;
    itemLinkDescription: string;
    assignedOn: string | null;
    dueOn: string | null;
    isOverdue: boolean;
    isDueSoon: boolean;
};

type UserSettingsRow = {
    dateformatstring?: string;
    dateseparator?: string;
    [key: string]: unknown;
};

type LoadState = {
    items: InboxItem[];
    loading: boolean;
    error: string | null;
};

/* -------------------------------------------------------------------------
 * Window-backed cache (see references/data-caching.md)
 *
 * The genpage host double-mounts the page on open and hands a new `dataApi`
 * reference on every render. The in-flight promise makes both mounts share one
 * round-trip; the resolved cache skips the spinner on return navigation.
 * ---------------------------------------------------------------------- */

const winAny = window as unknown as Record<string, unknown>;
const INBOX_CACHE = "__genpage_approvalcockpit_inbox_v1";
const INBOX_INFLIGHT = "__genpage_approvalcockpit_inbox_inflight_v1";
const SETTINGS_CACHE = "__genpage_approvalcockpit_usersettings_v1";
const SETTINGS_INFLIGHT = "__genpage_approvalcockpit_usersettings_inflight_v1";

/** Rows per query page — the inbox of a single approver stays well below this. */
const PAGE_SIZE = 200;
/** Approval ids per `or` filter chunk, to keep each request URL short. */
const ID_CHUNK_SIZE = 20;
/** A request is "due soon" within this many days. */
const DUE_SOON_DAYS = 7;

/* -------------------------------------------------------------------------
 * Utilities (top-level functions, never nested)
 * ---------------------------------------------------------------------- */

function stripBraces(value: string): string {
    return value.replace("{", "").replace("}", "");
}

function chunk<T>(values: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
        out.push(values.slice(i, i + size));
    }
    return out;
}

function readFormatted(row: Record<string, unknown>, column: string): string {
    const value = row[`${column}${FORMATTED}`];
    return typeof value === "string" ? value : "";
}

function parseResponseOptions(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(",")
        .map((option) => option.trim())
        .filter((option) => option.length > 0);
}

function daysUntil(iso: string | null, now: number): number | null {
    if (!iso) return null;
    const due = new Date(iso).getTime();
    if (Number.isNaN(due)) return null;
    return Math.floor((due - now) / 86400000);
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

/** Joins each approval request with its approval into one list row. */
function buildInboxItems(requests: ApprovalRequestRow[], approvals: ApprovalRow[], now: number): InboxItem[] {
    const byApprovalId = new Map<string, ApprovalRow>();
    approvals.forEach((approval) => {
        if (approval.msdyn_flow_approvalid) {
            byApprovalId.set(approval.msdyn_flow_approvalid.toLowerCase(), approval);
        }
    });

    const items: InboxItem[] = [];
    requests.forEach((request) => {
        const requestId = request.msdyn_flow_approvalrequestid;
        const approvalId = request._msdyn_flow_approvalrequest_approval_value;
        if (!requestId || !approvalId) return;
        const approval = byApprovalId.get(approvalId.toLowerCase());
        if (!approval) return;

        const dueOn =
            request.msdyn_flow_approvalrequest_dueon ??
            approval.msdyn_flow_approval_dueon ??
            request.msdyn_flow_approvalrequest_expireson ??
            approval.msdyn_flow_approval_expireson ??
            null;
        const remainingDays = daysUntil(dueOn, now);

        items.push({
            id: requestId,
            title:
                approval.msdyn_flow_approval_title ||
                approval.msdyn_flow_approval_name ||
                request.msdyn_flow_approvalrequest_name ||
                "Ohne Titel",
            details: approval.msdyn_flow_approval_details ?? "",
            category: approval.msdyn_flow_approval_category ?? "",
            source: approval.msdyn_flow_approval_name ?? "",
            createdBy: readFormatted(approval, "_createdby_value"),
            priority: approval.msdyn_flow_approval_priority ?? PRIORITY_MEDIUM,
            priorityLabel: readFormatted(approval, "msdyn_flow_approval_priority"),
            statusLabel: readFormatted(request, "statuscode"),
            responseOptions: parseResponseOptions(request.msdyn_flow_approvalrequest_responseoptions),
            itemLink: approval.msdyn_flow_approval_itemlink ?? "",
            itemLinkDescription: approval.msdyn_flow_approval_itemlinkdescription ?? "",
            assignedOn: request.createdon ?? null,
            dueOn,
            isOverdue: remainingDays !== null && remainingDays < 0,
            isDueSoon: remainingDays !== null && remainingDays >= 0 && remainingDays <= DUE_SOON_DAYS,
        });
    });

    return items;
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
        ...shorthands.gap(tokens.spacingHorizontalM),
        flexWrap: "wrap",
    },
    headerTitle: {
        display: "flex",
        flexDirection: "column",
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
    filterRow: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        flexWrap: "wrap",
        ...shorthands.gap(tokens.spacingHorizontalM),
    },
    searchField: {
        minWidth: "220px",
        flexGrow: 1,
        maxWidth: "420px",
    },
    filterField: {
        minWidth: "180px",
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
    listPane: {
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
    listScroll: {
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "auto",
    },
    detailPane: {
        display: "flex",
        flexDirection: "column",
        width: "360px",
        flexShrink: 0,
        minHeight: 0,
        overflowY: "auto",
        ...shorthands.gap(tokens.spacingVerticalS),
        ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground1,
        "@media (max-width: 1024px)": {
            width: "auto",
            maxHeight: "320px",
        },
    },
    detailLabel: {
        color: tokens.colorNeutralForeground3,
    },
    detailBody: {
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
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
        ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalL),
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

function PriorityBadge(props: { priority: number; label: string }): React.ReactElement {
    const { priority, label } = props;
    const color =
        priority === PRIORITY_URGENT
            ? "danger"
            : priority === PRIORITY_IMPORTANT
                ? "warning"
                : priority === PRIORITY_LOW
                    ? "informative"
                    : "brand";
    return (
        <Badge appearance="tint" color={color}>
            {label || "—"}
        </Badge>
    );
}

type DetailPaneProps = {
    item: InboxItem | null;
    settings: UserSettingsRow | null;
};

function DetailPane(props: DetailPaneProps): React.ReactElement {
    const styles = useStyles();
    const { item, settings } = props;

    if (!item) {
        return (
            <aside className={styles.detailPane} aria-label="Details zur Genehmigung">
                <div className={styles.emptyState}>
                    <ClipboardTaskListLtrRegular fontSize={32} />
                    <Body1>Wähle eine Genehmigung aus, um die Details zu sehen.</Body1>
                </div>
            </aside>
        );
    }

    return (
        <aside className={styles.detailPane} aria-label={`Details zu ${item.title}`}>
            <Subtitle2>{item.title}</Subtitle2>
            <PriorityBadge priority={item.priority} label={item.priorityLabel} />
            <Divider />

            <Caption1 className={styles.detailLabel}>Zugewiesen am</Caption1>
            <Body1>{formatDate(item.assignedOn, settings)}</Body1>

            <Caption1 className={styles.detailLabel}>Fällig</Caption1>
            <Body1>{formatDate(item.dueOn, settings)}</Body1>

            {item.createdBy ? (
                <>
                    <Caption1 className={styles.detailLabel}>Erstellt von</Caption1>
                    <Body1>{item.createdBy}</Body1>
                </>
            ) : null}

            {item.category ? (
                <>
                    <Caption1 className={styles.detailLabel}>Kategorie</Caption1>
                    <Body1>{item.category}</Body1>
                </>
            ) : null}

            {item.responseOptions.length > 0 ? (
                <>
                    <Caption1 className={styles.detailLabel}>Antwortoptionen</Caption1>
                    <Body1>{item.responseOptions.join(" · ")}</Body1>
                </>
            ) : null}

            {item.details ? (
                <>
                    <Divider />
                    <Caption1 className={styles.detailLabel}>Details</Caption1>
                    <Body1 className={styles.detailBody}>{item.details}</Body1>
                </>
            ) : null}

            {item.itemLink ? (
                <>
                    <Divider />
                    <Link href={item.itemLink} target="_blank" rel="noopener noreferrer">
                        <OpenRegular /> {item.itemLinkDescription || "Zugehörigen Datensatz öffnen"}
                    </Link>
                </>
            ) : null}
        </aside>
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
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [dueFilter, setDueFilter] = useState<string>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [settings, setSettings] = useState<UserSettingsRow | null>(
        () => (winAny[SETTINGS_CACHE] as UserSettingsRow | undefined) ?? null,
    );

    const [{ items, loading, error }, setData] = useState<LoadState>(() => {
        const cached = winAny[INBOX_CACHE] as InboxItem[] | undefined;
        return { items: cached ?? [], loading: cached === undefined, error: null };
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
                    // Clear only if still ours — a later refresh may have replaced it.
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
                // Formatting falls back to the browser locale — not worth an error state.
                console.error("Benutzereinstellungen konnten nicht geladen werden", fetchError);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady]);

    // --- Inbox (requests + approvals, one batched setState) -----------------
    useEffect(() => {
        if (!dataReady) return;

        const cached = winAny[INBOX_CACHE] as InboxItem[] | undefined;
        if (cached !== undefined && reloadKey === 0) {
            if (items !== cached) setData({ items: cached, loading: false, error: null });
            return;
        }

        const rawUserId =
            typeof Xrm !== "undefined" ? Xrm.Utility?.getGlobalContext()?.userSettings?.userId : "";
        if (!rawUserId) {
            setData({
                items: [],
                loading: false,
                error: "Der angemeldete Benutzer konnte nicht ermittelt werden.",
            });
            return;
        }
        const currentUserId = stripBraces(rawUserId);
        let cancelled = false;

        let inflight = winAny[INBOX_INFLIGHT] as Promise<InboxItem[]> | undefined;
        if (!inflight) {
            inflight = loadInbox(dataApi, currentUserId).finally(() => {
                if (winAny[INBOX_INFLIGHT] === inflight) delete winAny[INBOX_INFLIGHT];
            });
            winAny[INBOX_INFLIGHT] = inflight;
        }

        inflight
            .then((loaded) => {
                if (!cancelled) setData({ items: loaded, loading: false, error: null });
            })
            .catch((loadError: unknown) => {
                console.error("Genehmigungen konnten nicht geladen werden", loadError);
                if (!cancelled) {
                    setData({
                        items: [],
                        loading: false,
                        error: "Die Genehmigungen konnten nicht geladen werden. Bitte erneut versuchen.",
                    });
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataReady, reloadKey]);

    // --- Derived values — all memos above every early return ----------------
    const stats = useMemo(() => {
        const open = items.length;
        let overdue = 0;
        let dueSoon = 0;
        let urgent = 0;
        items.forEach((item) => {
            if (item.isOverdue) overdue += 1;
            if (item.isDueSoon) dueSoon += 1;
            if (item.priority === PRIORITY_URGENT || item.priority === PRIORITY_IMPORTANT) urgent += 1;
        });
        return { open, overdue, dueSoon, urgent };
    }, [items]);

    const visibleItems = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return items.filter((item) => {
            if (priorityFilter !== "all" && String(item.priority) !== priorityFilter) return false;
            if (dueFilter === "overdue" && !item.isOverdue) return false;
            if (dueFilter === "dueSoon" && !item.isDueSoon) return false;
            if (!needle) return true;
            return [item.title, item.details, item.category, item.createdBy, item.source]
                .filter((field) => typeof field === "string" && field.length > 0)
                .some((field) => field.toLowerCase().includes(needle));
        });
    }, [items, search, priorityFilter, dueFilter]);

    const selectedItem = useMemo(
        () => visibleItems.find((item) => item.id === selectedId) ?? null,
        [visibleItems, selectedId],
    );

    const columns = useMemo(
        () => [
            createTableColumn<InboxItem>({
                columnId: "title",
                compare: (a, b) => a.title.localeCompare(b.title),
                renderHeaderCell: () => "Genehmigung",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            title={item.title}
                            style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {item.title}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<InboxItem>({
                columnId: "priority",
                compare: (a, b) =>
                    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
                renderHeaderCell: () => "Priorität",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <PriorityBadge priority={item.priority} label={item.priorityLabel} />
                    </TableCellLayout>
                ),
            }),
            createTableColumn<InboxItem>({
                columnId: "createdBy",
                compare: (a, b) => a.createdBy.localeCompare(b.createdBy),
                renderHeaderCell: () => "Erstellt von",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            title={item.createdBy}
                            style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {item.createdBy || "—"}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<InboxItem>({
                columnId: "dueOn",
                compare: (a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""),
                renderHeaderCell: () => "Fällig",
                renderCell: (item) => (
                    <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                        <span
                            style={{
                                color: item.isOverdue ? tokens.colorPaletteRedForeground1 : undefined,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {formatDate(item.dueOn, settings)}
                        </span>
                    </TableCellLayout>
                ),
            }),
            createTableColumn<InboxItem>({
                columnId: "link",
                compare: () => 0,
                renderHeaderCell: () => "Datensatz",
                renderCell: (item) =>
                    item.itemLink ? (
                        <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>
                            <Link
                                href={item.itemLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={item.itemLinkDescription || item.itemLink}
                                onClick={(event: React.MouseEvent) => event.stopPropagation()}
                            >
                                Öffnen
                            </Link>
                        </TableCellLayout>
                    ) : (
                        <TableCellLayout style={{ overflow: "hidden", minWidth: 0 }}>—</TableCellLayout>
                    ),
            }),
        ],
        [settings],
    );

    const columnSizingOptions = useMemo(
        () => ({
            title: { defaultWidth: 320, minWidth: 180, idealWidth: 320 },
            priority: { defaultWidth: 130, minWidth: 100, idealWidth: 130 },
            createdBy: { defaultWidth: 180, minWidth: 120, idealWidth: 180 },
            dueOn: { defaultWidth: 140, minWidth: 110, idealWidth: 140 },
            link: { defaultWidth: 110, minWidth: 90, idealWidth: 110 },
        }),
        [],
    );

    const handleRefresh = useCallback(() => {
        delete winAny[INBOX_CACHE];
        setData({ items: [], loading: true, error: null });
        setSelectedId(null);
        setReloadKey((key) => key + 1);
    }, []);

    // --- Render (every hook has been called by this point) ------------------
    return (
        <div ref={setContainer} className={styles.root}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <Title3>Approval Cockpit</Title3>
                    <Caption1>Alle offenen Genehmigungen, die dir zugewiesen sind</Caption1>
                </div>
                <Button
                    appearance="secondary"
                    icon={<ArrowClockwiseRegular />}
                    onClick={handleRefresh}
                    disabled={loading}
                >
                    Aktualisieren
                </Button>
            </header>

            <div className={styles.statRow}>
                <StatCard icon={<ClipboardTaskListLtrRegular />} label="Offen" value={stats.open} />
                <StatCard
                    icon={<WarningRegular />}
                    label="Überfällig"
                    value={stats.overdue}
                    tone="danger"
                />
                <StatCard
                    icon={<HourglassRegular />}
                    label={`Fällig in ${DUE_SOON_DAYS} Tagen`}
                    value={stats.dueSoon}
                    tone="warning"
                />
                <StatCard icon={<AlertRegular />} label="Dringend / Wichtig" value={stats.urgent} />
            </div>

            <div className={styles.filterRow}>
                <Field label="Suche" className={styles.searchField}>
                    <Input
                        value={search}
                        onChange={(_event, data) => setSearch(data.value)}
                        contentBefore={<SearchRegular />}
                        placeholder="Titel, Details, Kategorie …"
                    />
                </Field>
                <Field label="Priorität" className={styles.filterField}>
                    <Dropdown
                        mountNode={mountNode}
                        selectedOptions={[priorityFilter]}
                        value={PRIORITY_FILTER_LABELS[priorityFilter] ?? "Alle"}
                        onOptionSelect={(_event, data) => setPriorityFilter(data.optionValue ?? "all")}
                    >
                        {Object.keys(PRIORITY_FILTER_LABELS).map((value) => (
                            <Option key={value} value={value}>
                                {PRIORITY_FILTER_LABELS[value]}
                            </Option>
                        ))}
                    </Dropdown>
                </Field>
                <Field label="Fälligkeit" className={styles.filterField}>
                    <Dropdown
                        mountNode={mountNode}
                        selectedOptions={[dueFilter]}
                        value={
                            dueFilter === "overdue"
                                ? "Überfällig"
                                : dueFilter === "dueSoon"
                                    ? `Fällig in ${DUE_SOON_DAYS} Tagen`
                                    : "Alle"
                        }
                        onOptionSelect={(_event, data) => setDueFilter(data.optionValue ?? "all")}
                    >
                        <Option value="all">Alle</Option>
                        <Option value="overdue">Überfällig</Option>
                        <Option value="dueSoon">{`Fällig in ${DUE_SOON_DAYS} Tagen`}</Option>
                    </Dropdown>
                </Field>
            </div>

            {error ? (
                <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
            ) : null}

            <div className={styles.content}>
                <main className={styles.listPane} aria-label="Liste der Genehmigungen">
                    {loading ? (
                        <div className={styles.emptyState}>
                            <Spinner label="Genehmigungen werden geladen …" />
                        </div>
                    ) : visibleItems.length === 0 ? (
                        <div className={styles.emptyState}>
                            <ClockRegular fontSize={32} />
                            <Body1>
                                {items.length === 0
                                    ? "Dir sind aktuell keine Genehmigungen zugewiesen."
                                    : "Keine Genehmigung entspricht den aktiven Filtern."}
                            </Body1>
                        </div>
                    ) : (
                        <div className={styles.listScroll}>
                            <DataGrid
                                items={visibleItems}
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
                                <DataGridBody<InboxItem>>
                                    {({ item, rowId }) => (
                                        <DataGridRow<InboxItem>
                                            key={rowId}
                                            className={styles.selectableRow}
                                            aria-selected={item.id === selectedId}
                                            onClick={() => setSelectedId(item.id)}
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

                <DetailPane item={selectedItem} settings={settings} />
            </div>

            <Caption1>
                <CalendarLtrRegular /> Quelle: Power-Automate-Genehmigungen (msdyn_flow_approvalrequest ·
                msdyn_flow_approval). Zum Genehmigen oder Ablehnen den zugehörigen Datensatz öffnen.
            </Caption1>
        </div>
    );
};

/* -------------------------------------------------------------------------
 * Data loading
 * ---------------------------------------------------------------------- */

async function loadInbox(dataApi: unknown, currentUserId: string): Promise<InboxItem[]> {
    const api = dataApi as any;

    const requestResult = await api.queryTable("msdyn_flow_approvalrequest", {
        select: [
            "msdyn_flow_approvalrequestid",
            "msdyn_flow_approvalrequest_name",
            "msdyn_flow_approvalrequest_dueon",
            "msdyn_flow_approvalrequest_expireson",
            "msdyn_flow_approvalrequest_responseoptions",
            "statuscode",
            "createdon",
        ],
        filter: `_ownerid_value eq ${currentUserId} and statecode eq 0`,
        orderBy: "createdon desc",
        pageSize: PAGE_SIZE,
    });

    const requests = (requestResult?.rows ?? []) as ApprovalRequestRow[];
    const approvalIds = Array.from(
        new Set(
            requests
                .map((request) => request._msdyn_flow_approvalrequest_approval_value)
                .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
    );

    if (approvalIds.length === 0) {
        return [];
    }

    // Chunked `or` filters keep each request URL short while staying precise —
    // we only ever read the approvals behind this user's own requests.
    const approvalChunks = await Promise.all(
        chunk(approvalIds, ID_CHUNK_SIZE).map((ids) =>
            api.queryTable("msdyn_flow_approval", {
                select: [
                    "msdyn_flow_approvalid",
                    "msdyn_flow_approval_title",
                    "msdyn_flow_approval_details",
                    "msdyn_flow_approval_category",
                    "msdyn_flow_approval_priority",
                    "msdyn_flow_approval_itemlink",
                    "msdyn_flow_approval_itemlinkdescription",
                    "msdyn_flow_approval_dueon",
                    "msdyn_flow_approval_expireson",
                    "msdyn_flow_approval_name",
                    "statuscode",
                    "createdon",
                ],
                filter: ids.map((id) => `msdyn_flow_approvalid eq ${id}`).join(" or "),
                pageSize: ID_CHUNK_SIZE,
            }),
        ),
    );

    const approvals = approvalChunks.flatMap(
        (result: { rows?: ApprovalRow[] }) => (result?.rows ?? []) as ApprovalRow[],
    );

    const items = buildInboxItems(requests, approvals, Date.now());
    winAny[INBOX_CACHE] = items;
    return items;
}

export default GeneratedComponent;
