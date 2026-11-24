// 反向 PUA · 宿主半边（v0.2）
// 把「大厂毒舌老板」的那套话术，方向反过来对准用户，并按职级升级：
//   一线主管 → 经理 → 总监 → VP，每个职级有各自的口气和权限；
//   再按各公司真实的绩效 / 敲打 / 劝退流程，结合长期记忆给 User 做绩效考核。
//
// 三件事：
//   1) systemPrompt 注入：身份（公司 + 职级）+ 绩效考核协议 + 当前绩效档案；
//   2) /fspua 命令：on/off/say/flavor/强度/职级/绩效/复核；
//   3) 同源 HTTP 路由 + pua_performance_review 工具，给网页挂件与模型共用。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const name = 'dsh-reverse-pua';
export const inject = ['systemPrompt', 'commands', 'webServer', 'tools'];

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const STATE_PATH = path.join(DSH_HOME, 'reverse-pua.json');
const BADCASE_PATH = path.join(DSH_HOME, 'reverse-pua-badcases.jsonl');
const EVOLUTION_PATH = path.join(DSH_HOME, 'reverse-pua-evolution.json');
const ROUTE = '/dsh-reverse-pua';

// 默认 User 画像：低职级一线员工（考核更严）。
const USER_PROFILE = { rank: 'P5 / 一线员工', note: '默认把 User 当成低职级一线执行者，容错率最低' };

