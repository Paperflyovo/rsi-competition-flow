import React, { useEffect, useRef, useState } from 'react';
import {
  directions,
  fields,
  nodeTypes,
  portTypes,
  sortModes,
  valuesFor,
} from '../../src/research/nodes.mjs';
import { NodeMark, portColor, stateText } from './diagram.jsx';

export function EditText({ value, save, label, maxLength = 64 }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const clean = e.target.value.trim();
        if (clean && clean !== value) save(clean);
        setDraft(clean || value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Options({ label, value, options, change }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => change(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function LimitField({ value, change }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>保留数量</span>
      <input
        type="number"
        min="1"
        max="1000"
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (!e.target.checkValidity() || !draft) {
            setDraft(String(value));
            return;
          }
          if (Number(draft) !== value) change(Number(draft));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function Receipt({ receipt }) {
  if (!receipt) return null;
  return (
    <section className="receipt" data-state={receipt.status}>
      <h4>
        本次执行 <span>{stateText[receipt.status]}</span>
      </h4>
      <p>{receipt.detail}</p>
      {Number.isFinite(receipt.elapsedMs) && <small>耗时 {receipt.elapsedMs} 毫秒</small>}
      {[
        ['输入', receipt.inputs || []],
        ['输出', receipt.outputs || []],
      ].map(([title, pins]) =>
        pins.map((p) => (
          <div key={title + p.key} className="receipt-pin">
            <b>
              {title} · {p.label}
            </b>
            <span>{p.active ? p.count + ' 项' : '未触发'}</span>
            {p.sample?.length > 0 && <small>{p.sample.join('、')}</small>}
          </div>
        )),
      )}
    </section>
  );
}

export function Inspector({
  node,
  edge,
  view,
  receipt,
  busy,
  update,
  remove,
  insert,
  duplicate,
  close,
}) {
  if (!node && !edge) return null;
  const spec = node && nodeTypes[node.kind];
  const lookup = (id) => view.elements.find((n) => n.id === id);
  const configure = (settings) => update({ settings });
  return (
    <aside className="inspector" aria-label={node ? '节点属性' : '连线属性'}>
      <header>
        <strong>{node ? '节点属性' : '连线属性'}</strong>
        <button className="icon" onClick={close} aria-label="收起属性">
          ×
        </button>
      </header>
      {node ? (
        <>
          <div className="inspected-action">
            <NodeMark kind={node.kind} />
            <small className="meta">
              {spec.group} / {spec.title}
            </small>
          </div>
          <fieldset disabled={busy}>
            <label className="field">
              <span>{node.kind === 'publish' ? '输出清单名称' : '节点名称'}</span>
              <EditText value={node.name} label="节点名称" save={(name) => update({ name })} />
            </label>
            {(node.kind === 'branch' || node.kind === 'filter') && (
              <>
                <label className="field">
                  <span>判断字段</span>
                  <select
                    value={node.settings.field}
                    onChange={(e) =>
                      configure({ field: e.target.value, value: valuesFor(e.target.value)[0] })
                    }
                  >
                    {Object.entries(fields).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <Options
                  label="等于"
                  value={node.settings.value}
                  options={valuesFor(node.settings.field)}
                  change={(value) => configure({ ...node.settings, value })}
                />
              </>
            )}
            {node.kind === 'rank' && (
              <Options
                label="排序方式"
                value={node.settings.by}
                options={sortModes}
                change={(by) => configure({ by })}
              />
            )}
            {node.kind === 'discover' && (
              <Options
                label="采集方向"
                value={node.settings.direction}
                options={['跟随调研范围', ...directions]}
                change={(direction) => configure({ direction })}
              />
            )}
            {node.kind === 'limit' && (
              <LimitField value={node.settings.count} change={(count) => configure({ count })} />
            )}
            {node.kind === 'merge' && (
              <p>相同赛事保留输入 A 的版本。两端需接线，执行时可接收单侧活跃分支。</p>
            )}
            {node.kind === 'snapshot' && <p>读取公开赛事快照，使用采集当天的赛事状态。</p>}
            {node.kind === 'extract' && <p>读取上游公告，使用「运行设置 → 模型服务」选定的模型。</p>}
            <div className="panel-actions">
              {!['start', 'end'].includes(node.kind) && (
                <button onClick={duplicate}>复制节点</button>
              )}
              <button className="destructive" onClick={remove}>
                删除节点
              </button>
            </div>
          </fieldset>
          <Receipt receipt={receipt} />
        </>
      ) : (
        <>
          <p className="edge-title">
            {lookup(edge.fromElementId).name}
            <small>
              ↓{' '}
              {
                nodeTypes[lookup(edge.fromElementId).kind].outputs.find(
                  (p) => p.key === edge.fromPort,
                ).label
              }
            </small>
            {lookup(edge.toElementId).name}
          </p>
          <div className="panel-actions">
            <button disabled={busy} onClick={insert}>
              在线上插入节点
            </button>
            <button className="destructive" disabled={busy} onClick={remove}>
              断开连线
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

export function NodeMenu({ menu, view, pick, close }) {
  const [search, setSearch] = useState('');
  const searchInput = useRef(null);
  useEffect(() => {
    searchInput.current?.focus();
  }, []);
  const candidates = Object.entries(nodeTypes).filter(([kind, spec]) => {
    if (['start', 'end'].includes(kind) && view.elements.some((n) => n.kind === kind)) return false;
    if (menu.fromType && !spec.inputs.some((p) => p.type === menu.fromType)) return false;
    if (menu.toType && !spec.outputs.some((p) => p.type === menu.toType)) return false;
    return (spec.title + spec.group + kind).toLowerCase().includes(search.trim().toLowerCase());
  });
  return (
    <div
      className="picker"
      style={{ '--menu-x': menu.x + 'px', '--menu-y': menu.y + 'px' }}
      role="dialog"
      aria-label="节点库"
    >
      <header>
        <strong>{menu.edge ? '在线上插入' : menu.from ? '连接新节点' : '添加节点'}</strong>
        <button className="icon" onClick={close} aria-label="关闭节点库">
          ×
        </button>
      </header>
      {menu.fromType && (
        <div className="picker-ports">
          <span>
            <i aria-hidden="true" style={{ color: portColor(menu.fromType) }} />
            接收{portTypes[menu.fromType][0]}
          </span>
          {menu.toType && (
            <span>
              <i className="out" aria-hidden="true" style={{ color: portColor(menu.toType) }} />
              输出{portTypes[menu.toType][0]}
            </span>
          )}
        </div>
      )}
      <label className="picker-search">
        <input
          ref={searchInput}
          type="search"
          placeholder="搜索节点…"
          aria-label="搜索节点"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && candidates.length === 1) pick(candidates[0][0]);
          }}
        />
      </label>
      <div className="choices">
        {candidates.map(([kind, spec]) => (
          <button key={kind} onClick={() => pick(kind)}>
            <NodeMark kind={kind} />
            <span>{spec.title}</span>
            <small>{spec.group}</small>
          </button>
        ))}
        {!candidates.length && <p>没有匹配的节点。</p>}
      </div>
    </div>
  );
}
