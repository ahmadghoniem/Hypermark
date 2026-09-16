import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@hypermark/review-editor';
import { ReviewWorkerPoolProvider } from '@hypermark/review-editor/worker-pool';
import '@hypermark/review-editor/styles';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* Worker-pool syntax highlighting — tokenization off the main thread
        (diffshub parity). Pierre's CodeView/FileDiff pick the pool up from
        context automatically. */}
    <ReviewWorkerPoolProvider>
      <App />
    </ReviewWorkerPoolProvider>
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
