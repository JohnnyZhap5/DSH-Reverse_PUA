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
