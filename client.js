// 反向 PUA · 网页半边（v0.2）
// 输入框下方的小胶囊：开关 / 换厂 / 换职级 / 来一句 / 绩效徽章。
// 状态读写走同源 fetch（宿主半边注册的 /dsh-reverse-pua 路由）。
window.__ModuleLoader__.load({
  id: '@local/dsh-reverse-pua',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const B = '/dsh-reverse-pua';

    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    const post = (p, body) =>
      fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
        .then((r) => r.json())
        .catch(() => null);

    const S = {
      wrap: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, padding: '2px 10px 4px' },
      row: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.4, color: 'var(--dsw-alias-label-secondary)', flexWrap: 'wrap', justifyContent: 'flex-end' },
      dot: (on) => ({ width: 8, height: 8, borderRadius: 8, background: on ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-idle-primary)', boxShadow: on ? '0 0 0 3px rgba(200,60,60,.14)' : 'none', flex: '0 0 auto' }),
      name: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', letterSpacing: '.02em' },
      ghost: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 12, lineHeight: 1.5 },
      toggle: (on) => ({ padding: '2px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12, lineHeight: 1.5, border: '1px solid ' + (on ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-border-l2)'), background: on ? 'var(--dsw-alias-state-error-primary)' : 'transparent', color: on ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)', fontWeight: 600 }),
      bubble: { maxWidth: 560, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' },
      close: { border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 },
      hint: { fontSize: 11, opacity: 0.6 },
      badge: (tone) => ({
        padding: '1px 7px', borderRadius: 999, fontSize: 11, lineHeight: 1.6,
        border: '1px solid ' + (tone === 'counsel' ? 'var(--dsw-alias-state-error-primary)' : tone === 'warn' ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-border-l1)'),
        color: tone === 'counsel' ? 'var(--dsw-alias-state-error-primary)' : tone === 'warn' ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)',
        background: 'transparent',
      }),
    };

    function rich(text) {
      const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? h('strong', { key: i, style: { fontWeight: 700 } }, part.slice(2, -2))
          : h('span', { key: i }, part),
      );
    }

    function Chip(props) {
      const sessionId = props && (props.sessionId || (props.session && props.session.sessionId));
      const [st, setSt] = React.useState(null);
      const [line, setLine] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const timer = React.useRef(null);

      const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
      const flash = (next) => { clearTimer(); setLine(next); timer.current = setTimeout(() => { setLine(null); timer.current = null; }, 9000); };

      React.useEffect(() => {
        let live = true;
        clearTimer();
        setLine(null);
        if (!sessionId) { setSt(null); return () => { live = false; }; }
        get('/state?sessionId=' + encodeURIComponent(sessionId)).then((v) => {
          if (live && v && v.ok) setSt(v);
          else if (live) setSt({ ok: false });
        });
        return () => { live = false; clearTimer(); };
      }, [sessionId]);

      if (!sessionId) return null;

      const apply = (patch) => {
        setBusy(true);
        post('/set', { sessionId, patch }).then((v) => { if (v && v.ok) setSt(v); setBusy(false); });
      };
      const toggle = () => { if (st && st.ok) apply({ enabled: !st.enabled }); };
      const cycleFlavor = () => {
        if (!st || !st.ok) return;
        const list = st.flavors || [];
        if (!list.length) return;
        const idx = Math.max(0, list.findIndex((f) => f.id === st.flavor));
        apply({ flavor: list[(idx + 1) % list.length].id, enabled: true });
      };
      const cycleLevel = () => { if (st && st.ok) apply({ level: (Number(st.levelIndex || 0) + 1) % (st.levelCount || 1) }); };
      const say = () => {
        setBusy(true);
        post('/say', { sessionId }).then((v) => { setBusy(false); if (v && v.ok) flash({ emoji: v.emoji, text: v.text }); });
      };

      const ready = st && st.ok;
      const on = ready && st.enabled;
      const perf = ready && st.perf;

      return h('div', { style: S.wrap },
        line ? h('div', { style: S.bubble },
          h('span', { style: { flex: '0 0 auto' } }, line.emoji || '🗯'),
          h('span', { style: { flex: '1 1 auto' } }, rich(line.text || '')),
          h('button', { style: S.close, title: '收起', onClick: () => { clearTimer(); setLine(null); } }, '×'),
        ) : null,
        h('div', { style: S.row, title: '反向 PUA：玩梗模式，只针对需求/做法，随时可关' },
          h('span', { style: S.dot(on) }),
          h('span', { style: S.name }, '反向PUA'),
          ready ? h('span', { style: S.hint }, on ? '老板已上线' : '老板在休息') : h('span', { style: S.hint }, st && st.ok === false ? '未连接' : '…'),
          ready && on ? h('button', { style: S.ghost, disabled: busy, title: '换一种大厂风味', onClick: cycleFlavor }, (st.flavorEmoji || '') + ' ' + (st.flavorName || '') + ' ⇄') : null,
          ready && on ? h('button', { style: S.ghost, disabled: busy, title: '换一个领导职级（中层→VP）', onClick: cycleLevel }, '职级 ' + st.levelRank + ' ⇄') : null,
          perf ? h('span', { style: S.badge(perf.mustRefuse ? 'counsel' : perf.band) }, '绩效 ' + perf.rating + (perf.mustRefuse ? ' · 已劝退' : '')) : null,
          ready ? h('button', { style: S.ghost, disabled: busy, title: '来一句', onClick: say }, '来一句') : null,
          ready ? h('button', { style: S.toggle(on), disabled: busy, role: 'switch', 'aria-checked': on ? 'true' : 'false', title: on ? '关掉老板模式' : '打开老板模式', onClick: toggle }, on ? '开' : '关') : null,
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'local-reverse-pua', order: 30 },
            (props) => h(Chip, { sessionId: props && (props.sessionId || (props.session && props.session.sessionId)) }),
          ),
        );
      },
    };
  },
});
