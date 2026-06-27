import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ListFilter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { type AdminAuditEntry, listAuditActions, listAuditLog } from "@/lib/api";

function formatTime(raw: string): string {
  // admin_audit_log.created_at is "YYYY-MM-DD HH:MM:SS" in UTC.
  const d = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
}

// Turn a dotted action key into a readable label, e.g.
// "user.ink.grant" -> "User · Ink · Grant". Purely cosmetic; the raw
// action string stays the filter value and the query param.
function humanizeAction(action: string): string {
  return action
    .split(".")
    .map(part =>
      part.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase()),
    )
    .join(" · ");
}

function prettyDetail(detail: string | null): string {
  if (!detail) return "";
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!entry.detail;

  return (
    <>
      <TableRow
        className={hasDetail ? "cursor-pointer" : undefined}
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? expanded : undefined}
        onClick={() => hasDetail && setExpanded(e => !e)}
        onKeyDown={e => {
          if (hasDetail && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(v => !v);
          }
        }}
      >
        <TableCell className="w-8 pr-0">
          {hasDetail
            ? expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            : null}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          <span className="whitespace-nowrap">{formatTime(entry.created_at)}</span>
          <span className="mt-0.5 block font-mono sm:hidden">
            {entry.target_type}
            {entry.target_id ? `:${entry.target_id}` : ""}
          </span>
          <span className="mt-0.5 block break-all md:hidden">{entry.actor_email}</span>
        </TableCell>
        <TableCell className="hidden text-xs md:table-cell">{entry.actor_email}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="font-mono text-xs">{entry.action}</Badge>
        </TableCell>
        <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
          {entry.target_type}
          {entry.target_id ? `:${entry.target_id}` : ""}
        </TableCell>
      </TableRow>
      {hasDetail && expanded && (
        <TableRow className="bg-muted/20 hover:bg-transparent">
          <TableCell colSpan={5} className="py-3 pl-10 pr-6">
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">
              {prettyDetail(entry.detail)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// Multi-select dropdown of action types. Empty selection = no filter
// ("All actions"). Selecting several matches any of them (OR).
function ActionFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: string[];
  onToggle: (action: string) => void;
  onClear: () => void;
}) {
  const label =
    selected.length === 0
      ? "All actions"
      : selected.length === 1
        ? humanizeAction(selected[0])
        : `${selected.length} actions`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between sm:w-56"
          aria-label="Filter by action type"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        {options.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            No actions recorded yet.
          </p>
        ) : (
          <>
            <div className="max-h-72 overflow-y-auto p-1">
              {options.map(action => (
                <label
                  key={action}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(action)}
                    onCheckedChange={() => onToggle(action)}
                  />
                  <span className="truncate">{humanizeAction(action)}</span>
                </label>
              ))}
            </div>
            {selected.length > 0 && (
              <div className="border-t p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  onClick={onClear}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear {selected.length} selected
                </Button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AuditPage() {
  // `cursors` holds the cursor used to fetch each page beyond the first;
  // page number = cursors.length + 1. Newer = pop, Older = push nextCursor.
  const [cursors, setCursors] = useState<string[]>([]);
  // Selected action types (mix-and-match; empty = every action).
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  // All action types available to filter by (loaded once).
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  // `search` is the committed (debounced) user-scope query; `searchInput`
  // is the live text box. Default empty = everyone.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentCursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;
  const pageNumber = cursors.length + 1;
  const hasFilter = selectedActions.length > 0 || search.length > 0;
  // Stable primitive for the fetch effect deps (array identity changes each
  // render otherwise). Order is insertion order, kept consistent by toggle.
  const actionsKey = selectedActions.join(",");

  // Distinct action types for the filter list. Loaded once; a failure here
  // is non-fatal (the list just stays empty -> only "all" is available).
  useEffect(() => {
    const controller = new AbortController();
    listAuditActions(controller.signal)
      .then(list => {
        if (!controller.signal.aborted) setActionOptions(list);
      })
      .catch(() => {
        /* non-fatal: leave the filter empty */
      });
    return () => controller.abort();
  }, []);

  // Debounce the search box, and restart paging whenever the committed
  // query changes so a new search begins from the newest match.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(prev => {
        const next = searchInput.trim();
        if (next !== prev) setCursors([]);
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    listAuditLog(
      currentCursor,
      { actions: selectedActions, q: search || undefined },
      controller.signal,
    )
      .then(res => {
        if (controller.signal.aborted) return;
        setEntries(res.entries);
        setNextCursor(res.nextCursor);
      })
      .catch(e => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        const msg = e instanceof Error ? e.message : "Failed to load audit log";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // selectedActions is tracked via actionsKey (stable string).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCursor, actionsKey, search]);

  // Toggling an action restarts paging from the newest matching entry.
  function toggleAction(action: string) {
    setSelectedActions(prev =>
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action],
    );
    setCursors([]);
  }

  function clearActions() {
    setSelectedActions([]);
    setCursors([]);
  }

  function clearSearch() {
    setSearchInput("");
  }

  function goNewer() {
    // Block while a page is in flight: otherwise a second click reads a
    // stale `nextCursor` from this render and can push a duplicate cursor.
    if (loading || pageNumber <= 1) return;
    setCursors(c => c.slice(0, -1));
  }
  function goOlder() {
    if (loading || !nextCursor) return;
    setCursors(c => [...c, nextCursor]);
  }

  const canNewer = pageNumber > 1 && !loading;
  const canOlder = !!nextCursor && !loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actor-attributed record of privileged admin actions. Newest first, 25 per page.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search user (email or ID)..."
              className="pl-8 pr-8"
              aria-label="Search audit log by user"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ActionFilter
            options={actionOptions}
            selected={selectedActions}
            onToggle={toggleAction}
            onClear={clearActions}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-destructive">{error}</p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {pageNumber > 1
                ? "No more entries."
                : hasFilter
                  ? "No entries match these filters."
                  : "No audit entries yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Time</TableHead>
                  <TableHead className="hidden md:table-cell">Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden sm:table-cell">Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          )}

          {!error && (pageNumber > 1 || !!nextCursor) && (
            <Pagination className="mt-5">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={!canNewer}
                    className={!canNewer ? "pointer-events-none opacity-50" : undefined}
                    onClick={e => {
                      e.preventDefault();
                      goNewer();
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive onClick={e => e.preventDefault()}>
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={!canOlder}
                    className={!canOlder ? "pointer-events-none opacity-50" : undefined}
                    onClick={e => {
                      e.preventDefault();
                      goOlder();
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