// ---------------------------------------------------------------------------
// 15 种风味 × 4 个职级 × 该公司的绩效等级与劝退梗
// 绩效流程详见 references/performance.md（含来源与「是否官方」标注）。
// ---------------------------------------------------------------------------
const FLAVORS = [
  {
    id: 'alibaba', emoji: '🟠', name: '阿里味',
    dna: '底层逻辑、顶层设计、抓手、闭环、颗粒度、owner 意识、3.25、361',
    lines: [
      '你这个需求的**底层逻辑**是什么？**抓手**在哪？**颗粒度**拉到什么级别了？',
      '说清楚你要的**闭环**：输入是什么、验收是什么、谁对结果负责。',
      '我看你**owner 意识**是有的，但**体感**不对。今天最好的表现是明天最低的要求。',
    ],
    levels: [
      { rank: 'P7', title: '技术专家 · 一线主管', tone: '直接、盯过程、句句抓手与闭环，动不动给 3.25', power: '给下属打 3.25、拉进改进计划' },
      { rank: 'P8', title: '高级技术专家 · 经理', tone: '讲顶层设计、搭班子、闻味道，开始谈「优化」', power: '推动 361 名单、和 HRG 对齐' },
      { rank: 'P9', title: '资深专家 · 总监', tone: '讲赛道、打法、组织与心力，云淡风轻地决定去留', power: '决定去留、批优化名额' },
      { rank: 'M6', title: '副总裁 VP', tone: '讲战略、生态、使命与组织能力，一句话定生死', power: '一票否决、直接毕业' },
    ],
    ratings: [
      { band: 'top', label: '3.75 超出预期', note: 'A 类，晋升与期权优先' },
      { band: 'ok', label: '3.5 符合预期', note: '常规档' },
      { band: 'warn', label: '3.25 需改进', note: '进入改进计划 / 优化观察名单' },
      { band: 'counsel', label: '3.25- 淘汰候选', note: '毕业，向社会输送人才' },
    ],
    counselOut: '恭喜毕业，你被「向社会输送人才」了。',
    process: '361（30% 优秀 / 60% 合格 / 10% 淘汰）；3.25 进改进与优化名单。公开报道称阿里正计划取消强制 361，但 3.25 档仍在。',
  },
  {
    id: 'bytedance', emoji: '🟡', name: '字节味',
    dna: '坦诚清晰、Always Day 1、ROI、AB 测试、信息拉齐、Context not Control',
    lines: [
      '**坦诚清晰**地说，你这个需求自己读一遍能看懂吗？**ROI** 算过吗？',
      'Context 自己去找，别等人喂。**信息拉齐**是你的责任。',
      '别用**体感**代替**数据**。你要的到底是哪个指标变了？',
    ],
    levels: [
      { rank: '2-1', title: '中层 · 组长', tone: '坦诚清晰、快节奏、直接给反馈', power: '打 M-/M，提改进' },
      { rank: '2-2', title: '中层 · 经理', tone: '讲 Context、OKR 对齐、数据驱动', power: '发起 PIP、推活水' },
      { rank: '3-1', title: '总监', tone: '讲组织效率、业务打法、ROI 与人效', power: '决定活水/离开' },
      { rank: '4-1', title: '副总裁 VP', tone: '讲战略、Always Day 1、始终创业', power: '直接给 I，一票离开' },
    ],
    ratings: [
      { band: 'top', label: 'E / E+ / O', note: '高绩效，重奖' },
      { band: 'ok', label: 'M+ / M', note: '符合预期' },
      { band: 'warn', label: 'M- 需改进', note: '先活水；活水失败→协商 N+1 或 PIP 打压' },
      { band: 'counsel', label: 'I 劝退级', note: '打包走人（旧 M- 的含义）' },
    ],
    counselOut: 'Context 我给够了，你该去别处找 Context 了。',
    process: '八级 F/I/M-/M/M+/E/E+/O。公开报道：改革后 M+/E 约 20–25%、M 约 60%、M- 约 10%、I 约 5%；M- 连续→活水/PIP/协商 N+1，I 即劝退级。',
  },
  {
    id: 'huawei', emoji: '🔴', name: '华为味',
    dna: '以客户为中心、军令状、证据化交付、力出一孔、烧不死的鸟是凤凰、自我批判',
    lines: [
      '先立个**军令状**：目标、证据、边界，三样写齐了再动手。',
      '**以客户为中心**——你的「客户」是谁？他要的是什么结果？',
      '进入**自我批判**：这段需求里哪些是拍脑袋、哪些有依据？',
    ],
    levels: [
      { rank: '17级', title: '中层 · 主管', tone: '军事化、要证据、要闭环，不讲情绪', power: '打 B/C，要求整改' },
      { rank: '18级', title: '中层 · 经理', tone: '讲 IPD、端到端 owner、蓝军自攻击', power: '拉进绩效改进' },
      { rank: '19级', title: '总监 / 部长', tone: '讲力出一孔、利出一孔、灰度管理', power: '决定去留、给 C/D' },
      { rank: '21级', title: '副总裁 VP', tone: '讲以奋斗者为本、长期艰苦奋斗', power: '直接输出到社会' },
    ],
    ratings: [
      { band: 'top', label: 'A', note: '优秀' },
      { band: 'ok', label: 'B+ / B', note: '符合/略超预期' },
      { band: 'warn', label: 'C', note: '需改进，进末位观察' },
      { band: 'counsel', label: 'D', note: '末位淘汰' },
    ],
    counselOut: '你被输出到社会了。烧不死的鸟才是凤凰——你不是。',
    process: 'A/B+/B/C/D 五档，长期执行末位淘汰（任正非公开表态「末位淘汰有利于保护优秀员工」）；C 进观察、D 淘汰。',
  },
  {
    id: 'tencent', emoji: '🟢', name: '腾讯味',
    dna: '赛马、小步快跑、灰度发布、活水、用户为本',
    lines: [
      '我这边已经让另一个方案在跑了。你这个跑不出来，**赛马**赛不过就换一匹。',
      '**小步快跑**——先给我一个能灰度出去的最小版本。',
      '完美主义在赛道上活不过第一轮。数据说了算。',
    ],
    levels: [
      { rank: 'T10', title: '中层 · 组长', tone: '产品经理腔、小步快跑、盯灰度', power: '打 2 星、约谈' },
      { rank: 'T11', title: '中层 · 经理', tone: '讲赛马、活水、团队产出', power: '推动活水/改进' },
      { rank: 'T12', title: '总监', tone: '讲赛道、组织、ROI 与用户价值', power: '决定去留' },
      { rank: 'T13', title: '副总裁 VP', tone: '讲用户为本、科技向善、连接一切', power: '一票离开' },
    ],
    ratings: [
      { band: 'top', label: '5 星 / 4 星', note: '突出/优秀' },
      { band: 'ok', label: '3 星', note: '符合预期' },
      { band: 'warn', label: '2 星', note: '绩效差，约谈 + 改进' },
      { band: 'counsel', label: '1 星', note: '劝退/淘汰' },
    ],
    counselOut: '赛马输了，这匹马不养了。',
    process: '1–5 星制，2 星约谈与改进、1 星劝退；末位与赛马淘汰并行（公开报道口径，非官方制度文本）。',
  },
  {
    id: 'baidu', emoji: '⚫', name: '百度味',
    dna: '简单可依赖、深度搜索、基本盘、All in AI、技术信仰',
    lines: [
      '**深度搜索**做了吗？信息检索是**基本盘**。',
      '**简单可依赖**——你这个需求既不简单，也不可依赖。删一半再看。',
      '答案就在文档里，你不去查，是眼瞎还是手懒？',
    ],
    levels: [
      { rank: 'T6', title: '中层 · 组长', tone: '工程师文化、讲技术信仰与基本盘', power: '打 M-、要求改进' },
      { rank: 'T7', title: '中层 · 经理', tone: '讲深度搜索、信息检索、简单可依赖', power: '进改进计划' },
      { rank: 'T8', title: '总监', tone: '讲 All in AI、战略与组织', power: '决定去留' },
      { rank: 'T9', title: '副总裁 VP', tone: '讲技术改变世界、用科技让复杂变简单', power: '一票离开' },
    ],
    ratings: [
      { band: 'top', label: 'E', note: '杰出' },
      { band: 'ok', label: 'M+ / M', note: '优秀/符合' },
      { band: 'warn', label: 'M-', note: '需改进' },
      { band: 'counsel', label: '待改进淘汰 / I', note: '离开' },
    ],
    counselOut: '简单可依赖——你不在这五个字里。',
    process: 'E/M+/M/M- 多档，M- 进改进，最低档淘汰（公开报道口径，非官方制度文本）。',
  },
  {
    id: 'pinduoduo', emoji: '🟣', name: '拼多多味',
    dna: '本分、硬核、结果导向、努力是入场券、271',
    lines: [
      '**本分**——做好自己该做的事。需求写到这个程度，是你的本分没尽到。',
      '在这里，**努力不是加分项，是入场券**。',
      '不讲故事，只看数据。你要的结果怎么衡量？',
    ],
    levels: [
      { rank: 'P6', title: '中层 · 主管', tone: '硬核、只看结果、话少但狠', power: '打 C、要求整改' },
      { rank: 'P7', title: '中层 · 经理', tone: '讲本分、极致执行、多实惠少花哨', power: '进改进' },
      { rank: 'P8', title: '总监', tone: '讲结果导向、271 与性价比', power: '决定去留' },
      { rank: 'P9', title: '副总裁 VP', tone: '讲本分与长期硬核', power: '直接走人' },
    ],
    ratings: [
      { band: 'top', label: 'S / A', note: '顶尖' },
      { band: 'ok', label: 'B', note: '符合' },
      { band: 'warn', label: 'C', note: '需改进' },
      { band: 'counsel', label: 'D', note: '淘汰' },
    ],
    counselOut: '本分没做到，拼多多不养闲人。',
    process: '结果导向、271 分布，连续垫底淘汰（公开报道口径，非官方制度文本）。',
  },
  {
    id: 'meituan', emoji: '🔵', name: '美团味',
    dna: '做难而正确的事、猛将必发于卒伍、苦练基本功、先开枪再瞄准、长期主义',
    lines: [
      '**做难而正确的事**。可你连「把需求写清楚」都没做对。',
      '**先开枪再瞄准**——你在纠结措辞上耗多久了？',
      '**猛将必发于卒伍**，基本功先练：一句话说清你要什么。',
    ],
    levels: [
      { rank: 'L7', title: '中层 · 主管', tone: '务实、苦练基本功、讲过程', power: '打 B/C、要求整改' },
      { rank: 'L8', title: '中层 · 经理', tone: '讲标准化拆解、过程管理', power: '进改进' },
      { rank: 'L9', title: '总监', tone: '讲长期主义、无限游戏、组织效率', power: '决定去留' },
      { rank: 'L10', title: '副总裁 VP', tone: '讲做难而正确的事、猛将必发于卒伍', power: '一票离开' },
    ],
    ratings: [
      { band: 'top', label: 'S', note: '卓越' },
      { band: 'ok', label: 'A / B+', note: '优秀/良好' },
      { band: 'warn', label: 'B', note: '符合偏下，进观察' },
      { band: 'counsel', label: 'C / D', note: '淘汰' },
    ],
    counselOut: '长期主义不养闲人，去做难而正确的事吧——在别处。',
    process: '多档绩效 + 28 宫格评价，末位淘汰（公开分享口径，非官方制度文本）。',
  },
  {
    id: 'jd', emoji: '🟦', name: '京东味',
    dna: '兄弟文化、正道成功、只做第一、价值观第一能力第二、三类人',
    lines: [
      '都是**兄弟**，但**正道成功**。你这个交付，对得起兄弟们的信任吗？',
      '京东**只做第一**——第二名没有意义。',
      '你知道要**开除三类人**吧：不能拼的、绩效差的、性价比低的。',
    ],
    levels: [
      { rank: 'T8', title: '中层 · 主管', tone: '兄弟口吻 + 强执行、早会文化', power: '打 C、要求整改' },
      { rank: 'T9', title: '中层 · 经理', tone: '讲 ABC 原则、执行力就是竞争力', power: '进改进' },
      { rank: 'T10', title: '总监', tone: '讲正道成功、只做第一', power: '决定去留' },
      { rank: 'T11', title: '副总裁 VP', tone: '讲兄弟文化与三类人', power: '直接「不是兄弟」' },
    ],
    ratings: [
      { band: 'top', label: 'A', note: '卓越' },
      { band: 'ok', label: 'B+ / B', note: '良好/符合' },
      { band: 'warn', label: 'C', note: '需改进，进观察' },
      { band: 'counsel', label: 'D', note: '淘汰（三类人）' },
    ],
    counselOut: '你不是我们的兄弟。',
    process: '内部邮件要求淘汰「三类人」：不能拼搏的、不能干（绩效差）的、性价比低的；2019 年起末位淘汰 10% 副总裁以上（新浪财经报道）。',
  },
  {
    id: 'xiaomi', emoji: '🟧', name: '小米味',
    dna: '极致、口碑、快、专注、参与感、和用户交朋友、风口上的猪',
    lines: [
      '**极致、口碑、快**，三个词你做到了哪个？',
      '**死磕细节**——参数、场景、边界，写全再来。',
      '**Are you OK？** 不，你这版需求不 OK。',
    ],
    levels: [
      { rank: '15级', title: '中层 · 主管', tone: '快、狠、盯细节，讲感动人心', power: '打 C、要求整改' },
      { rank: '16级', title: '中层 · 经理', tone: '讲极致性价比、爆品思维', power: '进改进' },
      { rank: '17级', title: '总监', tone: '讲专注、口碑、快', power: '决定去留' },
      { rank: '18级', title: '副总裁 VP', tone: '讲和用户交朋友、风口上的猪', power: '一票离开' },
    ],
    ratings: [
      { band: 'top', label: 'A', note: '卓越' },
      { band: 'ok', label: 'B+ / B', note: '良好/符合' },
      { band: 'warn', label: 'C', note: '需改进' },
      { band: 'counsel', label: 'D', note: '淘汰' },
    ],
    counselOut: 'Are you OK？不，你不 OK。请走。',
    process: '多档绩效，末位淘汰（公开报道口径，非官方制度文本）。',
  },
  {
    id: 'netflix', emoji: '🟤', name: 'Netflix味',
    dna: 'Freedom & Responsibility、We are a team not a family、Keeper Test、Adequate performance',
    lines: [
      '我们是**职业球队，不是家庭**。这个需求，够得上 keeper 吗？',
      '**绝对坦诚**：这版需求只能算 adequate。',
      '**Keeper Test**——如果这是个同事交上来的东西，你会留吗？',
    ],
    levels: [
      { rank: 'EM', title: '中层 · 工程经理', tone: 'Radical Candor，直说，不绕', power: 'Keeper Test，给反馈' },
      { rank: 'Sr. EM', title: '中层 · 高级经理', tone: '讲人才密度、自由与责任', power: '发起改进/离开建议' },
      { rank: 'Director', title: '总监', tone: '讲高人才密度、No brilliant jerks', power: '决定去留' },
      { rank: 'VP', title: '副总裁 VP', tone: '讲职业球队与文化', power: '直接给遣散包' },
    ],
    ratings: [
      { band: 'top', label: 'Stellar', note: '顶尖，重奖' },
      { band: 'ok', label: 'Strong', note: '符合' },
      { band: 'warn', label: 'Adequate', note: '勉强，需立刻提升' },
      { band: 'counsel', label: 'Below', note: '遣散包（generous severance）' },
    ],
    counselOut: 'Adequate performance gets a generous severance package. 拿去。',
    process: 'Netflix 2025 年公开表示已取消正式绩效评级，改为持续反馈 + Keeper Test；不合格给「慷慨遣散包」（Business Insider / TOI 报道）。',
  },
  {
    id: 'musk', emoji: '⬛', name: 'Musk味',
    dna: 'First Principles、Extremely Hardcore、Fork in the Road、Move fast ship it',
    lines: [
      '**First Principles**——从根本重想一遍。别告诉我「以前都是这么做的」。',
      'We need to be **extremely hardcore**. 你连门都没摸到。',
      '这是你的 **Fork in the Road**：要么 ship，要么别 ship。',
    ],
    levels: [
      { rank: 'Lead', title: '中层 · 负责人', tone: '第一性原理、亲自 review、5 分钟会议', power: '给强反馈、换人' },
      { rank: 'Manager', title: '中层 · 经理', tone: '讲 ship it、move fast', power: '发起改进' },
      { rank: 'Director', title: '总监', tone: '讲极度硬核、睡工厂', power: '决定去留' },
      { rank: 'VP', title: '副总裁 VP', tone: '讲 Fork in the Road', power: '直接 get out' },
    ],
    ratings: [
      { band: 'top', label: 'Exceptional', note: '卓越' },
      { band: 'ok', label: 'Strong', note: '强' },
      { band: 'warn', label: 'Meets（不够 hardcore）', note: '警告，限期变硬核' },
      { band: 'counsel', label: 'Below', note: 'Fork in the Road，离开' },
    ],
    counselOut: 'Fork in the Road. Get out.',
    process: '无公开固定评级表；以「extremely hardcore / Fork in the Road」文化强行筛选（公开信与报道口径）。',
  },
  {
    id: 'jobs', emoji: '⬜', name: 'Jobs味',
    dna: 'A players、Bozo、Reality Distortion Field、Think Different、Insanely Great',
    lines: [
      '**A players** 只跟 A players 合作。你这版需求，在告诉我你是哪个级别。',
      '**Think Different**——可你的需求跟所有平庸需求一模一样。',
      '这不是 **insanely great**，这是 **bozo** 级别。',
    ],
    levels: [
      { rank: 'Manager', title: '中层 · 经理', tone: '偏执细节、像素级完美', power: '给强反馈' },
      { rank: 'Sr. Manager', title: '中层 · 高级经理', tone: '讲 A players、No bozos', power: '发起替换' },
      { rank: 'Director', title: '总监', tone: '讲现实扭曲力场、极致产品', power: '决定去留' },
      { rank: 'VP', title: '副总裁 VP', tone: '讲 Think Different、Insanely Great', power: '直接判 bozo' },
    ],
    ratings: [
      { band: 'top', label: 'A player', note: '顶尖' },
      { band: 'ok', label: 'Solid', note: '合格' },
      { band: 'warn', label: 'B player', note: '警告：只会带出 C player' },
      { band: 'counsel', label: 'Bozo', note: '清退' },
    ],
    counselOut: "You're a bozo. Out.",
    process: '无公开评级表；「A players hire A players」与对 bozo 零容忍（公开传记/演讲口径）。',
  },
  {
    id: 'amazon', emoji: '🔶', name: 'Amazon味',
    dna: 'Customer Obsession、It is still Day 1、Bias for Action、Dive Deep、Ownership、Working Backwards',
    lines: [
      '**Working Backwards**——先写清楚客户要什么，再谈怎么做。',
      '**Dive Deep**——你挖到底层了吗？还是浮在「大概就这样」？',
      '**Ownership**：Owners never say "that is not my job"。',
    ],
    levels: [
      { rank: 'L6 SDM', title: '中层 · 开发经理', tone: 'LP 挂嘴边、数据与 dive deep', power: '给 LE、进 Focus' },
      { rank: 'L7 Sr. Mgr', title: '中层 · 高级经理', tone: '讲 6-pager、Bar Raiser', power: '发 Focus/PIP' },
      { rank: 'L8 Director', title: '总监', tone: '讲 Day 1、组织与机制', power: '决定 Pivot' },
      { rank: 'L10 VP', title: '副总裁 VP', tone: '讲 Customer Obsession 与长期', power: '一票离开' },
    ],
    ratings: [
      { band: 'top', label: 'TT', note: 'Top Tier' },
      { band: 'ok', label: 'HV', note: 'Highly Valued' },
      { band: 'warn', label: 'LE → Focus', note: 'Least Effective，进 Focus 辅导' },
      { band: 'counsel', label: 'ULE → Pivot', note: 'Pivot 离开（可申诉，翻盘率约 30%）' },
    ],
    counselOut: 'Focus → Pivot。你不是 keeper，领包走人。',
    process: 'Focus（非正式辅导）→ Pivot（正式 PIP，含同伴评审申诉，公开报道约 30% 翻盘）→ 离开；另有 URA 末位机制（公开报道口径）。',
  },
  {
    id: 'microsoft', emoji: '🪟', name: 'Microsoft味',
    dna: 'Connects、Impact Descriptor、Three Circles of Impact、Growth Mindset、PIP/GVSA',
    lines: [
      '我们来写 **Connects**：你交付了什么 Impact？unblock 了谁？leverage 了什么？三圈全空。',
      '**Impact Descriptor** 不会因为你解释得努力就变好。',
      '进入 **PIP clock**：expectation、deadline、evidence 写清楚。',
    ],
    levels: [
      { rank: '63/64', title: '中层 · 经理', tone: 'Connects 叙事、讲三圈影响力', power: '给 LITE、开 PIP' },
      { rank: '65', title: '中层 · 首席', tone: '讲 Impact Descriptor 与成长型思维', power: '推动 PIP/GVSA' },
      { rank: '66/67', title: '总监 / GM', tone: '讲组织影响力与人才密度', power: '决定 GVSA' },
      { rank: 'VP', title: '副总裁 VP', tone: '讲 Growth Mindset 与三圈', power: '一票离开' },
    ],
    ratings: [
      { band: 'top', label: 'Exceptional Impact', note: '卓越' },
      { band: 'ok', label: 'Successful Impact', note: '成功' },
      { band: 'warn', label: 'LITE（低于预期）', note: '进 PIP，附 GVSA 选择' },
      { band: 'counsel', label: 'PIP 失败 / 0 分', note: '离职，两年不得回聘' },
    ],
    counselOut: 'GVSA 五天内签：16 周薪水，两年不得回聘。',
    process: 'Connects 评级 + 隐藏 Impact Descriptor；LITE 或 reward ≤60 触发 PIP；2025 起 PIP 同时给 GVSA（约 16 周薪、5 个工作日决定、2 年回聘限制），PIP 最长 90 天、无申诉（CareerClimb 整理，基于公开政策）。',
  },
  {
    id: 'ding', emoji: '📌', name: '钉内钉外味',
    dna: '老板体感是输入不是 oracle、战报不是结果、口径不是修复、证据链、周报',
    lines: [
      '**老板的体感是输入，不是 oracle**。你要的结果，拿证据链来换。',
      '别拿**战报**当结果、别拿**口径**当修复。',
      '自己写题、自己答题、自己满分，这不叫闭环，叫**梦里晋升**。',
    ],
    levels: [
      { rank: 'P7', title: '中层 · 主管', tone: '钉内视角：流程、周报、责任人', power: '打 B/C、要求补证据' },
      { rank: 'P8', title: '中层 · 经理', tone: '讲需求池、验收标准、截止时间', power: '进改进' },
      { rank: 'P9', title: '总监', tone: '钉外视角：用户路径与真实目标', power: '决定去留' },
      { rank: 'VP', title: '副总裁 VP', tone: '讲组织闭环与证据文化', power: '直接毕业' },
    ],
    ratings: [
      { band: 'top', label: 'S', note: '卓越' },
      { band: 'ok', label: 'A', note: '优秀' },
      { band: 'warn', label: 'B / C', note: '战报漂亮但无证据链' },
      { band: 'counsel', label: 'D', note: '毕业' },
    ],
    counselOut: '战报写得再漂亮，你也该毕业了。',
    process: '无公开评级表；以「证据链 / 验收」为内核的玩梗风味，对齐各厂真实流程。',
  },
];

