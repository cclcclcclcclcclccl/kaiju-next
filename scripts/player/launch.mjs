import { spawn, execFile } from 'node:child_process';
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(join(root, '.env'))) loadEnvFile(join(root, '.env'));
const data = resolve(root, process.env.PLAYER_DATA_DIR || 'data');
const port = Number(process.env.PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local port');
const url = `http://127.0.0.1:${port}`;
mkdirSync(data, { recursive: true });
const stateFile = join(data, 'launcher.json');
const logFile = join(data, 'launcher.log');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function status() {
  try {
    const response = await fetch(url + '/api/status', { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return 'occupied';
    const result = await response.json();
    return result.product === '开局 NEXT' ? result : 'occupied';
  } catch {
    return undefined;
  }
}
function openBrowser() {
  if (process.env.KAIJU_NO_BROWSER === '1') return;
  const command =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  execFile(command, [url], { windowsHide: true }, () => {});
}
function log(message) {
  console.log(new Date().toISOString() + ' ' + message);
}
function run(args) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? accept() : reject(Error('Preparation failed: ' + args.join(' '))),
    );
  });
}
function fingerprint() {
  const hash = createHash('sha256');
  function visit(path) {
    if (statSync(path).isDirectory())
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    else hash.update(path.slice(root.length)).update(readFileSync(path));
  }
  for (const name of [
    'src',
    'server',
    'public',
    'examples',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
  ])
    visit(join(root, name));
  return hash.digest('hex');
}
async function supervise() {
  const lock = join(data, 'launcher.lock');
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch {
    const pid = Number(readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw Error('Invalid launcher lock; inspect ' + lock);
    try {
      process.kill(pid, 0);
      log('Another launcher is already running.');
      return;
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    rmSync(lock);
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  }
  let child;
  let stopping = false;
  let restarts = 0;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      stopping = true;
      child?.kill();
    });
  try {
    while (!stopping) {
      const existing = await status();
      if (existing) {
        log('Port is already in use; no duplicate server started.');
        break;
      }
      const began = Date.now();
      child = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.ts'], {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, PORT: String(port), PLAYER_DATA_DIR: data },
      });
      writeFileSync(
        stateFile,
        JSON.stringify(
          {
            supervisorPid: process.pid,
            serverPid: child.pid,
            url,
            startedAt: new Date().toISOString(),
            restarts,
            logFile,
          },
          null,
          2,
        ),
      );
      const code = await new Promise((accept, reject) => {
        child.on('error', reject);
        child.on('exit', accept);
      });
      if (stopping || code === 0) break;
      if (Date.now() - began > 600000) restarts = 0;
      if (++restarts > 3) {
        log('Stopped after 3 recovery attempts. Read the error above.');
        break;
      }
      log('Server exited with code ' + code + '; recovery ' + restarts + '/3');
      await wait(restarts * 1000);
    }
  } finally {
    rmSync(lock, { force: true });
  }
}
async function launch() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 16) throw Error('Install Node.js 24.16 or a newer Node 24 release.');
  const existing = await status();
  if (existing === 'occupied') throw Error('Port ' + port + ' is occupied by another service.');
  if (existing) {
    log('Already running: ' + url + ' (v' + existing.version + ')');
    openBrowser();
    return;
  }
  const lockHash = createHash('sha256')
    .update(readFileSync(join(root, 'package-lock.json')))
    .digest('hex');
  const dependencyStamp = join(root, 'node_modules', '.kaiju-lock');
  if (!existsSync(dependencyStamp) || readFileSync(dependencyStamp, 'utf8') !== lockHash) {
    const npm =
      process.platform === 'win32'
        ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
        : process.env.npm_execpath;
    if (!npm) throw Error('Run npm run open on this platform.');
    await run([npm, 'ci', '--no-audit', '--no-fund']);
    writeFileSync(dependencyStamp, lockHash);
  }
  const current = fingerprint(),
    buildStamp = join(root, 'dist', '.kaiju-build');
  if (!existsSync(buildStamp) || readFileSync(buildStamp, 'utf8') !== current) {
    await run(['node_modules/typescript/bin/tsc', '--noEmit']);
    await run(['node_modules/vite/bin/vite.js', 'build']);
    writeFileSync(buildStamp, current);
  }
  const fd = openSync(logFile, 'a');
  const supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), '--supervise'], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fd, fd],
    env: process.env,
  });
  supervisor.on('error', (error) => log(error.message));
  supervisor.unref();
  closeSync(fd);
  for (let i = 0; i < 40; i++) {
    await wait(250);
    const ready = await status();
    if (ready && ready !== 'occupied') {
      log('Ready: ' + url + '; closing this window will not stop the server.');
      openBrowser();
      return;
    }
  }
  throw Error('Server did not become ready. See ' + logFile);
}
try {
  await (process.argv.includes('--supervise') ? supervise() : launch());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
