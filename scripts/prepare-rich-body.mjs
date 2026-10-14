import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photo = path.join(root, 'public/demo/rich-isolated.png');
const destination = path.join(root, 'work/raw/rich-body.raw.glb');
const taskFile = path.join(root, '.meshy-rich-isolated-task.json');
const key = process.env.MESHY_API_KEY?.trim();

if (process.argv.includes('--help')) {
  console.log('Run with: node --env-file=.env.local scripts/prepare-rich-body.mjs');
  console.log('Creates one Meshy Lite Image to 3D task from public/demo/rich-isolated.png and saves a raw GLB for offline compression. Meshy charges API credits.');
  process.exit(0);
}
if (!key) throw new Error('Add MESHY_API_KEY to .env.local first.');

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meshy request failed (${response.status}): ${String(result.message ?? 'unknown error').slice(0, 200)}`);
  return result;
}

let taskId;
try { taskId = JSON.parse(await readFile(taskFile, 'utf8')).taskId; } catch { /* No previous task. */ }
if (!taskId) {
  const bytes = await readFile(photo);
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('The Rich photo exceeds Meshy’s 20 MB image limit.');
  const created = await request('https://api.meshy.ai/openapi/v1/image-to-3d', {
    method: 'POST',
    body: JSON.stringify({ image_url: `data:image/png;base64,${bytes.toString('base64')}`, ai_model: 'meshy-6-lite', geometry_resolution: 'standard', should_texture: true, texture_resolution: '2k', should_remesh: true, topology: 'triangle', target_polycount: 30000, target_formats: ['glb'], auto_size: true }),
  });
  taskId = created.result;
  if (typeof taskId !== 'string' || taskId.length < 8) throw new Error('Meshy did not return a task ID.');
  await writeFile(taskFile, JSON.stringify({ taskId, createdAt: new Date().toISOString() }, null, 2));
  console.log(`Rich body task started: ${taskId}`);
} else console.log(`Resuming Rich body task: ${taskId}`);

let modelUrl;
for (let attempt = 0; attempt < 120; attempt++) {
  const task = await request(`https://api.meshy.ai/openapi/v1/image-to-3d/${encodeURIComponent(taskId)}`);
  if (task.status === 'SUCCEEDED') { modelUrl = task.model_urls?.glb; break; }
  if (task.status === 'FAILED' || task.status === 'CANCELED') throw new Error(`Meshy task ${task.status}: ${String(task.task_error?.message ?? 'no details')}`);
  console.log(`Rich body: ${task.status} ${Number(task.progress) || 0}%`);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
if (typeof modelUrl !== 'string' || !modelUrl.startsWith('https://assets.meshy.ai/')) throw new Error('Meshy task did not produce a valid GLB URL. Resume later with the same command.');
const modelResponse = await fetch(modelUrl, { signal: AbortSignal.timeout(60000) });
if (!modelResponse.ok) throw new Error(`Could not download the generated GLB (${modelResponse.status}).`);
const data = Buffer.from(await modelResponse.arrayBuffer());
if (data.byteLength > 80 * 1024 * 1024 || data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Generated file is not a valid GLB or exceeds 80 MB.');
const temporary = `${destination}.tmp`;
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(temporary, data);
await rename(temporary, destination);
console.log(`Saved ${path.relative(root, destination)} (${(await stat(destination)).size} bytes). Inspect its appearance before using it in the demo.`);