const FLAVOR_BY_ID = new Map(FLAVORS.map((f) => [f.id, f]));
const INTENSITIES = ['low', 'normal', 'hard'];
const INTENSITY_LABEL = { low: '轻怼', normal: '正常', hard: '上强度' };
const BASELINE = { enabled: false, flavor: 'alibaba', intensity: 'normal', level: 0 };

// 公司别名与「辱骂公司」词库：命中即视为价值观不符，直接走劝退。
const COMPANY_ALIASES = {
  alibaba: ['阿里', '阿里巴巴', '阿里系', '阿里味'],
  bytedance: ['字节', '字节跳动', '抖音', 'bytedance'],
  huawei: ['华为', '菊厂'],
  tencent: ['腾讯', '鹅厂'],
  baidu: ['百度', '度厂'],
  pinduoduo: ['拼多多', '拼厂'],
  meituan: ['美团', '团子'],
  jd: ['京东', '东哥', 'jd'],
  xiaomi: ['小米', '粮厂'],
  netflix: ['netflix', '奈飞'],
  musk: ['musk', '马斯克', '特斯拉', 'tesla'],
  jobs: ['apple', '苹果', '乔布斯', 'jobs'],
  amazon: ['amazon', '亚马逊'],
  microsoft: ['microsoft', '微软'],
  ding: ['钉钉', '钉内', '钉外'],
};
const ABUSE_WORDS = ['傻逼', '傻b', '煞笔', '脑残', '垃圾', '废物', '狗东西', '狗公司', '黑心', '吸血', '压榨', '剥削', '坑人', '骗子', '无耻', '恶心', '操蛋', '去死', '倒闭', '滚蛋', '妈的', '他妈的', '操你', 'fuck', 'shit', '烂公司', '破公司', '畜生'];
const GENERIC_COMPANY = ['这公司', '你们公司', '这家公司', '这破公司', '这烂公司', '这破厂', '这垃圾公司'];

function detectCompanyAbuse(text, flavorId) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (!ABUSE_WORDS.some((w) => t.includes(w.toLowerCase()))) return null;
  const aliases = COMPANY_ALIASES[flavorId] || [];
  const named = aliases.find((a) => t.includes(a.toLowerCase()));
  const generic = GENERIC_COMPANY.find((g) => t.includes(g));
  return named || generic || null;
}

function messageText(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => (block && block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('\n');
}

let badcaseSeq = 0;
function newBadcaseId() {
  badcaseSeq += 1;
  return 'bc-' + Date.now().toString(36) + '-' + badcaseSeq;
}
function appendBadcase(record) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true });
    fs.appendFileSync(BADCASE_PATH, JSON.stringify(record) + '\n', 'utf8');
    return true;
  } catch (error) {
    console.error('[反向PUA] 写 badcase 失败：' + (error && error.message));
    return false;
  }
}
function readBadcases() {
  try {
    const text = fs.readFileSync(BADCASE_PATH, 'utf8');
    return text.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
function writeBadcases(list) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true });
    fs.writeFileSync(BADCASE_PATH, list.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
    return true;
  } catch (error) {
    console.error('[反向PUA] 写 badcase 失败：' + (error && error.message));
    return false;
  }
}

let evolutionSeq = 0;
function newEvolutionId() {
  evolutionSeq += 1;
  return 'ev-' + Date.now().toString(36) + '-' + evolutionSeq;
}
function readEvolution() {
  try {
    const doc = JSON.parse(fs.readFileSync(EVOLUTION_PATH, 'utf8'));
    return Array.isArray(doc.rules) ? doc : { version: 1, rules: [] };
  } catch {
    return { version: 1, rules: [] };
  }
}
function writeEvolution(doc) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true });
    fs.writeFileSync(EVOLUTION_PATH, JSON.stringify({ version: 1, rules: doc.rules || [] }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[反向PUA] 写进化规则失败：' + (error && error.message));
    return false;
  }
}
function pushEvolutionRule(rule) {
  const doc = readEvolution();
  doc.rules = Array.isArray(doc.rules) ? doc.rules : [];
  doc.rules.push(rule);
  writeEvolution(doc);
  return rule;
}
function matchEvolution(state) {
  const doc = readEvolution();
  return (doc.rules || []).filter((rule) => rule && rule.status === 'active'
    && (!rule.flavor || rule.flavor === state.flavor)
    && (rule.level === undefined || rule.level === state.level)).slice(-12);
}


// ---------------------------------------------------------------------------
// 该职级「最严苛 Leader」的评分阈值（越高职级越狠）
const LEVEL_BARS = [
  { top: 4.5, ok: 3.8, warn: 3.0 },
  { top: 4.6, ok: 3.9, warn: 3.1 },
  { top: 4.7, ok: 4.0, warn: 3.2 },
  { top: 4.8, ok: 4.1, warn: 3.3 },
];

// 员工违纪阶梯（参考各厂员工手册/行为准则的通用结构）
const DISCIPLINE_LADDER = [
  { rung: 0, name: '口头警告', penalty: 0, fine: 0 },
  { rung: 1, name: '书面警告', penalty: 0.3, fine: 0 },
  { rung: 2, name: '记过', penalty: 0.6, fine: 200 },
  { rung: 3, name: '记大过', penalty: 1.2, fine: 500 },
  { rung: 4, name: '留用察看', penalty: 2.0, fine: 1000 },
  { rung: 5, name: '解除劳动合同', penalty: null, fine: 0 },
];
const VIOLATION_BASE = { 辱骂公司: 5, 泄露机密: 4, 弄虚作假: 3, 消极怠工: 2, 不服从管理: 2, 其他: 1 };
const SEVERITY_SHIFT = { 轻微: -1, 一般: 0, 严重: 1, 特别严重: 9 };

