// 智能重命名：Muvyo naming 能力实现，移植自 MoviePilot 智能重命名插件。
// 协议见 muvyo-addon-guide/docs/naming.md：每次传入一个文件的只读上下文，返回 null 表示沿用内置结果，
// 或返回 {template, vars} 交给 Muvyo 渲染，或返回 {rendered} 作为最终相对路径（两类不能混用）。
// 命名调用期间禁止联网与持久存储，总时限 3 秒，mv.render 每次最多调用 4 次，这里至多调用 1 次。

/** 未保存过「分隔符适用范围」时使用的字段，与 MoviePilot 版默认值一致（去掉 Muvyo 不提供的 original_name）。 */
var DEFAULT_SEPARATOR_TYPES = ['audioCodec', 'videoCodec', 'videoFormat', 'edition', 'effect', 'resourceType'];

/**
 * 解析「二级分类名称:模板」或「TMDB编号:模板」，按第一个冒号切分，# 开头的行忽略。
 * @param {string} text 配置原文
 * @returns {Object<string, string>} 键为分类名称或 TMDB 编号字符串
 */
function parseTemplateGroups(text) {
  var groups = {};
  String(text || '').split('\n').forEach(function (line) {
    if (!line.trim() || line.trim().charAt(0) === '#') return;
    var i = line.indexOf(':');
    if (i <= 0) return;
    var key = line.slice(0, i).trim();
    var template = line.slice(i + 1).trim();
    if (key && template) groups[key] = template;
  });
  return groups;
}

/**
 * 按 TMDB 编号优先、二级分类其次选择覆盖模板，与 MoviePilot 版的优先级一致。
 * @returns {string|null} 与原模板相同或未命中时返回 null
 */
function pickTemplate(context, text) {
  var groups = parseTemplateGroups(text);
  var byTmdb = context.tmdb_id ? groups[String(context.tmdb_id)] : undefined;
  var byCategory = context.category ? groups[String(context.category).trim()] : undefined;
  var template = byTmdb || byCategory || null;
  return template && template !== context.template ? template : null;
}

/**
 * 把所选字段内部的连续空白换成分隔符，只返回真正变化的字段。
 * Muvyo 会拒绝覆盖作品身份、季集、扩展名等字段，所以这里只处理用户勾选的展示字段。
 */
function separatorVars(vars, config) {
  var separator = config.separator;
  if (typeof separator !== 'string' || separator === '') return {};
  // multiselect 从未保存时没有值，此时使用默认范围；保存为空数组表示用户明确不处理任何字段
  var types = Array.isArray(config.separator_types) ? config.separator_types : DEFAULT_SEPARATOR_TYPES;
  var changed = {};
  types.forEach(function (field) {
    var value = vars[field];
    if (typeof value !== 'string' || !value.trim()) return;
    var updated = value.trim().split(/\s+/).join(separator);
    if (updated !== value) changed[field] = updated;
  });
  return changed;
}

/**
 * 把 Python re 写法转换为 JavaScript RegExp，兼容 MoviePilot 识别词与智能重命名的既有规则。
 * 支持开头的内联标志 (?i)/(?m)/(?s)、(?P<name>…) 与 (?P=name)；(?x) 等无法等价的写法直接报错。
 */
function toRegExp(pattern) {
  var flags = 'g';
  var source = pattern;
  var inline = /^\(\?([aiLmsux]+)\)/.exec(source);
  if (inline) {
    source = source.slice(inline[0].length);
    inline[1].split('').forEach(function (f) {
      if (f === 'i' || f === 'm' || f === 's') {
        if (flags.indexOf(f) < 0) flags += f;
      } else if (f === 'x' || f === 'L') {
        throw new Error('不支持的正则标志 (?' + f + ')');
      }
      // a、u 在 JavaScript 中无对应含义，按默认处理
    });
  }
  source = source.replace(/\(\?P</g, '(?<').replace(/\(\?P=(\w+)\)/g, '\\k<$1>');
  return new RegExp(source, flags);
}

/** 把 Python re.sub 的替换串转换为 JavaScript 写法：\1、\g<1>、\g<name> 引用分组，$ 按字面输出。 */
function toReplacement(repl) {
  var out = '';
  for (var i = 0; i < repl.length; i++) {
    var c = repl.charAt(i);
    if (c === '$') { out += '$$'; continue; }
    if (c !== '\\' || i === repl.length - 1) { out += c; continue; }
    var rest = repl.slice(i + 1);
    var group = /^g<(\w+)>/.exec(rest) || /^(\d{1,2})/.exec(rest);
    if (group) {
      out += /^\d+$/.test(group[1]) ? '$' + group[1] : '$<' + group[1] + '>';
      i += group[0].length;
      continue;
    }
    var next = rest.charAt(0);
    out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
    i += 1;
  }
  return out;
}

/**
 * 解析替换词，沿用 MoviePilot 识别词的「被替换词 => 替换词」与单独屏蔽词写法。
 * 集数偏移类规则（含 <> 与 >>）对命名没有意义，直接跳过；写错的正则记日志后跳过，不影响其余规则。
 * @returns {Array<{re: RegExp, to: string}>}
 */
function parseRules(text) {
  var rules = [];
  String(text || '').split('\n').forEach(function (raw) {
    var line = raw.replace(/^\s+/, '').replace(/\r$/, '');
    if (!line.trim() || line.charAt(0) === '#') return;
    if (line.indexOf(' <> ') >= 0 && line.indexOf(' >> ') >= 0) return;
    var pattern;
    var replacement = '';
    var i = line.indexOf(' => ');
    if (i >= 0) {
      pattern = line.slice(0, i);
      replacement = line.slice(i + 4);
    } else if (/ =>\s*$/.test(line)) {
      pattern = line.replace(/ =>\s*$/, '');
    } else {
      pattern = line.replace(/\s+$/, '');
    }
    try {
      rules.push({re: toRegExp(pattern), to: toReplacement(replacement)});
    } catch (e) {
      mv.log.warn('替换词无效，已跳过：' + line.slice(0, 200) + '（' + e.message + '）');
    }
  });
  return rules;
}

/** 按配置顺序依次替换，每条规则作用在上一条的结果上。 */
function applyRules(text, rules) {
  return rules.reduce(function (current, rule) {
    rule.re.lastIndex = 0;
    return current.replace(rule.re, rule.to);
  }, text);
}

/**
 * naming 入口。三项能力的组合方式与 MoviePilot 版一致：
 * 先确定模板（分类或 TMDB 覆盖），再改写字段分隔符，最后对渲染结果做替换词。
 * 没有替换词时返回 {template, vars} 让 Muvyo 渲染；有替换词时需要渲染结果，因此返回 {rendered}。
 */
function naming(context) {
  var config = mv.config || {};
  var template = pickTemplate(context, config.template_groups);
  var vars = separatorVars(context.vars || {}, config);
  var hasVars = Object.keys(vars).length > 0;
  var rules = parseRules(config.word_replacements);

  if (!rules.length) {
    if (!template && !hasVars) return null;
    var result = {};
    if (template) result.template = template;
    if (hasVars) result.vars = vars;
    return result;
  }

  var base = template || hasVars ? mv.render(template || undefined, vars) : context.rendered;
  var rendered = applyRules(base, rules);
  return rendered === context.rendered ? null : {rendered: rendered};
}
