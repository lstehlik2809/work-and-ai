import { defineConfig } from 'vite';
export default defineConfig({ base: '/work-and-ai/', worker: { format: 'es' }, build: { target: 'es2022', rolldownOptions:{input:{app:'index.html',diagnostics:'diagnostics.html'}} } });
