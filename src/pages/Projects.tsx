import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Archive, Filter, MoreHorizontal, Plus, Search } from 'lucide-react';
import { DeleteProjectModal } from '../components/projects/DeleteProjectModal';
import { projectDisplayTitle } from '../shared/utils/projectDisplay';
import { format } from 'date-fns';
import { ResumeProjectBanner } from '../components/ResumeProjectBanner';
import { api } from '../services/api';
import { useProjectsQuery } from '../hooks/api/useProjectsQuery.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { getCanonicalProjectDateTimestamp } from '../shared/utils/projectDates';
import { getDashboardDisplayStatus } from '../shared/utils/dashboardProjectDisplay';

type SortValue = 'newest' | 'oldest' | 'name';
type ProjectFilterValue =
  | 'all'
  | 'active'
  | 'Draft'
  | 'estimate'
  | 'Submitted'
  | 'Awarded'
  | 'Archived'
  | 'due-soon'
  | 'draft-proposals';

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
  if (filter === 'active') return 'Active';
  if (filter === 'estimate') return 'Estimate';
  if (filter === 'Submitted') return 'Proposal ready';
  if (filter === 'Awarded') return 'Won';
  if (filter === 'due-soon') return 'Bids due soon';
  if (filter === 'draft-proposals') return 'Draft proposals';
  if (filter === 'all') return 'All projects';
  if (filter === 'Draft') return 'Draft';
  if (filter === 'Archived') return 'Archived';
  return filter;
}

const PROJECT_FILTER_PILLS: Array<{ id: ProjectFilterValue; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'Draft', label: 'Draft' },
  { id: 'estimate', label: 'Estimate' },
  { id: 'Submitted', label: 'Proposal Ready' },
  { id: 'Awarded', label: 'Won' },
  { id: 'Archived', label: 'Archived' },
];

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
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('search', search.trim());
    if (status !== 'all') next.set('filter', status);
    if (sort !== 'newest') next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [search, status, sort, setSearchParams]);

  useEffect(() => {
    if (!openMenuProjectId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-project-row-menu]')) {
        setOpenMenuProjectId(null);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openMenuProjectId]);

  const filtered = useMemo(() => {
    const bySearch = projects.filter((project) => {
      const haystack = `${project.projectName} ${project.clientName || ''} ${project.projectNumber || ''}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });

    const byStatus = bySearch.filter((project) => {
      if (status === 'all') return true;
      if (status === 'active') return project.status !== 'Archived' && project.status !== 'Lost';
      if (status === 'due-soon') {
        const due = getCanonicalProjectDateTimestamp(project);
        if (due === null) return false;
        const now = Date.now();
        const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
        return due >= now && due <= inSevenDays;
      }
      if (status === 'draft-proposals') return project.status === 'Draft';
      if (status === 'Draft') return getDashboardDisplayStatus(project) === 'draft';
      if (status === 'estimate') {
        return getDashboardDisplayStatus(project) === 'estimate';
      }
      if (status === 'Archived') return project.status === 'Archived' || project.status === 'Lost';
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

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setOpenMenuProjectId(null);
    } catch (err) {
      console.error('Unable to delete project', err);
      window.alert('Unable to delete this project right now.');
    }
  }

  function goNewProject() {
    navigate('/project/new');
  }

  return (
    <div className="ui-page space-y-4">
      <div className="ui-panel flex items-end justify-between gap-4 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="ui-status-live">Live</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Brighten Builders <span className="mx-1 text-slate-300">/</span> Project Library
            </span>
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">Find a job, open the workspace, and move it through quote → estimate → proposal.</p>
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

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Project status filters">
          <Filter className="hidden w-4 h-4 text-slate-400 sm:block" aria-hidden />
          {PROJECT_FILTER_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatus(pill.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                status === pill.id
                  ? 'border-blue-300 bg-blue-50 text-blue-950'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

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
        <span className="ui-chip-soft">
          Filter: {activeFilterLabel}
        </span>
        {search.trim() ? (
          <span className="ui-chip-soft">
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
            className="ui-ghost-btn h-8 rounded-full px-3 text-[11px]"
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
              <tr className="sticky top-0 z-10 border-b border-app-line bg-app-surface-soft-95 backdrop-blur-sm">
                <th className="ui-table-th px-5 py-3">Project</th>
                <th className="ui-table-th px-5 py-3">Client</th>
                <th className="ui-table-th px-5 py-3">Status</th>
                <th className="ui-table-th px-5 py-3">Created</th>
                <th className="ui-table-th-end w-16 px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color-mix(in_srgb,var(--line)_55%,white)]">
              {filtered.map((project, idx) => {
                const tone = statusTone(project.status);
                const rowNumber = String(idx + 1).padStart(3, '0');
                return (
                  <tr
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    title="Click row to open"
                    className={`cursor-pointer border-l-[3px] ${tone.accent} outline-none hover:bg-app-surface-soft focus-visible-ring-app-inset`}
                    onClick={() => navigate(`/project/${project.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/project/${project.id}`);
                      }
                    }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="mb-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.05em] text-slate-400">
                        <span className="font-semibold tabular-nums">{rowNumber}</span>
                        {project.projectNumber ? (
                          <span>· IDREF <span className="text-slate-600">{project.projectNumber}</span></span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{projectDisplayTitle(project.projectName)}</p>
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
                      <div className="relative inline-block" data-project-row-menu>
                        <button
                          type="button"
                          aria-label={`More actions for ${projectDisplayTitle(project.projectName)}`}
                          aria-expanded={openMenuProjectId === project.id}
                          aria-haspopup="menu"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuProjectId((current) => (current === project.id ? null : project.id));
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-400/40"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                        {openMenuProjectId === project.id ? (
                          <div
                            role="menu"
                            className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
                          >
                            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Danger zone
                            </p>
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuProjectId(null);
                                setDeleteTarget({ id: project.id, name: project.projectName });
                              }}
                            >
                              Delete project…
                            </button>
                          </div>
                        ) : null}
                      </div>
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

      <DeleteProjectModal
        open={Boolean(deleteTarget)}
        projectName={deleteTarget?.name}
        busy={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteProject()}
      />
    </div>
  );
}
