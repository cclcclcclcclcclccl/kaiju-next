import { Component } from 'react';
import type { ReactNode } from 'react';
export default class ScreenBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="surface page-loading" role="alert">
        <h2>这个页面暂时未能载入</h2>
        <p>
          已保存的资料仍在。可以切换其他页面；确认网络正常后重新打开本站。若正在编辑，请先复制可见内容。
        </p>
        <button className="btn secondary" onClick={() => location.reload()}>
          重新载入本站
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
