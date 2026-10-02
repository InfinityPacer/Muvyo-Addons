// 本地测试替身：在 node:vm 中按 Muvyo 的方式加载插件入口（全局函数 + 全局 mv），
// 并用一个只覆盖本仓库测试所需语法的小型渲染器模拟宿主侧的 mv.render。
// 真实渲染、路径校验与 QuickJS 运行时以 Muvyo 为准，这里只验证插件自身逻辑。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** 简化渲染器：支持 {{var}}、{{var|replace('a','b')|lower|upper|trim}} 与 if/elif/else/endif（可带 not）。 */
export function renderTemplate(template, vars) {
  const tokens = template.split(/({%.*?%}|{{.*?}})/s).filter((t) => t !== '');
  const value = (expr) => {
    const [name, ...filters] = expr.split('|').map((s) => s.trim());
    let v = vars[name];
    for (const f of filters) {
      const m = /^(\w+)(?:\((.*)\))?$/.exec(f);
      const args = m[2] ? [...m[2].matchAll(/'([^']*)'/g)].map((a) => a[1]) : [];
      if (m[1] === 'replace') v = String(v ?? '').split(args[0]).join(args[1]);
      else if (m[1] === 'lower') v = String(v ?? '').toLowerCase();
      else if (m[1] === 'upper') v = String(v ?? '').toUpperCase();
      else if (m[1] === 'trim') v = String(v ?? '').trim();
      else throw new Error(`测试渲染器不支持过滤器 ${m[1]}`);
    }
    return v;
  };
  const truthy = (expr) => {
    const neg = /^not\s+/.test(expr);
    const v = value(expr.replace(/^not\s+/, ''));
    const t = !(v === undefined || v === null || v === '' || v === 0 || v === false);
    return neg ? !t : t;
  };
  // 栈元素：{active: 当前分支是否输出, taken: 本 if 链是否已有分支命中, parent: 外层是否输出}
  const stack = [];
  const on = () => stack.every((s) => s.active);
  let out = '';
  for (const t of tokens) {
    const tag = /^{%\s*(\w+)\s*(.*?)\s*%}$/s.exec(t);
    if (tag) {
      const [, kw, expr] = tag;
      if (kw === 'if') {
        const hit = on() && truthy(expr);
        stack.push({active: hit, taken: hit});
      } else if (kw === 'elif' || kw === 'else') {
        const top = stack.at(-1);
        const outer = stack.slice(0, -1).every((s) => s.active);
        const hit = outer && !top.taken && (kw === 'else' || truthy(expr));
        top.active = hit;
        top.taken = top.taken || hit;
      } else if (kw === 'endif') {
        stack.pop();
      } else {
        throw new Error(`测试渲染器不支持 {% ${kw} %}`);
      }
      continue;
    }
    if (!on()) continue;
    const v = /^{{(.*)}}$/s.exec(t);
    out += v ? String(value(v[1]) ?? '') : t;
  }
  return out;
}

/**
 * 加载插件并返回调用函数。
 * @param {string} pluginId src/ 下的插件目录名
 * @param {object} config 模拟 mv.config
 * @returns {{naming: Function, renderCalls: Array, logs: Array}}
 */
export function loadPlugin(pluginId, config = {}) {
  const dir = path.join(import.meta.dirname, '..', 'src', pluginId);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const code = fs.readFileSync(path.join(dir, manifest.entry || 'main.js'), 'utf8');
  const renderCalls = [];
  const logs = [];
  let current = null;
  const log = (level) => (msg) => logs.push({level, msg});
  const mv = {
    config: Object.freeze({...config}),
    service: '',
    log: {info: log('info'), warn: log('warn'), error: log('error')},
    // 与协议一致：template 为 undefined 时沿用原模板，vars 合并到原变量
    render(template, vars) {
      renderCalls.push({template, vars});
      if (renderCalls.length > 4) throw new Error('mv.render 每次命名最多调用 4 次');
      return renderTemplate(template ?? current.template, {...current.vars, ...(vars || {})});
    },
    fetch() { throw new Error('命名调用禁止联网'); },
    storage: {
      get() { throw new Error('命名调用禁止持久存储'); },
      set() { throw new Error('命名调用禁止持久存储'); },
      remove() { throw new Error('命名调用禁止持久存储'); },
    },
  };
  const sandbox = vm.createContext({mv});
  vm.runInContext(code, sandbox, {filename: `${pluginId}/main.js`});
  return {
    manifest,
    renderCalls,
    logs,
    naming(context) {
      current = context;
      const frozen = structuredClone(context);
      deepFreeze(frozen);
      // 宿主按 JSON 接收返回值；序列化也去掉 vm 跨 realm 的原型差异，便于 deepStrictEqual
      const result = sandbox.naming(frozen);
      return result === null ? null : JSON.parse(JSON.stringify(result));
    },
  };
}

function deepFreeze(obj) {
  for (const v of Object.values(obj)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(obj);
}
