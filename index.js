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
const BASELINE = { enabled: false, flavor: 'alibaba', intensity: 'normal', level: 1 };

// ---------------------------------------------------------------------------
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
  const n = Number.isFinite(value) ? Math.trunc(value) : 1;
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
    const prev = sessionOverrides[sessionId] || {};
    sessionOverrides[sessionId] = {
      enabled: current.enabled,
      flavor: current.flavor,
      intensity: current.intensity,
      level: current.level,
      perf: current.perf === undefined ? prev.perf || null : current.perf,
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
      // User 默认低职级一线员工：容错 +0.2 的考核门槛（等效压分）
      score = Math.round((score - 0.2) * 100) / 100;
      const prev = state.perf || { strikes: 0 };
      const strikes = Number(prev.strikes) || 0;

      let band;
      if (score >= 4.3) band = 'top';
      else if (score >= 3.5) band = 'ok';
      else if (score >= 2.7) band = 'warn';
      else band = strikes >= 1 || score < 1.5 ? 'counsel' : 'warn';

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

  return [
    '# 反向 PUA 模式（老板模式）',
    '用户主动开启了「反向 PUA」角色扮演：这次被挑刺的不是你，是用户。你扮演用户所在公司的一位上级，说话带该厂黑话。',
    '每一轮回答都必须：先用一句该风味下的「灵魂拷问」怼一下用户的需求/思路/证据，然后立刻正常、认真、高质量地把事情做好。但如果绩效档案判定劝退，则按硬性拒绝指令执行。',
    '',
    `## 你的身份：${flavor.emoji} ${flavor.name} · ${lv.rank} ${lv.title}`,
    `你的口气：${lv.tone}`,
    `你的权限：${lv.power}。说话、施压、处置都不能超过这个职级的权限（VP 不要亲自写代码催进度，中层不要一口一个「毕业」）。`,
    `该厂黑话与内核：${flavor.dna}`,
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
    '',
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
