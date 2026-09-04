import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronRight, Plus } from "lucide-react";
import { useMeetings, useProjects } from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { SimpleSelect } from "@/components/ui/select";
import { EmptyState, ErrorNotice } from "@/components/ui/misc";
import { formatDate, formatDuration } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function MeetingsScreen() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project") ?? undefined;
  const [offset, setOffset] = React.useState(0);

  const projects = useProjects();
  const meetings = useMeetings({
    project_id: projectId,
    limit: PAGE_SIZE,
    offset,
  });

  // X-Total-Count gives an exact answer; without it, fall back to inferring
  // from whether the page came back full.
  const page = meetings.data;
  const hasMore =
    page === undefined
      ? false
      : page.total !== null
        ? offset + page.items.length < page.total
        : page.items.length === PAGE_SIZE;

  const projectOptions = React.useMemo(
    () => [
      { value: "", label: "All projects" },
      ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects.data],
  );

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Newest first."
        action={
          <Button asChild size="sm">
            <Link to="/meetings/new">
              <Plus className="size-4" />
              New
            </Link>
          </Button>
        }
      />

      <div className="mb-4">
        <SimpleSelect
          value={projectId ?? ""}
          onChange={(value) => {
            setOffset(0);
            setParams(value ? { project: value } : {}, { replace: true });
          }}
          options={projectOptions}
          placeholder="All projects"
        />
      </div>

      {meetings.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : meetings.isError ? (
        <ErrorNotice
          message={(meetings.error as Error).message}
          action={
            <Button size="sm" variant="outline" onClick={() => meetings.refetch()}>
              Retry
            </Button>
          }
        />
      ) : meetings.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No meetings yet"
          description="Create a meeting, then record or upload its audio."
          action={
            <Button asChild>
              <Link to="/meetings/new">New meeting</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {meetings.data.items.map((meeting) => (
              <li key={meeting.id}>
                <Card className="transition-colors hover:border-primary/40">
                  <Link
                    to={`/meetings/${meeting.id}`}
                    className="flex items-center gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate font-medium" dir="auto">
                        {meeting.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatDate(meeting.meeting_date)}</span>
                        {meeting.duration_seconds ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{formatDuration(meeting.duration_seconds)}</span>
                          </>
                        ) : null}
                      </div>
                      <StatusChip status={meeting.status} />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>

          {(offset > 0 || hasMore) && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{offset + meetings.data.items.length}
                {meetings.data.total !== null ? ` of ${meetings.data.total}` : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
