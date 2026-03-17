#!/usr/bin/env node
// npm postinstall 훅으로 실행 — node_modules의 ffmpeg 파일을 static/ffmpeg/로 복사

import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const dest = resolve(root, 'static/ffmpeg');
mkdirSync(dest, { recursive: true });

const files = [
  {
    src: resolve(root, 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js'),
    dest: resolve(dest, 'ffmpeg-core.js')
  },
  {
    src: resolve(root, 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm'),
    dest: resolve(dest, 'ffmpeg-core.wasm')
  },
  {
    src: resolve(root, 'node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js'),
    dest: resolve(dest, 'ffmpeg-worker.js')
  },
  {
    src: resolve(root, 'node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js.map'),
    dest: resolve(dest, 'ffmpeg-worker.js.map')
  }
];

for (const { src, dest: d } of files) {
  cpSync(src, d);
  console.log(`copied: ${src.replace(root, '.')} → ${d.replace(root, '.')}`);
}
