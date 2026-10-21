import { useMemo, useState } from 'react';
import { heroes } from '../catalog.ts';
import { ROLES } from '../model.ts';
import type { Hero, Pool, Role } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { usePro } from './context.tsx';
import { personalizedHeroes, personalizedGuide } from './personalization.ts';
import { download } from '../../api.ts';
import TeachingLibrary from './TeachingLibrary.tsx';
import { lessonPacket } from './teaching.ts';

export default function PersonalRecommendations({
  pool,
  onOpen,
  onEdit,
}: {
  pool: Pool;
  onOpen: (h: Hero) => void;
  onEdit: () => void;
}) {
  const { data } = usePro();
  const [role, setRole] = useState<Role | ''>('');
  const [expanded, setExpanded] = useState(false);
  const recommendations = useMemo(
    () => personalizedHeroes(heroes, pool, data.profile, role || undefined),
    [pool, data.profile, role],
  );
  return (
    <section className="surface personal-recommendations" aria-label="个性化英雄推荐">
      <div className="section-title">
        <div>
          <p className="eyebrow">PERSONAL COACH / 下一位适合你的英雄</p>
          <h2>按你的打法选，也按你的记录选。</h2>
        </div>
        <button className="btn secondary" onClick={onEdit}>
          编辑打法与详细档案
        </button>
      </div>
      <div className="pro-toolbar">
        <label>
          推荐分路
          <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
            <option value="">全部位置</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <p className="muted">
          当前目标：{data.profile.habits?.goal ?? '尚未填写，按现有英雄池推荐'}
        </p>
      </div>
      <div className="personal-cards">
        {recommendations.slice(0, expanded ? 6 : 3).map((r) => (
          <article key={r.hero.id}>
            <button className="hero-row" onClick={() => onOpen(r.hero)}>
              <Portrait hero={r.hero} />
              <span>
                <strong>{r.hero.name}</strong>
                <small>{r.hero.roles.join(' / ')}</small>
              </span>
            </button>
            <p className="recommend-score">
              适配 {r.score} <small>/ 100 · {r.known ? '已有基础' : '拓展候选'}</small>
            </p>
            <ul>
              {r.reasons.slice(0, 3).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="muted">{r.fit.risks[0] ?? r.guide.nextGoal}</p>
            <p className="practice-tip">先练：{r.guide.priorities[0].action}</p>
            <button className="text-btn" onClick={() => onOpen(r.hero)}>
              查看专属打法与攻略 →
            </button>
          </article>
        ))}
      </div>
      <button className="text-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? '收起更多候选' : '再看 3 位适配英雄'}
      </button>
      <p className="data-caption">
        适配分依据个人记录、打法选择和官方能力信息，表示练习与备战优先级，不是预测胜率。未填写的偏好按中立处理。
      </p>
    </section>
  );
}

export function PersonalGuide({
  hero,
  role,
  onEdit,
}: {
  hero: Hero;
  role: Role;
  onEdit?: () => void;
}) {
  const { data } = usePro();
  const guide = personalizedGuide(hero, data.profile, role);
  return (
    <section id="hero-personal-guide" className="personal-guide">
      <div className="section-title">
        <h3>你的专属打法与训练卡</h3>
        {onEdit && (
          <button className="text-btn" onClick={onEdit}>
            调整我的打法偏好
          </button>
        )}
      </div>
      <p>
        {guide.fit.reasons.join('；') || '尚未填写打法偏好，以下以官方资料和当前分路任务为起点。'}
      </p>
      <div className="guide-stages">
        {guide.stages.map((text, i) => (
          <article key={text}>
            <strong>{['对线 / 首轮发育', '转线 / 节奏', '团战 / 资源'][i]}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <p>
        <strong>{hero.name}的技能练习：</strong>
        {guide.skillTip}
      </p>
      <p>
        <strong>{hero.name}的团战任务参考：</strong>
        {guide.roleTask}
      </p>
      <h4>
        {guide.sessionGames
          ? `本周练习：每次 ${guide.sessionGames} 场，先看动作是否做到`
          : '本周未安排实战场次，先看攻略与回放'}
      </h4>
      <ul>
        {guide.priorities.map((x) => (
          <li key={x.name}>
            <strong>{x.name}：</strong>
            {x.action}
          </li>
        ))}
      </ul>
      <p className="muted">{guide.nextGoal}</p>
      {data.profile.habits?.notes && <p>你补充的思路：{data.profile.habits.notes}</p>}
      <button
        className="btn secondary"
        onClick={() =>
          download(
            '自在弈境-' + hero.name + '-个人训练卡.md',
            [
              '# ' + hero.name + ' · ' + data.profile.name + '的训练卡',
              '分路：' + role,
              ...guide.stages.map((x, i) => `${i + 1}. ${x}`),
              '技能练习：' + guide.skillTip,
              ...guide.priorities.map((x) => '- ' + x.name + '：' + x.action),
              '官方资料：' + hero.source,
              ...lessonPacket(hero, role).cards.map((card) =>
                [
                  '## 教学检查：' + card.title,
                  ...card.checks.map((q) => '- ' + q),
                  '不适用的情况：' + card.counterexample,
                  '练习：' + card.drill,
                  '依据：' + card.source.title + ' ' + card.source.url,
                  '适用范围：' + card.source.versionNote,
                ].join('\n'),
              ),
              '分路计划与训练任务由项目依据所填偏好整理；不是官方攻略原文，也不是胜率承诺。',
            ].join('\n\n'),
            'text/markdown',
          )
        }
      >
        导出我的训练卡
      </button>
      <TeachingLibrary hero={hero} role={role} compact />
    </section>
  );
}
