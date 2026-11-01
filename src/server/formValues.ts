/** 把 FormData 的文字欄位轉成物件，用來在驗證失敗時把使用者填的內容放回表單。 */
export function textValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}
