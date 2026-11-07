// 網站基本設定。暱稱不寫在這裡：由創作者帳號的「暱稱」決定（見 src/server/auth.ts 的 getSiteOwnerName）。
export const site = {
  tagline: '畫畫、拍照、彈琴，用不同的方式記錄生活。',
  // 預設不讓搜尋引擎收錄；正式要公開時，建置時設 NOINDEX=false
  noindex: (process.env.NOINDEX ?? 'true') !== 'false',
  nav: [
    { href: '/about/', label: '關於我' },
    { href: '/painting/', label: '畫作' },
    { href: '/photography/', label: '攝影' },
    { href: '/piano/', label: '鋼琴' },
  ],
};

export const siteTitle = (name: string) => `${name}的作品集`;

export const categoryInfo = {
  painting: { label: '畫作', path: '/painting/', intro: '水彩、素描與壓克力作品。' },
  photography: { label: '攝影', path: '/photography/', intro: '日常與旅途中的光影。' },
  piano: { label: '鋼琴演奏', path: '/piano/', intro: '比賽與發表會的演奏紀錄。' },
  certificate: { label: '檢定證書', path: '/piano/', intro: '鋼琴檢定與獲獎證明。' },
} as const;
