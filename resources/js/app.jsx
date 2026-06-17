import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppRoot.jsx';
import './bootstrap.js';

createRoot(document.getElementById('app')).render(<App />);
