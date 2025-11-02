import React from "react";

type FallbackProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  FallbackComponent: React.ComponentType<FallbackProps>;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: ReadonlyArray<unknown> | null;
};

type ErrorBoundaryState = {
  error: Error | null;
};

const hasArrayChanged = (a: ReadonlyArray<unknown> | null | undefined, b: ReadonlyArray<unknown> | null | undefined) => {
  if (a === b) return false;
  if (!a || !b) return true;
  if (a.length !== b.length) return true;
  return a.some((item, index) => !Object.is(item, b[index]));
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && hasArrayChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, FallbackComponent } = this.props;

    if (error) {
      return <FallbackComponent error={error} resetErrorBoundary={this.resetErrorBoundary} />;
    }

    return children;
  }
}

