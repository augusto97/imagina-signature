import type { FC } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useSchemaStore } from '@/stores/schemaStore';
import { useKeyboardShortcuts } from './shortcuts/useKeyboardShortcuts';
import { BlockRenderer } from './canvas/BlockRenderer';
import { Topbar } from './topbar/Topbar';
import { LeftSidebar } from './sidebar-left/LeftSidebar';
import { RightSidebar } from './sidebar-right/RightSidebar';
import { Canvas } from './canvas/Canvas';
import { TemplatePicker } from './modals/TemplatePicker';
import { ExportModal } from './modals/ExportModal';

/**
 * Top-level editor layout — owns the DndContext that the library
 * cards (in LeftSidebar) and the canvas (sortable list) share.
 *
 * Keyboard shortcuts are also installed here so they're listening
 * for the lifetime of the app.
 */
export const EditorShell: FC = () => {
  const dnd = useDragAndDrop();
  const schema = useSchemaStore((s) => s.schema);

  useKeyboardShortcuts();

  const previewBlock =
    dnd.draggingId !== null ? schema.blocks.find((b) => b.id === dnd.draggingId) : null;

  return (
    <div className="flex h-full w-full flex-col">
      <Topbar />
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
      >
        <div className="flex flex-1 overflow-hidden">
          <LeftSidebar />
          <Canvas />
          <RightSidebar />
        </div>
        <DragOverlay>
          {previewBlock ? (
            <div className="rounded-md border border-[var(--border-selected)] bg-[var(--bg-panel)] p-2 opacity-80 shadow-lg">
              <BlockRenderer block={previewBlock} isPreview />
            </div>
          ) : dnd.draggingLibraryType ? (
            <div className="rounded-md border border-[var(--border-selected)] bg-[var(--bg-panel)] px-3 py-2 text-xs shadow-lg">
              {dnd.draggingLibraryType}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <TemplatePicker />
      <ExportModal />
    </div>
  );
};
