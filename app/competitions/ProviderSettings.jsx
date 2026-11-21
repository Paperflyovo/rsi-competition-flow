import { useEffect, useState } from 'react';
import { modelProviders, providerBaseUrl } from '../../src/research/providers.mjs';

const preferenceKey = 'competition-flow.model-provider.v1';

function newSelection(kind) {
  const { baseUrl, model } = modelProviders[kind];
  return { kind, baseUrl, model, apiKey: '' };
}

export function useProviderSettings() {
  const [selection, setSelection] = useState(() => newSelection('server'));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey));
      if (!saved || !Object.hasOwn(modelProviders, saved.kind)) return;
      const restored = newSelection(saved.kind);
      if (typeof saved.model === 'string') restored.model = saved.model;
      if (saved.kind === 'custom' && saved.baseUrl) restored.baseUrl = providerBaseUrl(saved.baseUrl);
      setSelection(restored);
    } catch {
      // A blocked store or an old invalid address leaves the default selection available.
    }
  }, []);

  function change(next) {
    setSelection(next);
    if (
      next.kind === selection.kind &&
      next.baseUrl === selection.baseUrl &&
      next.model === selection.model
    )
      return;
    try {
      const preferences = { kind: next.kind, model: next.model };
      if (next.kind === 'custom' && next.baseUrl) preferences.baseUrl = providerBaseUrl(next.baseUrl);
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    } catch {
      // Partially typed URLs stay editable. Runs validate the complete selection separately.
    }
  }
  return [selection, change];
}

function DefaultProviderSummary() {
  const [description, setDescription] = useState('正在读取服务端配置…');
  useEffect(() => {
    const controller = new AbortController();
    async function readSummary() {
      try {
        const response = await fetch('/api/competition-research', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw Error();
        const summary = await response.json();
        setDescription(
          summary.configured
            ? '当前使用 ' + summary.host + ' · ' + summary.model + '，密钥由服务端提供。'
            : '服务端默认配置尚未填全。可以在「服务商」中选择自己的模型服务。',
        );
      } catch {
        if (!controller.signal.aborted)
          setDescription('无法读取服务端默认模型设置。仍可手动选择服务商。');
      }
    }
    readSummary();
    return () => controller.abort();
  }, []);
  return <p className="providerHint" role="status">{description}</p>;
}

export function ProviderSettings({ selection, change, disabled, error }) {
  const { kind, baseUrl, model, apiKey } = selection;
  return (
    <fieldset id="model-provider-settings" className="providerFields" disabled={disabled}>
      <legend>模型服务设置</legend>
      <label>
        服务商
        <select value={kind} onChange={(e) => change(newSelection(e.target.value))}>
          {Object.entries(modelProviders).map(([id, preset]) => (
            <option key={id} value={id}>{preset.label}</option>
          ))}
        </select>
      </label>
      {kind === 'server' ? (
        <DefaultProviderSummary />
      ) : (
        <>
          <label>
            API 基础地址
            <input
              type="url"
              value={baseUrl}
              readOnly={kind !== 'custom'}
              maxLength={2048}
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…/v1"
              onChange={(e) => change({ ...selection, baseUrl: e.target.value, apiKey: '' })}
            />
          </label>
          <label>
            模型 ID
            <input
              type="text"
              value={model}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              placeholder="服务商提供的模型 ID"
              onChange={(e) => change({ ...selection, model: e.target.value })}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={apiKey}
              maxLength={8192}
              autoComplete="off"
              spellCheck={false}
              placeholder="填写此服务商的 Key"
              onChange={(e) => change({ ...selection, apiKey: e.target.value })}
            />
          </label>
          <p className="providerHint">
            服务和模型记在此浏览器。Key 只在当前页面使用。请选择支持 Chat Completions 和 JSON 对象输出的模型。
          </p>
        </>
      )}
      {error && <p className="providerError" role="alert">{error}</p>}
    </fieldset>
  );
}
