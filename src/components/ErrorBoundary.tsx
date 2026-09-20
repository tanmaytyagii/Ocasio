import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Catches render-tree failures so one broken component cannot blank the app.
 *
 * A class component because this is the only thing React gives us:
 * componentDidCatch and getDerivedStateFromError have no hook equivalent, and
 * wrapping JSX in try/catch does not work — render errors surface during
 * React's own reconciliation, not on the line that produced the element.
 *
 * Scope, stated honestly: this catches errors thrown while rendering, in
 * lifecycle methods, and in constructors below it. It does NOT catch rejected
 * promises, errors inside event handlers, or failed network calls. Those are
 * already handled where they happen — every service call funnels through
 * ErrorState with a retry, and main.tsx covers a failed startup. This is the
 * last net under the render tree, not a global handler.
 *
 * What the user sees never includes the error text. A stack trace is a
 * debugging artefact that can carry query fragments, ids and internal paths,
 * and it means nothing to the person it interrupted. It goes to the console in
 * development, where a developer is actually looking.
 */
interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — used to clear the error on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      // Grouped so the component stack is readable next to the error itself.
      console.group('[ocasio] render error caught by boundary');
      console.error(error);
      console.error(info.componentStack);
      console.groupEnd();
    } else {
      // Production: one line, no stack in the DOM. When error tracking is
      // configured this is the single call site that needs to change.
      console.error('[ocasio] render error:', error.message);
    }
  }

  componentDidUpdate(prev: Props) {
    // A route change should not leave the user stranded on the fallback.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-5 py-16">
        <div
          role="alert"
          className="w-full max-w-lg rounded-card border border-line bg-surface p-7 shadow-card sm:p-9"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ocasio</p>

          <h1 className="mt-3 text-2xl font-semibold leading-snug text-ink">
            This page didn&rsquo;t load properly
          </h1>

          <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
            Something went wrong while displaying this page. Nothing you were doing has been lost,
            and the rest of Ocasio still works.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex h-11 items-center justify-center rounded-control bg-brand-600 px-5 text-sm font-medium text-white transition-colors duration-200 hover:bg-brand-700"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 text-sm font-medium text-ink-soft transition-colors duration-200 hover:bg-canvas"
            >
              Go to the homepage
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
