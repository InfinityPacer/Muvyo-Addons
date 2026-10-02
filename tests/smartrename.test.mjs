import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadPlugin} from './harness.mjs';

const ID = 'infinitypacer.smartrename';

// 用户当前在 Muvyo 使用的电影模板（tmdb 编号外层的花括号是字面量）
const MOVIE_TEMPLATE = '{{title}}{% if year %} ({{year}}){% endif %}{% if tmdbid %} {tmdb-{{tmdbid}}}{% endif %}/{{title}}{% if year %}.{{year}}{% endif %}{% if edition %}.{{edition}}{% endif %}{% if videoFormat %}.{{videoFormat}}{% endif %}{% if videoCodec %}.{{videoCodec}}{% endif %}{% if audioCodec %}.{{audioCodec}}{% endif %}{% if releaseGroup %}-{{releaseGroup}}{% endif %}{{fileExt}}';

// 「重新整理」弹窗截图中的死侍
function deadpool(overrides = {}) {
  return {
    media_type: 'movie',
    tmdb_id: 293660,
    title: '死侍',
    original_title: 'Deadpool',
    year: 2016,
    season: null,
    episodes: [],
    part: 0,
    source_name: '死侍.2016.BluRay.HDR.2160p.x265.TrueHD.Atmos.7.1-FRDS.mkv',
    template: MOVIE_TEMPLATE,
    rendered: '死侍 (2016) {tmdb-293660}/死侍.2016.BluRay HDR.2160p.x265.TrueHD 7.1 Atmos-FRDS.mkv',
    category: '欧美电影',
    vars: {
      title: '死侍', original_title: 'Deadpool', name: '死侍', en_name: 'Deadpool', year: '2016', tmdbid: 293660,
      season: '', episode: '', season_episode: '', resolution: '2160p', videoFormat: '2160p', resourceType: 'BluRay',
      videoCodec: 'x265', audioCodec: 'TrueHD 7.1 Atmos', releaseGroup: 'FRDS', part: '', effect: 'HDR',
      edition: 'BluRay HDR', customization: '', webSource: '', episode_title: '', fileExt: '.mkv',
    },
    ...overrides,
  };
}

// MoviePilot 智能重命名的默认替换词，原样粘贴
const MP_DEFAULT_WORDS = String.raw`(?i)(?<=[\W_])BluRay.REMUX(?=[\W_]) => REMUX
(?i)(?<=[\W_])HDR.DV(?=[\W_]) => DoVi.HDR
(?i)(?<=[\W_])DV(?=[\W_]) => DoVi
(?i)(?<=[\W_])H264(?=[\W_]) => x264
(?i)(?<=[\W_])h265(?=[\W_]) => x265
(?i)(?<=[\W_])NF(?=[\W_]) => Netflix
(?i)(?<=[\W_])AMZN(?=[\W_]) => Amazon
(?i)\.Atmos(?=\W) => `;

test('截图场景：只开分隔符时返回字段覆盖，由 Muvyo 用原模板渲染', () => {
  const p = loadPlugin(ID, {separator: '.'});
  assert.deepEqual(p.naming(deadpool()), {
    vars: {audioCodec: 'TrueHD.7.1.Atmos', edition: 'BluRay.HDR'},
  });
  assert.equal(p.renderCalls.length, 0);
});

test('没有任何可改内容时返回 null，沿用内置结果', () => {
  const p = loadPlugin(ID, {separator: ''});
  assert.equal(p.naming(deadpool()), null);
});

test('分隔符适用范围：未保存用默认范围，保存为空数组则不处理', () => {
  assert.equal(loadPlugin(ID, {separator: '.', separator_types: []}).naming(deadpool()), null);
  assert.deepEqual(loadPlugin(ID, {separator: '_', separator_types: ['audioCodec']}).naming(deadpool()), {
    vars: {audioCodec: 'TrueHD_7.1_Atmos'},
  });
});

test('模板组：按二级分类切换，同时命中时 TMDB 编号优先', () => {
  const byCategory = loadPlugin(ID, {separator: '', template_groups: '欧美电影:{{en_name}}{{fileExt}}'});
  assert.deepEqual(byCategory.naming(deadpool()), {template: '{{en_name}}{{fileExt}}'});

  const both = loadPlugin(ID, {
    separator: '',
    template_groups: '# 注释行\n欧美电影:{{en_name}}{{fileExt}}\n293660:{{title}}.{{year}}{{fileExt}}',
  });
  assert.deepEqual(both.naming(deadpool()), {template: '{{title}}.{{year}}{{fileExt}}'});
});

