'use strict';
// patch-dsh-llm.cjs — 对 dsh 主仓库的 llm-deepseek adapter 打「General Rules 注入」补丁(幂等)。
// 用法: node scripts/patch-dsh-llm.cjs <dsh-repo-path>
// 在 pnpm build 之前执行; 已打过则跳过。详见 docs/GENERAL-RULES.md。
const fs = require('node:fs');
const path = require('node:path');

const src = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', '..');
const target = path.join(src, 'packages', 'llm', 'llm-deepseek', 'src', 'serialize.ts');

if (!fs.existsSync(target)) {
  console.error('未找到 serialize.ts:', target);
  process.exit(1);
}
let d = fs.readFileSync(target, 'utf8');

if (d.includes('GR-ADAPTER') || d.includes('withGlobalRules')) {
  console.log('补丁已存在,跳过:', target);
  process.exit(0);
}

// 1) 注入辅助函数(放在文件顶部 import 区之后 — 找第一个 export/函数声明前)
const helper = `
// [dsh-general-rules] 全局规则直接拼进 system —— 绕开 scoped SystemPrompt 组装,保证送达。
import { readFileSync as __grRf, existsSync as __grEf } from 'node:fs'
import { join as __grJoin } from 'node:path'
import { homedir as __grHd } from 'node:os'

function withGlobalRules(system: string | undefined): string | undefined {
  if (system === undefined) return system
  if (system.includes('Create a concise title')) return system
  try {
    const p = __grJoin(process.env.DSH_HOME || __grHd(), '.dsh', 'AGENTS.md')
    if (!__grEf(p)) return system
    const extra = __grRf(p, 'utf8')
    if (extra.trim() === '') return system
    return system + '\n\n' + extra
  } catch { return system }
}

`;
// 找第一个顶层声明(export/function/const)插入前
const insertAt = d.search(/\n(export |function |const |class |interface |type )/);
const pos = insertAt >= 0 ? insertAt : 0;
d = d.slice(0, pos) + '\n' + helper + d.slice(pos);

// 2) 替换两个序列化函数的 system push
// 通用模式(两种写法): options.system !== void 0 的 push → 用 withGlobalRules
const pushPattern = /if \(options\.system !== void 0\) messages\.push\(\{[\s\S]*?content: options\.system[\s\S]*?\}\}\);/g;
let count = 0;
d = d.replace(pushPattern, (m) => {
  count++;
  return `const gsys = withGlobalRules(options.system)
	if (gsys !== void 0) messages.push({
		role: 'system',
		content: gsys
	});`;
});
if (count < 2) {
  console.error('警告: 只替换了', count, '处 system push(期望 2 处),请人工检查文件');
}

fs.writeFileSync(target, d);
console.log('补丁已应用:', target, '| 替换 push:', count);
