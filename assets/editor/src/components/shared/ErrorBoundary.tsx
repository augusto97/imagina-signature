import { Component, type ReactNode } from 'react';
import { __ } from '@/i18n/helpers';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level error boundary so a render error in any block doesn't
 * blow up the whole editor. Sprint 11 adds the boundary; future
 * iterations can hook into a logging endpoint.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Imagina editor error:', error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <h2 className="mb-1 font-semibold">{__('Something went wrong')}</h2>
          <p className="mb-2">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
            onClick={this.reset}
          >
            {__('Try again')}
          </button>
        </div>
      </div>
    );
  }
}
