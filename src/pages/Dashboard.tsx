
import React, { useEffect, useState } from 'react';
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
import { api } from '../services/api';
import { ProjectRecord } from '../shared/types/estimator';
import { getCanonicalProjectDate, getCanonicalProjectDateTimestamp } from '../shared/utils/projectDates';
import { format } from 'date-fns';

type DashboardDrilldown = 'active' | 'due-soon' | 'draft-proposals' | 'submitted';

export function Dashboard() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    void loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await api.getV1Projects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  }

  const sortedByRecent = [...projects].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });

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

  const stats: Array<{
    label: string;
    value: number;
    filter: DashboardDrilldown;
    helper: string;
  }> = [
    {
      label: 'Active Projects',
      value: projects.filter((project) => project.status !== 'Archived').length,
      filter: 'active',
      helper: 'Open active project list',
    },
    {
      label: 'Bids Due Soon',
      value: dueSoon.length,
      filter: 'due-soon',
      helper: 'Open projects due in the next 7 days',
    },
    {
      label: 'Draft Proposals',
      value: draftProposals.length,
      filter: 'draft-proposals',
      helper: 'Open draft proposal projects',
    },
    {
      label: 'Submitted',
      value: projects.filter((project) => project.status === 'Submitted').length,
      filter: 'submitted',
      helper: 'Open submitted projects',
    },
  ];

  function openDrilldown(filter: DashboardDrilldown) {
    const params = new URLSearchParams();
    params.set('filter', filter);
    navigate(`/projects?${params.toString()}`);
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
  }: {
    title: string;
    items: ProjectRecord[];
    emptyText: string;
    dateField: 'createdAt' | 'projectDate' | 'updatedAt';
  }) {
    function resolveDateValue(project: ProjectRecord): string | null | undefined {
      if (dateField === 'projectDate') return getCanonicalProjectDate(project);
      return project[dateField] as string | null | undefined;
    }

    return (
      <section className="ui-accent-card space-y-3 p-4 pl-5">
        <div className="flex items-center justify-between">
          <p className="ui-mono-kicker">{title}</p>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
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
                onClick={() => navigate(`/project/${project.id}`)}
                className="group flex w-full items-center justify-between gap-3 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{project.projectName}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    {project.clientName || 'No Client'} · {project.status} · {formatDateOrNA(resolveDateValue(project))}
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

  return (
    <div className="ui-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="ui-status-live">Live</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Brighten Builders <span className="mx-1 text-slate-300">/</span> Operations Snapshot
            </span>
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Dashboard</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
            Active Work · Bid Due Dates · Proposal Progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/project/new')} className="ui-btn-cta">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Project
          </button>
          <button onClick={() => navigate('/projects')} className="ui-btn-secondary h-10 px-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
            View All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
                <p className="mt-2 font-mono text-[28px] font-semibold leading-none tabular-nums text-white">{String(stat.value).padStart(2, '0')}</p>
                <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-slate-400">{stat.helper}</p>
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
          <button onClick={() => navigate('/project/new')} className="ui-btn-secondary flex h-10 items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <Plus className="h-4 w-4" /> New Project
          </button>
          <button onClick={() => navigate('/project/new')} className="ui-btn-secondary flex h-10 items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <Upload className="h-4 w-4" /> Upload Takeoff
          </button>
          <button onClick={() => navigate('/catalog')} className="ui-btn-secondary flex h-10 items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <FolderOpen className="h-4 w-4" /> Open Catalog
          </button>
        </div>
      </section>

      {loading ? (
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
            title="Projects Needing Attention"
            items={needingAttention}
            emptyText="No projects need immediate attention."
            dateField="updatedAt"
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
                  className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700 hover:text-blue-800"
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
