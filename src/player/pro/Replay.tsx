import { useEffect, useRef, useState } from 'react';
import { Camera, Save, Download, Sparkles, Play, Trash2 } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { usePro } from './context.tsx';
import { reviewSchema } from './model.ts';
import type { ReviewEvent, Review } from './model.ts';
import { reviewFindings } from './analytics.ts';
import { api, download } from '../../api.ts';
const fmt = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
type ModelResult = {
  findings: { eventId: string; observation: string; advice: string; uncertainty: string }[];
  model: string;
  scope: string;
};
export default function Replay() {
  const { data, refresh, configured } = usePro();
  const video = useRef<HTMLVideoElement>(null);
  const [savedId, setSavedId] = useState<string>();
  const [url, setUrl] = useState(''),
    [videoName, setVideoName] = useState(''),
    [title, setTitle] = useState('我的对局复盘'),
    [heroId, setHeroId] = useState(131),
    [events, setEvents] = useState<ReviewEvent[]>([]),
    [active, setActive] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<ModelResult | null>(null);
  const current = events.find((e) => e.id === active);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    epoch.current++;
    setResult(null);
  }, [events, heroId]);
  const change = (key: string, value: unknown) =>
    setEvents((es) => es.map((e) => (e.id === active ? { ...e, [key]: value } : e)));
  const add = (frame?: string) => {
    if (events.length >= 30) {
      setMessage('每份复盘最多保留 30 个关键点');
      return;
    }
    const e: ReviewEvent = {
      id: crypto.randomUUID(),
      second: video.current?.currentTime ?? 0,
      label: '关键决策 ' + (events.length + 1),
      observation: '',
      decision: '',
      allies: null,
      enemies: null,
      allyGold: null,
      enemyGold: null,
      objectiveIn: null,
      ultimateReady: null,
      ...(frame ? { frame } : {}),
    };
    setEvents([...events, e]);
    setActive(e.id);
    setMessage('先写下这一刻实际看见了什么，再分析选择。');
  };
  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth) {
      setMessage('请先打开可播放的视频并定位到一个时间点');
      return;
    }
    if (v.seeking || v.readyState < 2 || v.getVideoPlaybackQuality().totalVideoFrames === 0) {
      setMessage('请先播放到画面出现，再暂停并截取；定位过程中请等待画面稳定。');
      return;
    }
    try {
      const c = document.createElement('canvas'),
        scale = Math.min(1, 960 / v.videoWidth);
      c.width = v.videoWidth * scale;
      c.height = v.videoHeight * scale;
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      add(c.toDataURL('image/jpeg', 0.65));
    } catch {
      setMessage('当前视频无法截取画面，请换一个本地可播放文件');
    }
  };
  const payload = () => {
    const missing = events.find((e) => !e.observation.trim());
    if (missing) throw new Error('请先为「' + missing.label + '」填写实际观察，再保存或分析');
    return reviewSchema.parse({ title, heroId, videoName, events });
  };
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const saved = await api<Review>('/pro/review', {
        ...payload(),
        ...(savedId ? { id: savedId } : {}),
      });
      setSavedId(saved.id);
      await refresh();
      setMessage('复盘与关键帧已保存到当前账号');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const analyze = async () => {
    setMessage('');
    const version = ++epoch.current;
    setBusy(true);
    try {
      const r = await api<ModelResult>('/pro/review-analyze', payload());
      if (epoch.current === version) setResult(r);
    } catch (e) {
      if (epoch.current === version) setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reopen = async (id: string) => {
    setMessage('');
    try {
      const r = await api<Review>('/pro/review-get', { id });
      setSavedId(r.id);
      setTitle(r.title);
      setHeroId(r.heroId);
      setVideoName(r.videoName);
      setEvents(r.events);
      setActive(r.events[0]?.id ?? '');
      setUrl('');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPLAY ROOM / EVIDENCE BEFORE JUDGMENT</p>
          <h1>回到那一刻，再判断该怎么打。</h1>
          <p>查看真实画面，标出当时已知的信息，对比可执行的选择。</p>
        </div>
        <button className="btn primary" disabled={busy || !events.length} onClick={save}>
          <Save size={16} />
          保存这份复盘
        </button>
      </div>
      <div className="pro-actions">
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setSavedId(undefined);
            setUrl('');
            setVideoName('');
            setTitle('我的对局复盘');
            setEvents([]);
            setActive('');
            setMessage('已打开空白复盘；请先保存需要保留的改动。');
          }}
        >
          新建复盘
        </button>
        {savedId && <span className="muted">正在编辑已保存记录，再次保存会更新同一份复盘。</span>}
      </div>
      <div className="pro-toolbar">
        <label>
          复盘标题
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          我的英雄
          <select
            aria-label="复盘英雄"
            value={heroId}
            onChange={(e) => setHeroId(Number(e.target.value))}
          >
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="btn secondary">
          打开本地录像
          <input
            aria-label="打开对局录像"
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (events.length && videoName && videoName !== f.name) {
                  setMessage('当前关键帧属于 ' + videoName + '。分析另一局前请先保存并新建复盘。');
                  e.target.value = '';
                  return;
                }
                setUrl(URL.createObjectURL(f));
                setVideoName(f.name);
              }
            }}
          />
        </label>
        <button className="text-btn" onClick={() => add()}>
          添加无截图时间点
        </button>
      </div>
      <div className="replay-layout">
        <section className="surface video-panel">
          {url ? (
            <video
              ref={video}
              controls
              src={url}
              onError={() => setMessage('浏览器不能解码此视频，请使用 H.264 MP4 或兼容的 WebM。')}
            />
          ) : (
            <div className="video-empty">
              <Play size={38} />
              <h3>打开你的真实对局录像</h3>
              <p>
                {videoName
                  ? '原视频：' + videoName + '。请重新选择原文件继续定位。'
                  : '原视频留在本机，保存的只是你选中的关键帧与笔记。'}
              </p>
            </div>
          )}
          <div className="pro-actions">
            <button className="btn secondary" onClick={capture}>
              <Camera size={16} />
              截取当前决策点
            </button>
            <button
              className="btn secondary"
              disabled={busy || !events.some((e) => e.frame)}
              onClick={analyze}
            >
              <Sparkles size={16} />
              {busy ? '处理中…' : configured ? 'AI 分析所选关键帧' : 'AI 关键帧分析 · 未连接'}
            </button>
          </div>
          <p className="data-caption">
            可选视觉模型最多分析前 6
            个带截图的时间点，仅点击分析时发送截图和标注。关键帧分析不等于已经理解完整录像，也不能推断战争迷雾内的信息。
          </p>
        </section>
        <aside className="surface replay-list">
          <h3>决策时间线 · {events.length}</h3>
          {events.map((e) => (
            <button
              className={active === e.id ? 'active' : ''}
              key={e.id}
              onClick={() => {
                setActive(e.id);
                if (video.current) video.current.currentTime = e.second;
              }}
            >
              <b>{fmt(e.second)}</b>
              <span>{e.label}</span>
            </button>
          ))}
          {!events.length && (
            <p className="muted">在行动前后各选一个时间点，更容易看清决策条件。</p>
          )}
        </aside>
      </div>
      {message && (
        <p className="pro-notice" role="status">
          {message}
        </p>
      )}
      {current && (
        <section className="surface event-editor">
          <div className="section-title">
            <h2>
              {fmt(current.second)} · {current.label}
            </h2>
            <button
              className="icon-btn"
              aria-label="删除当前时间点"
              onClick={() => {
                setEvents(events.filter((e) => e.id !== active));
                setActive('');
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="event-grid">
            {current.frame && (
              <img
                className="review-frame"
                src={current.frame}
                alt={'录像在 ' + fmt(current.second) + ' 的实际画面'}
              />
            )}
            <div>
              <div className="pro-form">
                <label>
                  时间（秒）
                  <input
                    type="number"
                    min={0}
                    max={14400}
                    value={current.second}
                    onChange={(e) => change('second', Number(e.target.value))}
                  />
                </label>
                <label>
                  决策名称
                  <input
                    value={current.label}
                    maxLength={80}
                    onChange={(e) => change('label', e.target.value)}
                  />
                </label>
              </div>
              <label className="field">
                这一刻实际看到的情况
                <textarea
                  aria-label="实际观察"
                  rows={3}
                  maxLength={1200}
                  value={current.observation}
                  onChange={(e) => change('observation', e.target.value)}
                  placeholder="例如：队友刚回城，画面可见敌方三人在河道；我准备向河道走。"
                />
              </label>
              <label className="field">
                当时选择 / 你想比较的做法
                <textarea
                  value={current.decision}
                  maxLength={600}
                  onChange={(e) => change('decision', e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="pro-form">
            {[
              ['allies', '附近我方人数'],
              ['enemies', '附近敌方人数'],
              ['allyGold', '我方总经济'],
              ['enemyGold', '敌方总经济'],
              ['objectiveIn', '资源刷新倒计时（秒）'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  type="number"
                  min={0}
                  placeholder="未知请留空"
                  value={(current[key as keyof ReviewEvent] as number) ?? ''}
                  onChange={(e) =>
                    change(key, e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </label>
            ))}
            <label>
              我的大招
              <select
                value={current.ultimateReady === null ? 'unknown' : String(current.ultimateReady)}
                onChange={(e) =>
                  change(
                    'ultimateReady',
                    e.target.value === 'unknown' ? null : e.target.value === 'true',
                  )
                }
              >
                <option value="unknown">未知</option>
                <option value="true">可用</option>
                <option value="false">未就绪</option>
              </select>
            </label>
          </div>
          <h3>根据这些证据，值得回看的地方</h3>
          <div className="finding-grid">
            {reviewFindings(current).map((f) => (
              <article key={f.title}>
                <h4>{f.title}</h4>
                <p>
                  <strong>依据：</strong>
                  {f.evidence}
                </p>
                <p>{f.advice}</p>
                <small>{f.confidence}</small>
              </article>
            ))}
          </div>
        </section>
      )}
      {result && (
        <section className="surface pro-prose">
          <h2>AI 对所选画面的分析</h2>
          <p className="data-caption">
            {result.scope} · {result.model}
          </p>
          {result.findings.map((f, i) => (
            <article key={i}>
              <h3>{fmt(events.find((e) => e.id === f.eventId)?.second ?? 0)} 的决策</h3>
              <p>{f.observation}</p>
              <p>{f.advice}</p>
              <small>{f.uncertainty}</small>
            </article>
          ))}
        </section>
      )}
      <div className="pro-actions">
        <button
          className="btn secondary"
          disabled={!events.length}
          onClick={() =>
            download(
              '开局-证据复盘.json',
              JSON.stringify(
                {
                  title,
                  heroId,
                  videoName,
                  events,
                  analysis: result,
                  scope: '带证据的局部复盘；非完整录像自动理解',
                },
                null,
                2,
              ),
            )
          }
        >
          <Download size={16} />
          导出复盘证据
        </button>
      </div>
      <section className="surface">
        <h3>已保存的复盘</h3>
        <div className="saved-reviews">
          {data.reviews.map((r) => (
            <button key={r.id} onClick={() => reopen(r.id)}>
              <strong>{r.title}</strong>
              <span>
                {heroById(r.heroId)?.name} · {r.events.length} 个时间点 ·{' '}
                {new Date(r.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </button>
          ))}
        </div>
        {!data.reviews.length && (
          <p className="muted">保存后可从这里重新打开，截图和观察不会丢失。</p>
        )}
      </section>
    </>
  );
}
