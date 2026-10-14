/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { handleApi } from './server/http.js';

type Next = () => void;

async function serveApi(req: IncomingMessage, res: ServerResponse, next: Next) {
  if (!req.url?.startsWith('/api/')) return next();
  try {
    const response = await handleApi(new Request(`http://localhost${req.url}`, { method: req.method ?? 'GET' }));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Product service unavailable.' }));
  }
}

/** Serves the product API from the same origin in `vite` and `vite preview`. */
function productApi(): Plugin {
  return {
    name: 'product-api',
    configureServer(server) { server.middlewares.use(serveApi); },
    configurePreviewServer(server) { server.middlewares.use(serveApi); },
  };
}

// v0 and Vercel Sandbox terminate TLS at their proxy, so the server running
// inside the sandbox must speak plain HTTP. Camera access needs a secure
// context: http://localhost qualifies; for a phone on the LAN run
// IWSDK_DEV_HTTPS=1 to get IWSDK's cached self-signed certificate.
const devHttps = process.env.IWSDK_DEV_HTTPS === '1';

// The managed Playwright workspace is an authoring tool, not something the
// preview server should launch on boot. `iwsdk dev up` sets this explicitly.
process.env.IWSDK_DEV_OPEN ??= 'false';

const port = Number.parseInt(process.env.PORT ?? '', 10) || 5173;

export default defineConfig({
  plugins: [productApi(), iwsdkDev({ https: devHttps })],
  server: {
    host: '0.0.0.0',
    port,
    open: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port,
    allowedHosts: true,
  },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  // Absolute, not './': the SPA rewrite in vercel.json serves index.html for
  // deep paths, where a relative base resolves assets against the wrong directory.
  base: process.env.VITE_BASE_PATH || '/',
});
