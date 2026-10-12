import Squad from './Squad.tsx';
import { useState } from 'react';
import { ArrowRight, Check, BookOpen } from 'lucide-react';
import { SYSTEMS } from './systems.ts';
import { heroByName } from '../catalog.ts';
import { Portrait, Modal } from '../ui.tsx';
import type { Draft, Pool, Role } from '../model.ts';
import { emptyDraft } from '../model.ts';
export default function Systems({ pool, onLoad }: { pool: Pool; onLoad: (draft: Draft) => void }) {
  const [active, setActive] = useState<(typeof SYSTEMS)[number] | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEAM PLAYBOOK / PRACTICE WITH A PURPOSE</p>
          <h1>练一套配合，知道每个人为什么在场。</h1>
          <p>先看英雄池是否覆盖，再练共同目标与沟通。</p>
        </div>
      </div>
      <Squad pool={pool} onLoad={onLoad} />
      <div className="systems-grid">
        {SYSTEMS.map((s) => {
          const count = s.heroes.filter((n) =>
            pool.some((p) => p.heroId === heroByName(n).id),
          ).length;
          return (
            <article className="surface system-card" key={s.id}>
              <p className="eyebrow">
                {count}/{s.heroes.length} 位在你的英雄池
              </p>
              <h2>{s.name}</h2>
              <div className="system-heroes">
                {s.heroes.map((n) => (
                  <div key={n}>
                    <Portrait hero={heroByName(n)} />
                    <span>{n}</span>
                    {pool.some((p) => p.heroId === heroByName(n).id) && <Check size={12} />}
                  </div>
                ))}
              </div>
              <p>{s.idea}</p>
              <small>{s.difficulty}</small>
              <button className="btn secondary" onClick={() => setActive(s)}>
                <BookOpen size={15} />
                查看打法与练习
              </button>
            </article>
          );
        })}
      </div>
      <p className="data-caption">
        项目整理的练习模板，不是实测胜率排行榜。技能交互、版本强度与队伍熟练度需要实战校验。
      </p>
      {active && (
        <Modal title={active.name} onClose={() => setActive(null)} wide>
          <div className="pro-prose">
            <p>{active.idea}</p>
            <ol>
              {active.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            <h3>这套体系怕什么</h3>
            <p>{active.risk}</p>
            <h3>一起练什么</h3>
            <p>{active.drill}</p>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              const d = emptyDraft();
              active.heroes.forEach((n, i) => {
                d.allies[active.roles[i] as Role] = heroByName(n).id;
              });
              d.pool = pool;
              d.preference = 'balanced';
              onLoad(d);
              setActive(null);
            }}
          >
            带入阵容备战 <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
