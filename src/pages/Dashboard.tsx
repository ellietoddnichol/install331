
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
      if (!project.dueDate) return false;
      const due = new Date(project.dueDate).getTime();
      const now = Date.now();
      const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
      return due >= now && due <= inSevenDays;
    })
    .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
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
    dateField: 'createdAt' | 'dueDate' | 'updatedAt';
  }) {
    return (
      <section className="ui-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {items.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="w-full text-left rounded-md border border-slate-200 bg-slate-50/30 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/30"
              >
                <p className="text-sm font-medium text-slate-900">{project.projectName}</p>
                <p className="text-xs text-slate-500">
                  {project.clientName || 'No client'} · {project.status} · {formatDateOrNA(project[dateField] as string | null | undefined)}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="ui-page space-y-4">
      <div className="ui-surface px-5 py-4 md:px-6 md:py-5 flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="ui-label">Operations Snapshot</p>
          <h1 className="ui-title mt-1">Dashboard</h1>
          <p className="ui-subtitle mt-1">What needs attention right now across bids, due dates, and proposal progress.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/project/new')}
            className="ui-btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
          <button
            onClick={() => navigate('/projects')}
            className="ui-btn-secondary"
          >
            View All Projects
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => openDrilldown(stat.filter)}
            className="ui-surface px-4 py-3 text-left transition-all cursor-pointer hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 active:translate-y-0 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ui-label">{stat.label}</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{stat.helper}</p>
              </div>
              <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors group-hover:text-blue-700">
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </button>
        ))}
      </div>

      <section className="ui-surface p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <button onClick={() => navigate('/project/new')} className="ui-btn-secondary h-10 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> New Project
          </button>
          <button onClick={() => navigate('/project/new')} className="ui-btn-secondary h-10 flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> Upload Takeoff
          </button>
          <button onClick={() => navigate('/catalog')} className="ui-btn-secondary h-10 flex items-center justify-center gap-2">
            <FolderOpen className="w-4 h-4" /> Open Catalog
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
            emptyText="No bid due dates in the next 7 days."
            dateField="dueDate"
          />
          <SmallList
            title="Draft Proposals"
            items={draftProposals}
            emptyText="No draft proposals right now."
            dateField="updatedAt"
          />
        </div>
      )}

      <section className="ui-surface p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Recent Activity</h2>
        {recentProjects.length === 0 ? (
          <p className="text-xs text-slate-500">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {recentProjects.slice(0, 4).map((project) => (
              <div key={`${project.id}-activity`} className="flex items-center justify-between gap-2 border border-slate-100 rounded-md px-3 py-2 bg-slate-50/40">
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-slate-400" />
                  Updated {project.projectName}
                </div>
                <button onClick={() => navigate(`/project/${project.id}`)} className="text-xs text-blue-700 font-medium hover:text-blue-800 flex items-center gap-1">
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ui-surface px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2"><Flag className="w-4 h-4 text-slate-400" /> Keep draft estimates moving to submitted.</div>
        <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-slate-400" /> Review due dates daily to avoid bid misses.</div>
        <div className="flex items-center gap-2"><FileClock className="w-4 h-4 text-slate-400" /> Prioritize proposals waiting on scope cleanup.</div>
      </section>
    </div>
  );
}
