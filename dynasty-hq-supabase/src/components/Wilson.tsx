'use client';

import { useEffect, useRef, useState } from 'react';

interface WilsonMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function Wilson() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<WilsonMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, open]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setError(null);
    const nextMessages: WilsonMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await fetch('/api/wilson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history: messages }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Something went wrong.');
        setLoading(false);
        return;
      }
      setMessages([...nextMessages, { role: 'assistant', content: json.answer }]);
    } catch (err: any) {
      setError(err?.message || 'Wilson is unreachable right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask Wilson"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 60,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: '1px solid var(--accent)',
          background: 'var(--primary)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {open ? '✕' : '🥥'}
      </button>

      {open ? (
        <div
          style={{
            position: 'fixed',
            bottom: 82,
            right: 20,
            zIndex: 60,
            width: 'min(360px, calc(100vw - 32px))',
            height: 'min(480px, calc(100vh - 140px))',
            background: 'var(--bg)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <span style={{ fontSize: 18 }}>🥥</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Wilson</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Dynasty HQ Librarian</div>
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 20 }}>
                Ask Wilson anything about your dynasty — record, next opponent, stat leaders, awards, whatever's in the data.
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.07)',
                  color: 'var(--text)',
                  padding: '8px 11px',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {loading ? (
              <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'rgba(255,255,255,0.5)', padding: '8px 11px' }}>Wilson is thinking…</div>
            ) : null}
            {error ? (
              <div style={{ alignSelf: 'flex-start', fontSize: 12, color: '#e05a5a', padding: '8px 11px' }}>{error}</div>
            ) : null}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Wilson..."
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--text)',
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                border: '1px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                borderRadius: 6,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              Ask
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
