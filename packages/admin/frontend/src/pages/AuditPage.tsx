import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { type AdminAuditEntry, listAuditLog } from "@/lib/api";

function formatTime(raw: string): string {
  // admin_audit_log.created_at is "YYYY-MM-DD HH:MM:SS" in UTC.
  const d = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
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
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {formatTime(entry.created_at)}
        </TableCell>
        <TableCell className="text-xs">{entry.actor_email}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="font-mono text-xs">{entry.action}</Badge>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
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

export function AuditPage() {
  // `cursors` holds the cursor used to fetch each page beyond the first;
  // page number = cursors.length + 1. Newer = pop, Older = push nextCursor.
  const [cursors, setCursors] = useState<string[]>([]);
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentCursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;
  const pageNumber = cursors.length + 1;

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    listAuditLog(currentCursor, controller.signal)
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
  }, [currentCursor]);

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
      <div>
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Actor-attributed record of privileged admin actions. Newest first, 25 per page.
        </p>
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
              {pageNumber === 1 ? "No audit entries yet." : "No more entries."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
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
