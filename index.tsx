import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);

// Handle module namespace object if default export is wrapped
// This fixes "object with keys {default}" error when the environment imports the module namespace
const Component = (App as any).default ? (App as any).default : App;

root.render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>
);