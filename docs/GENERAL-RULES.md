# General Rules — 生效机制与维护

General Rules（`~/.dsh/AGENTS.md`）是用户全局最高优先级规则，注入**每个会话的 system prompt**。

## 注入链路（当前实现）

```
用户编辑规则 (设置页 或 直接改 ~/.dsh/AGENTS.md)
        ↓
llm-deepseek adapter 序列化请求时 (每次请求)
        ↓  readFileSync(~/.dsh/AGENTS.md) —— 实时读取
        ↓  拼接到 system 末尾 (过滤标题生成请求)
        ↓
DeepSeek API —— 规则 100% 送达模型
```

- **实时性**：每次请求读取文件，保存后**下一轮对话立即生效**（无需重启/新会话）
- **优先级**：与 persona 同层（system），高于一切用户消息

## 为什么需要 adapter 补丁（血泪史）

dsh 原生的 `@deepseek-ai/dsh-agent-instructions` 只把 AGENTS.md 作为
**workspace context（用户消息层）**注入；尝试把它提升到 system 层时踩了
dsh 的连环坑：

| # | 坑 | 现象 |
|---|----|------|
| 1 | `SystemPrompt` 是 **scoped service** | root 注册的 section 永远进不了 agent 的 system |
| 2 | `system-prompt/assemble` 瀑布 | 修改的 assembly 与实际发送实例不一致 |
| 3 | `options` 是 **deepFreeze** | 直接改抛异常（严格模式） |
| 4 | vision 主请求走 `with-images` 分支 | 只改通用分支会漏 |
| 5 | `llm-deepseek/lib` 是 **ESM** | `require()` 抛 ReferenceError 被静默吞掉 |

**最终方案**：在 adapter 序列化前注入（绕开所有组装玄学）。

## 补丁位置

| 文件 | 说明 |
|------|------|
| `scripts/patch-dsh-llm.cjs` | **幂等补丁器**：对 dsh 主仓库 `packages/llm/llm-deepseek/src/serialize.ts` 打补丁（重建/CI 用） |
| CI workflow | build dsh 主仓库后自动执行补丁 |
| 本机运行时 | `desktop/dist/win-unpacked/resources/dsh/packages/llm/llm-deepseek/lib/index.js`（手工打过） |

> ⚠️ 若重新 `assemble` 而未打补丁，机制会丢失 → 始终先跑
> `node scripts/patch-dsh-llm.cjs <dsh-repo-path>` 再构建。

## 写规则的建议（实测结论）

- 一条规则一句话；**强措辞**（必须/禁止）比弱措辞（尽量/建议）遵守度高
- 示例胜过抽象："回复格式固定为 `老大，<内容>`" > "用尊敬语气称呼用户"
- 中英文皆可；文件整体英文（除必需的称呼词如 老大）
- 所有规则**平级**、均为最高优先级（此为产品约定，文档已声明）
