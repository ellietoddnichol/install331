import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useProjectsQuery } from '../hooks/api/useProjectsQuery.ts';
import type { ProjectRecord } from '../shared/types/estimator';
import { StatusBadge } from '../components/ui/mvp/StatusBadge';
import {
  countBidsDueThisWeek,
  countByDashboardDisplayStatus,
  dashboardStatusBadgeTone,
  dashboardStatusLabel,
  formatDashboardProposalMode,
  getDashboardDisplayStatus,
  getDashboardNextAction,
  hasBidDueDateData,
  isDashboardActiveProject,
  isDashboardSetupComplete,
  type DashboardDisplayStatus,
} from '../shared/utils/dashboardProjectDisplay';
import { getCanonicalProjectDateTimestamp } from '../shared/utils/projectDates';

type TableFilter = 'all' | DashboardDisplayStatus;

const TABLE_FILTER_PILLS: Array<{ id: TableFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'estimate', label: 'Estimate' },
  { id: 'proposal_ready', label: 'Proposal Ready' },
  { id: 'won', label: 'Won' },
  { id: 'archived', label: 'Archived' },
];

interface AttentionItem {
  key: string;
  title: string;
  projectName: string;
  reason: string;
  actionLabel: string;
  href: string;
}

function formatMoneyOrDash(_n: number | null | undefined): string {
  void _n;
  return '—';
}

function formatUpdatedAt(project: ProjectRecord): string {
  const v = project.updatedAt || project.createdAt;
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
}

function buildAttentionQueue(projects: ProjectRecord[]): {
  needsReview: AttentionItem[];
  ready: AttentionItem[];
  upcoming: AttentionItem[];
} {
  const needsReview: AttentionItem[] = [];
  const ready: AttentionItem[] = [];
  const upcoming: AttentionItem[] = [];

  const active = projects.filter(isDashboardActiveProject);

  for (const p of active) {
    if (p.status === 'Draft' && !isDashboardSetupComplete(p)) {
      needsReview.push({
        key: `nr-setup-${p.id}`,
        title: 'Finish project setup',
        projectName: p.projectName,
        reason: 'Add client, address, and other required fields',
        actionLabel: 'Open setup',
        href: `/project/${p.id}/setup`,
      });
    }
  }

  for (const p of active) {
    if (p.status === 'Submitted') {
      ready.push({
        key: `ready-prop-${p.id}`,
        title: 'Preview proposal',
        projectName: p.projectName,
        reason: 'Estimate is ready to review and send',
        actionLabel: 'Open proposal',
        href: `/project/${p.id}/proposal`,
      });
    } else if (p.status === 'Draft' && isDashboardSetupComplete(p)) {
      ready.push({
        key: `ready-q-${p.id}`,
        title: 'Review quotes or import to estimate',
        projectName: p.projectName,
        reason: 'Project setup is complete — continue in Quotes or Estimate',
        actionLabel: 'Open quotes',
        href: `/project/${p.id}/quotes`,
      });
    }
  }

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const dueSoon = [...projects]
    .filter((p) => {
      if (!isDashboardActiveProject(p)) return false;
      const due = getCanonicalProjectDateTimestamp(p);
      return due !== null && due >= now && due <= now + weekMs;
    })
    .sort((a, b) => (getCanonicalProjectDateTimestamp(a) || 0) - (getCanonicalProjectDateTimestamp(b) || 0))
    .slice(0, 4);

  for (const p of dueSoon) {
    upcoming.push({
      key: `up-due-${p.id}`,
      title: 'Bid due this week',
      projectName: p.projectName,
      reason: 'Double-check pricing and proposal timing',
      actionLabel: 'Open project',
      href: `/project/${p.id}/overview`,
    });
  }

  const upcomingIds = new Set(dueSoon.map((p) => p.id));

  const recent = [...active]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, 12);

  for (const p of recent) {
    if (upcoming.length >= 6) break;
    if (upcomingIds.has(p.id)) continue;
    upcomingIds.add(p.id);
    upcoming.push({
      key: `up-recent-${p.id}`,
      title: 'Recently updated',
      projectName: p.projectName,
      reason: 'Pick up where you left off',
      actionLabel: 'Open project',
      href: `/project/${p.id}/overview`,
    });
  }

  return {
    needsReview: needsReview.slice(0, 6),
    ready: ready.slice(0, 6),
    upcoming: upcoming.slice(0, 6),
  };
}

function KpiCard({
  label,
  value,
  helper,
  footnote,
  onNavigate,
}: {
  label: string;
  value: string | number;
  helper: string;
  footnote?: string;
  onNavigate?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-slate-600">{helper}</p>
      {footnote ? <p className="mt-1 text-[11px] text-slate-400">{footnote}</p> : null}
    </>
  );
  if (onNavigate) {
    return (
      <button
        type="button"
        onClick={onNavigate}
        className="rounded-2xl border border-slate-200/90 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
      >
        {body}
      </button>
    );
  }
  return <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">{body}</div>;
}

