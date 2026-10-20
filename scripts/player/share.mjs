// Starts only this project's isolated public service and tunnel.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = path.join(root, 'data/public-site');
const tunnel = path.join(root, 'tools/public-access/cloudflared.exe');
fs.mkdirSync(data, { recursive: true });
const read = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
  } catch {
    return null;
  }
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};
const lock = path.join(data, 'share.lock');
if (fs.existsSync(lock)) {
  if (alive(fs.readFileSync(lock, 'utf8')))
    throw new Error('Another sharing launcher is running. Please wait.');
  fs.unlinkSync(lock);
}
fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
process.on('exit', () => {
  try {
    fs.unlinkSync(lock);
  } catch {}
});

async function status(url) {
  try {
    const response = await fetch(url + '/api/status', { signal: AbortSignal.timeout(4000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
function background(exe, args, label) {
  const out = fs.openSync(path.join(data, label + '-out.log'), 'a');
  const err = fs.openSync(path.join(data, label + '.log'), 'a');
  try {
    const child = spawn(exe, args, {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, err],
    });
    child.on('error', (error) => console.error(error.message));
    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }
}
function processInfo(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const command = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return output.trim() ? JSON.parse(output) : null;
}
function restartServer() {
  const state = read('service.json');
  if (state) {
    if (path.resolve(state.dataDirectory) !== data)
      throw new Error('Public service directory mismatch; refusing to stop a process.');
    const parent = processInfo(state.supervisorPid);
    const child = processInfo(state.serverPid);
    if (
      parent &&
      (parent.ExecutablePath?.toLowerCase() !== process.execPath.toLowerCase() ||
        !parent.CommandLine?.includes('serve-public.mjs'))
    )
      throw new Error('Supervisor identity mismatch.');
    if (
      child &&
      (child.ParentProcessId !== state.supervisorPid ||
        child.ExecutablePath?.toLowerCase() !== process.execPath.toLowerCase() ||
        !child.CommandLine?.includes('server/index.ts'))
    )
      throw new Error('Server identity mismatch.');
    if (parent) process.kill(state.supervisorPid);
    if (child) process.kill(state.serverPid);
  }
  background(process.execPath, [path.join(root, 'scripts/player/serve-public.mjs')], 'service');
}

try {
  if (!fs.existsSync(path.join(root, 'dist/index.html')))
    throw new Error('Run npm run build first.');
  let config = read('config.json');
  if (!config) {
    config = { origin: 'https://pending.invalid' };
    fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify(config));
  }
  const local = await status('http://127.0.0.1:4320');
  if (local && (local.product !== '开局 NEXT' || !local.publicSharing))
    throw new Error('Port 4320 is not the isolated public instance.');
  if (!local || process.argv.includes('--restart-server')) restartServer();

  let tunnelPid = Number(
    fs.existsSync(path.join(data, 'cloudflare.pid'))
      ? fs.readFileSync(path.join(data, 'cloudflare.pid'), 'utf8')
      : 0,
  );
  const running = processInfo(tunnelPid);
  if (
    running &&
    (running.ExecutablePath?.toLowerCase() !== tunnel.toLowerCase() ||
      !running.CommandLine?.includes('http://127.0.0.1:4320'))
  )
    throw new Error('Tunnel identity mismatch; refusing to reuse it.');
  if (!running) {
    const digest = createHash('sha256').update(fs.readFileSync(tunnel)).digest('hex');
    if (digest !== '12c7c887f8aaab779aef1dfa9b60673530a5adb88ecc55dd6df8f56e0b70f199')
      throw new Error('Tunnel executable checksum mismatch.');
    fs.writeFileSync(path.join(data, 'cloudflare.log'), '');
    tunnelPid = background(
      tunnel,
      [
        'tunnel',
        '--url',
        'http://127.0.0.1:4320',
        '--protocol',
        'http2',
        '--edge-ip-version',
        '4',
        '--no-autoupdate',
        '--loglevel',
        'info',
      ],
      'cloudflare',
    );
    fs.writeFileSync(path.join(data, 'cloudflare.pid'), String(tunnelPid));
  }
  console.log('Checking the public tunnel (up to 60 seconds)...');
  let origin;
  for (let attempt = 0; attempt < 30; attempt++) {
    const log = fs.existsSync(path.join(data, 'cloudflare.log'))
      ? fs.readFileSync(path.join(data, 'cloudflare.log'), 'utf8')
      : '';
    origin = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
    if (origin) break;
    if (!alive(tunnelPid)) throw new Error('Tunnel exited. See data/public-site/cloudflare.log.');
    await delay(2000);
  }
  if (!origin) throw new Error('No public URL received. See data/public-site/cloudflare.log.');
  if (origin !== config.origin) {
    config.origin = origin;
    fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify(config, null, 2));
    restartServer();
  }
  let healthy = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const current = await status('http://127.0.0.1:4320');
    if (current?.publicSharing && current.publicUrl === origin) {
      healthy = true;
      break;
    }
    await delay(1000);
  }
  if (!healthy) throw new Error('Public server did not start. See data/public-site/service.log.');
  // Windows curl uses the system network configuration. Certificate validation remains enabled.
  const check = execFileSync(
    'curl.exe',
    [
      '--ssl-revoke-best-effort',
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '25',
      origin + '/api/status',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  const published = JSON.parse(check);
  if (
    !published.publicSharing ||
    published.publicUrl !== origin ||
    published.product !== '开局 NEXT'
  )
    throw new Error('Public HTTPS verification failed.');
  fs.writeFileSync(path.join(data, 'PUBLIC_URL.txt'), origin + '\n');
  console.log(
    '\nPublic site: ' +
      origin +
      '\nKeep this computer online and awake. Closing this launcher is OK.\nAfter a tunnel restart, share the NEW URL in data/public-site/PUBLIC_URL.txt.',
  );
} catch (error) {
  console.error('Sharing startup failed: ' + error.message);
  process.exitCode = 1;
}
