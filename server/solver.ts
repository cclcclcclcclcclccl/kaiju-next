import { Worker } from 'node:worker_threads';
import type { Economy, Bounds, SearchResult } from '../src/core/model.ts';
export function solve(model: Economy, bounds: Bounds): Promise<SearchResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./search-worker.ts', import.meta.url), {
      workerData: { model, bounds },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    let settled = false;
    const finish = (error?: Error, result?: SearchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(
      () => finish(new Error('验证进程超时，请缩小搜索范围后重试')),
      bounds.maxMillis + 5000,
    );
    worker.once('message', (message) =>
      message.ok ? finish(undefined, message.result) : finish(new Error('验证进程未能完成')),
    );
    worker.once('error', () => finish(new Error('验证进程启动失败')));
    worker.once('exit', (code) => {
      if (!settled) finish(new Error('验证进程提前退出：' + code));
    });
  });
}
