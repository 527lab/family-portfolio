// 網站基本設定。只使用暱稱，請勿填真實姓名、學校、電話、住址等個資。
export const site = {
  nickname: '小禾',
  title: '小禾的作品集',
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

export const categoryInfo = {
  painting: { label: '畫作', path: '/painting/', intro: '水彩、素描與壓克力作品。' },
  photography: { label: '攝影', path: '/photography/', intro: '日常與旅途中的光影。' },
  piano: { label: '鋼琴演奏', path: '/piano/', intro: '比賽與發表會的演奏紀錄。' },
  certificate: { label: '檢定證書', path: '/piano/', intro: '鋼琴檢定與獲獎證明。' },
} as const;
