import { createHash } from 'node:crypto'

const styles = `
  :root { color-scheme: light; font-family: "Trebuchet MS", Tahoma, sans-serif; color: #183f3b; background: #f5f3e9; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  main { width: min(100%, 480px); background: #fffef8; border: 1px solid #d9e2d8; border-radius: 18px; padding: clamp(24px, 7vw, 40px); box-shadow: 0 18px 55px #214e4212; }
  .mark { width: 36px; height: 36px; position: relative; margin-bottom: 24px; }
  .mark::before, .mark::after { content: ""; position: absolute; inset: 5px; border: 2px solid #27746a; transform: rotate(45deg); }
  .mark::after { inset: 11px; border-color: #a9c8b1; }
  h1, h2 { margin: 0 0 10px; font-size: 1.4rem; line-height: 1.3; letter-spacing: -.025em; }
  p { margin: 0; color: #425b54; line-height: 1.65; font-size: .95rem; }
  .arabic { border-top: 1px solid #e1e8de; margin-top: 22px; padding-top: 22px; font-family: Tahoma, Arial, sans-serif; }
  .code { margin: 24px 0; padding: 18px 12px; background: #eff6ed; border: 1px solid #cfdfd0; border-radius: 10px; text-align: center; }
  strong { color: #164e47; font-size: clamp(1.65rem, 8vw, 2.3rem); font-variant-numeric: tabular-nums; letter-spacing: .12em; }
  button { display: block; width: 100%; margin: 14px 0 0; padding: 11px 18px; border: 1px solid #8eada2; border-radius: 10px; background: #fffef8; color: #195d54; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover { background: #e8f2e8; }
  [hidden], #copy-status:empty { display: none; }
  #copy-status { margin-top: 12px; text-align: center; }
  a { display: block; padding: 14px 18px; border-radius: 10px; background: #195d54; color: #fff; text-align: center; text-decoration: none; font-weight: 700; line-height: 1.5; }
  a:hover { background: #104b44; }
  a:focus-visible, button:focus-visible { outline: 3px solid #ae8a3f; outline-offset: 3px; }
`

const script = `
  const copyButton = document.getElementById('copy-code');
  const code = document.getElementById('link-code');
  const status = document.getElementById('copy-status');
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      status.textContent = 'Copied. Return to Telegram, paste the code, and send it. · تم النسخ. ارجع إلى تيليغرام والصق الرمز وأرسله.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Copy the selected code, then paste and send it in Telegram. · انسخ الرمز المحدد، ثم الصقه وأرسله في تيليغرام.';
    }
  });
`

export const linkPageStyleHash = createHash('sha256').update(styles).digest('base64')
export const linkPageScriptHash = createHash('sha256').update(script).digest('base64')

export function linkPage(code: string) {
  if (!/^\d{8}$/.test(code)) throw new Error('Invalid link code')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Connect Wartaq</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true"></div>
    <section>
      <h1>Connect Wartaq</h1>
      <p>Copy the code, then paste and send it in your private WartaqBot chat. Keep it private.</p>
    </section>
    <section class="arabic" lang="ar" dir="rtl">
      <h2>ربط وارتق</h2>
      <p>انسخ الرمز، ثم الصقه وأرسله في محادثتك الخاصة مع بوت وارتق. لا تشاركه مع أحد.</p>
    </section>
    <div class="code" dir="ltr">
      <span id="link-code"><strong>${code}</strong></span>
      <button id="copy-code" type="button" hidden>Copy code · <span lang="ar" dir="rtl">نسخ الرمز</span></button>
      <p id="copy-status" role="status"></p>
    </div>
    <a href="https://t.me/WartaqBot?start=link">Open Telegram · <span lang="ar" dir="rtl">فتح تيليغرام</span></a>
  </main>
  <script>${script}</script>
</body>
</html>`
}
