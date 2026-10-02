// QuickJS 冒烟：在与 Muvyo 沙箱同类的引擎里加载插件入口，确认语法和正则写法可用。
// 运行：qjs --std tests/quickjs-smoke.js src/infinitypacer.smartrename/main.js
// 只覆盖不依赖 mv.render 的路径；完整逻辑由 node 测试覆盖。
var entry = scriptArgs[1];
var logs = [];
globalThis.mv = {
  config: {
    separator: '.',
    word_replacements: '(?i)(?<=[\\W_])DV(?=[\\W_]) => DoVi\n(?P<g>NF) => Netflix\n(?i)\\.Atmos(?=\\W) => \n([ => x',
  },
  log: {info: function () {}, warn: function (m) { logs.push(m); }, error: function () {}},
  render: function () { throw new Error('冒烟用例不应调用 mv.render'); },
};
std.evalScript(std.loadFile(entry));

function check(name, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) throw new Error(name + ' 期望 ' + e + ' 实际 ' + a);
  print('ok ' + name);
}

var ctx = {
  template: '{{title}}{{fileExt}}',
  rendered: 'A (2020)/A.2020.DV.NF.Atmos.mkv',
  vars: {title: 'A', fileExt: '.mkv'},
};
check('替换词', naming(ctx), {rendered: 'A (2020)/A.2020.DoVi.Netflix.mkv'});
check('无效正则记日志', logs.length, 1);

mv.config = {separator: '.'};
ctx.vars = {audioCodec: 'TrueHD 7.1 Atmos'};
check('字段分隔符', naming(ctx), {vars: {audioCodec: 'TrueHD.7.1.Atmos'}});
