import { ProContext } from './pro/context.tsx';
import { emptyPro } from './pro/model.ts';
import type { ProData } from './pro/model.ts';
import Leaderboard from './pro/Leaderboard.tsx';
import ProfilePage from './pro/Profile.tsx';
import Social from './pro/Social.tsx';
import Systems from './pro/Systems.tsx';
import Replay from './pro/Replay.tsx';
import { BarChart3, Users, Video, Network, Gauge } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Aperture,
  LayoutDashboard,
  BookOpen,
  Swords,
  NotebookPen,
  Heart,
  ArrowUpRight,
  Search,
  FolderOpen,
  X,
  Check,
  Info,
  Menu,
} from 'lucide-react';
import { api } from '../api.ts';
import { heroes, dataMeta, heroById, heroByName } from './catalog.ts';
import { emptyDraft, draftSchema } from './model.ts';
import type { Draft, Hero, Pool, Match, MatchInput, SavedPlan } from './model.ts';
import Dashboard from './Dashboard.tsx';
import type { Page } from './Dashboard.tsx';
import Heroes, { HeroDetail } from './Heroes.tsx';
import DraftPage from './Draft.tsx';
import Journal from './Journal.tsx';
import { Modal, Portrait } from './ui.tsx';
type Workspace = { pool: Pool; draft: Draft; matches: Match[]; plans: SavedPlan[] };
export default function App() {
  const [pro, setPro] = useState<ProData>(emptyPro);
  const refreshPro = async () => setPro(await api<ProData>('/pro'));
  const draftKey =
    'kaiju-draft-v1' +
    (localStorage.getItem('kaiju-user') ? ':' + localStorage.getItem('kaiju-user') : '');
  const [page, setPage] = useState<Page>('home'),
    [pool, setPool] = useState<Pool>([]),
    [draft, setDraft] = useState<Draft>(emptyDraft),
    [matches, setMatches] = useState<Match[]>([]),
    [plans, setPlans] = useState<SavedPlan[]>([]);
  const [heroStats, setHeroStats] = useState<{
    segment: string;
    role: string;
    snapshotId?: string;
  }>();
  const openHero = (h: Hero, context?: { segment: string; role: string; snapshotId?: string }) => {
    setHero(h);
    setHeroStats(context);
  };
  const [activeCandidate, setActiveCandidate] = useState<number>();
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [hero, setHero] = useState<Hero | null>(null),
    [source, setSource] = useState(false),
    [archive, setArchive] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [globalSearch, setGlobalSearch] = useState(''),
    [mobileMenu, setMobileMenu] = useState(false);
  const load = async () => {
    try {
      const [workspace, status, proData] = await Promise.all([
        api<Workspace>('/workspace'),
        api<{ modelConfigured: boolean }>('/status'),
        api<ProData>('/pro'),
      ]);
      setPool(workspace.pool);
      setPro(proData);
      setMatches(workspace.matches);
      setPlans(workspace.plans);
      setConfigured(status.modelConfigured);
      let restored = workspace.draft;
      try {
        const local = draftSchema.safeParse(JSON.parse(localStorage.getItem(draftKey) ?? 'null'));
        if (
          local.success &&
          [
            ...Object.values(local.data.allies),
            ...Object.values(local.data.enemies),
            ...local.data.banned,
          ].every((id) => id === undefined || heroById(id))
        )
          restored = local.data;
      } catch {}
      setDraft(restored);
      setReady(true);
    } catch (e) {
      setToast({ text: '无法连接本地服务。请启动项目后点击重试。', error: true });
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        setToast({ text: '浏览器草稿空间不足，请点击保存阵容。', error: true });
      }
  }, [draft, ready]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);
  const currentDraft = useMemo(() => ({ ...draft, pool }), [draft, pool]);
  const go = (p: Page) => {
    setPage(p);
    setMobileMenu(false);
    setGlobalSearch('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const mutate = async <T,>(fn: () => Promise<T>, message?: string): Promise<T> => {
    setBusy(true);
    try {
      const value = await fn();
      if (message) setToast({ text: message });
      return value;
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const updatePool = (next: Pool) => {
    void mutate(async () => setPool(await api<Pool>('/pool', next)), '英雄池已保存').catch(
      () => {},
    );
  };
  const saveDraft = () => {
    void mutate(async () => {
      await api('/draft', currentDraft);
    }, '阵容已保存到本机').catch(() => {});
  };
  const savePlan = async (heroId: number, name: string) => {
    await mutate(async () => {
      const saved = await api<SavedPlan>('/plans', { heroId, name, draft: currentDraft });
      setPlans((p) => [saved, ...p]);
    }, '备战卡已保存，可在备战档案中找回').catch(() => {});
  };
  const addMatch = async (input: MatchInput, id?: string) => {
    await mutate(async () => {
      const saved = await api<Match>(
        id ? '/match-update' : '/matches',
        id ? { id, match: input } : input,
      );
      setMatches((rows) => (id ? rows.map((m) => (m.id === id ? saved : m)) : [saved, ...rows]));
    }, '对局手记已保存，下一局目标已更新');
  };
  const checkMatch = (m: Match, done: boolean) => {
    void mutate(async () => {
      const saved = await api<Match>('/match-check', { id: m.id, done });
      setMatches((rows) => rows.map((x) => (x.id === m.id ? saved : x)));
    }).catch(() => {});
  };
  const demo = () => {
    setActiveCandidate(undefined);
    const id = (n: string) => heroByName(n).id;
    setDraft({
      role: '中路',
      allies: { 对抗路: id('吕布'), 打野: id('赵云'), 发育路: id('孙尚香'), 游走: id('蔡文姬') },
      enemies: {
        对抗路: id('花木兰'),
        打野: id('兰陵王'),
        中路: id('嬴政'),
        发育路: id('后羿'),
        游走: id('张飞'),
      },
      banned: [],
      onlyPool: false,
      pool,
    });
    go('draft');
    setToast({ text: '已载入教学阵容，用于体验选人取舍，不是实际对局记录。' });
  };
  const openPlan = (p: SavedPlan) => {
    setDraft(p.draft);
    setActiveCandidate(p.heroId);
    setArchive(false);
    go('draft');
    setToast({ text: '已载入 ' + p.name + '。建议将按你当前英雄池重新计算。' });
  };
  const nav = [
    { id: 'home' as Page, label: '备战首页', icon: LayoutDashboard },
    { id: 'heroes' as Page, label: '英雄图鉴', icon: BookOpen },
    { id: 'tier' as Page, label: '分段梯度', icon: BarChart3 },
    { id: 'draft' as Page, label: '阵容备战', icon: Swords },
    { id: 'journal' as Page, label: '对局手记', icon: NotebookPen },
    { id: 'pool' as Page, label: '我的英雄池', icon: Heart },
    { id: 'profile' as Page, label: '玩家档案', icon: Gauge },
    { id: 'systems' as Page, label: '体系练习', icon: Network },
    { id: 'replay' as Page, label: '录像复盘', icon: Video },
    { id: 'social' as Page, label: '好友与组队', icon: Users },
  ];
  const searchResults = globalSearch.trim()
    ? heroes
        .filter((h) => h.name.includes(globalSearch.trim()) || h.slug.includes(globalSearch.trim()))
        .slice(0, 6)
    : [];
  return (
    <ProContext.Provider value={{ data: pro, refresh: refreshPro, configured }}>
      <div className="app">
        <aside className={'sidebar ' + (mobileMenu ? 'mobile-open' : '')}>
          <button className="brand" onClick={() => go('home')} aria-label="开局首页">
            <span className="brand-symbol">
              <Aperture size={29} />
            </span>
            <strong>
              开局 <span>NEXT</span>
            </strong>
          </button>
          <p className="brand-caption">你的王者备战台</p>
          <div className="nav-label">
            我的工作台 <span>PLAYBOOK</span>
          </div>
          <nav aria-label="主导航">
            {nav.map((n) => (
              <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)}>
                <n.icon size={19} />
                <span>{n.label}</span>
                {n.id === 'pool' && pool.length > 0 ? (
                  <small>{pool.length}</small>
                ) : page === n.id ? (
                  <i />
                ) : null}
              </button>
            ))}
          </nav>
          <div className="sidebar-callout">
            <span className="eyebrow">PLAY WITH A PLAN</span>
            <Swords size={30} />
            <h3>
              少一点盲选。
              <br />
              多一点自己的思路。
            </h3>
            <button onClick={demo}>
              试试一局教学阵容 <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <button onClick={() => setSource(true)}>
              <Info size={17} />
              数据与使用说明
              <ArrowUpRight size={13} />
            </button>
            <span>
              <i />
              {ready ? '本地工作台已连接' : '正在连接本地服务'}
              <small>v0.4</small>
            </span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="mobile-menu icon-btn"
                aria-label="展开导航"
                aria-expanded={mobileMenu}
                onClick={() => setMobileMenu(!mobileMenu)}
              >
                <Menu size={21} />
              </button>
              <span>王者荣耀</span>
              <i>/</i>
              <strong>{nav.find((n) => n.id === page)?.label}</strong>
            </div>
            <div className="topbar-actions">
              <div className="global-search">
                <label>
                  <Search size={15} />
                  <input
                    aria-label="全局搜索英雄"
                    placeholder="找一个英雄…"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                  />
                  <span>搜索</span>
                </label>
                {globalSearch && (
                  <div className="search-popover">
                    {searchResults.length ? (
                      searchResults.map((h) => (
                        <button
                          key={h.id}
                          onClick={() => {
                            openHero(h);
                            setGlobalSearch('');
                          }}
                        >
                          <Portrait hero={h} />
                          <span>
                            {h.name}
                            <small>{h.roles.join(' / ')}</small>
                          </span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))
                    ) : (
                      <p>没有匹配英雄</p>
                    )}
                  </div>
                )}
              </div>
              <button
                aria-label="备战档案"
                className="archive-button"
                onClick={() => setArchive(true)}
              >
                <FolderOpen size={17} />
                <span>备战档案</span>
              </button>
              <span className="avatar">蔡</span>
            </div>
          </header>
          <main>
            {!ready ? (
              <div className="loading-state">
                <Aperture size={30} />
                <h1>准备你的备战台</h1>
                <p>英雄资料与个人记录正在就位。</p>
                <button className="btn secondary" onClick={load}>
                  重试连接
                </button>
              </div>
            ) : (
              <>
                {page === 'tier' && <Leaderboard onOpen={openHero} />}
                {page === 'profile' && <ProfilePage />}
                {page === 'social' && <Social />}
                {page === 'replay' && <Replay />}
                {page === 'systems' && (
                  <Systems
                    pool={pool}
                    onLoad={(d) => {
                      setDraft(d);
                      go('draft');
                      setToast({ text: '体系核心英雄已带入，补齐剩余位置继续备战。' });
                    }}
                  />
                )}
                {page === 'home' && (
                  <Dashboard
                    pool={pool}
                    matches={matches}
                    plans={plans}
                    go={go}
                    onDemo={demo}
                    onOpen={openHero}
                    onLoadPlan={openPlan}
                  />
                )}
                {(page === 'heroes' || page === 'pool') && (
                  <Heroes
                    key={page}
                    pool={pool}
                    onPool={updatePool}
                    onOpen={openHero}
                    busy={busy}
                    onlyPool={page === 'pool'}
                  />
                )}
                {page === 'draft' && (
                  <DraftPage
                    active={activeCandidate}
                    setActive={setActiveCandidate}
                    draft={currentDraft}
                    onChange={setDraft}
                    onSave={saveDraft}
                    onSavePlan={savePlan}
                    onDemo={demo}
                    onOpen={openHero}
                    busy={busy}
                    configured={configured}
                  />
                )}
                {page === 'journal' && (
                  <Journal matches={matches} onAdd={addMatch} onCheck={checkMatch} busy={busy} />
                )}
              </>
            )}
          </main>
        </div>
        {hero && (
          <HeroDetail
            statsContext={heroStats}
            key={hero.id}
            hero={hero}
            pool={pool}
            onPool={updatePool}
            busy={busy}
            onClose={() => setHero(null)}
          />
        )}
        {toast && (
          <div
            className={'toast ' + (toast.error ? 'error' : '')}
            role={toast.error ? 'alert' : 'status'}
          >
            {toast.error ? <Info size={17} /> : <Check size={17} />}
            <span>{toast.text}</span>
            <button aria-label="关闭提示" onClick={() => setToast(null)}>
              <X size={15} />
            </button>
          </div>
        )}
        {archive && (
          <Modal title="我的备战档案" onClose={() => setArchive(false)}>
            <p className="dialog-lead">保存过的阵容和备战卡都在这里。打开后，你可以继续调整。</p>
            <div className="plan-list">
              {plans.length ? (
                plans.map((p) => (
                  <button key={p.id} onClick={() => openPlan(p)}>
                    <Portrait hero={heroById(p.heroId)} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{new Date(p.createdAt).toLocaleString('zh-CN')}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))
              ) : (
                <p className="muted">还没有备战卡。在阵容备战中选择候选，点击“保存备战卡”。</p>
              )}
            </div>
          </Modal>
        )}
        {source && (
          <Modal title="这份备战台，依据什么？" onClose={() => setSource(false)} wide>
            <div className="source-block">
              <h3>真实英雄资料</h3>
              <p>
                {dataMeta.count} 位英雄来自腾讯王者荣耀官方公开目录，{dataMeta.skillCount}{' '}
                位有可读取的技能页。资料获取时间：
                {new Date(dataMeta.fetchedAt).toLocaleString('zh-CN')}
                。官网页面未标明统一版本号，不能把获取时间当作游戏更新日期。
              </p>
              <a href={dataMeta.source} target="_blank" rel="noreferrer">
                查看官方目录 <ArrowUpRight size={14} />
              </a>
            </div>
            <div className="source-block">
              <h3>有解释的选人建议</h3>
              <p>
                根据公开定位、项目整理的战术笔记和你填写的熟练度比较候选。当前不提供实时全服胜率或对局胜率预测。阵容能力标签是定性判断，仍需要玩家结合游戏内情况决定。
              </p>
            </div>
            <div className="source-block">
              <h3>你的数据，由你记录</h3>
              <p>
                英雄池、备战卡和对局手记保存在本机。开局账号之间的数据独立保存。没有接入王者游戏账号，教学阵容不计入个人统计。
              </p>
            </div>
            <div className="source-block">
              <h3>AI 解读</h3>
              <p>
                {configured
                  ? '已配置模型服务，可在备战卡中按需生成解读。'
                  : '尚未配置模型服务。阵容建议和全部记录功能可直接使用；AI 入口会明确显示未连接。'}
                备战解读发送当前阵容及英雄资料；录像分析发送你选择的最多 6
                张关键帧及标注。两者都仅在你点击分析时调用。
              </p>
            </div>
            <p className="data-caption">
              开局 NEXT
              为独立参赛作品，与腾讯、王者营地及天元之弈助手无隶属关系。英雄名称与图像版权归其权利人所有。首次体验：英雄图鉴
              → 加入英雄池 → 载入教学阵容 → 比较候选 → 保存备战卡 → 对局手记。
            </p>
          </Modal>
        )}
      </div>
    </ProContext.Provider>
  );
}
