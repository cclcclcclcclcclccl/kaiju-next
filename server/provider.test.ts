import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateCandidate } from './model-provider.ts';
test('provider sends explicit input to the configured endpoint and validates returned clarification', async t => {
  let received: any;
  let authorization = '';
  const upstream = createServer(async (req, res) => {
    authorization = req.headers.authorization ?? '';
    let raw = ''; for await (const chunk of req) raw += chunk;
    received = JSON.parse(raw);
    assert.equal(req.url, '/v1/chat/completions');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status: 'needs-clarification', questions: ['初始库存是多少？'] }) } }] }));
  });
  await new Promise<void>(resolve => upstream.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise<void>(resolve => upstream.close(() => resolve())));
  const output = await generateCandidate('我有一个交易系统，想检查是否能套利。', {
    baseUrl: 'http://127.0.0.1:' + (upstream.address() as AddressInfo).port + '/v1',
    key: 'test-key-not-a-real-secret', model: 'mock-provider',
  });
  assert.equal(output.status, 'needs-clarification');
  assert.equal(authorization,'Bearer test-key-not-a-real-secret');
  assert.equal(received.messages.at(-1).content,'我有一个交易系统，想检查是否能套利。');
  assert.ok(received.messages[0].content.includes('Never guess'));
  assert.equal(received.response_format.type,'json_object');
});
