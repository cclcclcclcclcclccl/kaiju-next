import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const windows = process.platform === 'win32',
  python = windows ? 'py' : 'python3',
  args = windows ? ['-3'] : [];
function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const local = windows ? 'data/ocr-venv/Scripts/python.exe' : 'data/ocr-venv/bin/python';
if (!existsSync(local)) run(python, [...args, '-m', 'venv', 'data/ocr-venv']);
run(local, ['-m', 'pip', 'install', 'rapidocr==3.10.0', 'onnxruntime==1.31.0', 'Pillow==12.3.0']);
console.log('本地 OCR 已安装。图片仅在本机内存识别，重启开局服务后即可使用。');
