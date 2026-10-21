import QuickSearch from './QuickSearch.tsx';
import { ProContext } from './pro/context.tsx';
import { effectivePool } from './pro/analytics.ts';
import { emptyPro } from './pro/model.ts';
import type { ProData } from './pro/model.ts';
const Leaderboard = lazy(() => import('./pro/Leaderboard.tsx'));
const ProfilePage = lazy(() => import('./pro/Profile.tsx'));
const Social = lazy(() => import('./pro/Social.tsx'));
const Systems = lazy(() => import('./pro/Systems.tsx'));
const Replay = lazy(() => import('./pro/Replay.tsx'));
const ResourceCenter = lazy(() => import('./pro/ResourceCenter.tsx'));
const DataHub = lazy(() => import('./pro/DataHub.tsx'));
import ConnectionStatus from './ConnectionStatus.tsx';
import ShareLink from './ShareLink.tsx';
import { BarChart3, Users, Video, Network, Gauge } from 'lucide-react';
import { useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react';
import { readRoute, routeHash } from './route.ts';
import ScreenBoundary from './ScreenBoundary.tsx';
import {
  Aperture,
  LayoutDashboard,
  BookOpen,
  Swords,
  NotebookPen,
  Heart,
  ArrowUpRight,
  FolderOpen,
  X,
  Check,
  Info,
  Menu,
} from 'lucide-react';
import { api, ApiError } from '../api.ts';
const BackupCenter = lazy(() => import('./pro/BackupCenter.tsx'));
import { heroes, dataMeta, heroById, heroByName } from './catalog.ts';
import { emptyDraft, draftSchema } from './model.ts';
import type { Draft, Hero, Pool, Match, MatchInput, SavedPlan } from './model.ts';
import Dashboard from './Dashboard.tsx';
import type { Page } from './Dashboard.tsx';
import Heroes, { HeroDetail } from './Heroes.tsx';
const DraftPage = lazy(() => import('./Draft.tsx'));
const Journal = lazy(() => import('./Journal.tsx'));
import { Modal, Portrait } from './ui.tsx';
type Workspace = { pool: Pool; draft: Draft; matches: Match[]; plans: SavedPlan[] };
export default function App() {
  const initialRoute = useRef(readRoute(location.hash));
  const [pro, setPro] = useState<ProData>(emptyPro);
  const [publicSharing, setPublicSharing] = useState(false);
  const [profileHero, setProfileHero] = useState<number>();
  const [backupOpen, setBackupOpen] = useState(false),
    [expired, setExpired] = useState(false),
    [identity, setIdentity] = useState('访客');
  const refreshPro = async () => setPro(await api<ProData>('/pro'));
  const draftKey =
    'kaiju-draft-v1' +
    (localStorage.getItem('kaiju-user') ? ':' + localStorage.getItem('kaiju-user') : '');
  const [page, setPage] = useState<Page>(initialRoute.current.page),
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
    [hero, setHeroState] = useState<Hero | null>(heroById(initialRoute.current.heroId) ?? null),
    [source, setSource] = useState(false),
    [archive, setArchive] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobileScreen, setMobileScreen] = useState(
    () => window.matchMedia('(max-width: 760px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const change = () => setMobileScreen(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const [dataTool, setDataTool] = useState<string | undefined>(initialRoute.current.tool);
  const activeRoute = useRef(initialRoute.current);
  const writeRoute = (next: ReturnType<typeof readRoute>) => {
    const hash = routeHash(next);
    if (location.hash !== hash) history.pushState(null, '', hash);
    activeRoute.current = next;
  };
  const setHero = (value: Hero | null) => {
    setHeroState(value);
    writeRoute({ ...activeRoute.current, heroId: value?.id });
  };
  useEffect(() => {
    const sync = () => {
      const next = readRoute(location.hash);
      if (
        next.page !== activeRoute.current.page &&
        !window.dispatchEvent(new Event('kaiju-before-navigate', { cancelable: true }))
      ) {
        history.pushState(null, '', routeHash(activeRoute.current));
        return;
      }
      activeRoute.current = next;
      setPage(next.page);
      setDataTool(next.tool);
      setHeroState(heroById(next.heroId) ?? null);
      setHeroStats(undefined);
      setMobileMenu(false);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const load = async () => {
    try {
      const [workspace, status, proData] = await Promise.all([
        api<Workspace>('/workspace'),
        api<{ modelConfigured: boolean; publicSharing?: boolean; identity?: { name: string } }>(
          '/status',
        ),
        api<ProData>('/pro'),
      ]);
      setPool(workspace.pool);
      setPro(proData);
      setMatches(workspace.matches);
      setPlans(workspace.plans);
      setConfigured(status.modelConfigured);
      setPublicSharing(Boolean(status.publicSharing));
      setIdentity(status.identity?.name ?? '访客');
      setExpired(false);
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
      const invalid = e instanceof ApiError && e.status === 401;
      setExpired(invalid);
      setToast({
        text: invalid
          ? '登录已过期，个人资料仍在。请退出失效登录后重新登录原账号。'
          : '无法连接服务。请检查网络；若使用分享网址，请确认分享电脑仍在线，再点击重试。',
        error: true,
      });
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
  const registeredPool = useMemo(() => effectivePool(pool, pro.profile), [pool, pro.profile]);
  const go = (p: Page, tool?: string) => {
    if (
      p !== page &&
      !window.dispatchEvent(new Event('kaiju-before-navigate', { cancelable: true }))
    )
      return;
    writeRoute({ page: p, tool });
    setHeroState(null);
    setPage(p);
    setMobileMenu(false);
    setDataTool(tool);
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
    if (poolSaving.current) return;
    const ids = new Set([...pool, ...next].map((p) => p.heroId));
    const changes = [...ids]
      .map((heroId) => ({
        heroId,
        expected: pool.find((p) => p.heroId === heroId)?.level ?? null,
        level: next.find((p) => p.heroId === heroId)?.level ?? null,
      }))
      .filter((c) => c.expected !== c.level);
    if (!changes.length) return;
    poolSaving.current = true;
    void mutate(
      async () => setPool(await api<Pool>('/pool-edit', { changes })),
      publicSharing ? '英雄池已保存到当前账号' : '英雄池已写入本机数据库',
    )
      .catch(async () => {
        try {
          setPool((await api<Workspace>('/workspace')).pool);
        } catch {}
      })
      .finally(() => {
        poolSaving.current = false;
      });
  };
  const poolSaving = useRef(false);
  const editRecord = (id?: number) => {
    setProfileHero(id);
    setHero(null);
    go('profile');
  };
  const saveDraft = () => {
    void mutate(
      async () => {
        await api('/draft', currentDraft);
      },
      publicSharing ? '阵容已保存到当前账号' : '阵容已保存到本机',
    ).catch(() => {});
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
        id ? { id, match: input, expected: matches.find((m) => m.id === id) } : input,
      );
      setMatches((rows) => (id ? rows.map((m) => (m.id === id ? saved : m)) : [saved, ...rows]));
    }, '对局手记已保存，下一局目标已更新');
  };
  const checkMatch = (m: Match, done: boolean) => {
    void mutate(async () => {
      const saved = await api<Match>('/match-check', { id: m.id, done, expected: m });
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
    { id: 'resources' as Page, label: '装备与版本', icon: BookOpen },
    { id: 'datahub' as Page, label: '数据与工具', icon: BarChart3 },
    { id: 'draft' as Page, label: '阵容备战', icon: Swords },
    { id: 'journal' as Page, label: '对局手记', icon: NotebookPen },
    { id: 'pool' as Page, label: '我的英雄池', icon: Heart },
    { id: 'profile' as Page, label: '玩家档案', icon: Gauge },
    { id: 'systems' as Page, label: '体系练习', icon: Network },
    { id: 'replay' as Page, label: '录像复盘', icon: Video },
    { id: 'social' as Page, label: '好友与组队', icon: Users },
  ];
  return (
    <ProContext.Provider value={{ data: pro, refresh: refreshPro, configured, publicSharing }}>
      <div className="app">
        <aside
          className={'sidebar ' + (mobileMenu ? 'mobile-open' : '')}
          inert={mobileScreen && !mobileMenu}
        >
          <button className="brand" onClick={() => go('home')} aria-label="自在弈境首页">
            <span className="brand-symbol">
              <Aperture size={29} />
            </span>
            <strong>
              自在弈境 <span>数据站 · ZIZAI</span>
            </strong>
          </button>
          <p className="brand-caption">懂你的英雄池，从容应对每一局</p>
          <div className="nav-label">
            我的工作台 <span>PLAYBOOK</span>
          </div>
          <nav aria-label="主导航">
            {nav.map((n) => (
              <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)}>
                <n.icon size={19} />
                <span>{n.label}</span>
                {n.id === 'pool' && registeredPool.length > 0 ? (
                  <small>{registeredPool.length}</small>
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
              {ready ? (publicSharing ? '分享服务已连接' : '本地工作台已连接') : '正在连接服务'}
              <small>v0.26</small>
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
              <QuickSearch onHero={openHero} onTask={(t) => go(t.page, t.tool)} />
              <button
                aria-label="备战档案"
                className="archive-button"
                onClick={() => setArchive(true)}
              >
                <FolderOpen size={17} />
                <span>备战档案</span>
              </button>
              <button
                aria-label="备份与恢复"
                className="archive-button"
                onClick={() => setBackupOpen(true)}
              >
                <FolderOpen size={17} />
                <span>备份与恢复</span>
              </button>
              <button
                className="avatar"
                title={identity}
                aria-label={'当前身份：' + identity}
                onClick={() => go('social')}
              >
                {[...identity][0]}
              </button>
            </div>
          </header>
          <main>
            <ConnectionStatus
              publicSharing={publicSharing}
              onReconnect={() => {
                if (!ready && !expired) void load();
              }}
            />
            {publicSharing && ready && (
              <div className="pro-notice" role="status">
                分享体验版 · 可以直接查资料和练习
                BP。保存英雄池、档案与复盘需要登录，账号数据彼此独立。
                <button className="text-btn" onClick={() => go('social')}>
                  注册 / 登录与好友
                </button>
                <ShareLink />
                {location.hostname.endsWith('.trycloudflare.com') && (
                  <p className="muted">
                    临时分享地址，需要分享者的电脑保持在线；地址变更后请重新获取链接。
                  </p>
                )}
              </div>
            )}
            {!ready ? (
              <div className="loading-state">
                <Aperture size={30} />
                <h1>{expired ? '登录已过期' : '准备你的备战台'}</h1>
                <p>
                  {expired
                    ? '账号资料仍保存在服务端。退出失效登录后，可到好友与组队重新登录原账号。'
                    : '英雄资料与个人记录正在就位。'}
                </p>
                {expired ? (
                  <button
                    className="btn primary"
                    onClick={() => {
                      localStorage.removeItem('kaiju-token');
                      localStorage.removeItem('kaiju-user');
                      location.reload();
                    }}
                  >
                    退出失效登录，进入访客
                  </button>
                ) : (
                  <button className="btn secondary" onClick={load}>
                    重试连接
                  </button>
                )}
              </div>
            ) : (
              <ScreenBoundary key={page + ':' + (dataTool ?? '')}>
                <Suspense
                  fallback={
                    <div className="page-loading" role="status">
                      正在载入页面…
                    </div>
                  }
                >
                  {page === 'tier' && <Leaderboard onOpen={openHero} />}
                  {page === 'resources' && <ResourceCenter onOpen={openHero} />}
                  {page === 'datahub' && (
                    <DataHub
                      key={dataTool ?? 'default'}
                      initialTab={dataTool}
                      onTab={(tool) => {
                        setDataTool(tool);
                        writeRoute({ page: 'datahub', tool });
                      }}
                      onOpen={openHero}
                      draft={currentDraft}
                    />
                  )}
                  {page === 'profile' && <ProfilePage focusHeroId={profileHero} />}
                  {page === 'social' && <Social />}
                  {page === 'replay' && <Replay />}
                  {page === 'systems' && (
                    <Systems
                      pool={registeredPool}
                      onLoad={(d) => {
                        setDraft(d);
                        go('draft');
                        setToast({ text: '体系核心英雄已带入，补齐剩余位置继续备战。' });
                      }}
                    />
                  )}
                  {page === 'home' && (
                    <Dashboard
                      pool={registeredPool}
                      matches={matches}
                      plans={plans}
                      go={go}
                      onDemo={demo}
                      onOpen={openHero}
                      onTool={(tool) => go('datahub', tool)}
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
                      onSavedPool={setPool}
                      onEditRecord={editRecord}
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
                </Suspense>
              </ScreenBoundary>
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
            onEditRecord={editRecord}
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
        {backupOpen && (
          <Modal title="个人资料备份与恢复" wide onClose={() => setBackupOpen(false)}>
            <Suspense fallback={<p role="status">正在载入备份工具…</p>}>
              <BackupCenter
                onRestored={() => {
                  localStorage.removeItem(draftKey);
                  sessionStorage.removeItem(
                    'kaiju-profile-draft:' + (localStorage.getItem('kaiju-user') ?? 'guest'),
                  );
                  location.reload();
                }}
              />
            </Suspense>
          </Modal>
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
              <h3>自在之心，弈有依据</h3>
              <p>
                “自在”取自赵怀真的称号“自在之心”；“弈境”代表由你掌握的阵容与对局选择。本站服务所有英雄玩家，不隶属于游戏官方。
              </p>
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
                {publicSharing
                  ? '英雄池、备战卡和对局手记保存在分享服务的账号中。'
                  : '英雄池、备战卡和对局手记保存在本机。'}
                自在弈境账号之间的数据独立保存。没有接入王者游戏账号，教学阵容不计入个人统计。
              </p>
            </div>
            <div className="source-block">
              <h3>AI 解读</h3>
              <p>
                {configured
                  ? '已配置模型服务，可在备战卡中按需生成解读。'
                  : '教练博弈、个人推荐和体系适配使用本地算法，可直接使用。大模型解读与视觉分析尚未配置，相关入口会显示未连接。'}
                备战解读发送当前阵容及英雄资料；录像分析发送你选择的最多 6
                张关键帧及标注。两者都仅在你点击分析时调用。
              </p>
            </div>
            <p className="data-caption">
              自在弈境
              为独立参赛作品，与腾讯、王者营地及天元之弈助手无隶属关系。英雄名称与图像版权归其权利人所有。首次体验：英雄图鉴
              → 加入英雄池 → 载入教学阵容 → 比较候选 → 保存备战卡 → 对局手记。
            </p>
          </Modal>
        )}
      </div>
    </ProContext.Provider>
  );
}
