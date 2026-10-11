import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { modelSchema } from '../src/core/model.ts';
import type { Candidate, Clarification } from '../src/core/api-types.ts';
export type ProviderConfig = { baseUrl: string; key: string; model: string };
export function providerConfig(): ProviderConfig | null {
  const { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME } = process.env;
  if (!MODEL_BASE_URL || !MODEL_API_KEY || !MODEL_NAME) return null;
  return { baseUrl: MODEL_BASE_URL, key: MODEL_API_KEY, model: MODEL_NAME };
}
const responseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('needs-clarification'),
      questions: z.array(z.string().min(1).max(500)).min(1).max(8),
    })
    .strict(),
  z
    .object({
      status: z.literal('candidate'),
      model: modelSchema,
      evidence: z
        .array(z.object({ path: z.string().max(120), quote: z.string().min(1).max(1200) }).strict())
        .max(300),
      notes: z.array(z.string().max(500)).max(12),
    })
    .strict(),
]);
export function validateCandidate(raw: unknown, input: string): Candidate | Clarification {
  const output = responseSchema.parse(raw);
  if (output.status === 'needs-clarification') return output;
  const paths = [
    ...output.model.resources.map((_, i) => 'resources.' + i + '.initial'),
    ...output.model.actions.flatMap((a, i) =>
      ['cost', 'gain'].flatMap((field) =>
        Object.keys(a[field as 'cost' | 'gain']).map(
          (key) => 'actions.' + i + '.' + field + '.' + key,
        ),
      ),
    ),
    'contract.allowedProfit',
  ];
  if (
    output.evidence.some((e) => !paths.includes(e.path) || !input.includes(e.quote)) ||
    paths.some((path) => !output.evidence.some((e) => e.path === path))
  ) {
    throw new Error('模型候选缺少可核对的数值来源，请补充规则后重试');
  }
  return output;
}
export async function generateCandidate(
  input: string,
  config: ProviderConfig,
): Promise<Candidate | Clarification> {
  const endpoint = new URL(config.baseUrl.replace(/\/$/, '') + '/chat/completions');
  if (
    endpoint.protocol !== 'https:' &&
    !(
      endpoint.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
    )
  ) {
    throw new Error('模型服务地址需要 HTTPS，本机服务可使用 HTTP');
  }
  const system = readFileSync(new URL('../prompts/structure-rules.md', import.meta.url), 'utf8');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 5000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: input },
        ],
      }),
    });
  } catch {
    throw new Error('模型服务连接失败或超时，请稍后重试');
  }
  if (!response.ok)
    throw new Error('模型服务未完成请求（HTTP ' + response.status + '），请检查服务配置');
  const raw = await response.text();
  if (raw.length > 200_000) throw new Error('模型响应超过允许大小');
  try {
    const content = JSON.parse(raw)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('missing content');
    return validateCandidate(
      JSON.parse(content.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')),
      input,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('模型候选')) throw error;
    throw new Error('模型输出未通过规则校验，原有实验未被修改');
  }
}
