import React from 'react';
import './ErrorBoundary.css';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Reliability QA] Error capturado por ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>⚠️ Interrupción en el Sistema Táctico</h2>
          <p>Se ha producido un error inesperado en la interfaz.</p>
          <button onClick={() => window.location.reload()}>
            RECARGAR SISTEMA
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
