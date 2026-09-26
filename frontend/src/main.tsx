import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './i18n/i18n';
import './index.css';
import { AppErrorBoundary } from './shared/errors/AppErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
