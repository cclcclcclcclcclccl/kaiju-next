import { reviewMode } from '../reviewMode.ts';
import { useEffect, useRef, useState } from 'react';
import { Camera, Save, Download, Sparkles, Play, Trash2 } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { usePro } from './context.tsx';
import { reviewSchema } from './model.ts';
import type { ReviewEvent, Review } from './model.ts';
import { reviewFindings } from './analytics.ts';
import { api, download } from '../../api.ts';
import { reviewEvidence } from './reviewEvidence.ts';
import type { ReviewHandoff, CodexReview } from './codexReview.ts';
import { REVIEW_DIMENSIONS } from './reviewProtocol.ts';
import KplCases from './KplCases.tsx';
import TeachingLibrary from './TeachingLibrary.tsx';
const fmt = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
type ModelResult = {
  findings: { eventId: string; observation: string; advice: string; uncertainty: string }[];
  model: string;
  scope: string;
};
export default function Replay() {
  const { data, refresh, configured, publicSharing } = usePro();
  const video = useRef<HTMLVideoElement>(null);
  const [savedId, setSavedId] = useState<string>();
  const [savedRevision, setSavedRevision] = useState<string | null>(null);
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
  const evidence = reviewEvidence(events);
  const [assessment, setAssessment] = useState('未核对');
  const [correction, setCorrection] = useState('');
  const [handoff, setHandoff] = useState<ReviewHandoff | null>(null);
  const [codexResult, setCodexResult] = useState<CodexReview | null>(null);
  const epoch = useRef(0);
  const [savedContent, setSavedContent] = useState('');
  const content = JSON.stringify({ title, heroId, videoName, events });
  const dirty = Boolean(savedId || events.length > 0) && content !== savedContent;
  const allowDiscard = () =>
    !dirty || window.confirm('这份复盘有未保存修改。请先保存或导出；确定要放弃修改吗？');
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: Event) => {
      if (!window.confirm('这份复盘有未保存修改。离开前请保存或导出，确定离开吗？'))
        event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('kaiju-before-navigate', navigate);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('kaiju-before-navigate', navigate);
    };
  }, [dirty]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    epoch.current++;
    setResult(null);
    setAssessment('未核对');
    setCorrection('');
    setHandoff(null);
    setCodexResult(null);
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
      const saved = await api<Review & { revision: string }>('/pro/review-save', {
        review: payload(),
        expectedRevision: savedRevision,
        ...(savedId ? { id: savedId } : {}),
      });
      setSavedId(saved.id);
      setSavedRevision(saved.revision);
      setSavedContent(content);
      await refresh();
      setMessage(reviewMode ? '复盘与关键帧已保存到当前浏览器' : '复盘与关键帧已保存到当前账号');
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
  const prepareCodex = async () => {
    const version = ++epoch.current;
    setBusy(true);
    setMessage('');
    try {
      const prepared = await api<ReviewHandoff>(
        '/pro/review-handoff',
        reviewSchema.parse({
          title,
          heroId,
          videoName,
          events: events.map((e) => ({
            ...e,
            observation: e.observation.trim() || '（用户未填写观察，请只依据实际画面判断）',
          })),
        }),
      );
      if (epoch.current === version) {
        setHandoff(prepared);
        setCodexResult(null);
        setMessage('复盘包已写入本机。把下方指令发到当前 Codex 对话，分析完成后点击读取结果。');
      }
    } catch (e) {
      if (epoch.current === version) setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const readCodex = async () => {
    if (!handoff) return;
    const version = ++epoch.current;
    setBusy(true);
    setMessage('');
    try {
      const output = await api<{ state: 'pending' | 'complete'; result?: CodexReview }>(
        '/pro/review-handoff-result',
        { id: handoff.id },
      );
      if (epoch.current === version) {
        if (output.state === 'complete' && output.result) {
          setCodexResult(output.result);
          setMessage('已读取当前 Codex 对话的复盘结果，输入指纹与图像引用核对通过。');
        } else setMessage('当前对话尚未写入 result.json。请先把复盘指令发送到这里并完成分析。');
      }
    } catch (e) {
      if (epoch.current === version) setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reopen = async (id: string) => {
    if (!allowDiscard()) return;
    setMessage('');
    setBusy(true);
    try {
      const r = await api<Review & { revision: string }>('/pro/review-get', { id });
      setSavedId(r.id);
      setSavedRevision(r.revision);
      setTitle(r.title);
      setHeroId(r.heroId);
      setVideoName(r.videoName);
      setEvents(r.events);
      setSavedContent(
        JSON.stringify({
          title: r.title,
          heroId: r.heroId,
          videoName: r.videoName,
          events: r.events,
        }),
      );
      setActive(r.events[0]?.id ?? '');
      setUrl('');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="profile-workspace" disabled={busy} aria-label="复盘编辑区">
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
      <section className="surface replay-readiness" aria-label="复盘模型与证据状态">
        <h2>{reviewMode || publicSharing ? '准备你的录像复盘证据' : '交给当前 Codex 对话复盘'}</h2>
        <p>
          {reviewMode
            ? '可选择本地录像、截取画面、填写观察、保存与导出复盘证据。此在线入口未部署自动视觉模型，不能在网页调用作者的 Codex。'
            : publicSharing
              ? '可在浏览器选择录像、截取关键帧并记录观察，登录后保存到个人账号，也可以导出复盘证据。分享版不开放站长电脑上的 Codex 文件操作。'
              : '在这里准备真实画面，在当前聊天中让我逐帧分析，然后读取结果。不需要为这条流程另外配置模型密钥，也不会从网页自动发送聊天消息。'}
        </p>
        <p className="data-caption">
          {configured ? '另已配置可选视觉接口，实战能力待验证。' : '网页自动视觉接口尚未连接。'}
          当前对话分析不等于经过王者荣耀专项训练或职业级评测。
        </p>
        <div className="metric-strip">
          <div>
            <strong>{evidence.frames}</strong>
            <span>实际关键帧</span>
          </div>
          <div>
            <strong>{evidence.notes}</strong>
            <span>已填写观察</span>
          </div>
          <div>
            <strong>{evidence.unknownFields}</strong>
            <span>未知条件</span>
          </div>
        </div>
        {evidence.issues.map((issue) => (
          <p className="data-caption" key={issue}>
            {issue}
          </p>
        ))}
        <div className="pro-actions">
          <button
            className="btn primary"
            disabled={reviewMode || publicSharing || busy || !evidence.frames}
            onClick={prepareCodex}
          >
            准备当前对话复盘包
          </button>
          {handoff && (
            <button className="btn secondary" disabled={busy} onClick={readCodex}>
              读取 Codex 复盘结果
            </button>
          )}
        </div>
        {handoff && (
          <div className="codex-handoff">
            <p>
              已整理 {handoff.frames} 张真实截图。本机目录：<code>{handoff.directory}</code>
            </p>
            <label className="field">
              发给当前对话的指令
              <textarea aria-label="当前对话复盘指令" readOnly rows={5} value={handoff.prompt} />
            </label>
            <button
              className="text-btn"
              onClick={() =>
                void navigator.clipboard
                  .writeText(handoff.prompt)
                  .then(() => setMessage('复盘指令已复制，请粘贴到当前 Codex 对话。'))
                  .catch(() => setMessage('未能自动复制，请选中上方文字手动复制。'))
              }
            >
              复制复盘指令
            </button>
            <p className="data-caption">
              准备复盘包只写本机文件。需要你在聊天中发起分析；材料修改后需重新准备。文件保留在本机，页面切换后可通过已复制的路径找回。
            </p>
          </div>
        )}
        <details className="environment-method">
          <summary>复盘分析流程与真实训练状态</summary>
          <p>
            当前对话复盘包已按决策时间拆分材料，包含画面取证、战术比较、反证复核三轮协议。每个决策包只列出当时及之前的证据。流程改进不等于模型训练；当前没有完成专项训练或
            KPL 级效果验证。
          </p>
          <ul>
            {REVIEW_DIMENSIONS.map(([title, body]) => (
              <li key={title}>
                <strong>{title}：</strong>
                {body}
              </li>
            ))}
          </ul>
          <p>
            真实能力需要用经过人工校正的对局决策样本评测，分别检查可见事实、隐藏信息误判、建议可执行性和证据支持。校正样本需划分训练与独立测试集；重复运行同一批示例不代表训练有效。
          </p>
        </details>
      </section>
      <KplCases />
      <TeachingLibrary key={heroId} hero={heroById(heroId)} compact />
      <div className="pro-actions">
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            if (!allowDiscard()) return;
            setSavedId(undefined);
            setSavedRevision(null);
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
      <details className="surface review-evaluation">
        <summary>留下可复核的纠错样本 · 展开填写</summary>
        <p className="data-caption">
          把实际画面、原分析与你的校正一起导出，供后续人工评测。此处只生成本地文件，不会训练模型；校正文字需导出后保存。
        </p>
        <label className="field">
          人工核对结果
          <select
            aria-label="复盘人工核对"
            value={assessment}
            onChange={(e) => setAssessment(e.target.value)}
          >
            <option>未核对</option>
            <option>建议有证据支持</option>
            <option>建议存在错误</option>
            <option>证据不足，无法判断</option>
          </select>
        </label>
        <label className="field">
          具体错误或正确依据
          <textarea
            aria-label="复盘校正依据"
            value={correction}
            maxLength={2000}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="指出对应时间点、画面依据、建议哪里不成立，以及更合理的选择。"
          />
        </label>
        <button
          className="btn secondary"
          disabled={!events.some((e) => e.frame) || assessment === '未核对' || !correction.trim()}
          onClick={() =>
            download(
              '自在弈境-待人工审核的复盘样本.json',
              JSON.stringify(
                {
                  schema: 'kaiju-review-evaluation-v1',
                  createdAt: new Date().toISOString(),
                  status: 'human-labelled-unverified',
                  title,
                  heroId,
                  videoName,
                  events,
                  analysis: codexResult ?? result,
                  assessment,
                  correction,
                  trainingPerformed: false,
                },
                null,
                2,
              ),
            )
          }
        >
          导出待审核评测样本
        </button>
      </details>
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
      {codexResult && (
        <section className="surface pro-prose" aria-label="当前 Codex 对话复盘结果">
          <h2>当前对话的逐帧判断</h2>
          <p>{codexResult.scope}</p>
          {codexResult.findings.map((f) => (
            <article key={f.eventId}>
              <h3>
                {fmt(events.find((e) => e.id === f.eventId)?.second ?? 0)} ·{' '}
                {f.verdict === 'supported' ? '有证据的建议' : '证据不足，暂缓判断'}
              </h3>
              <p>
                <strong>观察：</strong>
                {f.observation}
              </p>
              <p>
                <strong>建议：</strong>
                {f.advice}
              </p>
              <p>
                <strong>替代选择：</strong>
                {f.alternative}
              </p>
              <p>
                <strong>下一次练习：</strong>
                {f.drill}
              </p>
              <small>{f.uncertainty}</small>
            </article>
          ))}
          {codexResult.limitations.map((x) => (
            <p className="data-caption" key={x}>
              {x}
            </p>
          ))}
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
              '自在弈境-证据复盘.json',
              JSON.stringify(
                {
                  title,
                  heroId,
                  videoName,
                  events,
                  analysis: result,
                  codexAnalysis: codexResult,
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
    </fieldset>
  );
}
