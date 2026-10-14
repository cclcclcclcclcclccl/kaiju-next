import { z } from 'zod';
export const kplCasesSchema = z.object({
  source: z.literal('KPL 官方赛事网站'),
  sourceUrl: z.literal('https://kpl.qq.com/'),
  fetchedAt: z.string().datetime(),
  cache: z.enum(['fresh', 'cached', 'stale']),
  warning: z.string().optional(),
  trained: z.literal(false),
  sources: z.array(
    z.object({
      url: z.string().url(),
      request: z.record(z.string(), z.unknown()),
      rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  matches: z
    .array(
      z.object({
        id: z.string(),
        season: z.string(),
        title: z.string(),
        startedAt: z.string().datetime(),
        rounds: z.array(
          z.object({
            round: z.number().int().positive(),
            url: z.string().url(),
            heroes: z.array(
              z.object({
                id: z.number().int().positive(),
                name: z.string(),
                playerId: z.string(),
                hasPlayerView: z.boolean(),
              }),
            ),
          }),
        ),
      }),
    )
    .max(3),
});
export type KplCases = z.infer<typeof kplCasesSchema>;
