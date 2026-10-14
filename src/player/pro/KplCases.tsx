import { useState } from 'react';
import { api } from '../../api.ts';
import type { KplCases as Cases } from './kpl.ts';
export default function KplCases() {
  const [data, setData] = useState<Cases>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function read() {
    setBusy(true);
    setError('');
    try {
      setData(await api<Cases>('/kpl/cases'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="surface kpl-cases"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy && !error) void read();
      }}
    >
      <summary>KPL 官方比赛素材库 · 回放与选手视角</summary>
      <p>
        从官方赛事公开页面取得真实比赛与逐局回放入口。用于查找案例和核对视角；当前索引没有经过画面标注，也没有训练模型。
      </p>
      <button className="btn secondary" disabled={busy} onClick={() => void read()}>
        读取官方素材索引
      </button>
      {busy && <p role="status">正在读取官方赛程和逐局回放……</p>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p className="data-caption">
            获取时间：
            {new Date(data.fetchedAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              hour12: false,
            })}
            （北京时间） · {data.matches.length} 场系列赛 /{' '}
            {data.matches.reduce((sum, m) => sum + m.rounds.length, 0)} 局回放索引 · 已训练样本：0
          </p>
          {data.warning && <p role="status">{data.warning}</p>}
          {data.matches.map((match) => (
            <article key={match.id}>
              <h3>{match.title}</h3>
              <p className="data-caption">
                {match.season} ·{' '}
                {new Date(match.startedAt).toLocaleDateString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                })}
              </p>
              <ul>
                {match.rounds.map((round) => (
                  <li key={round.round}>
                    <a href={round.url} target="_blank" rel="noreferrer">
                      第 {round.round} 局 · 前往官方回放 ↗
                    </a>
                    <p>{round.heroes.map((h) => h.name).join(' / ')}</p>
                    <small>
                      官方列有 {round.heroes.filter((h) => h.hasPlayerView).length}{' '}
                      个选手视角入口；未验证每个视频均可播放。
                    </small>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <details className="source-proof">
            <summary>官方来源与核验指纹</summary>
            <a href={data.sourceUrl} target="_blank" rel="noreferrer">
              KPL 官方赛事网站 ↗
            </a>
            {data.sources.map((source, i) => (
              <p key={i}>
                公开读取接口：{source.url} · SHA-256：{source.rawSha256}
              </p>
            ))}
          </details>
        </>
      )}
      <p className="data-caption">
        训练前还需可使用的录像片段、版本与比赛标识、教练或人工复核标签，并按整场比赛划分训练和测试。只浏览回放或增加提示词不会更新模型权重。
      </p>
    </details>
  );
}
