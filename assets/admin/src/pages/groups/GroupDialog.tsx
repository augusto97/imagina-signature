import { useEffect, useState, type FC } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Modal } from '@admin/components/Modal';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Banner, Field } from '@admin/pages/settings/_shared';
import type { TemplateRow } from '@admin/types';
import type { DirectoryUser, GroupRow } from '@admin/directoryTypes';
import { MemberPicker } from './MemberPicker';

interface Props {
  /** The group to edit; null creates one. */
  group: GroupRow | null;
  onClose: () => void;
  /** After a successful save (the parent reloads its list). */
  onSaved: () => void;
}

const GROUP_COLORS = [
  '#64748b',
  '#2563eb',
  '#0891b2',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#9333ea',
];

/** Most member pages (of 100) loaded for display. */
const MAX_MEMBER_PAGES = 20;

/**
 * Create / edit dialog: name, description, colour, assigned template,
 * compliance-footer override and members.
 */
export const GroupDialog: FC<Props> = ({ group, onClose, onSaved }) => {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[0]!);
  const [templateId, setTemplateId] = useState<number | null>(group?.template_id ?? null);
  const [footerEnabled, setFooterEnabled] = useState(
    group?.compliance_footer_override.enabled ?? false,
  );
  const [footerHtml, setFooterHtml] = useState(group?.compliance_footer_override.html ?? '');
  const [members, setMembers] = useState<DirectoryUser[] | null>(group ? null : []);
  const [initialIds, setInitialIds] = useState<number[]>([]);
  // False when not every member could be loaded: the list is then
  // read-only, since saving it would drop the members we never saw.
  const [membersComplete, setMembersComplete] = useState(true);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiCall<TemplateRow[]>('/templates?per_page=100')
      .then((rows) => setTemplates(Array.isArray(rows) ? rows : []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!group) return;
    let alive = true;
    void (async () => {
      const loaded: DirectoryUser[] = [];
      let failed = false;
      try {
        for (let page = 1; page <= MAX_MEMBER_PAGES; page++) {
          const rows = await apiCall<DirectoryUser[]>(
            `/admin/users?group=${group.id}&per_page=100&page=${page}`,
          );
          loaded.push(...rows);
          if (rows.length < 100) break;
        }
      } catch (e) {
        failed = true;
        if (alive) setError((e as Error).message);
      }
      if (alive) {
        setMembers(loaded);
        setInitialIds(loaded.map((m) => m.id).sort((a, b) => a - b));
        setMembersComplete(!failed && loaded.length >= group.member_count);
      }
    })();
    return () => {
      alive = false;
    };
  }, [group]);

  const onSave = async (): Promise<void> => {
    if (name.trim() === '' || members === null) return;
    setBusy(true);
    setError(null);
    const body = {
      name,
      description,
      color,
      template_id: templateId,
      compliance_footer_override: { enabled: footerEnabled, html: footerHtml },
    };
    try {
      const saved = group
        ? await apiCall<GroupRow>(`/admin/groups/${group.id}`, { method: 'PATCH', body })
        : await apiCall<GroupRow>('/admin/groups', { method: 'POST', body });

      const ids = members.map((m) => m.id).sort((a, b) => a - b);
      if (membersComplete && ids.join(',') !== initialIds.join(',')) {
        await apiCall(`/admin/groups/${saved.id}/members`, {
          method: 'PUT',
          body: { user_ids: ids },
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={group ? __('Edit group') : __('New group')}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {__('Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void onSave()}
            disabled={busy || name.trim() === '' || members === null}
            icon={busy ? <Spinner size={12} /> : <Save size={14} />}
          >
            {group ? __('Save group') : __('Create group')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={__('Name')}>
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder={__('e.g. Sales, Madrid office…')}
              autoFocus
            />
          </Field>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
              {__('Colour')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 py-1.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={__('Use colour %s', c)}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full ring-offset-2 transition-shadow',
                    color === c && 'ring-2 ring-[var(--accent)]',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <Field label={__('Description (optional)')}>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field
          label={__('Assigned template (optional)')}
          hint={__('The template this group’s members should use.')}
        >
          <select
            value={templateId ?? ''}
            onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{__('— None —')}</option>
            {templateId !== null && !templates.some((t) => t.id === templateId) && (
              <option value={templateId}>{__('Template #%s', String(templateId))}</option>
            )}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3">
          <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={footerEnabled}
              onChange={(e) => setFooterEnabled(e.target.checked)}
              className="mt-0.5 !h-4 !w-4 !p-0"
            />
            <span>
              <span className="font-medium text-[var(--text-primary)]">
                {__('Own compliance footer')}
              </span>
              <span className="block text-[11.5px] text-[var(--text-secondary)]">
                {__(
                  'Replaces the site-wide footer for members. Leave the HTML empty to ship no footer. If a user is in several groups with their own footer, the first group alphabetically wins.',
                )}
              </span>
            </span>
          </label>
          {footerEnabled && (
            <textarea
              rows={4}
              value={footerHtml}
              onChange={(e) => setFooterHtml(e.target.value)}
              className="font-mono text-[12px]"
              placeholder={__('Paste or write the HTML disclaimer here…')}
            />
          )}
        </div>

        <div>
          <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
            {members === null ? __('Members') : __('Members (%s)', String(members.length))}
          </span>
          {members === null ? (
            <div className="flex justify-center p-4">
              <Spinner size={16} />
            </div>
          ) : membersComplete ? (
            <MemberPicker members={members} onChange={setMembers} />
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {__(
                'Not every member could be loaded, so the member list is read-only here. Use the CSV import to add people to this group.',
              )}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
