# 实验室参赛机会调研助手

在实验室的可视化画布里编辑流程，点击运行，得到适合中国高校实验室的智能体、AI 应用和游戏开发赛事清单。窗口为从运行时刻起的一年。项目基于 `rsi-flow-platform` 的 `da563a1`，画布锁定 `rsi-flow-visual` 的 `43b8f53`。[平台仓库](https://github.com/ymxiong/rsi-flow-platform) · [画布仓库](https://github.com/ymxiong/rsi-flow-visual)

**调研结果**　[8 场赛事的结论与核对记录](docs/赛事调研结果.md) · [原始运行记录（JSON）](public/evidence/first-run.json)

**画布演示**　[40 秒操作回放（字幕）](docs/canvas-demo.mp4) · [可导入的七节点流程](public/evidence/branch-demo.json) · [运行结果截图](public/evidence/branch-run.jpg)

演示以 8 场已采集的赛事为输入。「是否开放投稿」把它们分为 3 场和 5 场，下方分支的「截取前几项」只保留 2 场。导入示例后，勾选三个关注方向并点击「运行历史数据流程」，可以直接比较两个分支的输入和输出。

## 本地打开

环境为 Node.js 22.12+ 和 pnpm 11。实跑使用 Windows、Node 24、pnpm 11、Chrome。首次从 GitHub 获取项目时一起克隆固定版本的画布子模块。

```powershell
git clone --recurse-submodules https://github.com/Paperflyovo/rsi-competition-flow.git
cd rsi-competition-flow
```

已有工作副本可以在项目根目录执行 `git submodule update --init`。在包含本 README 的目录安装依赖并启动调研台。

```powershell
pnpm install --frozen-lockfile
npm --prefix canvas ci
pnpm research
```

访问 [本地调研台](http://127.0.0.1:3210/competitions)。已有服务正在运行时，在项目根目录执行 `npm.cmd --prefix canvas run build` 后刷新页面，即可载入修改后的画布。实时调研以外的编辑和历史数据示例都可在未配置模型的情况下使用。

## 编排流程

打开“新建 / 模板”，选“空白画布”。点“添加节点”放一个“开始”，把它右侧的圆点拖到空白处，从弹出的节点库中选“读取历史实跑”。用同样的方式接上“生成参赛清单”和“结束”。已有节点之间也可以先点输出圆点，再点同色的输入圆点。点“校验”，再到画布下方点“运行历史数据流程”。

要看分支，选“历史赛事分流”模板并勾选三个关注方向。它用随项目保存的 8 场赛事作为输入，以“状态等于已截止”为条件生成两份清单。按历史文件应当得到“已截止归档”1 项、“继续关注”7 项。点击画布上的“是否已截止”可以核对两个输出口的数量和样例。把条件改成“开放投稿”再运行，预期分流变成 3 项和 5 项。这里的日期和状态取自当时的采集记录。

点一条连线可断开或在线上插入节点。点节点能改名、配置参数、查看输入输出。两个分支可分别接不同的输出清单，也可接入“合并去重”的 A、B 两端再统一排序。输出端允许分送，普通输入接一条线，“结束”可收多份清单。未命中的条件出口会跳过该侧的处理，合并节点仍会处理另一侧的数据。按依赖“整理布局”后仍可手动拖动和缩放。

浏览器为当前站点保存一份工作草稿。切换模板可以撤销。要保存多份流程，用“导出”下载流程 JSON，用“导入”恢复。结果区的“下载本次记录”另含实际执行轨迹、清单、模型调用记录和本次所用的图。

## 实时调研

在画布下方打开「运行设置 → 模型服务」。初始选择为「服务端默认」，可以看到已配置的服务域名和模型。也可以选 DeepSeek、OpenAI 或「自定义兼容服务」，填写对应的模型 ID 和 API Key。自定义服务还需填写 HTTPS API 基础地址。选择支持 Chat Completions 和 JSON 对象输出的模型。浏览器会记住服务地址和模型，手动填写的 Key 只保留在当前页面，更换服务或地址后需重新输入。含模型提取节点的流程才会发送这些设置。实际服务域名和返回的模型名可在实时运行结果中查看。[DeepSeek 接口说明](https://api-docs.deepseek.com/) · [OpenAI 接口说明](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

要配置整台机器的默认服务，在启动服务的 PowerShell 中设置 `COMPETITION_LLM_ENV`，值为本机模型配置文件的完整路径。该文件采用 dotenv 格式，需提供 `RADAR_LLM_API_KEY`、`RADAR_LLM_BASE_URL`、`RADAR_LLM_MODEL`。也可将这三个变量直接交给服务端进程。

```powershell
$env:COMPETITION_LLM_ENV = Read-Host '已有模型配置文件的完整路径'
pnpm research
```

若需要让已运行的服务读到新配置，在其终端按 Ctrl+C 后按本段重启。实时模板从所选方向的官网读取公告，并在有公告时调用一次配置的模型。自定义流程可放多个提取节点，同次运行中相同一批公告复用模型结果，不同批次可能分别计费。停止运行会取消后续步骤，已交给模型服务处理的请求可能计费。

## 从画布到结果

1. `canvas/editor.jsx` 使用上游 VisualDiagram。React 16 画布在同源 iframe 运行，宿主沿用平台的 React 19。每次运行提交当时的节点、参数和端口连线。
2. `src/research/nodes.mjs` 定义节点类型、输入输出和参数，`src/research/graph.mjs` 检查类型、输入占用、环路和起止节点，按上游依赖排序。当前单图接收上限为 128 个节点、512 条线，两项数值均为代码限额。
3. `src/research/run.mjs` 把图编译为拓扑执行顺序，交给平台执行器的 `register / load / run`。同一次运行会按原图端口传值，在合流处每个节点最多执行一次。分支按序处理。程序将开始、跳过、成功和失败事件发回画布。`src/research/operations.mjs` 实现各个节点的赛事处理行为。
4. `src/research/sources.mjs` 维护 8 个主办方入口、公告正文提取和日期用途解析。天池的公开介绍页由前端渲染，读取器使用其官方赛程接口。其他来源读取公开网页。
5. `src/research/model.mjs` 把这些原文交给模型提取资格和交付物。程序逐条核对模型短摘录，再将日期用途和窗口合并判定。缺失资格、源站出错或模型失败均可在结果或错误轨迹中识别。

“查看已保存实跑”打开旧版默认实时链的原始记录。该记录包含 8 个画布节点、6 个业务步骤。新版分流、合并的证据来自运行相应的编辑后流程。复核时也可暂时断开一条入线，点“校验”定位缺口，再用“撤销”恢复。
