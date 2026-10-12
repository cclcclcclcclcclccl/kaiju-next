import HeroInsights from './pro/HeroInsights.tsx';
import { HeroResources } from './pro/ResourceCenter.tsx';
import Jungle from './pro/Jungle.tsx';
import { useMemo, useState } from 'react';
import { Search, ArrowUpRight, Plus, Check, BookOpen, Star } from 'lucide-react';
import { heroes, dataMeta, heroById } from './catalog.ts';
import { ROLES, levelNames } from './model.ts';
import type { Hero, Pool } from './model.ts';
import { notes, traitNames } from './tactics.ts';
import { Modal, Portrait, Empty, SourceLink } from './ui.tsx';
import { usePro } from './pro/context.tsx';
import { mastery, effectivePool } from './pro/analytics.ts';
import PersonalRecommendations, { PersonalGuide } from './pro/PersonalRecommendations.tsx';
import type { Role } from './model.ts';

export function HeroDetail({
  hero,
  statsContext,
  pool,
  onPool,
  onClose,
  busy,
  onEditRecord,
}: {
  hero: Hero;
  statsContext?: { segment: string; role: string; snapshotId?: string };
  pool: Pool;
  onPool: (pool: Pool) => void;
  onClose: () => void;
  busy: boolean;
  onEditRecord?: (id?: number) => void;
}) {
  const { data } = usePro();
  const recorded = data.profile.heroes.some((h) => h.heroId === hero.id);
  const entry = pool.find((p) => p.heroId === hero.id),
    note = notes[hero.name];
  const [tab, setTab] = useState(0);
  return (
    <Modal title={hero.name + ' · ' + hero.title} onClose={onClose} wide>
      <div
        className="detail-banner"
        style={{
          backgroundImage:
            'linear-gradient(90deg,#111a28 10%,transparent),url("' + hero.cover + '")',
        }}
      >
        <Portrait hero={hero} />
        <div>
          <span className="tag">{hero.roles.join(' / ')}</span>
          <h3>{hero.name}</h3>
          <p>{hero.classes.join(' · ')}</p>
        </div>
      </div>
      <div className="detail-actions">
        <button
          className={'btn ' + (entry ? 'secondary' : 'primary')}
          disabled={busy}
          onClick={() =>
            recorded && onEditRecord
              ? onEditRecord(hero.id)
              : onPool(
                  entry
                    ? pool.filter((p) => p.heroId !== hero.id)
                    : [...pool, { heroId: hero.id, level: 'learning' }],
                )
          }
        >
          {entry ? <Check size={15} /> : <Plus size={15} />}{' '}
          {recorded ? '管理详细记录与入池状态' : entry ? '已加入英雄池 · 移除' : '加入我的英雄池'}
        </button>
        {entry && !recorded && (
          <select
            aria-label="英雄熟练度"
            value={entry.level}
            disabled={busy}
            onChange={(e) =>
              onPool(
                pool.map((p) =>
                  p.heroId === hero.id
                    ? { ...p, level: e.target.value as Pool[number]['level'] }
                    : p,
                ),
              )
            }
          >
            {Object.entries(levelNames).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        )}
        <SourceLink hero={hero} />
        {onEditRecord && (
          <button className="btn secondary" onClick={() => onEditRecord(hero.id)}>
            填写 / 编辑我的详细数据
          </button>
        )}
      </div>
      <nav className="detail-jump" aria-label="英雄详情章节">
        {[
          ['.skill-section', '技能'],
          ['#hero-stats', '分段表现'],
          ['#hero-relations', '搭配克制'],
          ['#hero-updates', '版本追踪'],
          ['#hero-skins', '皮肤'],
          ['#hero-guide', '英雄攻略'],
          ['#hero-builds', '出装铭文'],
          ['#hero-personal-guide', '我的打法'],
          ...(hero.roles.includes('打野') ? [['.jungle-section', '刷野路线']] : []),
        ].map(([selector, label]) => (
          <button
            key={selector}
            onClick={() =>
              document
                .querySelector(selector)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {note && (
        <section className="tactical-note">
          <p className="eyebrow">开局战术笔记 · 定性建议</p>
          <div className="chips">
            {note.traits.map((t) => (
              <span key={t}>{traitNames[t]}</span>
            ))}
          </div>
          <p>{note.tip}</p>
          <p className="muted">需要取舍：{note.tradeoff}</p>
          <div className="practice-tip">
            <Star size={16} />
            <span>先练这一件事：{note.drill}</span>
          </div>
        </section>
      )}
      <section className="skill-section">
        <div className="section-title">
          <h3>
            <BookOpen size={17} /> 技能资料
          </h3>
          <span>官方页面快照</span>
        </div>
        {hero.skills.length ? (
          <>
            <div className="skill-tabs">
              {hero.skills.map((s, i) => (
                <button
                  key={i}
                  aria-pressed={tab === i}
                  className={tab === i ? 'active' : ''}
                  onClick={() => setTab(i)}
                >
                  <span>{i === 0 ? '被动' : '技能 ' + i}</span>
                  {s.name}
                </button>
              ))}
            </div>
            <p className="skill-description">{hero.skills[tab]?.description}</p>
            <div className="skill-meta">
              <span>冷却：{hero.skills[tab]?.cooldown || '官方未列出'}</span>
              <span>消耗：{hero.skills[tab]?.cost || '官方未列出'}</span>
            </div>
            {hero.skills[tab]?.tip && (
              <p className="practice-tip">
                <strong>官方技能提示：</strong>
                {hero.skills[tab].tip}
              </p>
            )}
          </>
        ) : (
          <p className="muted">
            该英雄的旧版官方技能页暂不可用。可从官方资料入口查看，不补填未经核对的数值。
          </p>
        )}
        <p className="data-caption">
          获取于 {new Date(dataMeta.fetchedAt).toLocaleDateString('zh-CN')}
          。官网页面未提供统一版本号，技能数值以游戏内为准。
        </p>
      </section>
      <HeroInsights hero={hero} context={statsContext} />
      <section id="hero-builds" className="hero-builds">
        <h3>官方出装与铭文资料</h3>
        <p className="data-caption">
          来自英雄官网页面的方案快照。未标明统一版本，装备调整和对局局势会影响选择，不能当作当前版本唯一最优解。
        </p>
        <div className="guide-stages">
          {hero.builds?.map((build, i) => (
            <article key={i}>
              <h4>
                方案 {i + 1} · {build.note || '官方未附说明'}
              </h4>
              <ol>
                {build.items.map((item, index) => (
                  <li key={index}>
                    <strong>{item.name}</strong>
                    <details>
                      <summary>属性与说明 · {item.price} 金</summary>
                      <p>{item.description}</p>
                    </details>
                  </li>
                ))}
              </ol>
              {!!build.unresolvedItemIds?.length && (
                <p className="data-caption">
                  此旧方案含 {build.unresolvedItemIds.length} 件当前装备目录无法解析的装备（ID：
                  {build.unresolvedItemIds.join('、')}），以上不是完整六神装，请以游戏内装备为准。
                </p>
              )}
            </article>
          ))}
        </div>
        {!hero.builds?.length && <p>官网暂无可解析的装备方案。</p>}
        <div className="rune-grid">
          {hero.runes?.map((r) => (
            <article key={r.id}>
              <strong>{r.name}</strong>
              <span>{r.color === 'red' ? '红色' : r.color === 'blue' ? '蓝色' : '绿色'}铭文</span>
              <p>{r.description}</p>
            </article>
          ))}
        </div>
        <p>{hero.runeNote}</p>
        <p className="data-caption">铭文页未提供数量分配，未擅自补成“各 10 个”。</p>
      </section>
      <PersonalGuide
        hero={hero}
        role={(statsContext?.role ?? hero.roles[0]) as Role}
        onEdit={onEditRecord ? () => onEditRecord(hero.id) : undefined}
      />
      {hero.roles.includes('打野') && <Jungle hero={hero} />}
      <HeroResources hero={hero} />
    </Modal>
  );
}
export default function Heroes({
  pool,
  onPool,
  onOpen,
  busy,
  onlyPool = false,
  onEditRecord,
}: {
  pool: Pool;
  onPool: (pool: Pool) => void;
  onOpen: (h: Hero) => void;
  busy: boolean;
  onlyPool?: boolean;
  onEditRecord?: (id?: number) => void;
}) {
  const { data } = usePro();
  const combinedPool = useMemo(() => effectivePool(pool, data.profile), [pool, data.profile]);
  const [query, setQuery] = useState(''),
    [role, setRole] = useState('全部');
  const list = useMemo(
    () =>
      heroes.filter(
        (h) =>
          (!onlyPool || combinedPool.some((p) => p.heroId === h.id)) &&
          (role === '全部' || h.roles.includes(role)) &&
          (!query || [h.name, h.slug, h.title].some((x) => x.includes(query.trim()))),
      ),
    [query, role, combinedPool, onlyPool],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{onlyPool ? 'YOUR HERO POOL' : 'HERO ATLAS / OFFICIAL CATALOG'}</p>
          <h1>{onlyPool ? '把会玩的，变成底气。' : '找到你的下一位本命。'}</h1>
          <p>
            {onlyPool
              ? '场次、评分、胜率、战力与打法共同决定准备度。详细记录直接用于教练 BP 和体系适配。'
              : '查定位、看技能、记下练习重点。资料来自王者荣耀官方公开目录。'}
          </p>
        </div>
        <span className="outline-tag">{onlyPool ? combinedPool.length : heroes.length} 位英雄</span>
      </div>
      {onlyPool && onEditRecord && (
        <PersonalRecommendations pool={pool} onOpen={onOpen} onEdit={() => onEditRecord()} />
      )}
      <div className="atlas-toolbar">
        <div className="filter-tabs">
          {['全部', ...ROLES].map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>
              {r}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="搜索英雄"
            placeholder="搜索英雄 / 拼音"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {list.length ? (
        <div className="hero-grid">
          {list.map((h) => {
            const level = pool.find((p) => p.heroId === h.id)?.level;
            const record = data.profile.heroes.find((m) => m.heroId === h.id);
            const ready = mastery(h.id, pool, data.profile);
            return (
              <article className="hero-card" key={h.id}>
                <button
                  className="hero-art"
                  onClick={() => onOpen(h)}
                  aria-label={'查看' + h.name + '资料'}
                >
                  <img
                    src={h.cover}
                    loading="lazy"
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                  <span className="hero-watermark">{h.name}</span>
                  <span className="hero-card-role">{h.roles.join(' / ')}</span>
                  <span className="art-arrow">
                    <ArrowUpRight size={18} />
                  </span>
                </button>
                <div className="hero-card-info">
                  <div>
                    <button onClick={() => onOpen(h)}>{h.name}</button>
                    <p>{h.title}</p>
                  </div>
                  <button
                    className={'icon-btn ' + (level || record ? 'is-favorite' : '')}
                    disabled={busy}
                    aria-label={
                      (record ? '管理英雄记录' : level ? '移出英雄池' : '加入英雄池') + h.name
                    }
                    onClick={() =>
                      record && onEditRecord
                        ? onEditRecord(h.id)
                        : onPool(
                            level
                              ? pool.filter((p) => p.heroId !== h.id)
                              : [...pool, { heroId: h.id, level: 'learning' }],
                          )
                    }
                  >
                    {level || record ? <Star size={18} fill="currentColor" /> : <Plus size={19} />}
                  </button>
                </div>
                {onlyPool && (
                  <div className="pool-record-summary">
                    <div className="pool-record-metrics">
                      <span>
                        <strong>{ready.score}</strong>准备度
                      </span>
                      <span>
                        <strong>{record?.games ?? '—'}</strong>场次
                      </span>
                      <span>
                        <strong>{record?.averageRating ?? '—'}</strong>平均评分
                      </span>
                      <span>
                        <strong>
                          {record?.winRate !== undefined
                            ? record.winRate.toFixed(1) + '%'
                            : record?.games && record.wins !== undefined
                              ? ((100 * record.wins) / record.games).toFixed(1) + '%'
                              : '—'}
                        </strong>
                        胜率
                      </span>
                      <span>
                        <strong>{record?.power ?? '—'}</strong>当前战力
                      </span>
                      <span>
                        <strong>{record?.historicalPeakPower ?? '—'}</strong>历史最高
                      </span>
                    </div>
                    <p className="data-caption">
                      {ready.confidence}
                      {record ? ' · ' + record.observedOn : ''}
                    </p>
                    {onEditRecord && (
                      <button className="btn secondary" onClick={() => onEditRecord(h.id)}>
                        编辑{h.name}详细数据
                      </button>
                    )}
                  </div>
                )}
                {onlyPool && !record && level && (
                  <div className="pool-level">
                    <span>未录数据时的自报标签</span>
                    <select
                      aria-label={h.name + '熟练度'}
                      value={level}
                      disabled={busy}
                      onChange={(e) =>
                        onPool(
                          pool.map((p) =>
                            p.heroId === h.id
                              ? { ...p, level: e.target.value as Pool[number]['level'] }
                              : p,
                          ),
                        )
                      }
                    >
                      {Object.entries(levelNames).map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={onlyPool ? '从真正会玩的英雄开始' : '没有找到这个英雄'}
          description={
            onlyPool ? '在英雄图鉴中点击加号，把常玩的英雄加入这里。' : '试着换一个名字或分路筛选。'
          }
        />
      )}
      <p className="data-caption">
        英雄目录与立绘：腾讯王者荣耀官方公开资料 · 战术笔记：本项目整理的定性建议 ·
        不代表当前版本强度排名
      </p>
    </>
  );
}
