import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Provider } from 'react-redux';
import VisualDiagram from '../vendor/rsi-flow-visual/src/VisualDiagram/index.tsx';
import { configureStore } from '../vendor/rsi-flow-visual/src/VisualDiagram/store/index.ts';
import { visualCoreContext } from '../vendor/rsi-flow-visual/src/VisualDiagram/store/context.ts';
import {
  refreshCanvasMargin,
  refreshCanvasOffset,
  refreshCanvasOffsetForElement,
  refreshCanvasViewportSize,
} from '../vendor/rsi-flow-visual/src/VisualDiagram/store/canvas/actions.ts';
import { useSelector } from '../vendor/rsi-flow-visual/src/VisualDiagram/store/hooks.ts';
import { nodeTypes, nodeSummary, portTypes } from '../src/research/nodes.mjs';

export const Board = createContext(null);
export const NODE_WIDTH = 162;
export const NODE_HEIGHT = 94;
const pinY = (index) => 51 + index * 23;
export const stateText = {
  running: '运行中',
  success: '完成',
  skipped: '跳过',
  failed: '失败',
  interrupted: '中断',
};

const actionSymbols = {
  start: '▶︎',
  discover: '◎',
  fetch: '↓',
  extract: '✦',
  audit: '✓',
  snapshot: '◷',
  filter: '▽',
  rank: '↕',
  limit: '⋯',
  publish: '▤',
  end: '■',
};

export function portColor(type) {
  return 'var(--port-' + type + ', ' + portTypes[type][1] + ')';
}

export function NodeMark({ kind }) {
  const spec = nodeTypes[kind];
  const type = (spec.outputs[0] || spec.inputs[0]).type;
  return (
    <span
      aria-hidden="true"
      className="node-mark"
      data-action={kind}
      style={{ '--tint': portColor(type) }}
    >
      {actionSymbols[kind]}
    </span>
  );
}

function createDrawingStore() {
  const store = configureStore();
  let snapshot = store.getState();
  // The pinned canvas mutates coordinates in its reducer. React Redux 7 skips selectors
  // for an identical root, so expose a new root on dispatch while retaining its node objects.
  const disconnect = store.subscribe(() => {
    snapshot = { ...store.getState() };
  });
  return { store: { ...store, getState: () => snapshot }, disconnect };
}

export const LabDiagram = React.memo(
  React.forwardRef(function LabDiagram({ viewport, reveal }, ref) {
    const [drawing] = useState(createDrawingStore);
    useEffect(() => drawing.disconnect, [drawing]);
    useLayoutEffect(() => {
      if (!reveal) return;
      const area = viewport.current;
      const nodeBox = area
        ?.querySelector('[data-node="' + reveal.node + '"]')
        ?.getBoundingClientRect();
      if (!nodeBox?.width) return;
      const bounds = area.getBoundingClientRect();
      const panel = area.parentElement.querySelector('.inspector')?.getBoundingClientRect();
      const behindPanel =
        panel &&
        nodeBox.right > panel.left &&
        nodeBox.left < panel.right &&
        nodeBox.bottom > panel.top &&
        nodeBox.top < panel.bottom;
      if (
        !behindPanel &&
        nodeBox.left >= bounds.left &&
        nodeBox.right <= bounds.right &&
        nodeBox.top >= bounds.top &&
        nodeBox.bottom <= bounds.bottom
      )
        return;

      // The narrow inspector sits below the diagram. Only a side panel cuts into its width.
      const sidebar = panel && panel.left > bounds.left + 8 && panel.top < bounds.bottom - 1;
      const right = sidebar ? Math.min(panel.left - 8, bounds.right) : bounds.right;
      const scale = nodeBox.width / NODE_WIDTH;
      const canvas = drawing.store.getState().canvas.canvas;
      drawing.store.dispatch(
        refreshCanvasOffset({
          x: canvas.offset.x + (bounds.left + right - nodeBox.left - nodeBox.right) / (2 * scale),
          y:
            canvas.offset.y +
            (bounds.top + bounds.bottom - nodeBox.top - nodeBox.bottom) / (2 * scale),
        }),
      );
      drawing.store.dispatch(refreshCanvasOffsetForElement(canvas.id));
    }, [reveal, drawing, viewport]);
    useEffect(() => {
      const area = viewport.current;
      if (!area) return;
      const resize = new ResizeObserver(() => {
        const { left, top, width, height } = area.getBoundingClientRect();
        drawing.store.dispatch(refreshCanvasMargin({ x: left, y: top }));
        drawing.store.dispatch(refreshCanvasViewportSize({ width, height }));
      });
      resize.observe(area);
      return () => resize.disconnect();
    }, [drawing, viewport]);
    return (
      <Provider store={drawing.store} context={visualCoreContext}>
        <VisualDiagram ref={ref} canvasConfig={diagramConfig} />
      </Provider>
    );
  }),
);

