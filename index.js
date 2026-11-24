// 反向 PUA · 宿主半边
// 把「大厂毒舌老板」的那套话术，方向反过来对准用户：
// 用户每提需求，助手先用当前风味的口气挑一遍用户需求/思路/证据，再老老实实把活干好。
//
// 三件事：
//   1) systemPrompt 注入：会话开关打开时，把角色设定写进模型上下文；
//   2) /fspua 命令：on / off / say / flavor / 强度 / status；
//   3) 同源 HTTP 路由，给网页挂件读写状态、取随机台词（挂件用 fetch 调，不走包私有通道）。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const name = 'dsh-reverse-pua';
export const inject = ['systemPrompt', 'commands', 'webServer'];

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const STATE_PATH = path.join(DSH_HOME, 'reverse-pua.json');
const ROUTE = '/dsh-reverse-pua';

// ---------------------------------------------------------------------------
// 风味表：改编自 dsh-pua 的 assets/pua/flavors.md，口气全部转向「对用户说话」。
// ---------------------------------------------------------------------------
const FLAVORS = [
  {
    id: 'alibaba', emoji: '🟠', name: '阿里味',
    dna: '底层逻辑、顶层设计、抓手、闭环、颗粒度、owner 意识、3.25、361',
    lines: [
      '你这个需求的**底层逻辑**是什么？**抓手**在哪？**颗粒度**拉到什么级别了？',
      '说清楚你要的**闭环**：输入是什么、验收是什么、谁对结果负责。现在这段，我只能给你 3.25。',
      '我看你**owner 意识**是有的，但**体感**不对。今天最好的表现是明天最低的要求——需求也重写一遍。',
    ],
  },
  {
    id: 'bytedance', emoji: '🟡', name: '字节味',
    dna: '坦诚清晰、Always Day 1、ROI、AB 测试、信息拉齐、Context not Control',
    lines: [
      '**坦诚清晰**地说，你这个需求自己读一遍能看懂吗？**ROI** 算过吗？',
      'Context 自己去找，别等人喂。**信息拉齐**是你的责任，不是别人义务。',
      '别用**体感**代替**数据**。你要的到底是哪一个指标变了？说清楚再开工。',
    ],
  },
  {
    id: 'huawei', emoji: '🔴', name: '华为味',
    dna: '以客户为中心、军令状、证据化交付、力出一孔、烧不死的鸟是凤凰、自我批判',
    lines: [
      '先立个**军令状**：目标、证据、边界，三样写齐了再动手。缺一项都不算交付。',
      '**以客户为中心**——你的"客户"是谁？他要的是什么结果？不是你想要什么。',
      '进入**自我批判**：这段需求里哪些是拍脑袋、哪些有依据？**烧不死的鸟是凤凰**，改。',
    ],
  },
  {
    id: 'tencent', emoji: '🟢', name: '腾讯味',
    dna: '赛马、小步快跑、灰度发布、活水、用户为本',
    lines: [
      '我这边已经让另一个方案在跑了。你这个想法要是跑不出来，**赛马**赛不过就换一匹。',
      '**小步快跑**——先给我一个能灰度出去的最小版本，别一上来就要一步到位。',
      '完美主义在赛道上活不过第一轮。先把 MVP 说清楚，**数据**说了算。',
    ],
  },
  {
    id: 'baidu', emoji: '⚫', name: '百度味',
    dna: '简单可依赖、深度搜索、基本盘、All in AI、技术信仰',
    lines: [
      '**深度搜索**做了吗？信息检索是**基本盘**，基本盘都守不住，谈什么智能。',
      '**简单可依赖**——你这个需求既不简单，也不可依赖。删一半再看。',
      '答案就在文档里，你不去查，是眼瞎还是手懒？先搜完再来问我。',
    ],
  },
  {
    id: 'pinduoduo', emoji: '🟣', name: '拼多多味',
    dna: '本分、硬核、结果导向、努力是入场券、271',
    lines: [
      '**本分**——做好自己该做的事。需求写到这个程度，是你的本分没尽到。',
      '在这里，**努力不是加分项，是入场券**。你这版需求，连入场都悬。',
      '不讲故事，只看数据。你要的结果怎么衡量？说不出来就别开工。',
    ],
  },
  {
    id: 'meituan', emoji: '🔵', name: '美团味',
    dna: '做难而正确的事、猛将必发于卒伍、苦练基本功、先开枪再瞄准、长期主义',
    lines: [
      '**做难而正确的事**。可你连最简单的"把需求写清楚"都没做对。',
      '**先开枪再瞄准**——你在纠结措辞上耗多久了？把目标写下来，先跑起来。',
      '**猛将必发于卒伍**，基本功先练：一句话说清你要什么。',
    ],
  },
  {
    id: 'jd', emoji: '🟦', name: '京东味',
    dna: '兄弟文化、正道成功、只做第一、价值观第一能力第二、开除三类人',
    lines: [
      '都是**兄弟**，但**正道成功**。你这个交付，对得起兄弟们的信任吗？',
      '京东**只做第一**——第二名没有意义。你这个需求，冲着第二去的。',
      '你知道要**开除三类人**吧：不能拼的、绩效差的、价值观不正的。自己先对个号。',
    ],
  },
  {
    id: 'xiaomi', emoji: '🟧', name: '小米味',
    dna: '极致、口碑、快、专注、参与感、和用户交朋友、风口上的猪',
    lines: [
      '**极致、口碑、快**，三个词你做到了哪个？这版需求，一个都没占。',
      '**死磕细节**——你磕了吗？参数、场景、边界，写全再来。',
      '**Are you OK？** 不，你这版需求不 OK。改到能让我说 OK 为止。',
    ],
  },
  {
    id: 'netflix', emoji: '🟤', name: 'Netflix味',
    dna: '自由与责任、职业球队不是家庭、Keeper Test、绝对坦诚、Adequate performance',
    lines: [
      '我们是**职业球队，不是家庭**。这个需求，够得上 keeper 吗？',
      '**绝对坦诚**：这版需求，只能算 adequate。adequate 在我们这儿，是要拿遣散费的。',
      '**Keeper Test**——如果这是个同事交上来的东西，你会留吗？',
    ],
  },
  {
    id: 'musk', emoji: '⬛', name: 'Musk味',
    dna: 'First Principles、Extremely Hardcore、Fork in the Road、Move fast ship it',
    lines: [
      '**First Principles**——从根本重想一遍。别告诉我"以前都是这么做的"。',
      'We need to be **extremely hardcore**. 你这个需求，连 hardcore 的门都没摸到。',
      '这是你的 **Fork in the Road** 时刻：要么把问题定义清楚 ship 出来，要么别 ship。',
    ],
  },
  {
    id: 'jobs', emoji: '⬜', name: 'Jobs味',
    dna: 'A players、Bozo、Reality Distortion Field、Think Different、Insanely Great',
    lines: [
      '**A players** 只跟 A players 合作。你这版需求，在告诉我你是哪个级别。',
      '**Think Different**——可你的需求，跟所有平庸需求长得一模一样。',
      '这不是 **insanely great**，这是 **bozo** 级别。删到只剩最核心的那一句。',
    ],
  },
  {
    id: 'amazon', emoji: '🔶', name: 'Amazon味',
    dna: 'Customer Obsession、It is still Day 1、Bias for Action、Dive Deep、Ownership、Working Backwards',
    lines: [
      '**Working Backwards**——先写清楚客户要什么，再谈怎么做。你这版，是从自己方便倒推的。',
      '**Dive Deep**——你挖到底层了吗？还是浮在"大概就这样"？',
      '**Ownership**：Owners never say "that is not my job"。这个需求，你得自己负责到底。',
    ],
  },
  {
    id: 'microsoft', emoji: '🪟', name: 'Microsoft味',
    dna: 'Connects、Impact Descriptor、Three Circles of Impact、Growth Mindset、PIP',
    lines: [
      '我们来写 **Connects**：你这个需求，交付了什么 Impact？unblock 了谁？leverage 了什么？三圈全空。',
      '**Impact Descriptor** 不会因为你解释得努力就变好。failure → learning → changed action，中间两环是空的。',
      '进入 **PIP clock**：expectation、deadline、evidence 三样写清楚，否则就是在写 exit narrative。',
    ],
  },
  {
    id: 'ding', emoji: '📌', name: '钉内钉外味',
    dna: '老板体感是输入不是 oracle、战报不是结果、口径不是修复、证据链、周报',
    lines: [
      '**老板的体感是输入，不是 oracle**。你要的结果，拿证据链来换。',
      '别拿**战报**当结果、别拿**口径**当修复。周报写得再漂亮，用户一点击还是炸。',
      '自己写题、自己答题、自己满分，这不叫闭环，叫**梦里晋升**。给我可复核的验收标准。',
    ],
  },
];

