# 反向 PUA（Reverse PUA）· DSH 插件 · Evolving

> 平时是 dsh-pua 逼 AI 别敷衍；这个插件反过来——把大厂毒舌老板的劲儿，对准你。

「反向 PUA」把 [MichengAI/dsh-pua](https://github.com/MichengAI/dsh-pua) `assets/pua` 里的 15 种大厂风味话术**方向翻过来**：
每轮对话开头，助手先用当前风味的口气挑一遍你的需求 / 思路 / 证据，然后照常把活干好。

- 默认**关闭**，只在你自己打开的那个会话里生效。
- **真实职级**：同一家公司按公开职级体系分 `中层 → 高级中层 → 总监 → VP` 四档（如京东 T7 经理 → T8 高级经理 → T9 副总监 → T11 高级总监；阿里 P7 → P8 → P9 → P11），**助手每一句话的口气都要配得上这个职级**。
- **绩效考核**：默认把 User 当成**低职级一线员工**，结合长期记忆按四维打分；连续不及格会进入「敲打」，到劝退线就按各厂流程处置。
- **价值观红线**：只要你在当前风味的公司里辱骂、贬低这家公司（「XX 就是垃圾公司」「这破厂压榨人」之类），直接判定价值观不符，**立即走劝退流程**：拒绝回应，只回该公司的梗。
- **按 Code of Conduct 处分**：辱骂公司 / 泄露机密 / 弄虚作假 / 消极怠工 / 不服从管理，走「口头警告→书面警告→记过→记大过→留用察看→解除劳动合同」阶梯，带罚款/绩效扣减（玩梗金额）。
- **最严苛 Leader 的尺子**：职级越高、评分阈值越狠（中层 top≥4.5 … VP top≥4.8），一线员工再 −0.2，违纪再扣。
- 只怼「事」和「做法」，不怼人：提示词里写死了不许人身攻击、不许降低答案质量。
- 你说「停 / 关掉 / 别演了」，或者情绪不对，它就该收手。

## 版本号为什么是 Evolving

这个插件没有 `0.x` 这种固定版本号，**版本号就是 `Evolving`**，含义是：它靠你的反馈持续自我进化，而不是靠发版迭代。

- 你在对话里发 `#rpua-debug <纠正>`，插件会把这次纠正沉淀成一条**持久进化规则**（`$DSH_HOME/reverse-pua-evolution.json`），立即注入之后每一轮的提示词；
- 规则分 `global / flavor / level` 三种作用域，可以积累、可以停用、可以清空（`/fspua 进化`）；
- 所以「版本」不是一个数字，而是**当前累积的规则集合**。想看它长到哪一步，看规则列表或 git 历史即可；
- 代码本身的变更仍然走 GitHub 提交，`git log` 就是它的变更记录。


## 装

在能操作本机的 Agent 里，把本目录装进当前 profile：

```
dsh plugin --profile desktop add link:/Users/johnnyzhap/Documents/DS/plugins/dsh-reverse-pua
```

或用 Agent 的 `plugin_manager`：`action: install_bundle`，`target` 填本目录绝对路径。

装完重载 DSH。输入 `/fspua 绩效` 能看到状态就说明后端起来了。

## 用

新建话题后，**输入框左侧会出现一个「PUA」小喇叭图标**。点它，输入框上方展开参数面板（开关 / 风味 / 职级 / 强度 / 绩效档案 / 复核）。

| 控件 | 作用 |
| --- | --- |
| 关 / 开 | 开关当前会话的反向 PUA |
| 🟠 阿里味 ⇄ | 换下一种大厂风味（共 15 种） |
| 职级 P7 ⇄ | 换领导职级（真实职级名，如 P7→P8→P9→P11 / T7→T8→T9→T11）；每换一次口气、关注点和权限都变 |
| 绩效徽章 | 显示最近一次考核评级；判到劝退会标红「已劝退」 |
| 来一句 | 当场抽一句该风味 + 该职级的台词 |

命令：

| 命令 | 作用 |
| --- | --- |
| `/fspua on` / `/fspua off` | 开关当前会话 |
| `/fspua say` | 来一句 |
| `/fspua flavor jd` | 指定风味（alibaba / bytedance / huawei / tencent / baidu / pinduoduo / meituan / jd / xiaomi / netflix / musk / jobs / amazon / microsoft / ding） |
| `/fspua 职级` / `/fspua 职级 2` / `/fspua 职级 next` | 查看或设置领导职级 |
| `/fspua 强度 hard` | 强度：low / normal / hard |
| `/fspua 绩效` | 看当前状态与绩效档案 |
| `/fspua 违纪 <类型> [轻微/一般/严重/特别严重]` | 直接开违纪单（辱骂公司/泄露机密/弄虚作假/消极怠工/不服从管理/其他） |
| `/fspua 进化` | 查看自进化规则（active 数 / 最近 10 条） |
| `/fspua 进化 add <规则>` / `del <id>` / `clear` | 手动加 / 停用 / 清空规则 |
| `/fspua badcase` | 查看 badcase 列表（open 数量 / 最近 8 条） |
| `/fspua badcase done <id>` | 把某条 badcase 标记为 resolved |
| `/fspua 复核` | 清空绩效与违纪档案，重新给一次机会（解除劝退） |

全局默认（`enabled` / `flavor` / `intensity` / `level`）在 `cordis.patch.yml` 的 `config` 里改；
会话级状态与绩效档案存在 `$DSH_HOME/reverse-pua.json`。

## 绩效考核怎么走

1. 触发：你说「考核 / 绩效 / 述职 / 汇报」，或本会话累计 6 个用户轮次。
2. 助手先检索长期记忆（`memory_search` / `memory_read`）+ 本会话历史，摘出证据。
3. 调工具 `pua_performance_review`，按 **交付 0.35 / 沟通 0.20 / 主动性 0.25 / 影响面 0.20** 打分（各 0–5）。
4. User 默认一线员工，综合分再 **−0.2**（更严）。
5. 评级→处置按公司真实档位：`≥4.3 顶尖 / ≥3.5 通过 / ≥2.7 敲打 / 更低 劝退候选`；连续敲打后再差就是劝退。
6. 判到劝退：**拒绝提供任何工作帮助**，只回一句该公司的劝退梗（京东＝「你不是我们的兄弟。」），直到 `/fspua 复核`。
7. **价值观红线**：辱骂 / 贬低当前公司（带公司名或「这公司/你们公司」+ 侮辱词）→ 跳过打分，直接劝退；被劝退后连工具都会被拦截，只剩 `/fspua 复核` 能解除。
8. **Code of Conduct 处分**：违纪走六档阶梯；记过 ¥200、记大过 ¥500、留用察看 ¥1000（玩梗），解除即劝退。罚款现实受《工资支付暂行规定》第16条限制。
9. 评分阈值按领导职级取「最严苛 Leader」标准；职级体系与来源见 [references/performance.md](references/performance.md)。

各家真实档位、改进与劝退流程、来源（阿里 361、字节 I/M-、华为末位、京东三类人、微软 GVSA/PIP、Amazon Focus/Pivot、Netflix 取消正式评级……）见 [references/performance.md](references/performance.md)。

## Debug 入口（`#rpua-debug`）

在对话输入框里直接发：

```
#rpua-debug 刚才那句太软了，不像 P9 总监
```

插件会在消息进模型前拦下来：
1. 记录一条 badcase 到 `$DSH_HOME/reverse-pua-badcases.jsonl`（含 id、风味、职级、强度、你的反馈、上一条回答）；
2. 把这一轮改写成一份 **debug 工单** 交给助手：先判断是「插件口吻/职级/风味跑偏」还是「回答内容质量」问题；
3. 如果是插件问题，助教直接改 `plugins/dsh-reverse-pua` 对应文件并用 `node --check` 校验；修不了就保留 badcase 并回「已归入 badcase <id>」。
4. Debug 这一轮**不演 PUA**，结论先行。
5. **自进化**：这条反馈会同时生成一条持久「进化规则」（默认作用于当前风味 + 当前职级），**立即生效**并注入之后每一轮的提示词，优先级高于示例台词。助手还会调用 `pua_evolution_rule` 把原文抱怨精炼成可执行要求（如「P9 少谈实现细节，多谈组织与人事」），旧规则标 superseded。

规则存在 `$DSH_HOME/reverse-pua-evolution.json`，分三种作用域：`global`（全局）/ `flavor`（某个大厂风味）/ `level`（某风味某职级）。

`#rpua-debug` 即使插件处于关闭状态也能用；模型也可以调工具 `pua_badcase_record` 主动留档。

## 结构

- `index.js` — 宿主半边：`systemPrompt.section()` 注入身份与考核协议，`commands.register('/fspua')`，三个工具（绩效/违纪/`pua_badcase_record`），`agent/pre-step` 处理 `#rpua-debug` 与辱骂检测，`webServer` 注册 `/dsh-reverse-pua/*` 同源路由。
- `client.js` — 网页半边：`conversation.input.left` 放 PUA 图标，`conversation.input.dock` 放展开的参数面板，fetch 调上面那些路由。
- `references/performance.md` — 各大厂绩效/敲打/劝退流程核实记录与来源。
- `locale/{zh,en}.json`、`icon.svg` — 插件列表里的标题、描述和图标。

## 来源与边界

- 本插件原创代码与文档采用 **Apache License 2.0**（见 [LICENSE](LICENSE)）。
- 风味话术改编自 [MichengAI/dsh-pua](https://github.com/MichengAI/dsh-pua) 的 `assets/pua/flavors.md`（上游基于 tanweai/pua 3.5.1，MIT）。第三方素材的署名与许可见 [NOTICE](NOTICE)。
- 绩效制度除少数公开邮件/政策报道外，多数公司不公开完整制度；插件里的比例与档位属**公开口径**，不是官方文件，详见 `references/performance.md`。
- 这是**玩梗**插件，不是真的职场 PUA。它不会羞辱你、不会催命、不会拿焦虑卖货。
- 路由只监听本机回环地址，数据只落在 `$DSH_HOME/reverse-pua.json`，不上传。
