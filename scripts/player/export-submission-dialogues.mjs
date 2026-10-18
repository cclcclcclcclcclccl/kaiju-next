import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
// Explicit input avoids scanning unrelated chats or exporting account data.
const file = process.argv[2];
if (!file) throw Error('Pass the original project conversation JSONL path.');
const bytes = readFileSync(file),
  lines = bytes.toString('utf8').split('\n');
const folder = resolve('submission/prompt-chains');
mkdirSync(folder, { recursive: true });
const definitions = [
  [
    '01-persistence',
    '保存功能似乎没有做好',
    '这轮已经完成修复，并更新到你正在打开的网站，当前是 v0.14',
    '英雄池保存与身份隔离',
  ],
  [
    '02-ranking',
    '为什么英雄图鉴这里',
    '你截图里的图鉴空数据和默认梯度问题，已经实际修复',
    '梯度异常与数据入口纠正',
  ],
  ['03-skins', '皮肤使用率去哪里了', '已经修好，并更新到正在运行的网站', '皮肤使用率与装备图标'],
];
const manifest = {
  sourceSession: '01a12a03-87fd-71e1-9c2c-0907b4631346',
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  exportedAt: new Date().toISOString(),
  scope:
    'Original user/assistant visible text only. Tool output, internal compaction summaries and environment blocks excluded; exclusions recorded. No rewritten dialogue.',
  chains: [],
};
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const [id, start, end, title] of definitions) {
  let active = false,
    done = false;
  const messages = [],
    excluded = [];
  for (let i = 0; i < lines.length; i++) {
    let event;
    try {
      event = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const p = event.payload;
    if (
      event.type !== 'response_item' ||
      p?.type !== 'message' ||
      !['user', 'assistant'].includes(p.role)
    )
      continue;
    let text = p.content.map((c) => c.text ?? '').join('\n');
    if (!active && p.role === 'user' && text.includes(start)) active = true;
    if (!active) continue;
    if (
      /^## (Active request|Current task)/.test(text) ||
      (p.role === 'assistant' && p.channel === 'analysis')
    ) {
      excluded.push({ line: i + 1, reason: 'internal summary or reasoning' });
      continue;
    }
    if (p.role === 'assistant' && !p.content.some((c) => c.type === 'output_text')) continue;
    text = text
      .replace(/<in-app-browser-context[\s\S]*?<\/in-app-browser-context>/g, '[环境状态块已省略]')
      .replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, '[记忆引用元数据已省略]')
      .replace(/C:[\\/]+Users[\\/]+34711[^\s"<>]+/g, '[本机附件或文件路径]');
    if (!text.trim()) continue;
    messages.push({ role: p.role, timestamp: event.timestamp, sourceLine: i + 1, text });
    if (p.role === 'assistant' && text.includes(end)) {
      done = true;
      break;
    }
  }
  if (!done || messages.length < 2) throw Error('Incomplete chain ' + id);
  const doc = { id, title, completeThroughFinalReply: true, messages, excluded };
  writeFileSync(resolve(folder, id + '.json'), JSON.stringify(doc, null, 2));
  writeFileSync(
    resolve(folder, id + '.md'),
    `# ${title}\n\n原始会话转录，未重写对话。工具执行细节请对照仓库测试与迭代证据；本导出不包含工具输出、系统指令或内部压缩摘要。本机文件路径已隐去。\n\n` +
      messages
        .map(
          (m) =>
            `## ${m.role === 'user' ? '参赛者' : 'AI'} · ${m.timestamp} · 原记录第 ${m.sourceLine} 行\n\n${m.text}\n`,
        )
        .join('\n'),
  );
  writeFileSync(
    resolve(folder, id + '.html'),
    `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Microsoft YaHei',sans-serif;max-width:1300px;margin:36px auto;background:#0d1522;color:#e5edf6;font-size:22px;line-height:1.65}article{border:1px solid #34455d;border-radius:16px;padding:24px;margin:24px 0}small{color:#c7a566}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}h1{font-size:36px}</style><h1>${title}</h1><p>真实历史对话回看 · 非本次实时生成演示 · 工具输出与内部摘要未包含</p>` +
      messages
        .map(
          (m) =>
            `<article><small>${m.role === 'user' ? '参赛者原始请求' : 'AI原始回复'} · ${m.timestamp}</small><pre>${escape(m.text)}</pre></article>`,
        )
        .join(''),
  );
  manifest.chains.push({
    id,
    title,
    messages: messages.length,
    fromLine: messages[0].sourceLine,
    toLine: messages.at(-1).sourceLine,
    excluded,
    sha256: createHash('sha256')
      .update(readFileSync(resolve(folder, id + '.json')))
      .digest('hex'),
  });
}
writeFileSync(resolve(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  manifest.chains.map(({ id, messages, fromLine, toLine }) => ({ id, messages, fromLine, toLine })),
);
