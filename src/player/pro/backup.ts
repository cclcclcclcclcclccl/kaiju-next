import { z } from 'zod';
import { poolSchema, draftSchema, matchSchema } from '../model.ts';
import { profileSchema, snapshotSchema, reviewSchema, jungleSchema } from './model.ts';
const meta = { id: z.string().uuid(), createdAt: z.string().datetime() };
const unique = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((i) => i.id)).size === items.length;
export const personalStateSchema = z
  .object({
    pool: poolSchema,
    draft: draftSchema,
    matches: z
      .array(matchSchema.safeExtend({ ...meta, done: z.boolean() }))
      .max(10000)
      .refine(unique, '重复对局 ID'),
    plans: z
      .array(
        z
          .object({
            ...meta,
            name: z.string().min(1).max(80),
            draft: draftSchema,
            heroId: z.number().int().positive(),
            summary: z.string().max(20000),
          })
          .strict(),
      )
      .max(10000)
      .refine(unique, '重复备战卡 ID'),
    profile: profileSchema,
    snapshots: z
      .array(
        snapshotSchema.safeExtend({ id: z.string().uuid(), importedAt: z.string().datetime() }),
      )
      .max(1000)
      .refine(unique, '重复统计批次 ID'),
    reviews: z.array(reviewSchema.safeExtend(meta)).max(1000).refine(unique, '重复复盘 ID'),
    runs: z.array(jungleSchema.safeExtend(meta)).max(10000).refine(unique, '重复训练 ID'),
  })
  .strict();
export type PersonalState = z.infer<typeof personalStateSchema>;
export const backupSchema = z
  .object({
    format: z.literal('kaiju-personal-backup-v1'),
    exportedAt: z.string().datetime(),
    data: personalStateSchema,
  })
  .strict();
export type PersonalBackup = z.infer<typeof backupSchema>;
export const backupCounts = (d: PersonalState) => ({
  自选英雄: d.pool.length,
  详细英雄记录: d.profile.heroes.length,
  对局手记: d.matches.length,
  备战卡: d.plans.length,
  统计批次: d.snapshots.length,
  复盘: d.reviews.length,
  复盘截图: d.reviews.reduce((sum, r) => sum + r.events.filter((e) => e.frame).length, 0),
  刷野训练: d.runs.length,
});
export function backupHeroIds(d: PersonalState) {
  const draftIds = (v: z.infer<typeof draftSchema>) =>
    [
      ...Object.values(v.allies),
      ...Object.values(v.enemies),
      ...v.banned,
      ...v.pool.map((p) => p.heroId),
    ].filter((n): n is number => n !== undefined);
  return [
    ...d.pool.map((p) => p.heroId),
    ...draftIds(d.draft),
    ...d.matches.map((m) => m.heroId),
    ...d.plans.flatMap((p) => [p.heroId, ...draftIds(p.draft)]),
    ...d.profile.heroes.map((h) => h.heroId),
    ...d.snapshots.flatMap((s) => s.rows.map((r) => r.heroId)),
    ...d.reviews.map((r) => r.heroId),
    ...d.runs.map((r) => r.heroId),
  ];
}
