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

// Design panel. Loaded dynamically so `dialkit` and `motion` are tree-shaken
// out of an ordinary production bundle instead of shipping dead; a build run
// with HYPERMARK_DIALS=1 keeps it, which is how the `hypermark` CLI's bundle
// gets dials.
if (import.meta.env.DEV || __DIALS__) {
  void import('@hypermark/ui/components/DialsMount').then(({ DialsMount }) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.createRoot(host).render(<DialsMount />);
  });
}