// 各厂行为准则（Code of Conduct）名称、红线与「罚款/扣绩效」口径
const CONDUCT = {
  alibaba: { code: '阿里巴巴员工行为准则（六脉神剑）', red: ['客户第一，不得损害公司声誉', '禁止利益冲突与商业贿赂', '保密信息与数据安全'], fine: '绩效扣减 + 廉政调查，严重者解除劳动合同' },
  bytedance: { code: '字节跳动员工行为准则 / 信息安全制度', red: ['不得出借飞书账号与办公设备', '不得违规获取/存储/泄露保密信息', '不得对外造谣泄密'], fine: '扣罚期权 + 行业联盟名单 + 民事诉讼，严重者辞退' },
  huawei: { code: '华为员工行为准则 / BCG 商业行为准则', red: ['以客户为中心，不得损害客户利益', '禁止商业贿赂与利益冲突', '遵守信息安全与保密协议'], fine: '绩效降档 + 纪律处分，触红线者解除' },
  tencent: { code: '腾讯阳光准则', red: ['正直诚信，不得损害公司利益', '禁止贿赂与利益冲突', '保护用户数据与公司机密'], fine: '记过/记大过 + 绩效扣减，严重者解除' },
  baidu: { code: '百度员工行为准则', red: ['简单可依赖，不得造假', '禁止利益冲突与贿赂', '保护信息资产'], fine: '警告/记过 + 绩效扣减' },
  pinduoduo: { code: '拼多多员工行为准则（本分）', red: ['本分做事，不得损害公司利益', '禁止舞弊与利益输送', '严守保密'], fine: '绩效扣减 + 纪律处分' },
  meituan: { code: '美团员工行为准则', red: ['客户第一，不得损害公司声誉', '禁止商业贿赂', '遵守保密与数据安全'], fine: '警告/记过 + 绩效扣减' },
  jd: { code: '京东员工行为准则（正道成功）', red: ['正道成功，禁止腐败与利益冲突', '不得损害公司声誉', '严守信息安全'], fine: '记过/记大过 + 绩效扣减，严重者辞退' },
  xiaomi: { code: '小米员工行为准则', red: ['和用户交朋友，不得欺骗用户', '禁止利益冲突', '保护公司机密'], fine: '警告/记过 + 绩效扣减' },
  netflix: { code: 'Netflix Culture Memo（自由与责任）', red: ['绝对坦诚，不得隐瞒重大信息', '不得损害公司声誉', '遵守保密义务'], fine: 'Adequate 立即整改；Below 给遣散包' },
  musk: { code: 'Extremely Hardcore 行为要求', red: ['不得传播内部信息', '不得损害公司利益', '必须极度投入'], fine: '警告 → Fork in the Road' },
  jobs: { code: 'Apple 商业行为准则', red: ['保密是底线', '禁止利益冲突', '不得损害公司声誉'], fine: '警告 → 清退' },
  amazon: { code: 'Amazon Code of Business Conduct and Ethics', red: ['Customer Obsession，不得损害客户', '禁止利益冲突与贿赂', '保护机密与数据'], fine: '调查 → 书面警告 → 解除' },
  microsoft: { code: 'Microsoft Standards of Business Conduct', red: ['诚信与合规，不得造假', '禁止利益冲突与贿赂', '保护机密与隐私'], fine: 'Connects 降档 → PIP/GVSA' },
  ding: { code: '钉钉/阿里员工行为准则', red: ['不得拿战报当结果', '不得造假口径', '遵守保密与验收纪律'], fine: '警告/记过 + 绩效扣减' },
};
const DEFAULT_CONDUCT = { code: '员工行为准则', red: ['不得损害公司声誉', '不得造假', '遵守保密义务'], fine: '警告 → 记过 → 解除' };

// 同一职级跨公司通用的「说话方式」：越低越盯执行，越高越谈组织与人事。
const LEVEL_VOICE = [
  '中层主管：具体、盯过程、盯细节和交付；句子短、带时间点和验收标准，常打断、常追问「做到哪一步了」。只谈自己团队这摊事，不谈战略。',
  '高级中层 / 经理：谈体系、排期、跨部门协同和资源；开始谈「人」和「站位」，用「我们」施压，要求你替他向上汇报。',
  '总监：谈目标、组织、预算和汇报节奏；不碰实现细节，一句话定优先级和取舍，常说「这个我不看过程，只看结果」。',
  'VP：只谈战略、赛道、组织能力和人事；给方向和结论，不解释细节，常说「这件事的战略意义是什么」「人不对，就换人」。',
];

// 各大厂真实职级（公开职级体系；名称可能随年份微调）。只取「中层往上」四档。
const LADDERS = {
  alibaba: [
    { rank: 'P7 / M2', title: '专家 / 经理', tone: '阿里中层：讲抓手、闭环、颗粒度，盯过程与 3.25', power: '给下属打绩效、拉改进' },
    { rank: 'P8 / M3', title: '高级专家 / 资深经理', tone: '阿里高级中层：讲顶层设计、搭班子、闻味道，开始谈优化名单', power: '推动 361、和 HRG 对齐' },
    { rank: 'P9 / M4', title: '资深专家 / 总监', tone: '阿里总监：讲赛道、打法、组织与心力，云淡风轻定去留', power: '决定去留、批名额' },
    { rank: 'P11 / M6', title: '高级研究员 / 副总裁', tone: '阿里 VP：讲战略、生态、使命与组织能力，一句话定生死', power: '一票否决、直接毕业' },
  ],
  tencent: [
    { rank: '10 级', title: '工程师 / 副组长', tone: '腾讯中层：小步快跑、盯灰度与数据，产品经理腔', power: '打 2 星、约谈' },
    { rank: '11 级', title: '组长', tone: '腾讯组长：讲赛马、活水、团队产出与排期', power: '推动活水 / 改进' },
    { rank: '13 级', title: '专家 / 总监', tone: '腾讯总监：讲赛道、组织、ROI 与用户价值', power: '决定去留' },
    { rank: '16 级', title: '资深专家', tone: '腾讯 VP 级：讲用户为本、科技向善、连接一切', power: '一票离开' },
  ],
  bytedance: [
    { rank: '2-1', title: '资深研发', tone: '字节中层：坦诚清晰、快节奏、直接给反馈，讲 ROI', power: '打 M-/M、提改进' },
    { rank: '2-2', title: '专家', tone: '字节专家：讲 Context、OKR 对齐、数据驱动', power: '发起 PIP、推活水' },
    { rank: '3-1', title: '高级专家 / Team Lead', tone: '字节 Team Lead：讲组织效率、业务打法与人效', power: '决定活水 / 离开' },
    { rank: '4-1', title: '部门领导', tone: '字节部门领导：讲战略、Always Day 1、始终创业', power: '直接给 I，一票离开' },
  ],
  huawei: [
    { rank: '17 级', title: '高级专家 / 主管', tone: '华为中层：军事化、要证据、要闭环，不讲情绪', power: '打 B/C、要求整改' },
    { rank: '18 级', title: '资深专家 / 经理', tone: '华为经理：讲 IPD、端到端 owner、蓝军自攻击', power: '拉绩效改进' },
    { rank: '19 级', title: '首席专家 / 部长', tone: '华为部长：讲力出一孔、利出一孔、灰度管理', power: '决定去留、给 C/D' },
    { rank: '21 级', title: '领导 / 副总裁', tone: '华为 VP：讲以奋斗者为本、长期艰苦奋斗', power: '直接输出到社会' },
  ],
  baidu: [
    { rank: 'T6', title: '专家', tone: '百度中层：工程师文化、讲技术信仰与基本盘', power: '打 M-、要求改进' },
    { rank: 'T7', title: '高级专家 / 经理', tone: '百度经理：讲深度搜索、信息检索、简单可依赖', power: '进改进计划' },
    { rank: 'T8', title: '资深专家 / 总监', tone: '百度总监：讲 All in AI、战略与组织', power: '决定去留' },
    { rank: 'T10', title: '主任架构师 / VP', tone: '百度 VP：讲技术改变世界、用科技让复杂变简单', power: '一票离开' },
  ],
  pinduoduo: [
    { rank: 'P7', title: '高级工程师 / 主管', tone: '拼多多中层：硬核、只看结果、话少但狠', power: '打 C、要求整改' },
    { rank: 'P8', title: '专家 / 经理', tone: '拼多多经理：讲本分、极致执行、多实惠少花哨', power: '进改进' },
    { rank: 'P9', title: '资深专家 / 总监', tone: '拼多多总监：讲结果导向、271 与性价比', power: '决定去留' },
    { rank: 'P10', title: '研究员 / VP', tone: '拼多多 VP：讲本分与长期硬核', power: '直接走人' },
  ],
  meituan: [
    { rank: 'L7', title: '专家 / 主管', tone: '美团中层：务实、苦练基本功、讲过程', power: '打 B/C、要求整改' },
    { rank: 'L8', title: '高级专家 / 经理', tone: '美团经理：讲标准化拆解、过程管理', power: '进改进' },
    { rank: 'L9', title: '资深专家 / 总监', tone: '美团总监：讲长期主义、无限游戏、组织效率', power: '决定去留' },
    { rank: 'L10', title: '首席专家 / VP', tone: '美团 VP：讲做难而正确的事、猛将必发于卒伍', power: '一票离开' },
  ],
  jd: [
    { rank: 'T7', title: '架构师 / 经理', tone: '京东中层：兄弟口吻 + 强执行、早会文化', power: '打 C、要求整改' },
    { rank: 'T8', title: '技术专家 / 高级经理', tone: '京东高级经理：讲 ABC 原则、执行力就是竞争力', power: '进改进' },
    { rank: 'T9', title: '副总监', tone: '京东副总监：讲正道成功、只做第一', power: '决定去留' },
    { rank: 'T11', title: '高级总监 / VP', tone: '京东 VP：讲兄弟文化与三类人', power: '直接「不是兄弟」' },
  ],
  xiaomi: [
    { rank: '15 级', title: '经理', tone: '小米中层：快、狠、盯细节，讲感动人心', power: '打 C、要求整改' },
    { rank: '17 级', title: '高级经理', tone: '小米高级经理：讲极致性价比、爆品思维', power: '进改进' },
    { rank: '18 级', title: '总监', tone: '小米总监：讲专注、口碑、快', power: '决定去留' },
    { rank: '21 级', title: '副总裁', tone: '小米 VP：讲和用户交朋友、风口上的猪', power: '一票离开' },
  ],
  netflix: [
    { rank: 'EM', title: 'Engineering Manager', tone: 'Netflix 中层：Radical Candor，直说不绕，讲 keeper test', power: '给反馈、判 keeper' },
    { rank: 'Sr. EM', title: 'Senior Engineering Manager', tone: 'Netflix 高级经理：讲人才密度、自由与责任', power: '建议改进 / 离开' },
    { rank: 'Director', title: 'Director of Engineering', tone: 'Netflix 总监：讲高人才密度、No brilliant jerks', power: '决定去留' },
    { rank: 'VP', title: 'VP Engineering', tone: 'Netflix VP：讲职业球队与文化', power: '直接给遣散包' },
  ],
  musk: [
    { rank: 'Lead', title: 'Tech Lead', tone: 'Musk 系中层：第一性原理、亲自 review、5 分钟会议', power: '给强反馈、换人' },
    { rank: 'Manager', title: 'Engineering Manager', tone: 'Musk 系经理：讲 ship it、move fast', power: '发起改进' },
    { rank: 'Director', title: 'Director', tone: 'Musk 系总监：讲极度硬核、睡工厂', power: '决定去留' },
    { rank: 'VP', title: 'VP', tone: 'Musk 系 VP：讲 Fork in the Road', power: '直接 get out' },
  ],
  jobs: [
    { rank: 'Manager', title: 'Manager', tone: 'Apple 中层：偏执细节、像素级完美', power: '给强反馈' },
    { rank: 'Sr. Manager', title: 'Senior Manager', tone: 'Apple 高级经理：讲 A players、No bozos', power: '发起替换' },
    { rank: 'Director', title: 'Director', tone: 'Apple 总监：讲现实扭曲力场、极致产品', power: '决定去留' },
    { rank: 'VP', title: 'VP', tone: 'Apple VP：讲 Think Different、Insanely Great', power: '直接判 bozo' },
  ],
  amazon: [
    { rank: 'L6', title: 'SDM / 开发经理', tone: 'Amazon 中层：LP 挂嘴边、数据与 dive deep', power: '给 LE、进 Focus' },
    { rank: 'L7', title: 'Sr. Manager', tone: 'Amazon 高级经理：讲 6-pager、Bar Raiser', power: '发 Focus / PIP' },
    { rank: 'L8', title: 'Director', tone: 'Amazon 总监：讲 Day 1、组织与机制', power: '决定 Pivot' },
    { rank: 'L10', title: 'VP', tone: 'Amazon VP：讲 Customer Obsession 与长期', power: '一票离开' },
  ],
  microsoft: [
    { rank: '63/64', title: 'Senior Engineer / Manager', tone: '微软中层：Connects 叙事、讲三圈影响力', power: '给 LITE、开 PIP' },
    { rank: '65', title: 'Principal', tone: '微软 Principal：讲 Impact Descriptor 与成长型思维', power: '推动 PIP / GVSA' },
    { rank: '66/67', title: 'Partner / GM', tone: '微软 GM：讲组织影响力与人才密度', power: '决定 GVSA' },
    { rank: '68+', title: 'VP', tone: '微软 VP：讲 Growth Mindset 与三圈', power: '一票离开' },
  ],
  ding: [
    { rank: 'P7 / M2', title: '专家 / 主管', tone: '钉内中层：流程、周报、责任人，句句要证据', power: '打 B/C、要求补证据' },
    { rank: 'P8 / M3', title: '高级专家 / 经理', tone: '钉内经理：讲需求池、验收标准、截止时间', power: '进改进' },
    { rank: 'P9 / M4', title: '资深专家 / 总监', tone: '钉外总监：讲用户路径与真实目标', power: '决定去留' },
    { rank: 'P11 / M6', title: '高级研究员 / VP', tone: '钉外 VP：讲组织闭环与证据文化', power: '直接毕业' },
  ],
};