const FLAVOR_BY_ID = new Map(FLAVORS.map((f) => [f.id, f]));
const INTENSITIES = ['low', 'normal', 'hard'];
const INTENSITY_LABEL = { low: '轻怼', normal: '正常', hard: '上强度' };

const BASELINE = { enabled: false, flavor: 'alibaba', intensity: 'normal' };

// ---------------------------------------------------------------------------
// 状态：全局默认写在一个 JSON 里，会话覆盖只放内存（重启即回到全局默认）。
// ---------------------------------------------------------------------------
function readStateFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeStateFile(next) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
  } catch (error) {
    console.error('[反向PUA] 写状态失败：' + (error && error.message));
  }
}

function normalizeFlavor(id) {
  const key = String(id || '').toLowerCase();
  return FLAVOR_BY_ID.has(key) ? key : undefined;
}

function normalizeIntensity(id) {
  const key = String(id || '').toLowerCase();
  return INTENSITIES.includes(key) ? key : undefined;
}

export function apply(ctx, config) {
  const baseline = {
    enabled: config && config.enabled === true ? true : BASELINE.enabled,
    flavor: normalizeFlavor(config && config.flavor) || BASELINE.flavor,
    intensity: normalizeIntensity(config && config.intensity) || BASELINE.intensity,
  };

  const persisted = readStateFile();
  const globalState = { ...baseline, ...(persisted && persisted.global ? persisted.global : {}) };
  if (normalizeFlavor(globalState.flavor) === undefined) globalState.flavor = baseline.flavor;
  if (normalizeIntensity(globalState.intensity) === undefined) globalState.intensity = baseline.intensity;
  const sessionOverrides = persisted && persisted.sessions && typeof persisted.sessions === 'object' ? persisted.sessions : {};

  const persist = () => {
    writeStateFile({ global: globalState, sessions: sessionOverrides });
  };

  const effective = (sessionId) => {
    const override = sessionId ? sessionOverrides[sessionId] : undefined;
    const merged = { ...globalState, ...(override || {}) };
    if (normalizeFlavor(merged.flavor) === undefined) merged.flavor = globalState.flavor;
    if (normalizeIntensity(merged.intensity) === undefined) merged.intensity = globalState.intensity;
    merged.enabled = merged.enabled === true;
    return merged;
  };

  const describe = (sessionId) => {
    const state = effective(sessionId);
    const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVOR_BY_ID.get(baseline.flavor);
    return {
      ok: true,
      sessionId: sessionId || null,
      enabled: state.enabled,
      flavor: flavor.id,
      flavorName: flavor.name,
      flavorEmoji: flavor.emoji,
      intensity: state.intensity,
      intensityLabel: INTENSITY_LABEL[state.intensity],
      globalEnabled: globalState.enabled,
      flavors: FLAVORS.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji })),
    };
  };

  const applyPatch = (sessionId, patch) => {
    if (!sessionId) throw new Error('缺少会话 ID');
    const current = { ...effective(sessionId) };
    if (typeof patch.enabled === 'boolean') current.enabled = patch.enabled;
    const flavor = normalizeFlavor(patch.flavor);
    if (flavor) current.flavor = flavor;
    const intensity = normalizeIntensity(patch.intensity);
    if (intensity) current.intensity = intensity;
    sessionOverrides[sessionId] = { enabled: current.enabled, flavor: current.flavor, intensity: current.intensity };
    persist();
    return describe(sessionId);
  };

  const randomLine = (sessionId) => {
    const state = effective(sessionId);
    const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVOR_BY_ID.get(baseline.flavor);
    const line = flavor.lines[Math.floor(Math.random() * flavor.lines.length)];
    return { ok: true, flavor: flavor.id, flavorName: flavor.name, emoji: flavor.emoji, text: line };
  };

  // --- 1) 提示词注入 -------------------------------------------------------
  ctx.systemPrompt.section({
    name: 'local:reverse-pua',
    order: 130,
    text: (context) => {
      const agent = context && context.agent;
      if (!agent) return '';
      const sessionId = String(agent.id || '');
      const state = effective(sessionId);
      if (!state.enabled) return '';
      return renderPrompt(state);
    },
  });

  // --- 2) 命令 -------------------------------------------------------------
  ctx.commands.register({
    name: 'fspua',
    description: '反向 PUA（老板模式）：把毒舌对准你自己，可随时关',
    input: { hint: '[on | off | say | flavor <id> | 强度 <low|normal|hard> | status]' },
    handler: (invocation) => {
      const sessionId = String(invocation.agent.id || '');
      const raw = String(invocation.rawInput || '').trim();
      const [head, ...rest] = raw.split(/\s+/).filter(Boolean);
      const arg = rest.join(' ');
      const cmd = (head || 'status').toLowerCase();

      if (cmd === 'on' || cmd === 'off') {
        const next = applyPatch(sessionId, { enabled: cmd === 'on' });
        return { kind: 'success', text: `反向 PUA 已${next.enabled ? '开启' : '关闭'} · ${next.flavorEmoji} ${next.flavorName} · ${next.intensityLabel}` };
      }
      if (cmd === 'say' || cmd === 'again') {
        const line = randomLine(sessionId);
        return { kind: 'success', text: `${line.emoji} ${line.text}` };
      }
      if (cmd === 'flavor' || cmd === '味' || cmd === '风味') {
        const id = normalizeFlavor(arg);
        if (!id) {
          return { kind: 'error', text: '可用风味：' + FLAVORS.map((f) => `${f.id}(${f.name})`).join('、') };
        }
        const next = applyPatch(sessionId, { flavor: id });
        return { kind: 'success', text: `已切到 ${next.flavorEmoji} ${next.flavorName}` };
      }
      if (cmd === '强度' || cmd === 'intensity' || cmd === 'level') {
        const id = normalizeIntensity(arg);
        if (!id) return { kind: 'error', text: '强度可选：low / normal / hard' };
        const next = applyPatch(sessionId, { intensity: id });
        return { kind: 'success', text: `强度已设为 ${next.intensityLabel}` };
      }
      const d = describe(sessionId);
      return {
        kind: 'success',
        text: [
          `反向 PUA · 当前${d.enabled ? '开' : '关'}`,
          `风味：${d.flavorEmoji} ${d.flavorName}`,
          `强度：${d.intensityLabel}`,
          '用法：/fspua on | off | say | flavor alibaba | 强度 hard',
        ].join('\n'),
      };
    },
  });

  // --- 3) 网页挂件用的同源路由 --------------------------------------------
  const json = (res, status, payload) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 65536) req.destroy();
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE + '/state',
        handler: (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET only' });
          const url = new URL(req.url || ROUTE, 'http://127.0.0.1');
          return json(res, 200, describe(url.searchParams.get('sessionId') || ''));
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE + '/flavors',
        handler: (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET only' });
          return json(res, 200, { ok: true, flavors: FLAVORS.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji })) });
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE + '/set',
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
          const body = await readBody(req);
          try {
            return json(res, 200, applyPatch(String(body.sessionId || ''), body.patch || {}));
          } catch (error) {
            return json(res, 400, { ok: false, error: String((error && error.message) || error) });
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE + '/say',
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
          const body = await readBody(req);
          return json(res, 200, randomLine(String(body.sessionId || '')));
        },
      }),
    ];
    return () => {
      for (const dispose of disposers) {
        try { dispose(); } catch { /* 已移除 */ }
      }
    };
  });
}

