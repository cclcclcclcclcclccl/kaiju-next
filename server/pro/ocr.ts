import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
export const screenshotRequest = z
  .object({
    image: z
      .string()
      .max(11_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  })
  .strict();
const line = z.object({
  text: z.string().max(1500),
  confidence: z.number().min(0).max(1),
  box: z.array(z.array(z.number()).length(2)).length(4),
});
const resultSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  lines: z.array(line).max(1500),
});
export type OcrResult = z.infer<typeof resultSchema> & { sha256: string; engine: string };
let busy = false;
export function ocrPython() {
  return (
    process.env.OCR_PYTHON ??
    resolve(
      process.platform === 'win32'
        ? 'data/ocr-venv/Scripts/python.exe'
        : 'data/ocr-venv/bin/python',
    )
  );
}
export function ocrReady() {
  return existsSync(ocrPython());
}
export async function recognizeScreenshot(image: string): Promise<OcrResult> {
  if (!ocrReady()) throw new Error('本地识别引擎未安装，请运行 npm run ocr:setup');
  if (busy) throw new Error('正在识别另一张截图，请稍后再试');
  screenshotRequest.parse({ image });
  const bytes = Buffer.from(image.split(',')[1], 'base64');
  if (bytes.length > 8 * 1024 * 1024) throw new Error('截图超过 8 MB，请缩小后再识别');
  busy = true;
  try {
    return await new Promise<OcrResult>((accept, reject) => {
      const child = spawn(ocrPython(), [resolve('scripts/player/ocr.py')], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '2' },
      });
      const output: Buffer[] = [];
      let size = 0,
        settled = false;
      const finish = (error?: Error, value?: OcrResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : accept(value!);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('截图识别超时，请裁剪到战绩或战力区域重试'));
      }, 45000);
      child.stdout.on('data', (chunk) => {
        size += chunk.length;
        if (size > 2_000_000) {
          child.kill();
          finish(new Error('识别内容过多，请缩小截图范围'));
        } else output.push(chunk);
      });
      child.stderr.on('data', () => {}); // Engine diagnostics are not user screenshot text and are not persisted.
      child.stdin.on('error', () => {});
      child.on('error', () =>
        finish(new Error('无法启动本地识别，请检查 OCR_PYTHON 或重新安装识别引擎')),
      );
      child.on('close', (code) => {
        if (code !== 0) return finish(new Error('图片未能识别，请使用清晰的 PNG/JPG 截图并重试'));
        try {
          finish(undefined, {
            ...resultSchema.parse(JSON.parse(Buffer.concat(output).toString('utf8'))),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            engine: 'RapidOCR 3.10 / local CPU',
          });
        } catch {
          finish(new Error('识别结果格式异常，未修改档案'));
        }
      });
      child.stdin.end(JSON.stringify({ image: bytes.toString('base64') }));
    });
  } finally {
    busy = false;
  }
}
