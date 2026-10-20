import { useEffect, useRef, useState } from 'react';

export default function BpTimer({
  turnKey,
  active,
  paused,
  onPause,
  onTimeout,
}: {
  turnKey: string;
  active: boolean;
  paused: boolean;
  onPause: (value: boolean) => void;
  onTimeout: () => void;
}) {
  const [seconds, setSeconds] = useState(60),
    [remaining, setRemaining] = useState(60000);
  const left = useRef(60000),
    deadline = useRef(0),
    expired = useRef(false);
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;
  useEffect(() => {
    left.current = seconds * 1000;
    setRemaining(left.current);
    expired.current = false;
  }, [turnKey, seconds]);
  useEffect(() => {
    if (!active || paused || !seconds || expired.current) return;
    deadline.current = Date.now() + left.current;
    const tick = () => {
      left.current = Math.max(0, deadline.current - Date.now());
      setRemaining(left.current);
      if (!left.current && !expired.current) {
        expired.current = true;
        timeout.current();
      }
    };
    const id = window.setInterval(tick, 200);
    return () => {
      window.clearInterval(id);
      left.current = Math.max(0, deadline.current - Date.now());
    };
  }, [turnKey, seconds, active, paused]);
  return (
    <div className="pro-toolbar bp-timer">
      <label>
        每手计时
        <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
          {[0, 30, 60, 90, 120].map((n) => (
            <option key={n} value={n}>
              {n ? n + ' 秒' : '不计时'}
            </option>
          ))}
        </select>
      </label>
      <output aria-label="本手剩余时间">
        {!seconds ? '不限时' : `${Math.ceil(remaining / 1000)} 秒${paused ? ' · 暂停' : ''}`}
      </output>
      {active && (
        <button
          className="text-btn"
          onClick={() => {
            left.current = seconds * 1000;
            deadline.current = Date.now() + left.current;
            expired.current = false;
            setRemaining(left.current);
            onPause(false);
          }}
        >
          重新计时并继续
        </button>
      )}
      <small>
        练习计时；超时暂停 AI、保留当前选择，由你处理，不随机代选或判负。重新打开页面从暂停开始。
      </small>
    </div>
  );
}
