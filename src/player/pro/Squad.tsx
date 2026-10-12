import { useEffect, useMemo, useState } from 'react';
import { Users, ArrowRight, RefreshCw } from 'lucide-react';
import { usePro } from './context.tsx';
import { heroes, heroById, heroByName } from '../catalog.ts';
import { api, download } from '../../api.ts';
import type { SocialData } from './Social.tsx';
import type { Pool, Draft, Role } from '../model.ts';
import { buildSquad, matchSystem } from './squad.ts';
import type { SquadMember, SquadPlan } from './squad.ts';
import { SYSTEMS } from './systems.ts';
import { Portrait } from '../ui.tsx';
export default function Squad({ pool, onLoad }: { pool: Pool; onLoad: (draft: Draft) => void }) {
  const { data } = usePro();
  const [social, setSocial] = useState<SocialData>({ user: null, friends: [] }),
    [chosen, setChosen] = useState<string[]>(['self']),
    [learning, setLearning] = useState(false),
    [error, setError] = useState(''),
    [plans, setPlans] = useState<SquadPlan[]>([]);
  const refresh = async () => {
    try {
      const next = await api<SocialData>('/social');
      setSocial(next);
      setChosen((old) => {
        const filtered = old.filter(
          (id) => id === 'self' || next.friends.some((f) => f.shared && f.user.id === id),
        );
        return filtered.length === old.length ? old : filtered;
      });
      setPlans([]);
      setError('');
      return next;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    setPlans([]);
  }, [pool, data.profile, chosen, learning]);
  const available: SquadMember[] = [
    {
      id: 'self',
      name: data.profile.name === '我的档案' ? '我自己' : data.profile.name,
      pool,
      profile: data.profile,
    },
    ...social.friends
      .filter((f) => f.shared)
      .map((f) => ({
        id: f.user.id,
        name: f.user.name,
        pool: f.pool,
        profile: f.profile ?? undefined,
      })),
  ];
  const members = available.filter((m) => chosen.includes(m.id));
  const matches = useMemo(
    () =>
      SYSTEMS.map((s) => ({
        system: s,
        match: matchSystem(
          s.heroes.map((name, i) => ({ heroId: heroByName(name).id, role: s.roles[i] as Role })),
          members,
          learning,
        ),
      })).sort(
        (a, b) =>
          b.match.assigned.length / b.system.heroes.length -
          a.match.assigned.length / a.system.heroes.length,
      ),
    [pool, data.profile, social, chosen, learning],
  );
  const solve = async () => {
    const next = await refresh();
    if (!next) return;
    const fresh: SquadMember[] = [
      { id: 'self', name: available[0].name, pool, profile: data.profile },
      ...next.friends
        .filter((f) => f.shared)
        .map((f) => ({
          id: f.user.id,
          name: f.user.name,
          pool: f.pool,
          profile: f.profile ?? undefined,
        })),
    ].filter((m) => chosen.includes(m.id));
    try {
      const result = buildSquad(fresh, heroes, learning);
      setPlans(result);
      setError(
        result.length
          ? ''
          : '暂未找到覆盖五个位置的方案。请检查成员的熟练英雄与分路，或允许练习中的英雄参与。',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="surface squad-lab">
      <div className="section-title">
        <div>
          <p className="eyebrow">SQUAD FIT / WHO PLAYS WHAT</p>
          <h2>
            <Users size={20} /> 先看这套体系，队友能不能拿。
          </h2>
        </div>
        <button className="text-btn" onClick={() => void refresh()}>
          <RefreshCw size={14} />
          刷新共享记录
        </button>
      </div>
      <p className="muted">
        选择本次一起玩的成员。每人只分配一个英雄；默认只考虑本命和熟练英雄，缺少的位置会明确列出。
      </p>
      <div className="squad-members">
        {available.map((m) => (
          <label className="check-control" key={m.id}>
            <input
              type="checkbox"
              checked={chosen.includes(m.id)}
              disabled={!chosen.includes(m.id) && chosen.length >= 5}
              onChange={(e) =>
                setChosen(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))
              }
            />
            {m.name}
            <small>{m.pool.length} 位已登记</small>
          </label>
        ))}
      </div>
      {!social.friends.some((f) => f.shared) && (
        <p className="data-caption">
          在“好友与组队”互相接受，再由对方在“玩家档案”开启共享，就可以把队友加入这里。
        </p>
      )}
      <label className="check-control">
        <input type="checkbox" checked={learning} onChange={(e) => setLearning(e.target.checked)} />
        允许“正在练”的英雄参与（用于练习队）
      </label>
      {!matches.some((x) => x.match.assigned.length) && (
        <p className="pro-notice">
          这支队伍暂未登记能承担体系核心位置的熟练英雄。先从下方选一套想练的体系，再补充成员的英雄池。
        </p>
      )}
      <div className="squad-matches">
        {matches
          .filter((x) => x.match.assigned.length > 0)
          .map(({ system: s, match: m }) => (
            <article key={s.id}>
              <div className="section-title">
                <h3>{s.name}</h3>
                <span className={m.complete ? 'gold' : 'muted'}>
                  {m.complete
                    ? '核心位置可组成'
                    : m.assigned.length + '/' + s.heroes.length + ' 核心位置可分配'}
                </span>
              </div>
              <p>
                {m.assigned.length
                  ? m.assigned
                      .map(
                        (a) =>
                          a.memberName + ' → ' + heroById(a.heroId)?.name + '（' + a.role + '）',
                      )
                      .join('；')
                  : '暂无可分配成员'}
              </p>
              {m.missing.length > 0 && (
                <small>
                  还需：{m.missing.map((a) => heroById(a.heroId)?.name + ' · ' + a.role).join('、')}
                  。同一成员不能同时补多个位置。
                </small>
              )}
            </article>
          ))}
      </div>
      <div className="pro-actions">
        <button
          className="btn primary"
          disabled={members.length !== 5}
          onClick={() => void solve()}
        >
          生成五人起始阵容
        </button>
        <span className="muted">已选择 {members.length}/5 位成员</span>
      </div>
      <p className="data-caption">
        在已登记英雄池中比较分工与阵容配合，给出最多三份起始方案，再带入 BP
        应对敌方。当前结果未使用真实分段胜率，不代表实战胜率或全局最优解。
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="squad-plans">
        {plans.map((p, i) => (
          <article className="surface" key={i}>
            <div className="section-title">
              <h3>方案 {i + 1}</h3>
              <span>
                备战评分 {p.score} · 最低个人准备度 {p.weakest}
              </span>
            </div>
            <div className="squad-assignments">
              {p.assignments.map((a) => (
                <div className="hero-row" key={a.role}>
                  <Portrait hero={heroById(a.heroId)} />
                  <div>
                    <strong>
                      {a.memberName} · {heroById(a.heroId)?.name}
                    </strong>
                    <small>
                      {a.role} · 准备度 {a.readiness} · {a.confidence}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <div className="pro-actions">
              <button
                className="btn primary"
                onClick={() => onLoad({ ...p.draft, pool, onlyPool: false, role: '中路' })}
              >
                带入五人阵容 <ArrowRight size={15} />
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  download(
                    '开局-队伍分工.md',
                    [
                      '# 开局 NEXT · 队伍分工',
                      '',
                      ...p.assignments.map(
                        (a) =>
                          '- ' +
                          a.role +
                          '：' +
                          a.memberName +
                          ' / ' +
                          heroById(a.heroId)?.name +
                          ' / 准备度 ' +
                          a.readiness,
                      ),
                      '',
                      '评分为项目备战估计，非实战胜率。当前没有使用真实分段统计。',
                    ].join('\n'),
                    'text/markdown',
                  )
                }
              >
                导出分工卡
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
