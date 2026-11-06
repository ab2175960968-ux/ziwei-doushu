export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChartLike = {
  birthInfo?: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    gender?: string;
  };
  palaces?: unknown[];
  [key: string]: unknown;
};

export function isValidChart(value: unknown): value is ChartLike {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const chart = value as ChartLike;
  const birth = chart.birthInfo;
  return !!birth
    && Number.isInteger(birth.year)
    && Number.isInteger(birth.month)
    && Number.isInteger(birth.day)
    && Number.isInteger(birth.hour)
    && (birth.gender === 'male' || birth.gender === 'female')
    && Array.isArray(chart.palaces)
    && chart.palaces.length === 12;
}

export function normalizeMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 5000) return null;
    total += trimmed.length;
    if (total > 18000) return null;
    messages.push({ role, content: trimmed });
  }
  return messages;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function streamDeepSeek(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  request: Request,
): Promise<Response> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return jsonError('尚未配置 DEEPSEEK_API_KEY，请在部署平台的环境变量中添加。', 503);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  request.signal.addEventListener('abort', () => controller.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${apiKey}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
        stream: true,
        thinking: { type: 'disabled' },
        max_tokens: 4096,
        messages,
      }),
      signal: controller.signal,
    });
  } catch {
    return jsonError('无法连接 AI 服务，请稍后重试。', 502);
  }

  if (!upstream.ok || !upstream.body) {
    // Do not forward provider response bodies; they may contain sensitive diagnostics.
    return jsonError('AI 服务请求失败，请检查 API Key、账户余额和模型配置。', upstream.status >= 400 ? 502 : 503);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(output) {
      const reader = upstream.body!.getReader();
      let pending = '';
      const sendDelta = (text: string) => {
        if (text) output.enqueue(encoder.encode(\`data: \${JSON.stringify({ delta: { text } })}\\n\\n\`));
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\\n');
          pending = lines.pop() ?? '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              output.enqueue(encoder.encode('data: [DONE]\\n\\n'));
              output.close();
              return;
            }
            try {
              const event = JSON.parse(data);
              sendDelta(event.choices?.[0]?.delta?.content ?? '');
            } catch {
              // Ignore incomplete or non-JSON provider events.
            }
          }
        }
        if (pending.trim().startsWith('data:')) {
          const data = pending.trim().slice(5).trim();
          if (data !== '[DONE]') {
            try {
              const event = JSON.parse(data);
              sendDelta(event.choices?.[0]?.delta?.content ?? '');
            } catch { /* ignore trailing partial event */ }
          }
        }
        output.enqueue(encoder.encode('data: [DONE]\\n\\n'));
        output.close();
      } catch {
        try {
          sendDelta('\\n\\n（连接中断，请重试。）');
          output.enqueue(encoder.encode('data: [DONE]\\n\\n'));
          output.close();
        } catch { /* client disconnected */ }
      } finally {
        clearTimeout(timeoutId);
        reader.releaseLock();
      }
    },
    cancel() {
      clearTimeout(timeoutId);
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export function chartContext(chart: ChartLike): string {
  // Chart data is generated by the local engine. Keep it bounded before sending to the model.
  const serialized = JSON.stringify(chart);
  if (serialized.length > 160000) throw new Error('chart-too-large');
  return serialized;
}
