// 用法：npm run new -- painting "作品標題"
// 會在 src/content/works/<類別>/ 建立一份填好欄位的範本，之後只要改內容、放圖片即可。
import { writeFileSync, existsSync } from 'node:fs';

const cats = ['painting', 'photography', 'piano', 'certificate'];
const [cat, title] = process.argv.slice(2);
if (!cats.includes(cat) || !title) {
  console.error(`用法：npm run new -- <${cats.join('|')}> "作品標題"`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const slug = `${today}-${title.replace(/[\s/\:*?"<>|]+/g, '-')}`;
const file = `src/content/works/${cat}/${slug}.md`;
if (existsSync(file)) { console.error('檔案已存在：' + file); process.exit(1); }
const extra = {
  painting: 'medium: 水彩\nsize: A4',
  photography: 'location: 地點\ncamera: 器材',
  piano: 'composer: 作曲家\nevent: 演出場合\nvideo:\n  type: youtube\n  id: 這裡貼11碼影片ID',
  certificate: 'event: 檢定單位與級別\nresult: 通過',
}[cat];
writeFileSync(file, `---
title: ${title}
category: ${cat}
date: ${today}
summary: 一句話介紹（120 字內，可刪除）
cover: ../../../assets/works/請放圖片檔名.jpg
coverAlt: 用一句話描述圖片內容（給視障者與圖片載入失敗時使用）
${extra}
draft: true   # 準備好要公開時，改成 false
---

在這裡寫創作理念、過程或心得（可用 Markdown）。
`);
console.log('已建立：' + file + '\n請把圖片放進 src/assets/works/，並修改 cover 檔名。');
