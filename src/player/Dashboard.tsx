import {
  ArrowUpRight,
  ArrowRight,
  Swords,
  BookOpen,
  Target,
  Plus,
  CheckCircle2,
  Compass,
} from 'lucide-react';
import { heroes, heroById, heroByName, dataMeta } from './catalog.ts';
import type { Hero, Pool, Match, SavedPlan } from './model.ts';
import { Portrait, Empty } from './ui.tsx';
import { levelNames } from './model.ts';
export type Page = 'home' | 'heroes' | 'draft' | 'journal' | 'pool';
export default function Dashboard({
  pool,
  matches,
  plans,
  go,
  onDemo,
  onOpen,
  onLoadPlan,
}: {
  pool: Pool;
  matches: Match[];
  plans: SavedPlan[];
  go: (p: Page) => void;
  onDemo: () => void;
  onOpen: (h: Hero) => void;
  onLoadPlan: (p: SavedPlan) => void;
}) {
  const focus = matches.find((m) => !m.done);
  const featured = ['李白', '公孙离', '不知火舞', '孙尚香'].map(heroByName).filter(Boolean);
  const main = heroByName('李白');
  return (
    <>
      <div className="home-heading">
        <div>
          <p className="eyebrow">GOOD GAME STARTS BEFORE THE GAME</p>
          <h1>下一局，从这里开始。</h1>
        </div>
        <span className="today">
          <i />
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} ·
          你的个人备战台
        </span>
      </div>
      <div className="hero-layout">
        <section
          className="hero-banner"
          style={{
            backgroundImage:
              'linear-gradient(90deg,#151e2c 0%,#151e2cd9 35%,#151e2c08 85%),url("' +
              main.cover +
              '")',
          }}
        >
          <div className="banner-copy">
            <span className="gold-kicker">
              <span /> 为每一次认真上场
            </span>
            <h2>
              选你会的。
              <br />
              打有准备的局。
            </h2>
            <p>
              从英雄池到阵容，再到下一局的小目标。
              <br />
              把零散的信息，变成自己的打法。
            </p>
            <div className="banner-buttons">
              <button className="btn primary" onClick={() => go('draft')}>
                开始阵容备战 <ArrowRight size={17} />
              </button>
              <button className="text-btn" onClick={onDemo}>
                体验一局示例 <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
          <span className="banner-credit">李白 · 青莲剑仙 / 官方英雄立绘</span>
        </section>
        <section className="focus-card">
          <div className="section-title">
            <span className="eyebrow">ONE THING AT A TIME</span>
            <Target size={19} />
          </div>
          <span className="focus-number">
            01<span>/ 下一局</span>
          </span>
          <h3>{focus ? '带着一个目标上场' : '这次，只练好一件事。'}</h3>
          <p>{focus ? focus.nextAction : '复盘时留下一个具体动作。下一次开局前，让它提醒你。'}</p>
          <div className="focus-bottom">
            {focus ? (
              <>
                <Portrait hero={heroById(focus.heroId)} />
                <span>
                  {heroById(focus.heroId)?.name} · {focus.focus}
                </span>
              </>
            ) : (
              <span>你的目标，由你自己定义</span>
            )}
            <button className="icon-btn" aria-label="打开对局手记" onClick={() => go('journal')}>
              <ArrowUpRight size={20} />
            </button>
          </div>
        </section>
      </div>
      <div className="quick-grid">
        {[
          {
            icon: BookOpen,
            n: '01',
            title: '英雄图鉴',
            desc: heroes.length + ' 位英雄 · 定位与技能',
            page: 'heroes' as Page,
          },
          {
            icon: Swords,
            n: '02',
            title: '阵容备战',
            desc: '看阵容缺口，也看你的熟练度',
            page: 'draft' as Page,
          },
          {
            icon: Compass,
            n: '03',
            title: '对局手记',
            desc: '把一次复盘，变成下一次进步',
            page: 'journal' as Page,
          },
        ].map((c) => (
          <button key={c.page} onClick={() => go(c.page)}>
            <span className="quick-icon">
              <c.icon size={23} />
            </span>
            <span>
              <small>{c.n} / PLAYBOOK</small>
              <strong>{c.title}</strong>
              <p>{c.desc}</p>
            </span>
            <ArrowUpRight size={18} />
          </button>
        ))}
      </div>
      <div className="home-lower">
        <section className="surface">
          <div className="section-title">
            <div>
              <p className="eyebrow">COMFORT PICKS</p>
              <h2>
                你的英雄池 <span>{pool.length}</span>
              </h2>
            </div>
            <button className="text-btn" onClick={() => go('pool')}>
              管理 <ArrowUpRight size={15} />
            </button>
          </div>
          {pool.length ? (
            <div className="pool-strip">
              {pool.slice(0, 6).map((p) => (
                <button key={p.heroId} onClick={() => onOpen(heroById(p.heroId)!)}>
                  <Portrait hero={heroById(p.heroId)} />
                  <strong>{heroById(p.heroId)?.name}</strong>
                  <span>{levelNames[p.level]}</span>
                </button>
              ))}
              <button className="pool-add" onClick={() => go('heroes')}>
                <span>
                  <Plus size={22} />
                </span>
                <strong>添加英雄</strong>
              </button>
            </div>
          ) : (
            <div className="pool-empty">
              <div className="ghost-portraits">
                {featured.slice(0, 3).map((h) => (
                  <Portrait hero={h} key={h.id} />
                ))}
              </div>
              <div>
                <h3>先加入 3 位常玩的英雄</h3>
                <p>建议会优先考虑你真正能发挥的选择。</p>
              </div>
              <button className="btn secondary" onClick={() => go('heroes')}>
                建立英雄池 <Plus size={15} />
              </button>
            </div>
          )}
        </section>
        <section className="surface">
          <div className="section-title">
            <div>
              <p className="eyebrow">SAVED FOR THE NEXT GAME</p>
              <h2>备战卡</h2>
            </div>
            <span className="tiny-label">{plans.length} 份已保存</span>
          </div>
          {plans.length ? (
            <div className="plan-list">
              {plans.slice(0, 2).map((p) => (
                <button key={p.id} onClick={() => onLoadPlan(p)}>
                  <Portrait hero={heroById(p.heroId)} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {heroById(p.heroId)?.name} · {p.draft.role}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="mini-empty">
              <CheckCircle2 size={23} />
              <p>
                在阵容备战中保存一份计划，
                <br />
                下次开局前，一眼找回。
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="featured">
        <div className="section-title">
          <div>
            <p className="eyebrow">DISCOVER YOUR NEXT MAIN</p>
            <h2>换一种节奏，也许更适合你。</h2>
          </div>
          <button className="text-btn" onClick={() => go('heroes')}>
            浏览全部英雄 <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="featured-grid">
          {featured.map((h) => (
            <button
              key={h.id}
              onClick={() => onOpen(h)}
              style={{
                backgroundImage:
                  'linear-gradient(0deg,#101825 0%,transparent 90%),url("' + h.cover + '")',
              }}
            >
              <span>{h.roles.join(' / ')}</span>
              <strong>{h.name}</strong>
              <small>{h.title}</small>
              <ArrowUpRight size={20} />
            </button>
          ))}
        </div>
      </section>
      <footer className="page-footer">
        <span>开局 NEXT · 把下一局，打得更明白。</span>
        <span>
          非官方玩家工具 · 官方资料快照 {new Date(dataMeta.fetchedAt).toLocaleDateString('zh-CN')}
        </span>
      </footer>
    </>
  );
}
