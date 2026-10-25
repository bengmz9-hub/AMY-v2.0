import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary Component', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when no error occurs', () => {
    const ChildComponent = () => <div>Normal Child</div>;

    render(
      <ErrorBoundary>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Child')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws an error', () => {
    const ThrowErrorComponent = () => {
      throw new Error('Test Error');
    };

    render(
      <ErrorBoundary>
        <ThrowErrorComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('⚠️ Interrupción en el Sistema Táctico')).toBeInTheDocument();
    expect(screen.getByText('Se ha producido un error inesperado en la interfaz.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /RECARGAR SISTEMA/i })).toBeInTheDocument();

    // Verify console.error was called by componentDidCatch
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('reloads the page when the reload button is clicked', () => {
    const ThrowErrorComponent = () => {
      throw new Error('Test Error');
    };

    const originalLocation = window.location;
    delete window.location;
    window.location = { reload: vi.fn() };

    render(
      <ErrorBoundary>
        <ThrowErrorComponent />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole('button', { name: /RECARGAR SISTEMA/i });
    fireEvent.click(reloadButton);

    expect(window.location.reload).toHaveBeenCalled();

    window.location = originalLocation;
  });
});
