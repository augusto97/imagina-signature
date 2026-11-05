import type { FC } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useSchemaStore, findBlockByIdDeep } from '@/stores/schemaStore';
import { getBlockDefinition } from '@/core/blocks/registry';
import { __ } from '@/i18n/helpers';
import { useKeyboardShortcuts } from './shortcuts/useKeyboardShortcuts';
import { BlockRenderer } from './canvas/BlockRenderer';
import { Topbar } from './topbar/Topbar';
import { LeftSidebar } from './sidebar-left/LeftSidebar';
import { RightSidebar } from './sidebar-right/RightSidebar';
import { Canvas } from './canvas/Canvas';
import { TemplatePicker } from './modals/TemplatePicker';
import { ExportModal } from './modals/ExportModal';
import { PreviewModal } from './modals/PreviewModal';
import { SaveAsTemplateModal } from './modals/SaveAsTemplateModal';
import { useEditorStore } from '@/stores/editorStore';

/**
 * Top-level editor layout — owns the DndContext that the library
 * cards (in LeftSidebar) and the canvas (sortable list) share.
 *
 * Keyboard shortcuts are also installed here so they're listening
 * for the lifetime of the app.
 */
export const EditorShell: FC = () => {
  const dnd = useDragAndDrop();
  // Walks into container cells so dragging a nested block also gets
  // a preview. Returns the (immer-shared) block, so this only
  // re-renders the shell when the dragged block itself changes.
  const previewBlock = useSchemaStore((s) =>
    dnd.draggingId !== null ? findBlockByIdDeep(s.schema.blocks, dnd.draggingId) ?? null : null,
  );
  const libraryDefinition = dnd.draggingLibraryType
    ? getBlockDefinition(dnd.draggingLibraryType)
    : undefined;
  const LibraryIcon = libraryDefinition?.icon;

  useKeyboardShortcuts();

  return (
    <div className="flex h-full w-full flex-col">
      <Topbar />
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragMove={dnd.handleDragMove}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <div className="flex flex-1 overflow-hidden">
          <LeftSidebar />
          <Canvas />
          <RightSidebar />
        </div>
        {/* No drop animation: the store re-renders the block at its new
            position immediately, and the default animation would fly
            the overlay back to the OLD position first. */}
        <DragOverlay dropAnimation={null}>
          {previewBlock ? (
            <div className="pointer-events-none max-w-[600px] rounded-md border border-[var(--border-selected)] bg-[var(--bg-panel)] p-2 opacity-80 shadow-lg">
              <BlockRenderer block={previewBlock} isPreview />
            </div>
          ) : dnd.draggingLibraryType ? (
            <div className="pointer-events-none inline-flex items-center gap-2 rounded-md border border-[var(--border-selected)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg">
              {LibraryIcon && <LibraryIcon size={14} className="text-[var(--accent)]" />}
              <span>
                {libraryDefinition ? __(libraryDefinition.label) : __('Block')}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <TemplatePicker />
      <ExportModal />
      <PreviewModal />
      <SaveAsTemplateModalHost />
    </div>
  );
};

const SaveAsTemplateModalHost: FC = () => {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  return (
    <SaveAsTemplateModal open={modal === 'save-as-template'} onClose={closeModal} />
  );
};
