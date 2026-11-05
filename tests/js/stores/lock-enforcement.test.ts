import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useLinkStore } from '@/stores/linkStore';
import { useToastStore } from '@/stores/toastStore';
import {
  createEmptySchema,
  type EmployeeMode,
  type SignatureSchema,
} from '@/core/schema/signature';
import type {
  Block,
  ContainerBlock,
  HeadingBlock,
  ImageBlock,
  TextBlock,
} from '@/core/schema/blocks';
import { findBlock } from '@/core/schema/tree';

const text = (id: string, content: string, locked = false): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { color: '#333333' },
  ...(locked ? { locked: true } : {}),
});

const heading = (id: string): HeadingBlock => ({
  id,
  type: 'heading',
  content: 'Ana',
  content_html: '<p>Ana</p>',
  style: {},
});

const logo = (): ImageBlock => ({
  id: 'logo',
  type: 'image',
  src: 'https://cdn.acme.test/logo.png',
  alt: 'Acme',
  locked: true,
});

const row = (locked = false): ContainerBlock => ({
  id: 'row',
  type: 'container',
  gap: 8,
  columns: [{ id: 'col', width: 100, children: [text('inner', '<p>Inner</p>')] }],
  ...(locked ? { locked: true } : {}),
});

function schema(): SignatureSchema {
  const s = createEmptySchema();
  s.blocks = [logo(), heading('name'), text('bio', '<p>Bio</p>'), row()];
  s.overrides = {};
  return s;
}

function link(
  mode: 'linked' | 'detached',
  employeeMode: EmployeeMode,
  canBypassLocks = false,
): void {
  useLinkStore.setState({
    mode,
    templateId: 4,
    employeeMode,
    canBypassLocks,
    templateName: 'Corp',
  });
}

const blocks = (): Block[] => useSchemaStore.getState().schema.blocks;
const ids = (): string[] => blocks().map((b) => b.id);
const toasts = (): string[] => useToastStore.getState().toasts.map((t) => t.message);

