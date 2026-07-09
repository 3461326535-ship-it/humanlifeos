import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#1a1a2e',
          color: '#eee',
          fontFamily: 'monospace',
          padding: '20px',
          overflow: 'auto',
          zIndex: 99999,
        }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: '12px' }}>应用加载失败</h2>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#16213e',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '12px',
          }}>
            {this.state.error?.message}
          </pre>
          <details>
            <summary style={{ cursor: 'pointer', color: '#5ac8fa' }}>详细堆栈</summary>
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: '#16213e',
              padding: '12px',
              borderRadius: '8px',
              marginTop: '8px',
              fontSize: '12px',
            }}>
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
