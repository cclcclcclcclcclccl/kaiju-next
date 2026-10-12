import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const target = 'tests/player/fixtures/synthetic-replay.webm';
await mkdir('tests/player/fixtures', { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || 'data/test-tools/ffmpeg-1013/ffmpeg-win64.exe';
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
try {
  const page = await browser.newPage();
  const encoder = spawn(
    ffmpeg,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      '10',
      '-c:v',
      'mjpeg',
      '-i',
      'pipe:0',
      '-c:v',
      'libvpx-vp9',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'webm',
      target,
    ],
    { windowsHide: true },
  );
  encoder.stderr.on('data', (c) => process.stderr.write(c));
  const completed = once(encoder, 'close');
  for (let i = 0; i < 30; i++) {
    const png = await page.evaluate((i) => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const x = c.getContext('2d');
      x.fillStyle = '#162633';
      x.fillRect(0, 0, 640, 360);
      x.fillStyle = '#e5c98c';
      x.font = '24px sans-serif';
      x.fillText('SYNTHETIC PIPELINE TEST', 40, 70);
      x.fillStyle = 'white';
      x.font = '18px sans-serif';
      x.fillText('Not gameplay. Tests playback and capture only.', 40, 115);
      x.fillText('Frame ' + i, 40, 155);
      x.fillStyle = '#70d0b0';
      x.fillRect(40 + i * 14, 220, 40, 40);
      return c.toDataURL('image/jpeg', 0.8).split(',')[1];
    }, i);
    if (!encoder.stdin.write(Buffer.from(png, 'base64'))) await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end();
  const [code] = await completed;
  if (code !== 0) throw new Error('Video encoder failed: ' + code);
  console.log('Generated locally: ' + target);
} finally {
  await browser.close();
}
