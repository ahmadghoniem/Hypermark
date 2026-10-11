import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/review/App';
import { ReviewWorkerPoolProvider } from '@/review/workerPool';
import '@/review/index.css';

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
