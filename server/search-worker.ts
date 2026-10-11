import { parentPort, workerData } from 'node:worker_threads';
import { search } from '../src/core/engine.ts';
try {
  parentPort!.postMessage({ ok: true, result: search(workerData.model, workerData.bounds) });
} catch (error) {
  parentPort!.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : '验证失败',
  });
}
