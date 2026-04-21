import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Archive, Filter, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../services/api';
import { useProjectsQuery } from '../hooks/api/useProjectsQuery.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { getCanonicalProjectDateTimestamp } from '../shared/utils/projectDates';

type SortValue = 'newest' | 'oldest' | 'name';
type ProjectFilterValue = 'all' | 'active' | 'Draft' | 'Submitted' | 'Awarded' | 'Lost' | 'completed' | 'Archived' | 'due-soon' | 'draft-proposals';

/**
 * Map the project's textual `status` into a left-accent tone + status-chip tone
 * so the Projects table reads like the rest of the workstation app. Fallback
 * is slate for unknown/custom statuses.
 */
function statusTone(status: string | null | undefined): { accent: string; chip: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'draft') return { accent: 'border-l-amber-500', chip: 'ui-mono-chip ui-mono-chip--warn' };
  if (s === 'submitted') return { accent: 'border-l-blue-500', chip: 'ui-mono-chip ui-mono-chip--info' };
  if (s === 'awarded') return { accent: 'border-l-emerald-500', chip: 'ui-mono-chip ui-mono-chip--ok' };
  if (s === 'lost') return { accent: 'border-l-rose-500', chip: 'ui-mono-chip ui-mono-chip--danger' };
  if (s === 'archived') return { accent: 'border-l-slate-400', chip: 'ui-mono-chip ui-mono-chip--mute' };
  return { accent: 'border-l-slate-300', chip: 'ui-mono-chip ui-mono-chip--mute' };
}

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
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading, isError, error, refetch } = useProjectsQuery();
  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => api.deleteV1Project(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list });
    },
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const initialFilter = (searchParams.get('filter') as ProjectFilterValue | null) || 'all';
  const initialSort = (searchParams.get('sort') as SortValue | null) || 'newest';
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<ProjectFilterValue>(initialFilter);
  const [sort, setSort] = useState<SortValue>(initialSort);

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
      await deleteMutation.mutateAsync(projectId);
    } catch (err) {
      console.error('Unable to delete project', err);
      window.alert('Unable to delete this project right now.');
    }
  }

  return (
    <div className="ui-page space-y-4">
      <div className="flex items-end justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="ui-status-live">Live</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Brighten Builders <span className="mx-1 text-slate-300">/</span> Project Library
            </span>
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Projects</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
            Search · Filter · Sort · Manage Every Estimate
          </p>
        </div>
        <button onClick={() => navigate('/project/new')} className="ui-btn-cta">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New Project
        </button>
      </div>

      <div className="ui-surface p-3 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-2.5 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project, client, or number"
            className="ui-input ui-input--leading-icon"
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
        {isError ? (
          <div className="p-10 text-center text-sm text-red-700">
            Could not load projects.{error instanceof Error ? ` ${error.message}` : ''}{' '}
            <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
                Retry
              </button>
          </div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading projects...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">No projects match your filters.</p>
            <p className="text-xs text-slate-500 mt-1">Try changing the search, status, or sort options.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                <th className="ui-table-th px-5 py-3">Project</th>
                <th className="ui-table-th px-5 py-3">Client</th>
                <th className="ui-table-th px-5 py-3">Status</th>
                <th className="ui-table-th px-5 py-3">Created</th>
                <th className="ui-table-th-end px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((project, idx) => {
                const tone = statusTone(project.status);
                const rowNumber = String(idx + 1).padStart(3, '0');
                return (
                  <tr
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    title="Click row to open"
                    className={`cursor-pointer border-l-[3px] ${tone.accent} outline-none hover:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/50`}
                    onClick={() => navigate(`/project/${project.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/project/${project.id}`);
                      }
                    }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="mb-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        <span className="font-semibold tabular-nums">{rowNumber}</span>
                        {project.projectNumber ? (
                          <span>· IDREF <span className="text-slate-600">{project.projectNumber}</span></span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{project.projectName}</p>
                      <p className="text-xs text-slate-500">{project.address || 'No address'}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700">{project.clientName || 'No client'}</td>
                    <td className="px-5 py-3.5">
                      <span className={tone.chip}>{project.status || 'Unknown'}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-600">
                      {project.createdAt && !Number.isNaN(new Date(project.createdAt).getTime())
                        ? format(new Date(project.createdAt), 'MMM d, yyyy')
                        : 'N/A'}
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteProject(project.id, project.projectName);
                        }}
                        className="h-8 rounded-md border border-red-200 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400/40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
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
