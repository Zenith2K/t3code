import { PullRequestChangeBreakdownRows } from "../pullRequest/PullRequestChangeBreakdownStat";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { selectEnvironmentQueryData } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ProjectId, PullRequestRef } from "@t3tools/contracts";
import { sourceControlRepositorySelector } from "@t3tools/shared/sourceControl";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeOffIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { AsyncResult } from "effect/reactivity";
import { useState, type MouseEvent as ReactMouseEvent } from "react";

import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import { usePullRequestChecksRefresh } from "~/hooks/usePullRequestChecksRefresh";
import { cn } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import { pullRequestEnvironment } from "~/state/pullRequests";
import {
  useEnvironmentQueryIsNewer,
  useEnvironmentQueryRefresh,
  useEnvironmentQuerySelector,
} from "~/state/query";

import {
  buildFixFindingsHandoff,
  buildResolveConflictsPrompt,
  canPerformPullRequestAction,
  classifyPullRequestChecks,
  describePullRequestChecks,
  isPullRequestConflicting,
  resolveSelectedMergeMethod,
  allowedPullRequestMergeMethods,
  resolveThreadPanelPullRequestAction,
} from "../pullRequest/pullRequestDetail.logic";
import { PullRequestChecksPopover } from "../pullRequest/PullRequestChecksPopover";
import {
  pullRequestChecksState,
  PullRequestCheckStatusIcon,
  PullRequestDiffStat,
  resolvePullRequestState,
} from "../pullRequest/pullRequestPresentation";
import {
  usePullRequestActionRunner,
  usePullRequestHandoffs,
} from "../pullRequest/usePullRequestActions";
import {
  ChangeRequestStatusIcon,
  type PrStatusIndicator,
  type ThreadPr,
} from "../ThreadStatusIndicators";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  THREAD_DETAILS_PANEL_CHEVRON_CLASS,
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS,
} from "./threadDetailsPanelStyles";

// A server without checks for this pull request answers null; polling it again finds nothing new.
const isSettledWithoutChecks = (result: AsyncResult.AsyncResult<unknown, unknown>) =>
  result._tag === "Success" && result.value === null;

