import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

type ErrorState = { hasError: boolean };

class HesabuErrorBoundary extends React.Component<React.PropsWithChildren, ErrorState> {
  state: ErrorState = { hasError: false };

  static getDerivedStateFromError(): ErrorState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Hesabu could not render the current screen.', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" style={{
          boxSizing: 'border-box', minHeight: '100svh', display: 'grid', placeContent: 'center',
          gap: 14, padding: 24, background: '#F6F4EF', color: '#252B35',
          fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif', textAlign: 'center',
        }}>
          <strong style={{ fontSize: 23 }}>Hesabu could not open this screen.</strong>
          <p style={{ maxWidth: 360, margin: 0, color: '#6E7785', fontSize: 14, lineHeight: 1.6 }}>
            Your saved shop records have not been deliberately cleared. Reload the app to try again.
          </p>
          <button onClick={() => window.location.reload()} style={{
            justifySelf: 'center', minHeight: 44, padding: '0 18px', border: 0,
            borderRadius: 8, background: '#285BC5', color: '#fff', fontWeight: 700,
          }}>Reload Hesabu</button>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Hesabu root element is missing.');

createRoot(rootElement).render(
  <React.StrictMode>
    <HesabuErrorBoundary>
      <App />
    </HesabuErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
    console.warn('Hesabu could not register its offline cache. The online app can still be used.', error);
  }));
}
