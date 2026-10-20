import { useState } from 'react';
import { Copy } from 'lucide-react';

export default function ShareLink() {
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState(false);
  const address = location.origin;
  return (
    <span className="share-link">
      <button
        className="btn secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setMessage('分享网址已复制');
            setFallback(false);
          } catch {
            setFallback(true);
            setMessage('请选中下方网址复制');
          }
        }}
      >
        <Copy size={14} />
        复制分享网址
      </button>
      <span role="status">{message}</span>
      {fallback && (
        <input
          aria-label="分享网址"
          readOnly
          value={address}
          onFocus={(e) => e.currentTarget.select()}
          style={{ maxWidth: '100%', width: '32rem' }}
        />
      )}
    </span>
  );
}
