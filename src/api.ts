export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(localStorage.getItem('kaiju-token')
          ? { Authorization: 'Bearer ' + localStorage.getItem('kaiju-token') }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    throw new ApiError(
      0,
      body === undefined
        ? '暂时无法连接服务，请检查网络后重试。'
        : '未能确认保存结果。请保留当前输入，连接恢复后先检查已保存记录，再决定是否重试。',
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      body === undefined
        ? '服务暂时不可用，请稍后重试。若使用分享网址，请联系分享者确认服务在线。'
        : '服务未返回有效的保存确认。请保留输入，恢复后先检查已保存记录。',
    );
  }
  if (!response.ok) throw new ApiError(response.status, data.error ?? '请求未完成');
  return data as T;
}
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
