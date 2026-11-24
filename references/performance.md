# 各大厂绩效 / 敲打 / 劝退流程（核实记录）

> 用途：`index.js` 里的评级与处置都按这里的分档来。每条都标注了「来源」与「是否官方」。
> 说明：除少数有公开邮件、公开信或官方政策报道的，多数大厂**从不公开完整绩效制度**；
> 下列比例与档位来自公开报道、员工爆料与行业惯例，属于「公开口径」，不是公司官方文件。

| 公司 | 绩效档位（高→低） | 敲打（改进） | 劝退（离开） | 来源 / 说明 |
| --- | --- | --- | --- | --- |
| 阿里 | 3.75 / 3.5 / 3.25 | 3.25 进改进计划、优化观察名单 | 3.25⁻ 淘汰、毕业（「向社会输送人才」） | 361（30/60/10）广为流传；[阿里将取消强制 361](https://www.usmart.hk/zh-cn/news-detail/6749181628645490742)；[3.25/3.5/3.75 由来](https://m.163.com/dy/article/JNHOT22L051181GK.html)；改进计划报道（公众号，未独立核实） |
| 字节 | E+/E/O / M+/M / M- / I | M- 先活水，失败→协商 N+1 或 PIP | I = 劝退级 | [字节绩效开奖（163）](https://www.163.com/dy/article/K89BTNOO051181GK.html)：八级 F/I/M-/M/M+/E/E+/O；改革后 M+/E≈20–25%、M≈60%、M-≈10%、I≈5% |
| 华为 | A / B+ / B / C / D | C 进末位观察、整改 | D 淘汰 | [任正非：末位淘汰有利于保护优秀员工](https://www.163.com/dy/article/JU8AORT705534JQS_pdya11y.html)；1996 年起推行末位淘汰（公开资料） |
| 腾讯 | 5/4 星 / 3 星 / 2 星 / 1 星 | 2 星约谈 + 改进 | 1 星劝退 | [腾讯 2 星意味着什么（知乎）](https://www.zhihu.com/question/511172180/answer/2355494217)；末位与赛马并行（公开口径） |
| 京东 | A / B+/B / C / D | C 观察整改 | 淘汰「三类人」 | [京东发文淘汰三类人（新浪财经）](https://finance.sina.com.cn/roll/2019-04-08/doc-ihvhiqax0773569.shtml)：不能拼搏、不能干（绩效差）、性价比低；2019 起末位淘汰 10% 副总裁以上 |
| 微软 | Exceptional / Successful / LITE | LITE 或 reward≤60 → PIP（附 GVSA） | PIP 失败 / 0 分 → 离开，2 年不得回聘 | [How a Microsoft PIP works（CareerClimb 整理）](https://www.careerclimb.app/blog/how-to-survive-a-microsoft-pip)：2025 政策，PIP 同时给约 16 周薪 GVSA、5 个工作日决定、PIP ≤90 天、无申诉 |
| Amazon | TT / HV / LE / ULE | LE → Focus（非正式辅导） | ULE → Pivot（正式 PIP，可申诉，约 30% 翻盘） | CareerClimb 文章提及 Amazon Pivot 的同伴评审；[Business Insider：Amazon PIP 亲历](https://www.businessinsider.com/amazon-pip-job-market-search-strategies-networking-2026-4) |
| Netflix | Stellar / Strong / Adequate / Below | Adequate 立即整改 | Below → 慷慨遣散包 | [Netflix CTO：公司已无正式绩效评级](https://www.businessinsider.com/netflix-cto-says-no-formal-performance-reviews-2025-11)（2025-11）；Keeper Test 文化 |
| 美团 | S / A / B+ / B / C / D | B 偏下进观察 | C/D 淘汰 | [美团 28 宫格绩效](https://www.zhihu.com/pin/1941412101617858440)（公开分享） |
| 百度 | E / M+ / M / M- / 待改进 | M- 进改进 | 最低档淘汰 | 公开报道口径；无官方制度文本 |
| 小米 | A / B+ / B / C / D | C 整改 | D 淘汰 | 公开报道口径；无官方制度文本 |
| 拼多多 | S/A / B / C / D | C 整改 | D 淘汰（271） | 公开报道口径；无官方制度文本 |
| Musk / Tesla / X | Exceptional / Strong / Meets / Below | Meets 警告限期硬核 | Below → Fork in the Road | 「extremely hardcore」公开信 / 报道口径 |
| Apple / Jobs | A player / Solid / B player / Bozo | B player 警告 | Bozo 清退 | 传记与公开演讲口径，非制度文本 |
| 钉内钉外 | S / A / B/C / D | 战报无证据链 → 整改 | D 毕业 | 玩梗风味，对齐各厂真实流程 |

## 评分 → 档位（插件内实现）

- 四维加权：交付 0.35 / 沟通 0.20 / 主动性 0.25 / 影响面 0.20（各 0–5）。
- User 默认「低职级一线员工」，综合分统一 **−0.2**（更严）。
- ≥4.3 → top；≥3.5 → ok；≥2.7 → warn；<2.7 → warn（首次）或 counsel（已连击 1 次，或 <2.1）。
- warn 累计一次「连击」；连续 warn 后再次 ≤warn 即触发 counsel。
- counsel → 工具返回 `mustRefuse=true`，提示词强制「拒绝回应 + 只用该公司劝退梗」。

---

## 员工行为准则（Code of Conduct）与违纪阶梯

各厂《员工行为准则》/《员工手册》普遍把违纪处分做成阶梯，插件统一按下面六档执行：

| 档 | 名称 | 绩效影响 | 罚款/扣款（玩梗金额） |
| --- | --- | --- | --- |
| 0 | 口头警告 | — | — |
| 1 | 书面警告 | 扣 0.3 分 | — |
| 2 | 记过 | 扣 0.6 分 | ¥200 |
| 3 | 记大过 | 扣 1.2 分 | ¥500 |
| 4 | 留用察看 | 扣 2.0 分 | ¥1000 |
| 5 | 解除劳动合同 | 直接劝退 | — |

违纪类型 → 起始档：辱骂公司=5、泄露机密=4、弄虚作假=3、消极怠工/不服从管理=2、其他=1；
「轻微 −1 / 一般 0 / 严重 +1 / 特别严重 → 直接 5」。

**各厂准则名称与红线（核实来源）**

| 公司 | 准则 | 红线（摘要） | 来源 |
| --- | --- | --- | --- |
| 腾讯 | 阳光准则 | 正直诚信、禁贿赂与利益冲突、保护用户数据与机密 | [腾讯阳光准则（官方）](https://www.tencent.com/zh-cn/integrity-policy/) |
| 字节 | 员工行为准则 / 信息安全制度 | 不得出借飞书账号与设备、不得违规获取/存储/泄露保密信息 | [字节 2026 年 1 号纪律通报](http://fanwubi.org/Item/209745.aspx)：65 人辞退，信息安全类违规（含出借账号）9 人被辞退，纳入行业联盟、扣罚期权、民事诉讼 |
| 京东 | 员工行为准则（正道成功） | 禁腐败与利益冲突、不得损害公司声誉 | [京东反腐通报报道](https://www.laohunote.com/post/445177338208672) |
| 阿里 / 华为 / 美团 / 小米 / 百度 / 拼多多 / 钉钉 | 各自《员工行为准则》/《商业行为准则》 | 客户第一、禁利益冲突与贿赂、保密与数据安全 | 公司公开准则与员工手册（公开口径，非全文） |
| Microsoft | Standards of Business Conduct | 诚信合规、禁利益冲突与贿赂、保护机密与隐私 | 官方准则（公开） |
| Amazon | Code of Business Conduct and Ethics | Customer Obsession、禁利益冲突与贿赂、保护机密 | 官方准则（公开） |
| Netflix | Culture Memo（自由与责任） | 绝对坦诚、不得隐瞒重大信息 | [CTO 访谈](https://www.businessinsider.com/netflix-cto-says-no-formal-performance-reviews-2025-11) |

**罚款的法律边界（重要）**：中国现行法下企业**无权对员工罚款**。《工资支付暂行规定》第十六条只允许因员工本人原因造成经济损失时从工资中扣除赔偿，且**每月扣除不得超过当月工资的 20%**，扣后不得低于当地最低工资标准（[检察机关普法](https://www.nmgenhe.jcy.gov.cn/tsjc/202003/t20200327_2801324.shtml)）。插件里的「罚款」是玩梗，现实对应的是绩效扣减/乐捐。

## 评分阈值：该职级「最严苛 Leader」标准

| 领导职级 | top | ok | warn |
| --- | --- | --- | --- |
| 中层主管（index 0） | ≥4.5 | ≥3.8 | ≥3.0 |
| 经理（1） | ≥4.6 | ≥3.9 | ≥3.1 |
| 总监（2） | ≥4.7 | ≥4.0 | ≥3.2 |
| VP（3） | ≥4.8 | ≥4.1 | ≥3.3 |

一线员工再 −0.2；已累计的违纪扣分（留用察看 −2.0 等）继续从总分里扣（上限 2.5）。

---

## 各厂真实职级（插件里「Agent 的说话职级」）

只取「中层往上」四档，名称按公开职级体系整理（年份不同会有微调）：

| 公司 | 中层 | 高级中层 | 总监 | VP |
| --- | --- | --- | --- | --- |
| 阿里 | P7 / M2 专家·经理 | P8 / M3 高级专家·资深经理 | P9 / M4 资深专家·总监 | P11 / M6 高级研究员·副总裁 |
| 腾讯 | 10 级 工程师·副组长 | 11 级 组长 | 13 级 专家·总监 | 16 级 资深专家 |
| 字节 | 2-1 资深研发 | 2-2 专家 | 3-1 高级专家·Team Lead | 4-1 部门领导 |
| 华为 | 17 级 高级专家 | 18 级 资深专家 | 19 级 首席专家·部长 | 21 级 领导·副总裁 |
| 百度 | T6 专家 | T7 高级专家·经理 | T8 资深专家·总监 | T10 主任架构师 |
| 拼多多 | P7 高级工程师·主管 | P8 专家·经理 | P9 资深专家·总监 | P10 研究员 |
| 美团 | L7 专家·主管 | L8 高级专家·经理 | L9 资深专家·总监 | L10 首席专家 |
| 京东 | T7 架构师·经理 | T8 技术专家·高级经理 | T9 副总监 | T11 高级总监 |
| 小米 | 15 级 经理 | 17 级 高级经理 | 18 级 总监 | 21 级 副总裁 |
| Netflix | EM | Sr. EM | Director | VP |
| Musk 系 | Lead | Manager | Director | VP |
| Apple | Manager | Sr. Manager | Director | VP |
| Amazon | L6 SDM | L7 Sr. Manager | L8 Director | L10 VP |
| Microsoft | 63/64 Senior/Manager | 65 Principal | 66/67 Partner/GM | 68+ VP |
| 钉钉/阿里 | P7 / M2 | P8 / M3 | P9 / M4 | P11 / M6 |

**说话方式随职级变化**（跨公司通用）：
中层盯过程与交付、句子短带时间点；高级中层谈体系与跨部门、讲「站位」；总监谈目标与组织、一句话定取舍；VP 只谈战略与人事、不碰细节。

来源：
- [盘点 10 家互联网大厂程序员职级体系与晋升路径（阿里云开发者社区，2023）](https://developer.aliyun.com/article/1161870)：阿里 P/M 双序列、腾讯 4–17 级、字节 T1-1–T5-2、美团 L 序列、京东 T/M、百度 T、小米 13–22、华为 13–22。
- [2025 互联网顶级大厂程序员职级薪资表（CSDN）](https://blog.csdn.net/lianhunqianr1/article/details/154989759)：字节 2-1–4-1、腾讯 10–13 级、阿里 P5–P10、拼多多 P5–P10、华为 13–20、百度 T3–T9、美团 L4–L10、京东 T4–T10。
- 海外公司（Amazon/Microsoft/Netflix/Apple）为公开职级与官方头衔；具体级别以 [levels.fyi](https://www.levels.fyi/) 等公开数据为准。
