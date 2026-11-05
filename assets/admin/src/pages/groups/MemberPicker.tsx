import { useEffect, useState, type FC } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Spinner } from '@admin/components/Spinner';
import { apiCall } from '@admin/api';
import { __ } from '@admin/i18n';
import type { DirectoryUser } from '@admin/directoryTypes';

interface Props {
  /** Current member list (the source of truth). */
  members: DirectoryUser[];
  onChange: (members: DirectoryUser[]) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Member picker: chips for the current members, a user search
 * (`GET /admin/users?search=`) whose results can be added with one
 * click. The parent saves the final list with
 * `PUT /admin/groups/{id}/members`.
 */
export const MemberPicker: FC<Props> = ({ members, onChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term === '') {
      setResults(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      apiCall<DirectoryUser[]>(`/admin/users?per_page=20&search=${encodeURIComponent(term)}`)
        .then((users) => alive && setResults(users))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const memberIds = new Set(members.map((m) => m.id));

  return (
    <div className="space-y-2">
      {members.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">{__('No members yet.')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={__('Members')}>
          {members.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-panel-soft)] py-0.5 pl-0.5 pr-1.5 text-[12px]"
            >
              {m.avatar ? (
                <img src={m.avatar} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <span className="h-5 w-5 rounded-full bg-[var(--bg-hover)]" />
              )}
              <span className="max-w-[160px] truncate">{m.display_name || m.email}</span>
              <button
                type="button"
                onClick={() => onChange(members.filter((x) => x.id !== m.id))}
                title={__('Remove %s', m.display_name || m.email)}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={__('Search users by name or email…')}
          className="!pl-8"
        />
        {searching && <Spinner size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2" />}
      </div>

      {results !== null && (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-[var(--border-default)]">
          {results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
              {__('No users found.')}
            </li>
          )}
          {results.map((u) => {
            const added = memberIds.has(u.id);
            return (
              <li
                key={u.id}
                className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-1.5 text-[12px] last:border-b-0"
              >
                {u.avatar && <img src={u.avatar} alt="" className="h-6 w-6 rounded-full" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text-primary)]">
                    {u.display_name}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">
                    {u.email}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onChange([...members, u])}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:text-[var(--text-muted)] disabled:hover:bg-transparent"
                >
                  {added ? (
                    __('Added')
                  ) : (
                    <>
                      <Plus size={12} />
                      {__('Add')}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
