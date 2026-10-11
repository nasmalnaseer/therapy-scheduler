import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Makes the app installable on a phone ("Add to Home screen"). Production builds only.
if (process.env.NODE_ENV === 'production') {
  registerServiceWorker();
}
