# Auto code review 測試

此檔案僅用於測試自動 Code Review 工具，測試完成後可直接關閉 PR，不需合併。

## 範例程式（刻意留下可被審查的問題）

```js
// 計算作品平均評分；空陣列時會回傳 NaN（未處理除以 0）
export function averageRating(ratings) {
  let sum = 0;
  for (let i = 0; i <= ratings.length; i++) { // off-by-one
    sum += ratings[i];
  }
  return sum / ratings.length;
}
```
