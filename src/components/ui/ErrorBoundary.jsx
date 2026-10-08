import React from 'react';

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
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ff4655', background: '#08070a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontFamily: 'Rajdhani, sans-serif', textTransform: 'uppercase', letterSpacing: '2px' }}>⚠️ Interrupción en el Sistema Táctico</h2>
          <p style={{ color: '#aaa', margin: '1rem 0' }}>Se ha producido un error inesperado en la interfaz.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '0.6rem 1.5rem', background: '#ff4655', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            RECARGAR SISTEMA
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