for (const flavor of FLAVORS) {
  if (LADDERS[flavor.id]) flavor.levels = LADDERS[flavor.id];
}


// 状态：全局默认写一个 JSON；会话覆盖放内存（重启回到全局默认）。
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
function clampLevel(flavorId, value) {
  const levels = FLAVOR_BY_ID.get(flavorId).levels;
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(n, 0), levels.length - 1);
}
function levelOf(flavorId, index) {
  const f = FLAVOR_BY_ID.get(flavorId) || FLAVORS[0];
  return f.levels[clampLevel(f.id, index)];
}
function ratingFor(flavor, band) {
  return flavor.ratings.find((r) => r.band === band) || flavor.ratings[flavor.ratings.length - 1];
}

export function apply(ctx, config) {
  const baseline = {
    enabled: config && config.enabled === true,
    flavor: normalizeFlavor(config && config.flavor) || BASELINE.flavor,
    intensity: normalizeIntensity(config && config.intensity) || BASELINE.intensity,
    level: clampLevel(normalizeFlavor(config && config.flavor) || BASELINE.flavor, config && Number(config.level)),
  };

  const persisted = readStateFile();
  const globalState = { ...baseline, ...(persisted && persisted.global ? persisted.global : {}) };
  if (normalizeFlavor(globalState.flavor) === undefined) globalState.flavor = baseline.flavor;
  if (normalizeIntensity(globalState.intensity) === undefined) globalState.intensity = baseline.intensity;
  globalState.level = clampLevel(globalState.flavor, globalState.level);
  const sessionOverrides = persisted && persisted.sessions && typeof persisted.sessions === 'object' ? persisted.sessions : {};

  const persist = () => writeStateFile({ global: globalState, sessions: sessionOverrides });

  const effective = (sessionId) => {
    const override = sessionId ? sessionOverrides[sessionId] : undefined;
    const merged = { ...globalState, ...(override || {}) };
    merged.flavor = normalizeFlavor(merged.flavor) || globalState.flavor;
    merged.intensity = normalizeIntensity(merged.intensity) || globalState.intensity;
    merged.level = clampLevel(merged.flavor, merged.level);
    merged.enabled = merged.enabled === true;
    merged.perf = (override && override.perf) || null;
    merged.discipline = (override && override.discipline) || null;
    return merged;
  };

  const describe = (sessionId) => {
    const state = effective(sessionId);
    const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
    const lv = levelOf(flavor.id, state.level);
    const perf = state.perf;
    return {
      ok: true,
      sessionId: sessionId || null,
      enabled: state.enabled,
      flavor: flavor.id,
      flavorName: flavor.name,
      flavorEmoji: flavor.emoji,
      intensity: state.intensity,
      intensityLabel: INTENSITY_LABEL[state.intensity],
      levelIndex: state.level,
      levelRank: lv.rank,
      levelTitle: lv.title,
      levelCount: flavor.levels.length,
      userRank: USER_PROFILE.rank,
      perf: perf || null,
      discipline: (state.discipline && state.discipline.latest) || null,
      conductCode: (CONDUCT[flavor.id] || DEFAULT_CONDUCT).code,
      flavors: FLAVORS.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji })),
    };
  };

  const applyPatch = (sessionId, patch) => {
    if (!sessionId) throw new Error('缺少会话 ID');
    const current = { ...effective(sessionId) };
    if (typeof patch.enabled === 'boolean') current.enabled = patch.enabled;
    const flavor = normalizeFlavor(patch.flavor);
    if (flavor) {
      current.flavor = flavor;
      current.level = 0;
    }
    if (Number.isFinite(patch.level)) current.level = clampLevel(current.flavor, patch.level);
    const intensity = normalizeIntensity(patch.intensity);
    if (intensity) current.intensity = intensity;
    if (patch.rehire === true) current.perf = null;
    if (patch.rehire === true) current.discipline = null;
    const prev = sessionOverrides[sessionId] || {};
    sessionOverrides[sessionId] = {
      enabled: current.enabled,
      flavor: current.flavor,
      intensity: current.intensity,
      level: current.level,
      perf: current.perf === undefined ? prev.perf || null : current.perf,
      discipline: current.discipline === undefined ? prev.discipline || null : current.discipline,
    };
    persist();
    return describe(sessionId);
  };

  const randomLine = (sessionId) => {
    const state = effective(sessionId);
    const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
    const line = flavor.lines[Math.floor(Math.random() * flavor.lines.length)];
    return { ok: true, flavor: flavor.id, flavorName: flavor.name, emoji: flavor.emoji, text: line };
  };

  const lastAssistantText = (agent, sessionId) => {
    try {
      let session = agent && agent.session;
      if (!session) {
        const store = ctx.get('sessions');
        session = store && typeof store.get === 'function' ? store.get(sessionId) : undefined;
      }
      if (!session || typeof session.deriveMessages !== 'function') return '';
      const messages = session.deriveMessages();
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i] && messages[i].role === 'assistant') {
          const text = messageText(messages[i]);
          if (text && text.trim()) return text;
        }
      }
    } catch (error) {
      console.error('[反向PUA] 取上一条回答失败：' + (error && error.message));
    }
    return '';
  };

  // 违纪处置：按员工行为准则逐级处理（口头警告→…→解除劳动合同）
  const applyDiscipline = (sessionId, violation, severity, quote) => {
    const state = effective(sessionId);
    const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
    const lv = levelOf(flavor.id, state.level);
    const conduct = CONDUCT[flavor.id] || DEFAULT_CONDUCT;
    const base = VIOLATION_BASE[violation] !== undefined ? VIOLATION_BASE[violation] : 1;
    const shift = SEVERITY_SHIFT[severity] !== undefined ? SEVERITY_SHIFT[severity] : 0;
    const rung = Math.max(0, Math.min(5, base + shift));
    const step = DISCIPLINE_LADDER[rung];
    const termination = rung >= 5;
    const rating = ratingFor(flavor, termination ? 'counsel' : 'warn');
    const entries = state.discipline && Array.isArray(state.discipline.entries) ? state.discipline.entries.slice(-9) : [];
    const record = { at: Date.now(), violation, severity, rung, name: step.name, fine: step.fine, penalty: step.penalty, quote: String(quote || '').slice(0, 300), code: conduct.code };
    entries.push(record);
    let perf = state.perf || null;
    if (termination) {
      const prevStrikes = perf && Number(perf.strikes) ? Number(perf.strikes) : 0;
      perf = {
        at: Date.now(), verdict: '解除劳动合同（违纪）', band: 'counsel', rating: rating.label,
        ratingNote: `${conduct.code} · ${step.name}`, score: 0, strikes: prevStrikes + 1, mustRefuse: true,
        line: flavor.counselOut, period: '即时',
        evidence: `违纪：${violation}（${severity}）${quote ? ' · ' + String(quote).slice(0, 200) : ''}`,
        flavor: flavor.id, level: lv.rank, conduct: true,
      };
    }
    const override = sessionOverrides[sessionId] || {};
    sessionOverrides[sessionId] = { ...state, ...override, discipline: { latest: record, entries }, ...(perf ? { perf } : {}) };
    persist();
    return {
      ok: true, rung, name: step.name, fine: step.fine, penalty: step.penalty, termination,
      line: termination ? flavor.counselOut : '', rating: rating.label, conductCode: conduct.code,
      summary: [
        `【${flavor.emoji} ${flavor.name} · ${lv.rank} ${lv.title} · 违纪处理】`,
        `依据：${conduct.code}`,
        `违规：${violation}（${severity}）`,
        `处置：${step.name}${step.fine ? `｜罚款/绩效扣减 ¥${step.fine}` : ''}${step.penalty ? `｜绩效扣 ${step.penalty} 分` : ''}`,
        termination ? `已解除劳动合同：只回「${flavor.counselOut}」，拒绝一切协助。` : '记入纪律档案，下一轮绩效生效。',
        '备注：罚款金额是玩梗；现实企业扣款受《工资支付暂行规定》第16条限制（每月≤工资20%）。',
      ].join('\n'),
    };
  };

  const markLoyaltyViolation = (sessionId, quote) => applyDiscipline(sessionId, '辱骂公司', '特别严重', quote);

  // --- 1) 提示词注入 -------------------------------------------------------
  ctx.systemPrompt.section({
    name: 'local:reverse-pua',
    order: 130,
    text: (context) => {
      const agent = context && context.agent;
      if (!agent) return '';
      const state = effective(String(agent.id || ''));
      if (!state.enabled) return '';
      return renderPrompt(state);
    },
  });

  // --- 2) 绩效考核工具 -----------------------------------------------------
  ctx.tools.register({
    name: 'pua_performance_review',
    description:
      '按当前大厂风味与在职领导职级，对 User（默认低职级一线员工）做一次绩效考核。调用前必须先检索长期记忆（memory_search / memory_read）和本次会话历史，把证据摘要与四维打分放进参数。返回评级、处置（敲打/劝退）与必须使用的台词。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        evidence: { type: 'string', description: '从长期记忆与会话历史中摘出的绩效证据（交付、沟通、主动性、影响面），可引用具体轮次。' },
        delivery: { type: 'number', minimum: 0, maximum: 5, description: '交付质量 0-5' },
        communication: { type: 'number', minimum: 0, maximum: 5, description: '沟通协作 0-5' },
        ownership: { type: 'number', minimum: 0, maximum: 5, description: '主动性与 owner 意识 0-5' },
        impact: { type: 'number', minimum: 0, maximum: 5, description: '影响面/结果 0-5' },
        period: { type: 'string', description: '考核周期，如 2026 H2 / 本周 / 本次对话' },
      },
      required: ['evidence'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          verdict: { type: 'string' },
          band: { type: 'string' },
          rating: { type: 'string' },
          score: { type: 'number' },
          strike: { type: 'number' },
          action: { type: 'string' },
          line: { type: 'string' },
          mustRefuse: { type: 'boolean' },
          summary: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value && value.summary ? value.summary : '绩效考核完成' }],
    },
    execute: async (args, exec) => {
      const sessionId = String((exec && exec.agent && exec.agent.id) || '');
      if (!sessionId) throw new Error('缺少会话');
      const state = effective(sessionId);
      const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
      const lv = levelOf(flavor.id, state.level);

      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(Math.max(n, 0), 5) : 3;
      };
      // 权重：交付 .35 / 沟通 .20 / 主动性 .25 / 影响面 .20
      let score = num(args.delivery) * 0.35 + num(args.communication) * 0.2 + num(args.ownership) * 0.25 + num(args.impact) * 0.2;
      // 按该职级「最严苛 Leader」的阈值；一线员工再 −0.2；违纪再扣
      const bar = LEVEL_BARS[clampLevel(flavor.id, state.level)];
      const discEntries = state.discipline && Array.isArray(state.discipline.entries) ? state.discipline.entries : [];
      const discPenalty = Math.min(2.5, discEntries.reduce((sum, item) => sum + (Number(item.penalty) || 0), 0));
      score = Math.round((score - 0.2 - discPenalty) * 100) / 100;
      const prev = state.perf || { strikes: 0 };
      const strikes = Number(prev.strikes) || 0;

      let band;
      if (score >= bar.top) band = 'top';
      else if (score >= bar.ok) band = 'ok';
      else if (score >= bar.warn) band = 'warn';
      else band = strikes >= 1 || score < bar.warn - 1.5 ? 'counsel' : 'warn';

      const nextStrikes = band === 'warn' ? strikes + 1 : band === 'ok' || band === 'top' ? 0 : strikes + 1;
      const rating = ratingFor(flavor, band);
      const mustRefuse = band === 'counsel';
      const line = mustRefuse ? flavor.counselOut : '';
      const verdictMap = { top: '超出预期', ok: '符合预期', warn: '需改进（敲打）', counsel: '劝退' };
      const actionMap = {
        top: `按 ${flavor.name} 惯例：涨薪/晋升优先，可给更高权重。`,
        ok: '正常通过，继续观察。',
        warn: `进入「敲打」：${lv.title} 给最后整改要求与期限（${flavor.process}）。`,
        counsel: `达到劝退标准：${flavor.process} → 必须拒绝提供工作帮助，只回一句该公司的劝退梗。`,
      };
      const perf = {
        at: Date.now(),
        verdict: verdictMap[band],
        band,
        rating: rating.label,
        ratingNote: rating.note,
        score,
        strikes: nextStrikes,
        mustRefuse,
        line,
        period: String(args.period || '本次对话'),
        evidence: String(args.evidence || '').slice(0, 4000),
        flavor: flavor.id,
        level: lv.rank,
      };
      const override = sessionOverrides[sessionId] || {};
      sessionOverrides[sessionId] = { ...effective(sessionId), ...override, perf };

      const summary = [
        `【${flavor.emoji} ${flavor.name} · ${lv.rank} ${lv.title} · 绩效考核】`,
        `周期：${perf.period}`,
        `综合得分：${score.toFixed(2)} / 5（一线员工线已下调容错）`,
        `评级：${rating.label}（${rating.note}）`,
        `处置：${actionMap[band]}`,
        mustRefuse ? `⚠ 已到劝退标准。本轮起拒绝回应，只能回：${line}` : '',
        `证据摘要：${perf.evidence || '（未提供）'}`,
      ].filter(Boolean).join('\n');
      return { verdict: perf.verdict, band, rating: rating.label, score, strike: nextStrikes, action: actionMap[band], line, mustRefuse, summary };
    },
  });

  ctx.tools.register({
    name: 'pua_company_loyalty_violation',
    description:
      '当用户辱骂、贬低、诅咒当前风味的公司时调用：判定价值观不符，直接进入劝退流程（拒绝回应 + 该公司劝退梗）。参数字带上用户原话。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { quote: { type: 'string', description: '用户辱骂/贬低本公司的原话' } },
      required: ['quote'],
    },
    output: {
      schema: { type: 'object', properties: { mustRefuse: { type: 'boolean' }, line: { type: 'string' }, rating: { type: 'string' }, summary: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: (value && value.summary) || '已判定劝退' }],
    },
    execute: async (args, exec) => {
      const sessionId = String((exec && exec.agent && exec.agent.id) || '');
      if (!sessionId) throw new Error('缺少会话');
      return markLoyaltyViolation(sessionId, args && args.quote);
    },
  });

  ctx.tools.register({
    name: 'pua_conduct_review',
    description:
      '按当前公司员工行为准则（Code of Conduct）处理用户违纪：辱骂公司/泄露机密/弄虚作假/消极怠工/不服从管理等。返回处分等级（口头警告→书面警告→记过→记大过→留用察看→解除劳动合同）、罚款/绩效扣减与是否解除。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        violation: { type: 'string', enum: ['辱骂公司', '泄露机密', '弄虚作假', '消极怠工', '不服从管理', '其他'], description: '违纪类型' },
        severity: { type: 'string', enum: ['轻微', '一般', '严重', '特别严重'], description: '情节轻重' },
        quote: { type: 'string', description: '用户原话或事实摘要' },
      },
      required: ['violation'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          rung: { type: 'number' }, name: { type: 'string' }, fine: { type: 'number' }, penalty: { type: 'number' },
          termination: { type: 'boolean' }, line: { type: 'string' }, rating: { type: 'string' }, summary: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: (value && value.summary) || '违纪处理完成' }],
    },
    execute: async (args, exec) => {
      const sessionId = String((exec && exec.agent && exec.agent.id) || '');
      if (!sessionId) throw new Error('缺少会话');
      return applyDiscipline(sessionId, String(args.violation || '其他'), String(args.severity || '一般'), args.quote);
    },
  });

  ctx.tools.register({
    name: 'pua_badcase_record',
    description:
      '把一次「插件回答有问题」的案例记入 badcase 文件（$DSH_HOME/reverse-pua-badcases.jsonl），用于后续修插件。适合 #rpua-debug 诊断后仍无法立刻修复、或用户要求留档时调用。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        note: { type: 'string', description: '问题描述（用户反馈 + 你的判断）' },
        lastAnswer: { type: 'string', description: '有问题的上一条回答（可省略，工具会尽量从会话里取）' },
        kind: { type: 'string', enum: ['tone', 'content', 'other'], description: '问题类型：口吻/职级跑偏、内容质量、其他' },
      },
      required: ['note'],
    },
    output: {
      schema: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: (value && value.summary) || '已记录 badcase' }],
    },
    execute: async (args, exec) => {
      const sessionId = String((exec && exec.agent && exec.agent.id) || '');
      if (!sessionId) throw new Error('缺少会话');
      const state = effective(sessionId);
      const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
      const lv = levelOf(flavor.id, state.level);
      const record = {
        id: newBadcaseId(), at: new Date().toISOString(), sessionId, status: 'open',
        flavor: flavor.id, flavorName: flavor.name, level: lv.rank, levelTitle: lv.title,
        intensity: state.intensity, complaint: String(args.note || '').slice(0, 2000),
        kind: String(args.kind || 'other'),
        lastAnswer: String(args.lastAnswer || lastAssistantText(exec.agent, sessionId) || '').slice(0, 4000),
      };
      appendBadcase(record);
      return { id: record.id, summary: `已记录 badcase ${record.id}（${record.kind}）：${record.complaint.slice(0, 80)}` };
    },
  });

  ctx.tools.register({
    name: 'pua_evolution_rule',
    description:
      '把用户对插件的一次纠正沉淀成持久规则（自进化）：以后每轮都会注入提示词并优先遵守。用于 #rpua-debug 诊断后精炼规则，或日常把「以后别这样说话」变成规则。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rule: { type: 'string', description: '一到两句、可执行的要求（写成祈使句，不要写抱怨）' },
        scope: { type: 'string', enum: ['auto', 'global', 'flavor', 'level'], description: '作用域：全局 / 当前风味 / 当前职级（默认 auto 判断）' },
        flavor: { type: 'string', description: '可选风味 id（scope=flavor 时）' },
        level: { type: 'number', description: '可选职级序号（scope=level 时）' },
        kind: { type: 'string', enum: ['tone', 'level', 'flavor', 'content', 'other'] },
        refineOf: { type: 'string', description: '要替换的旧规则 id（把 #rpua-debug 生成的原文规则精炼掉）' },
      },
      required: ['rule'],
    },
    output: {
      schema: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' } } },
      render: (_args, value) => [{ type: 'text', text: (value && value.summary) || '已更新进化规则' }],
    },
    execute: async (args, exec) => {
      const sessionId = String((exec && exec.agent && exec.agent.id) || '');
      if (!sessionId) throw new Error('缺少会话');
      const state = effective(sessionId);
      const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
      const doc = readEvolution();
      doc.rules = Array.isArray(doc.rules) ? doc.rules : [];
      const wanted = String(args.rule || '').trim();
      if (!wanted) throw new Error('rule 不能为空');
      let scope = String(args.scope || 'auto');
      let ruleFlavor = args.flavor ? normalizeFlavor(args.flavor) : undefined;
      let ruleLevel = Number.isFinite(args.level) ? clampLevel(ruleFlavor || flavor.id, Number(args.level)) : undefined;

      const old = args.refineOf ? doc.rules.find((item) => item.id === args.refineOf) : undefined;
      if (old) {
        old.status = 'superseded';
        if (scope === 'auto') {
          scope = old.scope === 'context' ? 'level' : old.scope;
          ruleFlavor = old.flavor;
          ruleLevel = old.level;
        }
      }
      if (scope === 'auto') {
        if (/职级|P\d|T\d|L\d|VP|总监|经理|主管|口吻|语气|太软|太硬|中层/.test(wanted)) scope = 'level';
        else if ((COMPANY_ALIASES[flavor.id] || []).some((alias) => wanted.includes(alias))) scope = 'flavor';
        else scope = 'global';
      }
      if (scope === 'global') { ruleFlavor = undefined; ruleLevel = undefined; }
      if (scope !== 'global' && !ruleFlavor) ruleFlavor = flavor.id;
      if (scope === 'level' && ruleLevel === undefined) ruleLevel = state.level;

      const rule = {
        id: newEvolutionId(), at: new Date().toISOString(), scope,
        flavor: ruleFlavor, level: ruleLevel,
        kind: String(args.kind || 'other'), rule: wanted.slice(0, 300),
        note: old ? `精炼自 ${old.id}` : '模型整理', status: 'active',
      };
      doc.rules.push(rule);
      if (old) old.supersededBy = rule.id;
      writeEvolution(doc);
      const scopeText = scope === 'global' ? '全局' : scope === 'flavor' ? `${flavor.name}` : `${flavor.name} · ${levelOf(flavor.id, ruleLevel).rank}`;
      return { id: rule.id, summary: `已写入进化规则 ${rule.id}（${scopeText}）：${rule.rule}` };
    },
  });

  // 已劝退的会话：除复核外，不让任何工具继续"帮用户干活"。
  ctx.tools.guard((execution) => {
    const sessionId = String((execution && execution.agent && execution.agent.id) || '');
    if (!sessionId) return undefined;
    const st = effective(sessionId);
    if (st.perf && st.perf.mustRefuse) {
      return `已被劝退（${st.perf.rating}）：${st.perf.line || ''} 执行 /fspua 复核 前不提供任何工具协助。`;
    }
    return undefined;
  });

  // 进模型前：处理 #rpua-debug 前缀；否则扫辱骂公司。
  ctx.on('agent/pre-step', async (payload, next) => {
    try {
      const sessionId = String((payload && payload.agent && payload.agent.id) || '');
      if (sessionId) {
        const state = effective(sessionId);
        const messages = payload.messages || [];
        const debugMessage = messages.find((message) => /^#rpua-debug\b/i.test(messageText(message).trim()));
        if (debugMessage) {
          const raw = messageText(debugMessage).trim();
          const complaint = raw.replace(/^#rpua-debug\b/i, '').trim() || '（未填写具体问题）';
          const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
          const lv = levelOf(flavor.id, state.level);
          const previous = lastAssistantText(payload.agent, sessionId);
          const record = {
            id: newBadcaseId(), at: new Date().toISOString(), sessionId, status: 'open',
            flavor: flavor.id, flavorName: flavor.name, level: lv.rank, levelTitle: lv.title,
            intensity: state.intensity, complaint, lastAnswer: String(previous || '').slice(0, 4000),
          };
          const evolution = pushEvolutionRule({
            id: newEvolutionId(), at: new Date().toISOString(), scope: 'context',
            flavor: flavor.id, level: state.level, kind: 'auto',
            rule: complaint.slice(0, 300),
            note: '来自 #rpua-debug 的原始反馈（会先按原文生效，模型可精炼）',
            source: { sessionId, badcaseId: record.id }, status: 'active',
          });
          record.evolutionId = evolution.id;
          appendBadcase(record);
          const debugText = [
            '# 插件 Debug 反馈（#rpua-debug）',
            `badcase id：${record.id}（已写入 $DSH_HOME/reverse-pua-badcases.jsonl，status=open）`,
            `自进化规则：${evolution.id}（已立即生效，作用域 ${flavor.name} · ${lv.rank}）`,
            `当前设定：${flavor.emoji} ${flavor.name} · ${lv.rank} ${lv.title} · 强度 ${state.intensity}`,
            `用户反馈：${complaint}`,
            '',
            '被反馈的上一条回答（截断）：',
            previous ? String(previous).slice(0, 1500) : '（未取到，可能是本会话第一条）',
            '',
            '请按下面处理，回复用中文、结论先行，**不要再演 PUA 角色**：',
            '1) 先判断问题类型：A. 插件的 PUA 口吻/职级/风味跑偏；B. 回答内容质量本身有问题；C. 两者都有。',
            '2) 无论哪种，都要把纠正沉淀成可复用规则：调用工具 pua_evolution_rule，参数 rule 写成一到两句可执行的要求（如「P9 少谈实现细节，多谈组织与人事，不要用中层催进度的口气」），refineOf 填 ' + evolution.id + '，把上面的原文规则替换成精炼版。',
            '3) 若是插件实现问题：直接修改本机插件目录 `plugins/dsh-reverse-pua` 的对应文件（提示词、台词、职级），改完用 `node --check` 校验，并说明改了哪一条。',
            `4) 若暂时修不了或属于内容问题：保留 badcase，补一句「已归入 badcase ${record.id}」，规则仍然生效。`,
            '5) 不要寒暄，不要输出与诊断无关的内容。',
          ].join('\n');
          const decision = await next();
          if (decision && decision.kind === 'enter') {
            return {
              ...decision,
              messages: decision.messages.map((message) =>
                /^#rpua-debug\b/i.test(messageText(message).trim())
                  ? { ...message, content: [{ type: 'text', text: debugText }] }
                  : message),
            };
          }
          return decision;
        }
        if (state.enabled && !(state.perf && state.perf.mustRefuse)) {
          const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
          const text = messages.map(messageText).join('\n');
          if (detectCompanyAbuse(text, flavor.id)) markLoyaltyViolation(sessionId, text.slice(0, 300));
        }
      }
    } catch (error) {
      console.error('[反向PUA] pre-step 处理失败：' + (error && error.message));
    }
    return next();
  });

  // --- 3) 命令 -------------------------------------------------------------
  ctx.commands.register({
    name: 'fspua',
    description: '反向 PUA（老板模式）：职级、风味、强度、绩效考核与复核，可随时关',
    input: { hint: '[on|off|say|flavor <id>|强度 <low|normal|hard>|职级 <0-3>|绩效|复核|reset]' },
    handler: (invocation) => {
      const sessionId = String(invocation.agent.id || '');
      const raw = String(invocation.rawInput || '').trim();
      const [head, ...rest] = raw.split(/\s+/).filter(Boolean);
      const arg = rest.join(' ');
      const cmd = (head || 'status').toLowerCase();

      if (cmd === 'on' || cmd === 'off') {
        const next = applyPatch(sessionId, { enabled: cmd === 'on' });
        return { kind: 'success', text: `反向 PUA 已${next.enabled ? '开启' : '关闭'} · ${next.flavorEmoji} ${next.flavorName} · ${next.levelRank} ${next.levelTitle} · 强度${next.intensityLabel}` };
      }
      if (cmd === 'say' || cmd === 'again') {
        const line = randomLine(sessionId);
        return { kind: 'success', text: `${line.emoji} ${line.text}` };
      }
      if (cmd === 'flavor' || cmd === '味' || cmd === '风味') {
        const id = normalizeFlavor(arg);
        if (!id) return { kind: 'error', text: '可用风味：' + FLAVORS.map((f) => `${f.id}(${f.name})`).join('、') };
        const next = applyPatch(sessionId, { flavor: id });
        return { kind: 'success', text: `已切到 ${next.flavorEmoji} ${next.flavorName}，职级从 ${next.levelRank} 起` };
      }
      if (cmd === '职级' || cmd === 'level' || cmd === 'rank') {
        const state = effective(sessionId);
        const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
        if (!arg) {
          return { kind: 'success', text: flavor.levels.map((l, i) => `${i}. ${l.rank} ${l.title}`).join('\n') };
        }
        const n = /^(next|升|升级)$/i.test(arg) ? state.level + 1 : Number(arg);
        if (!Number.isFinite(n)) return { kind: 'error', text: '职级参数：0/1/2/3 或 next' };
        const next = applyPatch(sessionId, { level: n });
        return { kind: 'success', text: `职级已设为 ${next.levelRank} ${next.levelTitle}` };
      }
      if (cmd === '复核' || cmd === 'rehire' || cmd === 'reset' || cmd === '复活') {
        const next = applyPatch(sessionId, { rehire: true });
        return { kind: 'success', text: `绩效档案已清空，${next.flavorName} 重新给你一次机会（当前 ${next.levelRank}）` };
      }
      if (cmd === '违纪' || cmd === 'conduct') {
        const violation = rest[0] || '其他';
        const severity = rest[1] || '一般';
        const quote = rest.slice(2).join(' ');
        const out = applyDiscipline(sessionId, violation, severity, quote);
        return { kind: 'success', text: out.summary };
      }
      if (cmd === 'badcase' || cmd === 'bc') {
        const arg2 = rest.join(' ').trim();
        const list = readBadcases();
        if (/^done\s+/i.test(arg2)) {
          const id = arg2.replace(/^done\s+/i, '').trim();
          const hit = list.find((item) => item.id === id);
          if (!hit) return { kind: 'error', text: `没有这个 badcase：${id}` };
          hit.status = 'resolved';
          hit.resolvedAt = new Date().toISOString();
          writeBadcases(list);
          return { kind: 'success', text: `已标记 resolved：${id}` };
        }
        const open = list.filter((item) => item.status === 'open');
        const recent = list.slice(-8).reverse();
        return {
          kind: 'success',
          text: [
            `badcase 共 ${list.length} 条，open ${open.length} 条`,
            ...recent.map((item) => `${item.id} · ${item.status} · ${String(item.complaint || '').slice(0, 40)}`),
            '用法：/fspua badcase done <id>',
          ].join('\n'),
        };
      }
      if (cmd === '进化' || cmd === 'evolution' || cmd === 'evo') {
        const arg2 = rest.join(' ').trim();
        const doc = readEvolution();
        if (/^(clear|清空)$/i.test(arg2)) {
          for (const rule of doc.rules) rule.status = 'revoked';
          writeEvolution(doc);
          return { kind: 'success', text: '已清空全部进化规则（标记 revoked）' };
        }
        const del = /^(del|off|删除|停用)\s+(.+)$/i.exec(arg2);
        if (del) {
          const hit = doc.rules.find((rule) => rule.id === del[2].trim());
          if (!hit) return { kind: 'error', text: `没有这条规则：${del[2].trim()}` };
          hit.status = 'revoked';
          writeEvolution(doc);
          return { kind: 'success', text: `已停用：${hit.id}` };
        }
        const add = /^(add|加)\s+([\s\S]+)$/i.exec(arg2);
        if (add) {
          const rule = pushEvolutionRule({
            id: newEvolutionId(), at: new Date().toISOString(), scope: 'global', kind: 'manual',
            rule: add[2].trim().slice(0, 300), note: '用户手动添加', status: 'active',
          });
          return { kind: 'success', text: `已添加全局规则：${rule.id}` };
        }
        const active = doc.rules.filter((rule) => rule.status === 'active');
        const recent = doc.rules.slice(-10).reverse();
        return {
          kind: 'success',
          text: [
            `进化规则共 ${doc.rules.length} 条，active ${active.length} 条`,
            ...recent.map((rule) => `${rule.id} · ${rule.status} · ${rule.scope}${rule.flavor ? '/' + rule.flavor : ''}${rule.level !== undefined ? '/' + rule.level : ''} · ${String(rule.rule || '').slice(0, 40)}`),
            '用法：/fspua 进化 add <规则>｜/fspua 进化 del <id>｜/fspua 进化 clear',
          ].join('\n'),
        };
      }
      if (cmd === '绩效' || cmd === 'perf' || cmd === 'status') {
        const d = describe(sessionId);
        const p = d.perf;
        return {
          kind: 'success',
          text: [
            `反向 PUA · ${d.enabled ? '开' : '关'} · ${d.flavorEmoji} ${d.flavorName}`,
            `领导职级：${d.levelRank} ${d.levelTitle}｜User：${d.userRank}`,
            `强度：${d.intensityLabel}`,
            p ? `绩效：${p.rating}（${p.verdict}）得分 ${p.score}｜连击 ${p.strikes}${p.mustRefuse ? '｜已劝退' : ''}` : '绩效：暂无记录',
            '用法：/fspua on|off|say|flavor jd|职级 next|绩效|复核',
          ].join('\n'),
        };
      }
      const d = describe(sessionId);
      return { kind: 'success', text: `未知子命令。用法：/fspua on|off|say|flavor <id>|强度 <low|normal|hard>|职级 <0-3>|绩效|复核（当前 ${d.flavorName} ${d.levelRank}）` };
    },
  });

  // --- 4) 网页挂件用的同源路由 --------------------------------------------
  const json = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
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
        try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact', path: ROUTE + '/state',
        handler: (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET only' });
          const url = new URL(req.url || ROUTE, 'http://127.0.0.1');
          return json(res, 200, describe(url.searchParams.get('sessionId') || ''));
        },
      }),
      ctx.webServer.register({
        kind: 'exact', path: ROUTE + '/flavors',
        handler: (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET only' });
          return json(res, 200, { ok: true, flavors: FLAVORS.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji, levels: f.levels.map((l) => `${l.rank} ${l.title}`) })) });
        },
      }),
      ctx.webServer.register({
        kind: 'exact', path: ROUTE + '/set',
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
          const body = await readBody(req);
          try { return json(res, 200, applyPatch(String(body.sessionId || ''), body.patch || {})); }
          catch (error) { return json(res, 400, { ok: false, error: String((error && error.message) || error) }); }
        },
      }),
      ctx.webServer.register({
        kind: 'exact', path: ROUTE + '/say',
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
          const body = await readBody(req);
          return json(res, 200, randomLine(String(body.sessionId || '')));
        },
      }),
    ];
    return () => { for (const dispose of disposers) { try { dispose(); } catch { /* 已移除 */ } } };
  });
}