test('模板组与原模板相同或未命中时不返回 template', () => {
  const same = loadPlugin(ID, {separator: '', template_groups: `欧美电影:${MOVIE_TEMPLATE}`});
  assert.equal(same.naming(deadpool()), null);
  const miss = loadPlugin(ID, {separator: '', template_groups: '华语电影:{{title}}{{fileExt}}'});
  assert.equal(miss.naming(deadpool()), null);
});

test('MoviePilot 默认替换词可直接粘贴，与分隔符组合后返回最终路径', () => {
  const p = loadPlugin(ID, {separator: '.', word_replacements: MP_DEFAULT_WORDS});
  assert.deepEqual(p.naming(deadpool()), {
    rendered: '死侍 (2016) {tmdb-293660}/死侍.2016.BluRay.HDR.2160p.x265.TrueHD.7.1-FRDS.mkv',
  });
  assert.equal(p.renderCalls.length, 1);
  assert.equal(p.renderCalls[0].template, undefined);
  assert.equal(p.logs.length, 0);
});

test('只有替换词时直接处理内置结果，不调用 mv.render', () => {
  const ctx = deadpool({rendered: '电影 (2020)/电影.2020.2160p.HDR.DV.h265-NF.mkv'});
  const p = loadPlugin(ID, {separator: '', word_replacements: MP_DEFAULT_WORDS});
  assert.deepEqual(p.naming(ctx), {rendered: '电影 (2020)/电影.2020.2160p.DoVi.HDR.x265-Netflix.mkv'});
  assert.equal(p.renderCalls.length, 0);
});

test('替换词没有命中时返回 null', () => {
  const p = loadPlugin(ID, {separator: '', word_replacements: 'REMUX => Remux'});
  assert.equal(p.naming(deadpool()), null);
});

test('屏蔽词与行尾省略空格的删除写法', () => {
  const ctx = deadpool({rendered: 'A (2020)/A.2020.Atmos.SAMPLE-GRP.mkv'});
  const p = loadPlugin(ID, {separator: '', word_replacements: '\\.SAMPLE\n(?i)\\.atmos =>'});
  assert.deepEqual(p.naming(ctx), {rendered: 'A (2020)/A.2020-GRP.mkv'});
});

test('Python 分组引用写法转换为 JavaScript', () => {
  const ctx = deadpool({rendered: 'A (2020)/A.2020.WEB-DL.mkv'});
  const words = String.raw`(?P<src>WEB)-(DL) => \g<src>\2
(\d{4}) => [\1]$`;
  const p = loadPlugin(ID, {separator: '', word_replacements: words});
  assert.deepEqual(p.naming(ctx), {rendered: 'A ([2020]$)/A.[2020]$.WEBDL.mkv'});
});

test('写错的正则与集数偏移规则被跳过，其余规则照常生效', () => {
  const ctx = deadpool({rendered: 'A (2020)/A.2020.NF.mkv'});
  const words = '(?i)(?<=[\\W_])NF(?=[\\W_]) => Netflix\n([ => x\n第 <> 集 >> EP+1\n(?x)a b => c';
  const p = loadPlugin(ID, {separator: '', word_replacements: words});
  assert.deepEqual(p.naming(ctx), {rendered: 'A (2020)/A.2020.Netflix.mkv'});
  assert.equal(p.logs.filter((l) => l.level === 'warn').length, 2);
});

test('剧集：分隔符与替换词不影响季集标识', () => {
  const tvTemplate = '{{title}}/Season {{season}}/{{title}}.{{season_episode}}{% if audioCodec %}.{{audioCodec}}{% endif %}{{fileExt}}';
  const ctx = deadpool({
    media_type: 'tv', tmdb_id: 1399, title: '权力的游戏', category: '欧美剧', season: 1, episodes: [1, 2],
    template: tvTemplate,
    rendered: '权力的游戏/Season 1/权力的游戏.S01E01-E02.DDP 5.1 Atmos.mkv',
    vars: {title: '权力的游戏', season: '1', season_episode: 'S01E01-E02', audioCodec: 'DDP 5.1 Atmos', fileExt: '.mkv'},
  });
  const p = loadPlugin(ID, {separator: '.', word_replacements: MP_DEFAULT_WORDS});
  assert.deepEqual(p.naming(ctx), {rendered: '权力的游戏/Season 1/权力的游戏.S01E01-E02.DDP.5.1.mkv'});
});

test('manifest 只声明 naming 能力且不申请联网', () => {
  const {manifest} = loadPlugin(ID);
  assert.deepEqual(Object.keys(manifest.capabilities), ['naming']);
  assert.deepEqual(manifest.permissions.domains, []);
  assert.ok(manifest.id.startsWith('infinitypacer.'));
  for (const field of manifest.config) {
    if (field.type === 'select' || field.type === 'multiselect') {
      for (const o of field.options) assert.ok(typeof o.value === 'string' && typeof o.label === 'string');
    }
  }
});
