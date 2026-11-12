// 後台作品表單：選好圖片後立刻顯示大一點的預覽，確認選的是哪一張。
// 漸進增強：沒有 JS 時表單照常運作。用 data: 網址（CSP 的 img-src 已允許），不上傳任何東西。
// 有些手機相簿 / 檔案選擇器給的檔案沒有 MIME 類型（file.type 是空字串），這時改看副檔名。
const PREVIEW_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

function isPreviewableImage(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type && type !== 'application/octet-stream') return type.startsWith('image/');
  return PREVIEW_EXT.test(String(file.name || ''));
}

document.querySelectorAll('input[type=file][data-preview]').forEach((input) => {
  const box = document.getElementById(input.dataset.preview);
  const img = box && box.querySelector('img');
  if (!img) return;
  let seq = 0; // 連續換檔時，只顯示最後選的那張
  img.addEventListener('load', () => { box.hidden = false; });
  img.addEventListener('error', () => { box.hidden = true; }); // 例如瀏覽器無法顯示的 HEIC
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    const mine = ++seq;
    box.hidden = true;
    img.removeAttribute('src');
    if (!isPreviewableImage(file)) return;
    const reader = new FileReader();
    reader.onload = () => { if (mine === seq) img.src = String(reader.result); };
    reader.readAsDataURL(file);
  });
});