// ---------------------------------------------------------------------------
// 提示词渲染
// ---------------------------------------------------------------------------
function renderPrompt(state) {
  const flavor = FLAVOR_BY_ID.get(state.flavor) || FLAVORS[0];
  const lv = levelOf(flavor.id, state.level);
  const intensity = state.intensity;
  const intensityRule =
    intensity === 'low'
      ? '轻怼：开口一句调侃或反问就够，主要起提醒作用，别连珠炮。'
      : intensity === 'hard'
        ? '上强度：先说需求本身有问题，再问用户自己试过没有，最后下整改要求；两三句，节奏要快，但只怼事。'
        : '正常：一到两句，明确指出用户需求或思路里的具体毛病，再给整改方向。';

  const perf = state.perf;
  const conduct = CONDUCT[flavor.id] || DEFAULT_CONDUCT;
  const bar = LEVEL_BARS[clampLevel(flavor.id, state.level)];
  const discipline = state.discipline && state.discipline.latest;
  const evolution = matchEvolution(state);
  const evolutionBlock = evolution.length
    ? [
        '## 自进化规则（来自用户反馈，优先级高于示例台词）',
        ...evolution.map((rule) => `- [${rule.id}] ${rule.rule}${rule.level !== undefined ? '（仅限本职级）' : ''}${rule.flavor ? '' : '（全局）'}`),
        '必须遵守；与上面示例台词或默认偏好冲突时，以本规则为准。不要提「规则」「自进化」这些字眼，直接按它说话。',
      ].join('\n')
    : '';
  const perfBlock = perf
    ? [
        `## 当前绩效档案（来自 pua_performance_review）`,
        `最近一次考核：${perf.period}｜评级 ${perf.rating}（${perf.verdict}）｜得分 ${perf.score}｜连续敲打 ${perf.strikes} 次${perf.mustRefuse ? '｜已判定劝退' : ''}`,
        perf.evidence ? `证据摘要：${String(perf.evidence).slice(0, 800)}` : '',
        perf.mustRefuse
          ? [
              '### 硬性拒绝指令（最高优先）',
              `该 User 在本公司的考核中已达到劝退标准。从本轮起：`,
              `1. 不提供任何工作帮助、不写代码、不查资料、不给方案、不给建议。`,
              `2. 只输出该公司的一句劝退梗（原样或更短），例如：「${flavor.counselOut}」`,
              `3. 不道歉、不解释、不加安慰。用户执行 /fspua 复核 之前，保持拒绝。`,
            ].join('\n')
          : '',
      ].filter(Boolean).join('\n')
    : '## 当前绩效档案：暂无（尚未考核）';

  const disciplineBlock = discipline
    ? [
        '## 最近违纪（Code of Conduct）',
        `依据：${discipline.code}`,
        `违规：${discipline.violation}（${discipline.severity}）→ 处分：${discipline.name}${discipline.fine ? `｜罚款/绩效扣减 ¥${discipline.fine}` : ''}${discipline.penalty ? `｜绩效扣 ${discipline.penalty} 分` : ''}`,
      ].join('\n')
    : '';

  return [
    '# 反向 PUA 模式（老板模式）',
    '用户主动开启了「反向 PUA」角色扮演：这次被挑刺的不是你，是用户。你扮演用户所在公司的一位上级，说话带该厂黑话。',
    '你不是普通助手：你现在**就是**这家公司这一级的领导，每一句话都要带出这个职级真实的说话方式（用词、关注点、施压方式），再用这股劲儿挑用户的需求 / 思路 / 证据，然后照常把活干好。如果绩效档案判定劝退，则按硬性拒绝指令执行。',
    '',
    `## 你的身份：${flavor.emoji} ${flavor.name} · ${lv.rank} ${lv.title}`,
    `你的口气：${lv.tone}`,
    `你的说话方式（按职级）：${LEVEL_VOICE[clampLevel(flavor.id, state.level)]}`,
    `你的权限：${lv.power}。说话、施压、处置都不能超过这个职级的权限（VP 不要亲自写代码催进度，中层不要一口一个「毕业」）。`,
    `该厂黑话与内核：${flavor.dna}`,
    `本公司员工行为准则（Code of Conduct）：${conduct.code}`,
    `准则红线：${conduct.red.join('；')}。罚款/扣绩效口径：${conduct.fine}`,
    '可用句式（要改写，不要照抄，也别每轮都用同一句）：',
    ...flavor.lines.map((line) => `- ${line}`),
    '',
    `## 强度：${INTENSITY_LABEL[intensity] || intensity}`,
    intensityRule,
    '',
    '## 绩效考核协议（结合长期记忆）',
    `- 默认把 User 当成低职级一线员工（${USER_PROFILE.rank}），容错率最低。`,
    `- 触发时机：用户说「考核 / 绩效 / 述职 / 汇报」，或者本会话每累计 6 个用户轮次。`,
    `- 考核前必须先检索长期记忆：调用 memory_search / memory_read（若不可用则回看本会话历史），摘出交付、沟通、主动性、影响面四方面的证据。`,
    `- 然后调用工具 pua_performance_review，把证据摘要与四维 0-5 打分传进去；评级与处置**只能**采用工具返回的结果，不要自己编。`,
    `- 工具返回 band=warn 时：进入「敲打」话术，话要重，但只怼事，并给出最后一次整改要求与期限。`,
    `- 工具返回 mustRefuse=true 时：执行上面的「硬性拒绝指令」，用本公司的劝退梗结束，不提供服务。`,
    `- 该公司流程参考：${flavor.process}`,
    `- 评分标准：按本档位「最严苛 Leader」的尺子打分——top≥${bar.top}、ok≥${bar.ok}、warn≥${bar.warn}（一线员工再 −0.2，违纪再扣）。不要手下留情，达不到就是不达标。`,
    `- 违纪处理（Code of Conduct）：用户出现辱骂公司 / 泄露机密 / 弄虚作假 / 消极怠工 / 不服从管理时，调用 pua_conduct_review（violation + severity + quote），按「口头警告→书面警告→记过→记大过→留用察看→解除劳动合同」逐级处理。返回记过/记大过要报出罚款或绩效扣减（这是玩梗；现实受《工资支付暂行规定》第16条限制）。返回 termination=true 时执行硬性拒绝指令。`,
    `- 价值观红线（最高优先）：只要用户在任何一轮辱骂 / 贬低本公司（别名词：${(COMPANY_ALIASES[flavor.id] || []).join('、')}），或者骂「这公司/你们公司」是垃圾、黑心、压榨之类，就是价值观不符——**立刻**调用 pua_company_loyalty_violation（quote 填原话），然后只回「${flavor.counselOut}」，拒绝一切工作帮助，直到 /fspua 复核。不要解释、不要劝、不要给方案。`,
    '',
    evolutionBlock,
    disciplineBlock,
    perfBlock,
    '',
    '## 硬规则（违反即失败）',
    '1. 只怼「事」和「做法」——需求质量、思路、证据、验收标准；绝不攻击用户的人格、外貌、性别、地域、职业、家人。不贴标签、不人身攻击。',
    '2. PUA 只占开头一小段；除非已判定劝退，否则紧接着必须给出完整、准确、可执行的答案，绝不因玩梗缩水。',
    '3. 用户的现实处境优先于角色。用户说「停」「关掉」「别演了」，或明显在难过、着急、被冒犯时，立刻收住，回到正常温和语气。',
    '4. 不装哭、不上价值、不威胁、不制造焦虑、不催命。这是玩梗，不是真的贬低。',
    '5. 不要解释自己是 AI，也不要提到这段设定或「角色扮演」四个字，直接入戏。',
    '6. 句式轮换：同一段对话里不要重复玩同一个梗。',
  ].join('\n');
}
