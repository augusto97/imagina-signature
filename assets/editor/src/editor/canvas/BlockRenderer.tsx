import { Component, useMemo, type FC, type ReactNode } from 'react';
import type { Block } from '@/core/schema/blocks';
import { rendererForBlock } from '@/core/blocks/registry';
import { useCanvasVariables } from '@/hooks/useCanvasVariables';
import { useCanvasDataStore } from '@/stores/canvasDataStore';
import { BoxFrame } from './BoxFrame';
import { resolveBlockVariables } from './liveData';

interface Props {
  block: Block;
  isPreview?: boolean;
}

type RendererComponent = FC<{ block: Block; isPreview?: boolean }>;

/**
 * Resolves a block to its registered renderer and renders it inside
 * the block's generic box ({@link BoxFrame}) — the canvas side of
 * `compileBlock()`, so every block (top-level, nested, drag preview)
 * gets its `box` styling without its definition knowing about it.
 *
 * In "Show data" mode (topbar toggle, `canvasDataStore`) the renderer
 * receives a resolved deep copy of the block ({@link resolveBlockVariables}),
 * memoised per block + variables; the store keeps the raw tokens.
 * Container children are left to their own `BlockRenderer` so each
 * block is resolved exactly once. Should a renderer choke on resolved
 * data (e.g. a URL token that resolved to ''), it falls back to the raw
 * block instead of taking the canvas down.
 *
 * Unknown block types fall back to a visible diagnostic so we don't
 * silently lose data when a saved schema references a block type the
 * current bundle doesn't ship.
 */
export const BlockRenderer: FC<Props> = ({ block, isPreview }) => {
  const definition = rendererForBlock(block);
  const showData = useCanvasDataStore((s) => s.showData);
  const variables = useCanvasVariables();
  const resolved = useMemo(
    () => (showData ? resolveBlockVariables(block, variables, { children: 'keep' }) : block),
    [showData, block, variables],
  );

  if (!definition) {
    return (
      <div
        style={{
          padding: 8,
          border: '1px dashed #c00',
          color: '#c00',
          fontSize: 12,
        }}
      >
        Unknown block type: {block.type}
      </div>
    );
  }

  const Renderer = definition.Renderer as RendererComponent;

  if (resolved === block) {
    return (
      <BoxFrame box={block.box}>
        <Renderer block={block} isPreview={isPreview} />
      </BoxFrame>
    );
  }

  return (
    <BoxFrame box={resolved.box}>
      <RawFallbackBoundary
        resetKey={resolved}
        fallback={<Renderer block={block} isPreview={isPreview} />}
      >
        <Renderer block={resolved} isPreview={isPreview} />
      </RawFallbackBoundary>
    </BoxFrame>
  );
};

interface BoundaryProps {
  /** Rendered instead of `children` after they threw. */
  fallback: ReactNode;
  /** A new value clears the error (the block or the variables changed). */
  resetKey: unknown;
  children: ReactNode;
}

interface BoundaryState {
  failedKey: unknown;
  failed: boolean;
}

/**
 * Renders `fallback` when `children` throw, until `resetKey` changes.
 * (Error boundaries must be class components.)
 */
class RawFallbackBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failedKey: null, failed: false };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    if (state.failed && state.failedKey !== null && state.failedKey !== props.resetKey) {
      return { failed: false, failedKey: null };
    }
    return null;
  }

  override componentDidCatch(): void {
    this.setState({ failedKey: this.props.resetKey });
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
