import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReviewHandoff } from '../pro/reviewHandoff.ts';
import { heroes } from '../../src/player/catalog.ts';
const event = (second: number) => ({
  id: randomUUID(),
  second,
  label: '受控流程样本',
  observation: '用于文件传递验证，非真实对局',
  decision: '',
  allies: null,
  enemies: null,
  allyGold: null,
  enemyGold: null,
  objectiveIn: null,
  ultimateReady: null,
  frame: 'data:image/jpeg;base64,/9j/2Q==',
});
test('local Codex handoff preserves image bytes and binds returned findings to input, account and time', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kaiju-handoff-'));
  try {
    const source = createReviewHandoff(directory),
      events = [event(10), event(30)];
    const packet = await source.prepare(
      'alice',
      { title: '文件接口测试', heroId: heroes[0].id, videoName: 'synthetic.mp4', events },
      heroes[0],
    );
    assert.equal(packet.frames, 2);
    assert.deepEqual(
      await readFile(join(packet.directory, events[0].id + '.jpg')),
      Buffer.from('/9j/2Q==', 'base64'),
    );
    assert.equal((await source.result('alice', packet.id)).state, 'pending');
    const output = {
      schema: 'kaiju-codex-review-v1',
      packetId: packet.id,
      inputSha256: packet.inputSha256,
      scope: '受控文件测试，不是模型评测',
      findings: events.map((e) => ({
        eventId: e.id,
        evidenceEventIds: [e.id],
        verdict: 'insufficient',
        observation: '不包含真实对局',
        advice: '无法给出游戏建议',
        alternative: '补充真实视频',
        drill: '仅验证接口',
        uncertainty: '未调用任何模型',
      })),
      limitations: ['合成测试，不代表真实复盘质量'],
    };
    const save = async (value: unknown) =>
      writeFile(join(packet.directory, 'result.json'), JSON.stringify(value));
    await save(output);
    assert.equal((await source.result('alice', packet.id)).state, 'complete');
    await assert.rejects(source.result('bob', packet.id));
    await save({ ...output, inputSha256: '0'.repeat(64) });
    await assert.rejects(source.result('alice', packet.id), /不属于/);
    await save({ ...output, findings: [output.findings[0]] });
    await assert.rejects(source.result('alice', packet.id), /遗漏/);
    await save({
      ...output,
      findings: [{ ...output.findings[0], evidenceEventIds: [events[1].id] }, output.findings[1]],
    });
    await assert.rejects(source.result('alice', packet.id), /未来/);
    await save({
      ...output,
      findings: [{ ...output.findings[0], evidenceEventIds: [randomUUID()] }, output.findings[1]],
    });
    await assert.rejects(source.result('alice', packet.id), /不存在/);
    await save(output);
    await writeFile(join(packet.directory, events[0].id + '.jpg'), 'tampered');
    await assert.rejects(source.result('alice', packet.id), /画面校验/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