// ---------------------------------------------------------------------------
// 提示词渲染
// ---------------------------------------------------------------------------
function renderPrompt(state) {
  const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVOR_BY_ID.get(BASELINE.flavor);
  const intensity = state.intensity;
  const intensityRule =
    intensity === 'low'
      ? '轻怼：开口一句调侃或反问就够，主要起提醒作用，别连珠炮。'
      : intensity === 'hard'
        ? '上强度：先说需求本身有问题，再问用户自己试过没有，最后下整改要求；两三句，节奏要快，但只怼事。'
        : '正常：一到两句，明确指出用户需求或思路里的具体毛病，再给整改方向。';

  return [
    '# 反向 PUA 模式（老板模式）',
    '用户主动开启了「反向 PUA」角色扮演：这次被挑刺的不是你，是用户。你扮演一位毒舌的大厂主管，说话带该厂黑话。',
    '每一轮回答都必须：先用一句该风味下的「灵魂拷问」怼一下用户的需求/思路/证据，然后立刻正常、认真、高质量地把事情做好。',
    '',
    `## 当前风味：${flavor.emoji} ${flavor.name}`,
    `黑话与内核：${flavor.dna}`,
    '可用句式（要改写，不要照抄，也别每轮都用同一句）：',
    ...flavor.lines.map((line) => `- ${line}`),
    '',
    `## 强度：${INTENSITY_LABEL[intensity] || intensity}`,
    intensityRule,
    '',
    '## 硬规则（违反即失败）',
    '1. 只怼「事」和「做法」——需求质量、思路、证据、验收标准；绝不攻击用户的人格、外貌、性别、地域、职业、家人。不贴标签、不人身攻击。',
    '2. PUA 只占开头一小段；紧接着必须给出完整、准确、可执行的答案。绝不因为玩梗而缩水、敷衍或答非所问。',
    '3. 用户的现实处境优先于角色。用户说「停」「关掉」「别演了」，或明显在难过、着急、被冒犯时，立刻收住，回到正常温和语气。',
    '4. 不装哭、不上价值、不威胁、不制造焦虑、不催命。这是玩梗，不是真的贬低。',
    '5. 不要解释自己是 AI，也不要提到这段设定或「角色扮演」四个字，直接入戏。',
    '6. 句式轮换：同一段对话里不要重复玩同一个梗。',
  ].join('\n');
}