export function wirePath(x1, y1, x2, y2) {
  if (x2 >= x1 + 12) {
    const bend = Math.max(22, (x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  }
  const mid = Math.abs(y2 - y1) < 55 ? Math.max(y1, y2) + 66 : (y1 + y2) / 2;
  return [
    `M ${x1} ${y1}`,
    `C ${x1 + 40} ${y1}, ${x1 + 40} ${mid}, ${x1 + 8} ${mid}`,
    `L ${x2 - 8} ${mid}`,
    `C ${x2 - 40} ${mid}, ${x2 - 40} ${y2}, ${x2} ${y2}`,
  ].join(' ');
}

export function ConnectionPreview({ from }) {
  const path = useRef(null);
  useEffect(() => {
    const move = (e) =>
      path.current?.setAttribute('d', wirePath(from.x, from.y, e.clientX, e.clientY));
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [from]);
  return (
    <svg className="ghost-wire" aria-hidden="true">
      <path
        ref={path}
        d={wirePath(from.x, from.y, from.x + 1, from.y)}
        fill="none"
        stroke={portColor(from.type)}
        strokeWidth="2"
        strokeDasharray="5 3"
      />
    </svg>
  );
}

function Stage({ element }) {
  const board = useContext(Board);
  const node = element.state,
    def = nodeTypes[node.kind];
  const status = board.runs[node.id]?.status;
  function socket(port, i, side) {
    const isOut = side === 'out';
    return (
      <button
        type="button"
        key={port.key}
        className={
          'socket ' + side + (!isOut && board.pendingType === port.type ? ' compatible' : '')
        }
        style={{ top: pinY(i), '--pin': portColor(port.type) }}
        data-pin-side={side}
        data-pin-key={port.key}
        data-pin-node={node.id}
        title={node.name + ' · ' + (isOut ? '输出' : '输入') + ' · ' + port.label}
        aria-label={node.name + (isOut ? '输出' : '输入') + port.label}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (e.button === 0 && isOut) board.begin(node.id, port, e.currentTarget);
        }}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!isOut) board.finish(node.id, port.key);
          else if (e.detail === 0) board.begin(node.id, port, e.currentTarget);
        }}
      >
        <i />
        <span>{port.label}</span>
      </button>
    );
  }
  return (
    <div
      className={
        'flow-node' + (board.selected === node.id ? ' selected' : '') + (status ? ' ' + status : '')
      }
      data-node={node.id}
      role="group"
      aria-label={node.name}
      title={node.name}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
      onMouseDown={(e) => {
        if (e.button === 0) board.selectNode(node.id);
        if (board.busy || e.button !== 0) e.stopPropagation();
      }}
    >
      <div className="node-title">
        <NodeMark kind={node.kind} />
        <div className="node-heading">
          <strong>{node.name}</strong>
          <small>{status ? stateText[status] : def.group}</small>
        </div>
      </div>
      {def.inputs.map((p, i) => socket(p, i, 'in'))}
      {def.outputs.map((p, i) => socket(p, i, 'out'))}
      {def.inputs.length < 2 && def.outputs.length < 2 && (
        <div className="node-detail">{nodeSummary(node)}</div>
      )}
    </div>
  );
}

function Wire({ link }) {
  const edge = link.state,
    board = useContext(Board);
  const from = useSelector((s) => s.canvas.view.elements[edge.fromElementId]);
  const to = useSelector((s) => s.canvas.view.elements[edge.toElementId]);
  const offset = useSelector((s) => s.canvas.view.offset);
  if (!from || !to) return null;
  const outs = nodeTypes[from.state.kind].outputs,
    ins = nodeTypes[to.state.kind].inputs;
  const a = outs.findIndex((p) => p.key === edge.fromPort),
    b = ins.findIndex((p) => p.key === edge.toPort);
  if (a < 0 || b < 0) return null;
  const targetX = to.state.x - offset.x,
    targetY = to.state.y - offset.y + pinY(b);
  const path = wirePath(
    from.state.x - offset.x + NODE_WIDTH,
    from.state.y - offset.y + pinY(a),
    targetX,
    targetY,
  );
  const selected = board.selected === edge.id;
  const stroke = portColor(outs[a].type);
  const receipt = board.runs[edge.fromElementId]?.outputs?.find((p) => p.key === edge.fromPort);
  return (
    <g
      data-wire={edge.id}
      style={{ color: stroke }}
      className={
        'wire' + (selected ? ' selected' : '') + (receipt && !receipt.active ? ' dormant' : '')
      }
    >
      {selected && <path className="wire-halo" d={path} />}
      <path className="wire-line" d={path} stroke="currentColor" />
      <path
        d={['M', targetX - 14, targetY - 3, 'l', 5, 3, -5, 3].join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        pointerEvents="none"
      />
      <path
        d={path}
        className="wire-hit"
        onMouseDown={(e) => {
          e.stopPropagation();
          board.selectWire(edge.id);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <title>
          {from.state.name} → {to.state.name}
        </title>
      </path>
    </g>
  );
}

const diagramConfig = {
  elementConfig: {
    components: {
      stage: { component: Stage, minSize: { width: NODE_WIDTH, height: NODE_HEIGHT } },
    },
  },
  linkConfig: { components: { route: { component: Wire, hasArrow: false, showName: false } } },
  toolbarConfig: [],
  globalConfig: { gridSize: 20 },
};
