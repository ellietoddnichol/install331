
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FolderOpen,
  FileClock,
  Flag,
  Plus,
  Upload,
} from 'lucide-react';
import { ProjectRecord } from '../shared/types/estimator';
import { getCanonicalProjectDate, getCanonicalProjectDateTimestamp } from '../shared/utils/projectDates';
import { format } from 'date-fns';
import { useProjectsQuery } from '../hooks/api/useProjectsQuery.ts';

type DashboardDrilldown = 'active' | 'due-soon' | 'draft-proposals' | 'submitted';

export function Dashboard() {
  const { data: projects = [], isLoading, isError, error, refetch, isFetching } = useProjectsQuery();
  const navigate = useNavigate();

  const sortedByRecent = useMemo(() => {
    return [...projects].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [projects]);

  const recentProjects = sortedByRecent.slice(0, 5);
  const needingAttention = projects
    .filter((project) => project.status === 'Draft' || project.status === 'Submitted')
    .slice(0, 5);

  const dueSoon = projects
    .filter((project) => {
      const due = getCanonicalProjectDateTimestamp(project);
      if (due === null) return false;
      const now = Date.now();
      const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
      return due >= now && due <= inSevenDays;
    })
    .sort((a, b) => (getCanonicalProjectDateTimestamp(a) || 0) - (getCanonicalProjectDateTimestamp(b) || 0))
    .slice(0, 5);

  const draftProposals = projects.filter((project) => project.status === 'Draft').slice(0, 5);

  const missingBidDateCount = useMemo(() => {
    return projects.filter((project) => getCanonicalProjectDateTimestamp(project) === null && project.status !== 'Archived').length;
  }, [projects]);

  const dueTodayCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return projects.filter((project) => {
      const due = getCanonicalProjectDateTimestamp(project);
      return due !== null && due >= start && due < end && project.status !== 'Archived';
    }).length;
  }, [projects]);

  const draftCount = projects.filter((p) => p.status === 'Draft').length;
  const submittedCount = projects.filter((p) => p.status === 'Submitted').length;
  const dueSoonCount = useMemo(() => {
    const now = Date.now();
    const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
    return projects.filter((project) => {
      const due = getCanonicalProjectDateTimestamp(project);
      if (due === null || project.status === 'Archived') return false;
      return due >= now && due <= inSevenDays;
    }).length;
  }, [projects]);

  const stats: Array<{
    label: string;
    value: number | string;
    filter: DashboardDrilldown;
    helper: string;
  }> = [
    {
      label: 'Active Projects',
      value: projects.filter((project) => project.status !== 'Archived').length,
      filter: 'active',
      helper: 'Projects in progress',
    },
    {
      label: 'Quotes Needing Review',
      value: draftCount,
      filter: 'draft-proposals',
      helper: 'Draft projects — add or review quotes',
    },
    {
      label: 'Estimates In Progress',
      value: Math.max(0, projects.filter((p) => p.status !== 'Archived' && p.status !== 'Submitted').length - draftCount),
      filter: 'active',
      helper: 'Open estimating work',
    },
    {
      label: 'Proposals Ready',
      value: submittedCount,
      filter: 'submitted',
      helper: 'Ready to preview or send',
    },
    {
      label: 'Bids Due This Week',
      value: dueSoonCount,
      filter: 'due-soon',
      helper: 'Due in the next 7 days',
    },
  ];

  function openDrilldown(filter: DashboardDrilldown) {
    const params = new URLSearchParams();
    params.set('filter', filter);
    navigate(`/projects?${params.toString()}`);
  }

  /** Primary workflow link for “needs attention” projects (control center). */
  function projectControlCenterPath(project: ProjectRecord): string {
    if (project.status === 'Submitted') return `/project/${project.id}/proposal`;
    if (project.status === 'Draft') return `/project/${project.id}/quotes`;
    return `/project/${project.id}/estimate`;
  }

  function formatDateOrNA(value: string | null | undefined) {
    if (!value) return 'N/A';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'N/A' : format(date, 'MMM d, yyyy');
  }

  function SmallList({
    title,
    items,
    emptyText,
    dateField,
    getNavigateTo,
  }: {
    title: string;
    items: ProjectRecord[];
    emptyText: string;
    dateField: 'createdAt' | 'projectDate' | 'updatedAt';
    /** When set, row click goes here; defaults to project overview. */
    getNavigateTo?: (project: ProjectRecord) => string;
  }) {
    function resolveDateValue(project: ProjectRecord): string | null | undefined {
      if (dateField === 'projectDate') return getCanonicalProjectDate(project);
      return project[dateField] as string | null | undefined;
    }

    return (
      <section className="ui-accent-card space-y-3 p-4 pl-5">
        <div className="flex items-center justify-between">
          <p className="ui-mono-kicker">{title}</p>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            {String(items.length).padStart(2, '0')} Rows
          </span>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyText}</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(getNavigateTo ? getNavigateTo(project) : `/project/${project.id}`)}
                className="group flex w-full items-center justify-between gap-3 rounded-md border border-app-line-mix-75 bg-app-surface px-3 py-2 text-left transition-colors hover:border-app-focus hover:bg-app-brand-soft focus-visible-ring-app"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{project.projectName}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-slate-500">
                    {project.clientName || 'No Client'} · {project.status} · {formatDateOrNA(resolveDateValue(project))}
                    {getNavigateTo ? (
                      <span className="ml-1 text-slate-400">
                        → {getNavigateTo(project).includes('quotes') ? 'Quotes' : getNavigateTo(project).includes('proposal') ? 'Proposal' : 'Estimate'}
                      </span>
                    ) : null}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-blue-600" />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  function goNewProject() {
    navigate('/project/new');
  }

  return (
    <div className="ui-page space-y-5">
      <div className="ui-panel flex flex-wrap items-end justify-between gap-4 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="ui-status-live">Live</span>
            <span className="text-xs font-medium text-slate-500">Brighten Builders · Install App</span>
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Your projects, quotes, estimates, and proposals at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/project/new')} className="ui-btn-cta">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Project
          </button>
          <button onClick={() => navigate('/projects')} className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em]">
            View All
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="ui-btn-secondary h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] disabled:opacity-60"
            title="Refresh dashboard"
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="ui-panel-muted p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ui-mono-kicker">Now / Attention</p>
            <p className="mt-1 text-sm text-slate-900">
              {missingBidDateCount > 0 || dueTodayCount > 0
                ? 'A few items need attention before you price and submit.'
                : 'No urgent warnings detected.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              These are lightweight checks from project metadata (they do not change estimate math).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dueTodayCount > 0 ? (
              <button type="button" onClick={() => openDrilldown('due-soon')} className="ui-chip-soft">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Due today: {dueTodayCount}
              </button>
            ) : null}
            {missingBidDateCount > 0 ? (
              <button type="button" onClick={() => openDrilldown('active')} className="ui-chip-soft">
                <Flag className="h-3.5 w-3.5" aria-hidden /> Missing bid date: {missingBidDateCount}
              </button>
            ) : null}
            <button type="button" onClick={() => navigate('/project/new')} className="ui-chip-soft">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Start project
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => openDrilldown(stat.filter)}
            className="ui-stat-tile group relative cursor-pointer overflow-hidden text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-2"
            style={{ minHeight: 96 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="ui-stat-tile-kicker">{stat.label}</p>
                <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-white">
                  {typeof stat.value === 'number' ? String(stat.value).padStart(2, '0') : stat.value}
                </p>
                <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-slate-400">{stat.helper}</p>
              </div>
              <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-300 transition-colors group-hover:bg-white/10 group-hover:text-white">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </button>
        ))}
      </div>

      <section className="ui-accent-card p-4 pl-5">
        <p className="ui-mono-kicker mb-3">Module 01 / Quick Actions</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <button onClick={() => navigate('/project/new')} className="ui-btn-secondary flex h-10 items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
            <Plus className="h-4 w-4" /> New Project
          </button>
          <button onClick={() => navigate('/project/new')} className="ui-btn-secondary flex h-10 items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
            <Upload className="h-4 w-4" /> Upload Takeoff
          </button>
          <button onClick={() => navigate('/catalog')} className="ui-btn-secondary flex h-10 items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
            <FolderOpen className="h-4 w-4" /> Open Catalog
          </button>
        </div>
      </section>

      {isError ? (
        <div className="ui-surface p-10 text-center">
          <p className="text-sm font-medium text-slate-900">Could not load dashboard projects.</p>
          <p className="mt-1 text-xs text-slate-500">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <button type="button" onClick={() => void refetch()} className="ui-btn-secondary mt-4">
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="ui-surface p-10 text-center text-sm text-slate-500">Loading dashboard...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SmallList
            title="Recent Projects"
            items={recentProjects}
            emptyText="No projects yet. Create your first project to get started."
            dateField="updatedAt"
          />
          <SmallList
            title="Attention Queue"
            items={needingAttention}
            emptyText="Nothing needs attention right now."
            dateField="updatedAt"
            getNavigateTo={projectControlCenterPath}
          />
          <SmallList
            title="Bids Due Soon"
            items={dueSoon}
            emptyText="No bid due dates fall in the next 7 days."
            dateField="projectDate"
          />
          <SmallList
            title="Draft Proposals"
            items={draftProposals}
            emptyText="No draft proposals right now."
            dateField="updatedAt"
          />
        </div>
      )}

      <section className="ui-accent-card ui-accent-card--slate p-4 pl-5">
        <p className="ui-mono-kicker mb-3">Module 02 / Recent Activity</p>
        {recentProjects.length === 0 ? (
          <p className="text-xs text-slate-500">No activity yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recentProjects.slice(0, 4).map((project) => (
              <div
                key={`${project.id}-activity`}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-white px-3 py-2"
              >
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  Updated <span className="font-semibold text-slate-900">{project.projectName}</span>
                </div>
                <button
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-700 hover:text-blue-800"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ui-accent-card ui-accent-card--amber grid grid-cols-1 gap-2 p-4 pl-5 md:grid-cols-3">
        <div className="flex items-center gap-2 text-xs text-slate-600"><Flag className="h-4 w-4 text-amber-500" /> Keep draft estimates moving to submitted.</div>
        <div className="flex items-center gap-2 text-xs text-slate-600"><CalendarClock className="h-4 w-4 text-amber-500" /> Review bid due dates daily to avoid scheduling misses.</div>
        <div className="flex items-center gap-2 text-xs text-slate-600"><FileClock className="h-4 w-4 text-amber-500" /> Prioritize proposals waiting on scope cleanup.</div>
      </section>
    </div>
  );
}
