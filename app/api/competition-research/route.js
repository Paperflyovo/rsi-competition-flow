import { prepareResearch, runPreparedResearch } from '@/src/research/run.mjs';
import { defaultProviderSummary } from '@/src/research/model.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function fromLocalWorkbench(request) {
  const url = new URL(request.url),
    origin = request.headers.get('origin');
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    (!origin || (URL.canParse(origin) && new URL(origin).host === request.headers.get('host')));
}

export async function GET(request) {
  if (!fromLocalWorkbench(request))
    return Response.json({ error: '只接受本机调研台的请求。' }, { status: 403 });
  try {
    return Response.json(await defaultProviderSummary(), { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: '无法读取服务端默认模型设置。' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!fromLocalWorkbench(request))
    return Response.json({ error: '只接受本机调研台发起的运行。' }, { status: 403 });
  let prepared;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 384 * 1024) throw Error('流程文件超出 384 KB。');
    prepared = prepareResearch(JSON.parse(raw));
  } catch (e) {
    const message = e instanceof SyntaxError ? '运行请求的 JSON 格式无效。' : e.message;
    return Response.json({ error: message, nodeId: e.nodeId }, { status: 400 });
  }
  const encoder = new TextEncoder();
  const disconnect = new AbortController();
  const signal = AbortSignal.any([request.signal, disconnect.signal]);
  let connected = true;
  const stream = new ReadableStream({
    start(controller) {
      function send(event) {
        if (connected) {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
          } catch {
            connected = false;
            disconnect.abort();
          }
        }
      }
      runPreparedResearch(prepared, send, signal)
        .then(
          (report) => send({ type: 'report', report }),
          (error) => send({ type: 'error', detail: error.message }),
        )
        .finally(() => {
          if (connected) controller.close();
        });
    },
    cancel() {
      connected = false;
      disconnect.abort();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}
