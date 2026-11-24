# 反向 PUA（Reverse PUA）· DSH 插件

> 平时是 dsh-pua 逼 AI 别敷衍；这个插件反过来——把大厂毒舌老板的劲儿，对准你。

「反向 PUA」把 [MichengAI/dsh-pua](https://github.com/MichengAI/dsh-pua) `assets/pua` 里的 15 种大厂风味话术**方向翻过来**：
每轮对话开头，助手先用当前风味的口气挑一遍你的需求 / 思路 / 证据，然后照常把活干好。

- 默认**关闭**，只在你自己打开的那个会话里生效。
- 只怼「事」和「做法」，不怼人：提示词里写死了不许人身攻击、不许降低答案质量。
- 你说「停 / 关掉 / 别演了」，或者情绪不对，它就该收手。

## 装

在能操作本机的 Agent 里，把本目录装进当前 profile：

```
dsh plugin --profile desktop add link:/Users/johnnyzhap/Documents/DS/plugins/dsh-reverse-pua
```

或用 Agent 的 `plugin_manager`：`action: install_bundle`，`target` 填本目录绝对路径。

装完重载 DSH。输入 `/fspua status` 能看到状态就说明后端起来了。

## 用

聊天输入框下方会出现一枚小胶囊：`● 反向PUA · 老板在休息`。

| 控件 | 作用 |
| --- | --- |
| 关 / 开 | 开关当前会话的反向 PUA |
| 🟠 阿里味 ⇄ | 点一下换下一种大厂风味（共 15 种） |
| 来一句 | 当场抽一句该风味的台词，先感受一下 |

命令：

| 命令 | 作用 |
| --- | --- |
| `/fspua on` / `/fspua off` | 开关当前会话 |
| `/fspua say` | 来一句 |
| `/fspua flavor huawei` | 指定风味（alibaba / bytedance / huawei / tencent / baidu / pinduoduo / meituan / jd / xiaomi / netflix / musk / jobs / amazon / microsoft / ding） |
| `/fspua 强度 hard` | 强度：low / normal / hard |
| `/fspua status` | 看当前状态 |

全局默认（`enabled` / `flavor` / `intensity`）在 `cordis.patch.yml` 的 `config` 里改；
会话级开关存在 `$DSH_HOME/reverse-pua.json`。

## 结构

- `index.js` — 宿主半边：`systemPrompt.section()` 注入角色设定，`commands.register('/fspua')`，`webServer` 注册 `/dsh-reverse-pua/{state,set,say,flavors}` 同源路由。
- `client.js` — 网页半边：在 `conversation.composer.dock` 插槽渲染小胶囊，fetch 调上面那些路由。
- `locale/{zh,en}.json`、`icon.svg` — 插件列表里的标题、描述和图标。

## 来源与边界

- 本插件原创代码与文档采用 **Apache License 2.0**（见 [LICENSE](LICENSE)）。
- 风味话术改编自 [MichengAI/dsh-pua](https://github.com/MichengAI/dsh-pua) 的 `assets/pua/flavors.md`（上游基于 tanweai/pua 3.5.1，MIT）。第三方素材的署名与许可见 [NOTICE](NOTICE)。
- 这是**玩梗**插件，不是真的职场 PUA。它不会羞辱你、不会催命、不会拿焦虑卖货；发现你在难受就该闭嘴干活。
- 路由只监听本机回环地址，数据只落在 `$DSH_HOME/reverse-pua.json`，不上传。
