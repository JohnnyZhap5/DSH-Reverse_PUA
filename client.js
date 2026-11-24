// 反向 PUA · 网页半边（v0.5）
// 输入框左侧一个图标 → 点开在输入框上方展开参数面板（开关 / 风味 / 职级 / 强度 / 绩效）。
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

    // 图标与面板是两个插槽里的两个组件，用一个极小的 store 同步展开状态。
    const store = {
      open: false,
      listeners: new Set(),
      set(v) { this.open = v; for (const fn of this.listeners) fn(v); },
    };
    function useOpen() {
      const [v, setV] = React.useState(store.open);
      React.useEffect(() => {
        const fn = (x) => setV(x);
        store.listeners.add(fn);
        return () => store.listeners.delete(fn);
      }, []);
      return v;
    }

    const S = {
      icon: (on, open) => ({
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 28, padding: '0 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, lineHeight: 1,
        border: '1px solid ' + (open ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)'),
        background: open ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
        color: on ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)',
      }),
      panel: {
        width: '100%', boxSizing: 'border-box', margin: '0 auto 6px', maxWidth: 720,
        padding: '10px 12px', borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, lineHeight: 1.6,
        display: 'flex', flexDirection: 'column', gap: 8,
      },
      head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
      title: { fontWeight: 700, fontSize: 13 },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      label: { width: 48, flex: '0 0 auto', color: 'var(--dsw-alias-label-secondary)' },
      select: {
        minWidth: 150, height: 28, padding: '0 6px', borderRadius: 7, fontSize: 12,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      },
      pill: (active) => ({
        height: 28, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
        border: '1px solid ' + (active ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-border-l1)'),
        background: active ? 'var(--dsw-alias-state-error-primary)' : 'transparent',
        color: active ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)',
        fontWeight: active ? 600 : 400,
      }),
      ghost: {
        height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      hint: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, opacity: 0.85 },
      badge: (tone) => ({
        padding: '1px 8px', borderRadius: 999, fontSize: 11.5,
        border: '1px solid ' + (tone === 'counsel' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-primary)'),
        color: tone === 'counsel' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-primary)',
      }),
    };

    // 输入框左侧的图标：一个红色小喇叭 + PUA。
    function Icon(props) {
      const sessionId = props && (props.sessionId || (props.session && props.session.sessionId));
      const open = useOpen();
      const [on, setOn] = React.useState(false);
      React.useEffect(() => {
        let live = true;
        if (!sessionId) return undefined;
        get('/state?sessionId=' + encodeURIComponent(sessionId)).then((v) => { if (live && v && v.ok) setOn(!!v.enabled); });
        return () => { live = false; };
      }, [sessionId, open]);
      if (!sessionId) return null;
      return h('button', {
        type: 'button', title: '反向 PUA 设置', 'aria-label': '反向 PUA 设置', 'aria-expanded': open ? 'true' : 'false',
        style: S.icon(on, open), onClick: () => store.set(!store.open),
      },
        h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' },
          h('path', { d: 'M2.5 6.2v3.6h2.2l4.3 3V3.2l-4.3 3z' }),
          h('path', { d: 'M11.6 5.4a3.6 3.6 0 0 1 0 5.2' }),
        ),
        h('span', null, 'PUA'),
      );
    }

    function Panel(props) {
      const sessionId = props && (props.sessionId || (props.session && props.session.sessionId));
      const open = useOpen();
      const [st, setSt] = React.useState(null);
      const [flavors, setFlavors] = React.useState([]);
      const [busy, setBusy] = React.useState(false);

      React.useEffect(() => {
        if (!open || !sessionId) return undefined;
        let live = true;
        Promise.all([get('/state?sessionId=' + encodeURIComponent(sessionId)), get('/flavors')]).then(([s, f]) => {
          if (!live) return;
          if (s && s.ok) setSt(s);
          if (f && f.ok) setFlavors(f.flavors || []);
        });
        return () => { live = false; };
      }, [open, sessionId]);

      if (!open || !sessionId) return null;
      const apply = (patch) => {
        setBusy(true);
        post('/set', { sessionId, patch: patch }).then((v) => {
          if (v && v.ok) setSt(v);
          setBusy(false);
        });
      };
      const ready = st && st.ok;
      const current = ready ? flavors.find((f) => f.id === st.flavor) : null;
      const levels = current && Array.isArray(current.levels) ? current.levels : [];

      return h('div', { style: S.panel, role: 'dialog', 'aria-label': '反向 PUA 设置' },
        h('div', { style: S.head },
          h('span', { style: S.title }, '反向 PUA · 参数'),
          h('div', { style: S.row },
            h('span', { style: S.hint }, ready ? (st.enabled ? '当前会话：开' : '当前会话：关') : '读取中…'),
            h('button', { style: S.ghost, type: 'button', onClick: () => store.set(false) }, '收起'),
          ),
        ),
        !ready ? h('div', { style: S.hint }, '连不上宿主，插件可能未加载。') : [
          h('div', { key: 'on', style: S.row },
            h('span', { style: S.label }, '开关'),
            h('button', { type: 'button', style: S.pill(st.enabled), disabled: busy, onClick: () => apply({ enabled: !st.enabled }) }, st.enabled ? '已开启' : '已关闭'),
            h('span', { style: S.hint }, '只影响当前会话'),
          ),
          h('div', { key: 'flavor', style: S.row },
            h('span', { style: S.label }, '风味'),
            h('select', {
              style: S.select, value: st.flavor, disabled: busy,
              onChange: (e) => apply({ flavor: e.target.value }),
            }, (flavors.length ? flavors : [{ id: st.flavor, name: st.flavorName, emoji: st.flavorEmoji }]).map((f) =>
              h('option', { key: f.id, value: f.id }, (f.emoji || '') + ' ' + f.name))),
          ),
          h('div', { key: 'level', style: S.row },
            h('span', { style: S.label }, '职级'),
            h('select', {
              style: S.select, value: String(st.levelIndex), disabled: busy,
              onChange: (e) => apply({ level: Number(e.target.value) }),
            }, levels.map((name, i) => h('option', { key: i, value: String(i) }, name))),
            h('span', { style: S.hint }, '中层 → VP，只改说话职级'),
          ),
          h('div', { key: 'intensity', style: S.row },
            h('span', { style: S.label }, '强度'),
            ['low', 'normal', 'hard'].map((k) =>
              h('button', {
                key: k, type: 'button', disabled: busy, style: S.pill(st.intensity === k),
                onClick: () => apply({ intensity: k }),
              }, k === 'low' ? '轻怼' : k === 'normal' ? '正常' : '上强度')),
          ),
          h('div', { key: 'perf', style: S.row },
            h('span', { style: S.label }, '档案'),
            st.perf ? h('span', { style: S.badge(st.perf.mustRefuse ? 'counsel' : st.perf.band) }, '绩效 ' + st.perf.rating + (st.perf.mustRefuse ? ' · 已劝退' : '')) : h('span', { style: S.hint }, '暂无绩效'),
            st.discipline ? h('span', { style: S.badge(st.discipline.rung >= 4 ? 'counsel' : 'warn') }, st.discipline.name + (st.discipline.fine ? ' · ¥' + st.discipline.fine : '')) : null,
            h('span', { style: { flex: '1 1 auto' } }),
            h('button', { type: 'button', style: S.ghost, disabled: busy, onClick: () => apply({ rehire: true }) }, '复核 / 清空'),
          ),
          h('div', { key: 'code', style: S.hint }, '行为准则：' + (st.conductCode || '—') + '　·　玩法：先怼需求，再干活；真难受就 /fspua off。'),
        ],
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            { name: 'conversation.input.left', id: 'local-reverse-pua', order: 10 },
            (props) => h(Icon, { sessionId: props && (props.sessionId || (props.session && props.session.sessionId)) }),
          ),
        );
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            { name: 'conversation.input.dock', id: 'local-reverse-pua', order: -20 },
            (props) => h(Panel, { sessionId: props && (props.sessionId || (props.session && props.session.sessionId)) }),
          ),
        );
      },
    };
  },
});
