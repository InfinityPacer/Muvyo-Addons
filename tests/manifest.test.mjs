import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const PLUGINS = fs.readdirSync(SRC, {withFileTypes: true}).filter((d) => d.isDirectory()).map((d) => d.name);

// 图标约束见 muvyo-addon-guide docs/manifest.md「icon 插件图标」，不合规的图标会让安装被拒
const ICON_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*\.(png|jpg|jpeg|webp)$/;
const ICON_MAX_BYTES = 256 * 1024;
const ICON_MAX_SIDE = 1024;

/**
 * 从图片文件头读出格式与宽高，只覆盖 Muvyo 接受的三种静态格式。
 * @param {Buffer} buf 图片内容
 * @returns {{format: string, width: number, height: number, animated: boolean}|null}
 */
function imageInfo(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    // APNG 靠 acTL 块声明动画
    return {format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), animated: buf.includes('acTL')};
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15（除 DHT/JPG/DAC）记录帧尺寸
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), animated: false};
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
    const chunk = buf.subarray(12, 16).toString();
    if (chunk === 'VP8X') {
      return {format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), animated: (buf[20] & 0x02) !== 0};
    }
    if (chunk === 'VP8 ') return {format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, animated: false};
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return {format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, animated: false};
    }
  }
  return null;
}

for (const id of PLUGINS) {
  test(`${id} 声明的图标符合 Muvyo 的图标约束`, (t) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, id, 'manifest.json'), 'utf8'));
    if (manifest.icon === undefined) return t.skip('未声明图标');
    assert.match(manifest.icon, ICON_NAME);
    const buf = fs.readFileSync(path.join(SRC, id, manifest.icon));
    assert.ok(buf.length <= ICON_MAX_BYTES, `图标 ${buf.length} 字节，超过 256 KiB`);
    const info = imageInfo(buf);
    assert.ok(info, '无法识别为 PNG、JPEG 或 WebP');
    const ext = path.extname(manifest.icon).slice(1);
    assert.equal(ext === 'jpg' ? 'jpeg' : ext, info.format, '扩展名与实际格式不符');
    assert.ok(info.width <= ICON_MAX_SIDE && info.height <= ICON_MAX_SIDE, `图标 ${info.width}x${info.height} 超过 1024 像素`);
    assert.equal(info.animated, false, '只支持静态图片');
  });
}