function AttentionSection({
  title,
  items,
  onAction,
}: {
  title: string;
  items: AttentionItem[];
  onAction: (href: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-400">Nothing here right now.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-0.5 text-[12px] text-slate-600">{item.projectName}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{item.reason}</p>
              <button
                type="button"
                onClick={() => onAction(item.href)}
                className="ui-btn-secondary mt-2 h-8 w-full text-[11px]"
              >
                {item.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Dashboard() {
  const { data: projects = [], isLoading, isError, error, refetch } = useProjectsQuery();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<TableFilter>('all');

  const activeProjectCount = useMemo(() => projects.filter(isDashboardActiveProject).length, [projects]);
  const quotesReviewProxy = useMemo(() => countByDashboardDisplayStatus(projects, 'estimate'), [projects]);
  const estimatesInProgressCount = useMemo(
    () => projects.filter((p) => isDashboardActiveProject(p) && p.status === 'Draft').length,
    [projects],
  );
  const proposalReadyCount = useMemo(() => projects.filter((p) => p.status === 'Submitted').length, [projects]);
  const bidsDueCount = useMemo(() => countBidsDueThisWeek(projects), [projects]);
  const bidDateKnown = useMemo(() => hasBidDueDateData(projects), [projects]);

  const queue = useMemo(() => buildAttentionQueue(projects), [projects]);
  const queueEmpty = queue.needsReview.length === 0 && queue.ready.length === 0 && queue.upcoming.length === 0;

  const pipeline = useMemo(() => {
    const nonArchived = projects.filter((p) => getDashboardDisplayStatus(p) !== 'archived');
    return {
      draft: countByDashboardDisplayStatus(nonArchived, 'draft'),
      estimate: countByDashboardDisplayStatus(nonArchived, 'estimate'),
      proposal_ready: countByDashboardDisplayStatus(nonArchived, 'proposal_ready'),
      won: countByDashboardDisplayStatus(nonArchived, 'won'),
    };
  }, [projects]);

  const sortedForTable = useMemo(() => {
    return [...projects].sort((a, b) => {
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [projects]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedForTable.filter((p) => {
      const display = getDashboardDisplayStatus(p);
      if (tableFilter !== 'all' && display !== tableFilter) return false;
      if (!q) return true;
      const hay = `${p.projectName} ${p.clientName || ''} ${p.address || ''} ${p.projectNumber || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sortedForTable, search, tableFilter]);

  function goNewProject() {
    navigate('/project/new');
  }

  return (
    <div className="min-h-full bg-slate-50/80">
      <div className="ui-page-wide space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-slate-200/90 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Track active projects, quotes needing review, estimates in progress, and proposals ready to send.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={goNewProject} className="ui-btn-cta h-10 px-5 text-sm">
              New Project
            </button>
            <button type="button" onClick={() => navigate('/projects')} className="ui-btn-secondary h-10 px-4 text-sm">
              View Projects
            </button>
            <button type="button" onClick={() => navigate('/catalog')} className="ui-btn-secondary h-10 px-4 text-sm">
              Open Catalog
            </button>
          </div>
        </header>

        {isError ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-900">Could not load your projects.</p>
            <p className="mt-1 text-xs text-slate-500">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button type="button" onClick={() => void refetch()} className="ui-btn-secondary mt-4">
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
            Loading dashboard…
          </div>
        ) : (
          <>
            <section aria-label="Summary metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Active Projects"
                value={activeProjectCount}
                helper="Projects currently being estimated or proposed"
                footnote="Excludes archived and closed jobs"
                onNavigate={() => navigate('/projects?filter=active')}
              />
              <KpiCard
                label="Quotes Needing Review"
                value={quotesReviewProxy}
                helper="Past setup — open Quotes to review vendor rows"
                footnote="Row-level flags appear inside each project"
                onNavigate={() => navigate('/projects?filter=estimate')}
              />
              <KpiCard
                label="Estimates In Progress"
                value={estimatesInProgressCount}
                helper="Draft-stage work before proposal is ready"
                onNavigate={() => navigate('/projects?filter=draft-proposals')}
              />
              <KpiCard
                label="Proposals Ready"
                value={proposalReadyCount}
                helper="Ready to preview or send"
                onNavigate={() => navigate('/projects?filter=Submitted')}
              />
              <KpiCard
                label="Bids Due This Week"
                value={bidDateKnown ? bidsDueCount : '—'}
                helper={bidDateKnown ? 'Due in the next 7 days' : 'Add bid or due dates on projects to see this'}
                footnote={bidDateKnown ? undefined : 'No bid dates on file yet'}
                onNavigate={() => navigate('/projects?filter=due-soon')}
              />
            </section>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_minmax(17rem,20rem)] xl:grid-cols-[1fr_minmax(19rem,22rem)]">
              {/* Main table */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Active Projects</h2>
                  <p className="text-sm text-slate-600">Open project workspaces and continue the next step.</p>
                </div>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative min-w-[12rem] flex-1 lg:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search projects, customer, or address"
                      className="ui-input w-full pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filters">
                    {TABLE_FILTER_PILLS.map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setTableFilter(pill.id)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                          tableFilter === pill.id
                            ? 'border-blue-200 bg-blue-50 text-blue-950'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredRows.length === 0 ? (
                  <p className="mt-8 text-center text-sm text-slate-500">No projects match your search or filters.</p>
                ) : (
                  <div className="mt-4 -mx-2 overflow-x-auto">
                    <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left text-sm">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <th className="border-b border-slate-100 px-3 py-3">Project</th>
                          <th className="border-b border-slate-100 px-3 py-3">Customer</th>
                          <th className="border-b border-slate-100 px-3 py-3">Status</th>
                          <th className="border-b border-slate-100 px-3 py-3">Proposal mode</th>
                          <th className="border-b border-slate-100 px-3 py-3">Next action</th>
                          <th className="border-b border-slate-100 px-3 py-3 text-right">Total</th>
                          <th className="border-b border-slate-100 px-3 py-3">Updated</th>
                          <th className="border-b border-slate-100 px-3 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((project) => {
                          const display = getDashboardDisplayStatus(project);
                          const next = getDashboardNextAction(project);
                          const canPreviewProposal = project.status === 'Submitted';
                          return (
                            <tr key={project.id} className="align-top">
                              <td className="border-b border-slate-50 px-3 py-3.5">
                                <p className="font-medium text-slate-900">{project.projectName}</p>
                                {project.address ? <p className="mt-0.5 text-[12px] text-slate-500">{project.address}</p> : null}
                              </td>
                              <td className="border-b border-slate-50 px-3 py-3.5 text-slate-700">{project.clientName || '—'}</td>
                              <td className="border-b border-slate-50 px-3 py-3.5">
                                <StatusBadge label={dashboardStatusLabel(display)} tone={dashboardStatusBadgeTone(display)} />
                              </td>
                              <td className="border-b border-slate-50 px-3 py-3.5 text-[13px] text-slate-700">
                                {formatDashboardProposalMode(project.pricingMode)}
                              </td>
                              <td className="border-b border-slate-50 px-3 py-3.5 text-[13px] text-slate-700">{next.label}</td>
                              <td className="border-b border-slate-50 px-3 py-3.5 text-right text-[13px] tabular-nums text-slate-600">
                                {formatMoneyOrDash(null)}
                              </td>
                              <td className="border-b border-slate-50 px-3 py-3.5 text-[13px] text-slate-600">{formatUpdatedAt(project)}</td>
                              <td className="border-b border-slate-50 px-3 py-3.5">
                                <div className="flex flex-col items-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/project/${project.id}/overview`)}
                                    className="ui-ghost-btn h-8 gap-1 px-2 text-[11px] font-semibold text-blue-700"
                                  >
                                    Open <ExternalLink className="h-3 w-3" />
                                  </button>
                                  {canPreviewProposal ? (
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/project/${project.id}/proposal`)}
                                      className="text-[11px] font-semibold text-slate-600 underline-offset-2 hover:text-blue-700 hover:underline"
                                    >
                                      Preview proposal
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Attention queue */}
              <aside className="h-fit rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-lg font-semibold text-slate-900">Attention Queue</h2>
                  <p className="mt-1 text-[12px] text-slate-500">What needs a tap next across your work.</p>
                </div>
                {queueEmpty ? (
                  <p className="mt-6 text-sm leading-relaxed text-slate-600">
                    All caught up. New quote reviews and proposal tasks will appear here.
                  </p>
                ) : (
                  <div className="mt-5 space-y-6">
                    <AttentionSection title="Needs review" items={queue.needsReview} onAction={(href) => navigate(href)} />
                    <AttentionSection title="Ready to move forward" items={queue.ready} onAction={(href) => navigate(href)} />
                    <AttentionSection title="Upcoming" items={queue.upcoming} onAction={(href) => navigate(href)} />
                  </div>
                )}
              </aside>
            </div>

            {/* Proposal pipeline */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Proposal Pipeline</h2>
              <p className="mt-1 text-sm text-slate-600">Where active jobs sit in quote → estimate → proposal.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    { k: 'draft', label: 'Draft', n: pipeline.draft },
                    { k: 'est', label: 'Estimate', n: pipeline.estimate },
                    { k: 'pr', label: 'Proposal ready', n: pipeline.proposal_ready },
                    { k: 'won', label: 'Won', n: pipeline.won },
                  ] as const
                ).map((col) => (
                  <div key={col.k} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{col.label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{col.n}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Active jobs</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
