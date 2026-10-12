import { useEffect, useState } from 'react';
import { UserPlus, LogIn, LogOut, Copy, Users } from 'lucide-react';
import { api } from '../../api.ts';
import { Portrait } from '../ui.tsx';
import { heroById } from '../catalog.ts';
import { mastery } from './analytics.ts';
import type { Profile } from './model.ts';
import type { Pool } from '../model.ts';
type User = { id: string; name: string; username: string; code: string };
export type Friend = {
  id: string;
  status: string;
  incoming: boolean;
  user: User;
  shared: boolean;
  pool: Pool;
  profile: Profile | null;
};
export type SocialData = { user: User | null; friends: Friend[] };
export default function Social() {
  const [state, setState] = useState<SocialData>({ user: null, friends: [] }),
    [register, setRegister] = useState(true),
    [username, setUsername] = useState(''),
    [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = async () => setState(await api<SocialData>('/social'));
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const auth = () =>
    run(async () => {
      const d = await api<{ user: User; token: string }>(
        register ? '/auth/register' : '/auth/login',
        { username, password, ...(register ? { name: name || username } : {}) },
      );
      localStorage.setItem('kaiju-token', d.token);
      localStorage.setItem('kaiju-user', d.user.id);
      location.reload();
    });
  const logout = () =>
    run(async () => {
      await api('/auth/logout', {});
      localStorage.removeItem('kaiju-token');
      localStorage.removeItem('kaiju-user');
      location.reload();
    });
  const action = (path: string, body: unknown) =>
    run(async () => {
      await api(path, body);
      await refresh();
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SQUAD / PLAY BETTER TOGETHER</p>
          <h1>了解队友真正会什么。</h1>
          <p>双方确认成为好友后，按各自设置分享英雄池与准备度。</p>
        </div>
        {state.user && (
          <button className="btn secondary" disabled={busy} onClick={logout}>
            <LogOut size={16} />
            退出开局账号
          </button>
        )}
      </div>
      <div className="pro-notice">
        这是开局 NEXT
        的账号体系，与王者账号独立。当前服务只在本机运行；可以在同一服务的不同浏览器登录验证好友流程，跨设备好友需要部署同一实例后使用。
      </div>
      {!state.user ? (
        <section className="surface auth-card">
          <h2>{register ? '创建开局账号' : '登录开局账号'}</h2>
          <p className="muted">
            每个账号的英雄池、档案和复盘独立保存。原来的本机访客数据仍保留在访客工作台。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              auth();
            }}
          >
            <label>
              用户名
              <input
                autoComplete="username"
                value={username}
                placeholder="3–24 位英文、数字、下划线"
                pattern="[a-zA-Z0-9_]{3,24}"
                required
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            {register && (
              <label>
                玩家昵称
                <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            <label>
              开局账号密码
              <input
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={72}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn primary" disabled={busy}>
              <LogIn size={16} />
              {register ? '创建并登录' : '登录'}
            </button>
            <button type="button" className="text-btn" onClick={() => setRegister(!register)}>
              {register ? '已有账号，去登录' : '创建新账号'}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="surface social-identity">
            <div>
              <p className="eyebrow">YOUR SQUAD ID</p>
              <h2>{state.user.name}</h2>
              <p>
                我的好友码：<strong className="gold">{state.user.code}</strong>
              </p>
            </div>
            <button
              className="btn secondary"
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(state.user!.code);
                  setMessage('好友码已复制');
                })
              }
            >
              <Copy size={16} />
              复制好友码
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action('/social/request', { code });
              }}
            >
              <label>
                对方好友码
                <input
                  aria-label="对方好友码"
                  value={code}
                  pattern="[a-fA-F0-9]{10}"
                  required
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
              <button className="btn primary" disabled={busy}>
                <UserPlus size={16} />
                发送好友申请
              </button>
            </form>
          </section>
          <div className="social-grid">
            {state.friends.map((f) => (
              <article key={f.id} className="surface">
                <div className="section-title">
                  <h3>
                    <Users size={18} /> {f.user.name}
                  </h3>
                  <span>
                    {f.status === 'accepted'
                      ? '已成为好友'
                      : f.incoming
                        ? '待你确认'
                        : '等待对方确认'}
                  </span>
                </div>
                {f.status === 'pending' && f.incoming ? (
                  <div className="pro-actions">
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() => action('/social/respond', { id: f.id, accept: true })}
                    >
                      接受申请
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => action('/social/respond', { id: f.id, accept: false })}
                    >
                      拒绝
                    </button>
                  </div>
                ) : f.status === 'accepted' ? (
                  <>
                    {f.shared ? (
                      <>
                        <p className="muted">
                          巅峰分 {f.profile?.peakScore} · {f.profile?.season || '未注明赛季'}
                        </p>
                        <div className="friend-pool">
                          {f.pool.map((p) => (
                            <div className="hero-row" key={p.heroId}>
                              <Portrait hero={heroById(p.heroId)} />
                              <div>
                                <strong>{heroById(p.heroId)?.name}</strong>
                                <small>准备度 {mastery(p.heroId, f.pool, f.profile!).score}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                        {!f.pool.length && <p className="muted">好友还没有设置英雄池。</p>}
                        <p className="data-caption">
                          可在阵容备战中选择此好友，按对方英雄池与记录计算候选。
                        </p>
                      </>
                    ) : (
                      <p className="muted">
                        对方尚未开启英雄池共享。可在“玩家档案”中由对方自主开启。
                      </p>
                    )}
                  </>
                ) : null}
                <button
                  className="text-btn"
                  disabled={busy}
                  onClick={() => action('/social/remove', { id: f.id })}
                >
                  {f.status === 'accepted' ? '解除好友关系' : '撤回 / 移除申请'}
                </button>
              </article>
            ))}
          </div>
          {!state.friends.length && (
            <div className="empty">
              <h3>用好友码找到你的队友</h3>
              <p>好友必须主动接受，开启共享后你才能查看对方英雄池。</p>
            </div>
          )}
        </>
      )}
      {message && (
        <p className="pro-notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
