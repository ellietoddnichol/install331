import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Archive, Filter, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../services/api';
import { ProjectRecord } from '../shared/types/estimator';
import { getCanonicalProjectDateTimestamp } from '../shared/utils/projectDates';

type SortValue = 'newest' | 'oldest' | 'name';
type ProjectFilterValue = 'all' | 'active' | 'Draft' | 'Submitted' | 'Awarded' | 'Lost' | 'completed' | 'Archived' | 'due-soon' | 'draft-proposals';

function resolveFilterLabel(filter: ProjectFilterValue): string {
  if (filter === 'active') return 'Active projects';
  if (filter === 'due-soon') return 'Bids due soon';
  if (filter === 'draft-proposals') return 'Draft proposals';
  if (filter === 'completed') return 'Completed / archived';
  if (filter === 'all') return 'All projects';
  return filter;
}

export function Projects() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const initialSearch = searchParams.get('search') || '';
  const initialFilter = (searchParams.get('filter') as ProjectFilterValue | null) || 'all';
  const initialSort = (searchParams.get('sort') as SortValue | null) || 'newest';
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<ProjectFilterValue>(initialFilter);
  const [sort, setSort] = useState<SortValue>(initialSort);

  useEffect(() => {
    void (async () => {
      try {
        setProjects(await api.getV1Projects());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('search', search.trim());
    if (status !== 'all') next.set('filter', status);
    if (sort !== 'newest') next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [search, status, sort, setSearchParams]);

  const filtered = useMemo(() => {
    const bySearch = projects.filter((project) => {
      const haystack = `${project.projectName} ${project.clientName || ''} ${project.projectNumber || ''}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });

    const byStatus = bySearch.filter((project) => {
      if (status === 'all') return true;
      if (status === 'active') return project.status !== 'Archived';
      if (status === 'due-soon') {
        const due = getCanonicalProjectDateTimestamp(project);
        if (due === null) return false;
        const now = Date.now();
        const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
        return due >= now && due <= inSevenDays;
      }
      if (status === 'draft-proposals') return project.status === 'Draft';
      if (status === 'completed') return project.status === 'Awarded' || project.status === 'Archived';
      return project.status === status;
    });

    return [...byStatus].sort((a, b) => {
      if (sort === 'name') return a.projectName.localeCompare(b.projectName);
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return sort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [projects, search, status, sort]);

  const archivedCount = projects.filter((project) => project.status === 'Archived').length;
  const activeFilterLabel = resolveFilterLabel(status);

  async function deleteProject(projectId: string, projectName: string) {
    const confirmed = window.confirm(`Delete project "${projectName}" permanently?`);
    if (!confirmed) return;

    try {
      await api.deleteV1Project(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (error) {
      console.error('Unable to delete project', error);
      window.alert('Unable to delete this project right now.');
    }
  }

  return (
    <div className="ui-page space-y-4">
      <div className="ui-surface px-5 py-4 md:px-6 md:py-5 flex items-end justify-between gap-4">
        <div>
          <p className="ui-label">Project Library</p>
          <h1 className="ui-title mt-1">Projects</h1>
          <p className="ui-subtitle mt-1">Search, filter, sort, and manage every estimate from one operational index.</p>
        </div>
        <button
          onClick={() => navigate('/project/new')}
          className="ui-btn-primary h-10 px-4 inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="ui-surface p-3 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-2.5 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project, client, or number"
            className="ui-input pl-9"
          />
        </div>

        <label className="text-xs text-slate-600 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectFilterValue)} className="ui-input min-w-40">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="due-soon">Bids Due Soon</option>
            <option value="draft-proposals">Draft Proposals</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Awarded">Awarded</option>
            <option value="Lost">Lost</option>
            <option value="completed">Completed / Archived</option>
            <option value="Archived">Archived</option>
          </select>
        </label>

        <label className="text-xs text-slate-600 flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortValue)} className="ui-input min-w-32">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div className="px-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
          Filter: {activeFilterLabel}
        </span>
        {search.trim() ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
            Search: {search.trim()}
          </span>
        ) : null}
        {(status !== 'all' || search.trim() || sort !== 'newest') ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatus('all');
              setSort('newest');
            }}
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      <div className="ui-surface overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading projects...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">No projects match your filters.</p>
            <p className="text-xs text-slate-500 mt-1">Try changing the search, status, or sort options.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Project</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-900">{project.projectName}</p>
                    <p className="text-xs text-slate-500">{project.projectNumber ? `#${project.projectNumber}` : 'No project number'} · {project.address || 'No address'}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-700">{project.clientName || 'No client'}</td>
                  <td className="px-5 py-4">
                    <span className="ui-chip border-slate-200 bg-slate-100 text-slate-700">{project.status}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {project.createdAt && !Number.isNaN(new Date(project.createdAt).getTime())
                      ? format(new Date(project.createdAt), 'MMM d, yyyy')
                      : 'N/A'}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="ui-btn-secondary h-8 px-3 text-xs"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => void deleteProject(project.id, project.projectName)}
                        className="h-8 px-3 rounded-md border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-slate-500 flex items-center gap-2 px-1">
        <Archive className="w-4 h-4" />
        Archived projects: {archivedCount}
      </div>
    </div>
  );
}
