import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { StandaloneExamApp } from './app/StandaloneExamApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StandaloneExamApp />
  </StrictMode>
);
