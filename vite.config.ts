import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/d3')) return 'vendor-d3';
          if (id.includes('node_modules/marked')) return 'vendor-marked';
          if (id.includes('node_modules/@uiw/react-codemirror')) return 'vendor-cm-react';
          if (id.includes('node_modules/@codemirror/view')) return 'vendor-cm-view';
          if (id.includes('node_modules/@codemirror/state')) return 'vendor-cm-state';
          if (id.includes('node_modules/@codemirror/autocomplete')) return 'vendor-cm-language';
          if (id.includes('node_modules/@codemirror/commands')) return 'vendor-cm-commands';
          if (id.includes('node_modules/@codemirror/search')) return 'vendor-cm-tools';
          if (id.includes('node_modules/@codemirror/lint')) return 'vendor-cm-tools';
          if (id.includes('node_modules/@codemirror/lang-markdown')) return 'vendor-cm-language';
          if (id.includes('node_modules/@codemirror/language')) return 'vendor-cm-language';
          if (id.includes('node_modules/@lezer')) return 'vendor-cm-language';
          if (id.includes('node_modules/crelt')) return 'vendor-cm-dom';
          if (id.includes('node_modules/style-mod')) return 'vendor-cm-dom';
          if (id.includes('node_modules/w3c-keyname')) return 'vendor-cm-dom';
        },
      },
    },
  },
});
