import { z } from 'zod';
export const codexReviewSchema = z
  .object({
    schema: z.literal('kaiju-codex-review-v1'),
    packetId: z.string().uuid(),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.string().min(1).max(1200),
    findings: z
      .array(
        z
          .object({
            eventId: z.string().uuid(),
            evidenceEventIds: z.array(z.string().uuid()).min(1).max(30),
            verdict: z.enum(['supported', 'insufficient']),
            observation: z.string().min(1).max(1600),
            advice: z.string().min(1).max(1600),
            alternative: z.string().min(1).max(1000),
            drill: z.string().min(1).max(1000),
            uncertainty: z.string().min(1).max(1200),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    limitations: z.array(z.string().min(1).max(1000)).min(1).max(12),
  })
  .strict();
export type CodexReview = z.infer<typeof codexReviewSchema>;
export type ReviewHandoff = {
  id: string;
  directory: string;
  prompt: string;
  frames: number;
  inputSha256: string;
};
