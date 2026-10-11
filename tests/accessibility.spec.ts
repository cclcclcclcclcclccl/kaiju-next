import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
test('accessibility: initial lab, evidence and repairs, mobile model dialog', async ({ page }) => {
  const audits: unknown[] = [];
  const inspect = async (stage: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const violations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, data: n.any.map((c) => c.data) })),
    }));
    audits.push({
      stage,
      violations,
      passedRules: results.passes.length,
      incomplete: results.incomplete.length,
    });
    mkdirSync('evidence/checks', { recursive: true });
    writeFileSync(
      'evidence/checks/accessibility-current.json',
      JSON.stringify(
        {
          tool: 'axe-core',
          scope: 'Automated checks do not establish full WCAG conformance',
          audits,
        },
        null,
        2,
      ),
    );
    expect(violations, stage).toEqual([]);
  };
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始验证', exact: true })).toBeEnabled();
  await inspect('desktop initial laboratory');
  await page.getByRole('button', { name: '开始验证', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 步之后，金币多出了 1。' })).toBeVisible();
  await page.getByRole('button', { name: '比较修复方案' }).click();
  await expect(page.locator('.repair-card')).toHaveCount(2);
  await inspect('desktop witness and repair comparison');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '从文字开始' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await inspect('mobile disconnected model dialog');
});
