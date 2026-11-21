export const modelProviders = {
  server: { label: '服务端默认', baseUrl: '', model: '' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '' },
  custom: { label: '自定义兼容服务', baseUrl: '', model: '' },
};

export function providerBaseUrl(value) {
  const base = typeof value === 'string' ? value.trim() : '';
  if (!base || base.length > 2048 || !URL.canParse(base))
    throw Error('请填写有效的 HTTPS API 基础地址。');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || /[?#]/.test(base))
    throw Error('请使用 HTTPS 基础地址，并移除其中的账号、密码、查询参数和片段。');
  const path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return url.origin + path;
}

// A manual selection supplies all its own credentials. An omitted selection uses the server.
export function readProviderOverride(settings) {
  if (settings === undefined || settings?.kind === 'server') return undefined;
  const kind = settings?.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(modelProviders, kind))
    throw Error('请选择有效的模型服务商。');
  const baseUrl = providerBaseUrl(kind === 'custom' ? settings.baseUrl : modelProviders[kind].baseUrl);
  const model = typeof settings.model === 'string' ? settings.model.trim() : '';
  if (!model || model.length > 200 || /\s/.test(model)) throw Error('请填写有效的模型 ID。');
  const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  if (!apiKey || apiKey.length > 8192 || /[^\x21-\x7e]/.test(apiKey))
    throw Error('请填写此服务商的 API Key。');
  return { kind, baseUrl, model, apiKey };
}
