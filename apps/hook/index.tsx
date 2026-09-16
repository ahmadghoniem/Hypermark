import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@hypermark/editor';
import '@hypermark/editor/styles';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Dev-only design panel. Loaded dynamically so `dialkit` and `motion` are
// tree-shaken out of the production bundle instead of shipping dead.
if (import.meta.env.DEV) {
  void Promise.all([import('dialkit'), import('dialkit/styles.css')]).then(([{ DialRoot }]) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(<DialRoot position="bottom-left" />);
  });
}