export function ThreadDetailsPrRow({
  environmentId,
  pr,
  number,
  reference: linkedReference,
  status,
  project,
  label,
  openAriaLabel,
  onOpen,
  onActed,
  onStopWatching,
  detailsOpen,
  onDetailsOpenChange,
}: {
  environmentId: EnvironmentId;
  pr: ThreadPr;
  number: number;
  reference?: Pick<PullRequestRef, "host" | "repository" | "number"> | null;
  status: PrStatusIndicator | null;
  project: EnvironmentProject | null;
  label: string;
  openAriaLabel: string;
  onOpen: (event: ReactMouseEvent<HTMLElement>) => void;
  onActed?: () => void;
  onStopWatching?: (() => void) | undefined;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
}) {
  const serverConfigs = useServerConfigs();
  const supportsPullRequests =
    serverConfigs.get(environmentId)?.environment.capabilities.pullRequests === true;
  const repository = sourceControlRepositorySelector(project?.repositoryIdentity);
  const reference: PullRequestRef | null =
    supportsPullRequests && project !== null
      ? linkedReference
        ? { ...linkedReference, projectId: project.id as ProjectId }
        : repository !== null
          ? { projectId: project.id as ProjectId, repository, number }
          : null
      : null;
  const detailAtom =
    reference === null
      ? null
      : pullRequestEnvironment.detail({
          environmentId,
          input: { ...reference, allowStale: false },
        });
  // Read the queries part by part: every poll publishes a new result (a new
  // timestamp, `waiting` on and off) even when nothing in it changed.
  const detailData = useEnvironmentQuerySelector(detailAtom, selectEnvironmentQueryData);
  const detailQuery = useEnvironmentQueryRefresh(detailAtom);
  const supportsChecks =
    serverConfigs.get(environmentId)?.environment.capabilities.pullRequestChecks === true;
  const checksAtom =
    supportsChecks && reference !== null && detailData !== null
      ? pullRequestEnvironment.checks({ environmentId, input: reference })
      : null;
  const checksData = useEnvironmentQuerySelector(checksAtom, selectEnvironmentQueryData);
  const checksSettledEmpty = useEnvironmentQuerySelector(checksAtom, isSettledWithoutChecks);
  const checksQuery = useEnvironmentQueryRefresh(checksAtom);
  const checksAreNewer = useEnvironmentQueryIsNewer(checksAtom, detailAtom);
  const detail =
    detailData === null
      ? null
      : checksData !== null && checksAreNewer
        ? { ...detailData, ...checksData }
        : detailData;
  const open = reference !== null && (detail?.state ?? pr?.state) === "open";
  const refreshKey = `${environmentId}:${project?.id}:${reference?.host}:${reference?.repository}:${number}`;
  useLiveRefresh(
    () => {
      if (!detailQuery.isPending()) detailQuery.refresh();
    },
    { enabled: open, key: `workspace-pr:${refreshKey}`, intervalMs: 10 * 60_000 },
  );
  usePullRequestChecksRefresh({
    refresh: () => {
      if (!checksQuery.isPending() && !detailQuery.isPending()) checksQuery.refresh();
    },
    enabled: open && supportsChecks && !checksSettledEmpty,
    key: `workspace-pr-checks:${refreshKey}`,
    checks: detail?.checks ?? [],
  });

  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId,
    reference,
    onSuccess: () => {
      detailQuery.refresh();
      checksQuery.refresh();
      onActed?.();
    },
  });
  const { handoff, startHandoff } = usePullRequestHandoffs({ environmentId, detail });
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [localDetailsOpen, setLocalDetailsOpen] = useState(false);
  const isOpen = detailsOpen ?? localDetailsOpen;
  const setOpen = onDetailsOpenChange ?? setLocalDetailsOpen;

  const rowAction = resolveThreadPanelPullRequestAction(detail);
  if (confirmingMerge && rowAction !== "merge") {
    setConfirmingMerge(false);
  }
  const conflicting = isPullRequestConflicting(detail);
  const checksState = detail === null ? "none" : classifyPullRequestChecks(detail.checks);
  const checksRollup = detail === null ? null : pullRequestChecksState(detail.checks);
  const selectedMergeMethod = resolveSelectedMergeMethod(
    allowedPullRequestMergeMethods(detail),
    "merge",
  );

  const startResolveConflicts = () => {
    if (detail === null) return;
    void startHandoff("conflicts", {
      prompt: buildResolveConflictsPrompt({
        number: detail.number,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
      }),
    });
  };

  const startFixChecks = () => {
    if (detail === null) return;
    void startHandoff(
      "findings",
      buildFixFindingsHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        reviewThreads: [],
        comments: [],
        checks: detail.checks,
        commentsTruncated: false,
      }),
    );
  };

  const statePresentation =
    detail === null
      ? null
      : resolvePullRequestState({
          state: detail.state,
          isDraft: detail.isDraft,
        });
  const icon = statePresentation ? (
    <statePresentation.Icon
      aria-hidden
      className={cn("size-4 shrink-0", statePresentation.toneClassName)}
    />
  ) : pr && status ? (
    <ChangeRequestStatusIcon
      state={pr.state}
      className={cn(THREAD_DETAILS_PANEL_ICON_CLASS, status.colorClass)}
    />
  ) : (
    <PullRequestGlyph.pullRequest className={THREAD_DETAILS_PANEL_ICON_CLASS} />
  );

  const rowTooltip = (
    <TooltipPopup side="top">
      {detail?.title ?? status?.tooltip ?? `Pull request #${number}`}
    </TooltipPopup>
  );

  const prAction =
    rowAction === "resolve"
      ? {
          Icon: PullRequestGlyph.conflicting,
          label: "Resolve in new thread",
          pendingLabel: "Preparing...",
          pending: handoff === "conflicts",
          destructive: true,
          handoff: true,
          onClick: startResolveConflicts,
        }
      : rowAction === "ready"
        ? {
            Icon: CheckIcon,
            label: "Mark ready for review",
            pendingLabel: "Marking...",
            pending: actionPending,
            destructive: false,
            handoff: false,
            onClick: () => void perform("ready"),
          }
        : rowAction === "fix"
          ? {
              Icon: WrenchIcon,
              label: "Fix in new thread",
              pendingLabel: "Preparing...",
              pending: handoff === "findings",
              destructive: true,
              handoff: true,
              onClick: startFixChecks,
            }
          : rowAction === "merge"
            ? {
                Icon: PullRequestGlyph.merged,
                label: "Merge…",
                pendingLabel: "Merging...",
                pending: actionPending,
                destructive: false,
                handoff: false,
                onClick: () => setConfirmingMerge(true),
              }
            : null;
  // Merge only becomes the action once checks pass; until then the menu says why it is missing.
  const waitingOnChecks =
    rowAction === null &&
    detail !== null &&
    detail.state === "open" &&
    !detail.isDraft &&
    checksState === "pending" &&
    canPerformPullRequestAction(detail, "merge") &&
    allowedPullRequestMergeMethods(detail).length > 0;

  const watching =
    onStopWatching !== undefined && (detail?.state ?? pr?.state ?? "open") === "open";

  const openRow = (text: string, part: "row" | "primary") => (
    <Tooltip>
      <TooltipTrigger
        render={
          <ThreadDetailsControl
            type="button"
            variant="ghost"
            size="sm"
            part={part}
            aria-label={openAriaLabel}
            onClick={onOpen}
            onAuxClick={onOpen}
          />
        }
      >
        {icon}
        <span className={cn("min-w-0 flex-1 truncate text-left", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
          {text}
        </span>
      </TooltipTrigger>
      {rowTooltip}
    </Tooltip>
  );

  const showChecks = detail !== null && checksRollup !== null && !conflicting && !detail.isDraft;
  const rowStatus =
    rowAction === "resolve" ? (
      <span className="flex shrink-0 items-center gap-1 px-1.5 text-xs font-medium text-destructive">
        <TriangleAlertIcon aria-hidden className="size-3.5" />
        Conflicts
      </span>
    ) : showChecks && checksRollup !== null ? (
      <PullRequestChecksPopover
        checksState={checksRollup}
        checks={detail.checks}
        variant="count"
        render={<ThreadDetailsControl part="meta" />}
      />
    ) : null;

  return (
    <>
      {detail === null ? (
        openRow(label, "row")
      ) : (
        <div className={THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS}>
          {openRow(detail.title, "primary")}
          {rowStatus}
          <span aria-hidden="true" className={THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS} />
          <ThreadDetailsControl
            type="button"
            variant="ghost"
            size="sm"
            part="secondary"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Hide" : "Show"} pull request #${number} details`}
            onClick={() => setOpen(!isOpen)}
          >
            <ChevronDownIcon
              aria-hidden
              className={cn(THREAD_DETAILS_PANEL_CHEVRON_CLASS, isOpen && "rotate-180")}
            />
          </ThreadDetailsControl>
        </div>
      )}
      {isOpen && detail !== null ? (
        <div
          data-thread-pr-details
          className="mb-1.5 ms-4.5 flex flex-col border-s border-border ps-2.5"
        >
          <div className="grid gap-0.5 px-2.5 py-1 text-xs text-muted-foreground">
            <span className="truncate">
              #{detail.number} · {detail.baseBranch} ← {detail.headBranch}
            </span>
            <span className="flex items-baseline gap-1">
              {detail.changedFiles.toLocaleString()} {detail.changedFiles === 1 ? "file" : "files"}{" "}
              ·
              <PullRequestDiffStat additions={detail.additions} deletions={detail.deletions} />
            </span>
            {reference !== null && (detail.additions > 0 || detail.deletions > 0) ? (
              <PullRequestChangeBreakdownRows
                environmentId={environmentId}
                reference={reference}
                className="text-foreground/75"
              />
            ) : null}
          </div>
          {detail.state === "open" && !detail.isDraft && checksState !== "none" ? (
            <div className="flex h-7 items-center gap-2.5 px-2.5 text-xs text-foreground/80">
              <PullRequestCheckStatusIcon
                status={
                  checksState === "failing"
                    ? "failure"
                    : checksState === "pending"
                      ? "pending"
                      : "success"
                }
              />
              <span className="min-w-0 truncate">{describePullRequestChecks(detail.checks)}</span>
            </div>
          ) : null}
          {prAction ? (
            <ThreadDetailsControl
              type="button"
              variant="ghost"
              size="sm"
              part="row"
              tone={
                prAction.destructive ? "destructive" : rowAction === "merge" ? "primary" : "default"
              }
              disabled={actionPending || handoff !== null}
              onClick={prAction.onClick}
            >
              <prAction.Icon aria-hidden className="size-4 shrink-0" />
              {prAction.pending ? prAction.pendingLabel : prAction.label}
              {prAction.handoff ? <ArrowUpRightIcon aria-hidden className="size-3.5" /> : null}
            </ThreadDetailsControl>
          ) : waitingOnChecks ? (
            <ThreadDetailsControl type="button" variant="ghost" size="sm" part="row" disabled>
              <PullRequestGlyph.merged aria-hidden className="size-4 shrink-0" />
              Merge…
              <span className="ms-auto text-xs text-muted-foreground">waiting on checks</span>
            </ThreadDetailsControl>
          ) : null}
          {watching ? (
            <ThreadDetailsControl
              type="button"
              variant="ghost"
              size="sm"
              part="row"
              tone="muted"
              onClick={onStopWatching}
            >
              <EyeOffIcon aria-hidden className="size-4 shrink-0" />
              Stop watching
            </ThreadDetailsControl>
          ) : null}
        </div>
      ) : null}
      {rowAction === "merge" ? (
        <AlertDialog open={confirmingMerge} onOpenChange={(open) => setConfirmingMerge(open)}>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Merge pull request?</AlertDialogTitle>
              <AlertDialogDescription>
                This merges #{number} using {selectedMergeMethod}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" size="sm" />}>
                Cancel
              </AlertDialogClose>
              <Button
                size="sm"
                disabled={actionPending}
                onClick={() => {
                  setConfirmingMerge(false);
                  void perform("merge", selectedMergeMethod);
                }}
              >
                Merge
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      ) : null}
    </>
  );
}