describe('schema store — lock enforcement', () => {
  beforeEach(() => {
    useSchemaStore.setState({ schema: schema(), hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useToastStore.setState({ toasts: [] });
    endHistoryBurst();
  });

  describe('linked signature, free template', () => {
    beforeEach(() => link('linked', 'free'));

    it('refuses to edit, move, duplicate or delete a locked block, with a toast', () => {
      const store = useSchemaStore.getState();
      store.updateBlock('logo', { alt: 'Hacked' });
      store.moveBlockDown('logo');
      store.duplicateBlock('logo');
      expect(store.deleteBlock('logo')).toBe(false);

      expect((findBlock(blocks(), 'logo') as ImageBlock).alt).toBe('Acme');
      expect(ids()).toEqual(['logo', 'name', 'bio', 'row']);
      expect(useHistoryStore.getState().past).toHaveLength(0);
      expect(toasts().length).toBeGreaterThan(0);
      expect(toasts()[0]).toMatch(/locked/i);
    });

    it('lets unlocked blocks be edited and rearranged', () => {
      const store = useSchemaStore.getState();
      store.updateBlock('bio', { style: { color: '#ff0000' } });
      store.moveBlockUp('bio');
      expect(store.deleteBlock('name')).toBe(true);

      expect((findBlock(blocks(), 'bio') as TextBlock).style.color).toBe('#ff0000');
      expect(ids()).toEqual(['logo', 'bio', 'row']);
      expect(toasts()).toEqual([]);
    });

    it('a locked container locks its children and refuses drops into it', () => {
      useSchemaStore.setState({
        schema: { ...schema(), blocks: [row(true), text('loose', '<p>x</p>')] },
      });
      const store = useSchemaStore.getState();

      store.updateBlock('inner', { content: '<p>Edited</p>' });
      expect(store.moveBlockToColumn('loose', 'row', 'col')).toBe(false);
      expect(store.addChildToColumn('row', 'col', text('new', '<p>n</p>'))).toBe(false);
      store.setContainerColumns('row', 2);

      expect((findBlock(blocks(), 'inner') as TextBlock).content).toBe('<p>Inner</p>');
      expect((blocks()[0] as ContainerBlock).columns).toHaveLength(1);
      expect((blocks()[0] as ContainerBlock).columns[0]?.children.map((b) => b.id)).toEqual([
        'inner',
      ]);
    });

    it('never refuses derived writes (uploaded asset URLs)', () => {
      useSchemaStore
        .getState()
        .updateBlock('logo', { src: 'https://cdn.acme.test/2x.png' }, { history: false });
      expect((findBlock(blocks(), 'logo') as ImageBlock).src).toBe('https://cdn.acme.test/2x.png');
    });

    it('refuses to swap the design for another template', () => {
      expect(useSchemaStore.getState().replaceSchema(createEmptySchema())).toBe(false);
      expect(ids()).toEqual(['logo', 'name', 'bio', 'row']);
    });

    it('records text edits on unlocked text-like blocks as overrides', () => {
      const store = useSchemaStore.getState();
      store.updateBlock('bio', { content: '<p>I sell rockets</p>' });
      store.updateBlock('name', {
        content: 'Ana B',
        content_html: '<p><strong>Ana</strong> B</p>',
      });
      store.updateBlock('bio', { style: { color: '#000000' } });

      expect(useSchemaStore.getState().schema.overrides).toEqual({
        bio: { content: '<p>I sell rockets</p>' },
        name: { content: 'Ana B', content_html: '<p><strong>Ana</strong> B</p>' },
      });
    });

    it('undo also takes the override back', () => {
      useSchemaStore.getState().updateBlock('bio', { content: '<p>Edited</p>' });
      useSchemaStore.getState().undo();
      expect(useSchemaStore.getState().schema.overrides).toEqual({});
      expect((findBlock(blocks(), 'bio') as TextBlock).content).toBe('<p>Bio</p>');
    });

    it('turns a PHP-shaped empty overrides array into an object', () => {
      useSchemaStore.setState({
        schema: { ...schema(), overrides: [] as unknown as Record<string, never> },
      });
      useSchemaStore.getState().updateBlock('bio', { content: '<p>Edited</p>' });
      expect(JSON.parse(JSON.stringify(useSchemaStore.getState().schema)).overrides).toEqual({
        bio: { content: '<p>Edited</p>' },
      });
    });
  });

  describe('locked_design', () => {
    beforeEach(() => link('linked', 'locked_design'));

    it('allows only the text of unlocked text-like blocks', () => {
      const store = useSchemaStore.getState();
      store.updateBlock('bio', { content: '<p>Mine</p>', style: { color: '#ff0000' } });

      const bio = findBlock(blocks(), 'bio') as TextBlock;
      expect(bio.content).toBe('<p>Mine</p>');
      expect(bio.style.color).toBe('#333333');
      expect(useSchemaStore.getState().schema.overrides).toEqual({
        bio: { content: '<p>Mine</p>' },
      });
    });

    it('refuses style-only edits, structure changes and canvas changes', () => {
      const store = useSchemaStore.getState();
      store.updateBlock('bio', { style: { color: '#ff0000' } });
      store.updateBlock('bio', { visible: false });
      expect(store.addBlock(text('new', '<p>n</p>'))).toBe(false);
      expect(store.insertBlockAfter('bio', text('new', '<p>n</p>'))).toBe(false);
      expect(store.moveBlock('bio', 'name', 'before')).toBe(false);
      expect(store.deleteBlock('bio')).toBe(false);
      expect(store.pasteBlock(text('p', '<p>p</p>'), 'bio')).toBeNull();
      store.duplicateBlock('bio');
      store.updateCanvas({ background_color: '#000000' });

      expect(ids()).toEqual(['logo', 'name', 'bio', 'row']);
      expect((findBlock(blocks(), 'bio') as TextBlock).style.color).toBe('#333333');
      expect(useSchemaStore.getState().schema.canvas.background_color).toBe('#ffffff');
      expect(useHistoryStore.getState().past).toHaveLength(0);
      expect(toasts().some((m) => /template/i.test(m))).toBe(true);
    });

    it('variables stay editable', () => {
      useSchemaStore.getState().setVariable('tagline', 'Hello');
      expect(useSchemaStore.getState().schema.variables.tagline).toBe('Hello');
    });
  });

  describe('fields_only', () => {
    beforeEach(() => link('linked', 'fields_only'));

    it('refuses every block edit but accepts variables', () => {
      const store = useSchemaStore.getState();
      store.updateBlock('bio', { content: '<p>Mine</p>' });
      store.setVariable('phone', '+1 555');

      expect((findBlock(blocks(), 'bio') as TextBlock).content).toBe('<p>Bio</p>');
      expect(useSchemaStore.getState().schema.variables.phone).toBe('+1 555');
      expect(useSchemaStore.getState().schema.overrides).toEqual({});
    });
  });

  describe('when the policy does not apply', () => {
    it('template managers bypass every lock (and still record overrides)', () => {
      link('linked', 'locked_design', true);
      const store = useSchemaStore.getState();
      store.updateBlock('logo', { alt: 'New alt' });
      store.updateBlock('bio', { content: '<p>Admin text</p>' });
      expect(store.deleteBlock('name')).toBe(true);

      expect((findBlock(blocks(), 'logo') as ImageBlock).alt).toBe('New alt');
      expect(useSchemaStore.getState().schema.overrides).toEqual({
        bio: { content: '<p>Admin text</p>' },
      });
      expect(toasts()).toEqual([]);
    });

    it('a detached signature of a free template is unrestricted and records no overrides', () => {
      link('detached', 'free');
      const store = useSchemaStore.getState();
      store.updateBlock('logo', { alt: 'Mine' });
      store.updateBlock('bio', { content: '<p>Mine</p>' });

      expect((findBlock(blocks(), 'logo') as ImageBlock).alt).toBe('Mine');
      expect(useSchemaStore.getState().schema.overrides).toEqual({});
    });

    it('a detached copy of a locked_design template keeps the restrictions', () => {
      link('detached', 'locked_design');
      expect(useSchemaStore.getState().addBlock(text('new', '<p>n</p>'))).toBe(false);
    });
  });
});
