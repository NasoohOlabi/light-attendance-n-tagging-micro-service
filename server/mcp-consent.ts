export function mcpConsentPage(request: Request): Response {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const consent = new URL(request.url).pathname === '/mcp/consent'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wartaq · Connect an application</title>
<style nonce="${nonce}">
:root{font-family:system-ui,sans-serif;color:#183529;background:#f5f7f2}*{box-sizing:border-box}body{margin:0;padding:24px 16px}main{max-width:560px;margin:5vh auto;background:white;border:1px solid #d7e1d8;border-radius:18px;padding:clamp(20px,5vw,36px);box-shadow:0 12px 40px #18352912}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h1{font-size:1.55rem;line-height:1.25}p,li{line-height:1.55}button,input,select{font:inherit}button{min-height:44px;border-radius:9px;padding:10px 16px;cursor:pointer;border:1px solid #245b43;background:#245b43;color:white}button.secondary{background:white;color:#245b43}button:disabled{opacity:.6;cursor:wait}input,select{width:100%;min-height:44px;border:1px solid #94a99a;border-radius:8px;padding:10px;background:white;color:#183529}label{display:block;font-weight:600;margin:16px 0 6px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.actions button{flex:1}.account{background:#edf4ee;border-radius:10px;padding:12px;overflow-wrap:anywhere}.warning{border-inline-start:4px solid #b36a1c;padding-inline-start:14px}.error{color:#a12424;min-height:1.5em}small{color:#526a5a} [hidden]{display:none!important}
#client{overflow-wrap:anywhere}
</style></head><body><main><header><strong>وارتق · Wartaq</strong><button class="secondary" id="language" type="button">العربية</button></header>
<h1 data-en="Connect an application" data-ar="ربط تطبيق">Connect an application</h1>
<p id="client"></p><div id="current" class="account" hidden></div>
<section id="permission" hidden><p id="permissions" class="warning"></p><p data-en="Access works only after your account is approved and any required setup is complete." data-ar="يعمل الوصول فقط بعد الموافقة على حسابك وإكمال أي إعداد مطلوب.">Access works only after your account is approved and any required setup is complete.</p><div class="actions"><button id="accept" type="button" data-en="Allow access" data-ar="السماح بالوصول">Allow access</button><button id="decline" class="secondary" type="button" data-en="Decline" data-ar="رفض">Decline</button></div></section>
<section id="continue" hidden><p data-en="Continue with this account, or choose another account below." data-ar="تابع بهذا الحساب، أو اختر حساباً آخر أدناه.">Continue with this account, or choose another account below.</p><button id="resume" type="button" data-en="Continue" data-ar="متابعة">Continue</button></section>
<section id="switch" hidden><label for="accounts" data-en="Switch account" data-ar="تبديل الحساب">Switch account</label><select id="accounts"></select><button id="switch-button" class="secondary" type="button" data-en="Use selected account" data-ar="استخدام الحساب المحدد">Use selected account</button></section>
<details id="login"><summary data-en="Sign in to another account" data-ar="تسجيل الدخول إلى حساب آخر">Sign in to another account</summary><form id="form"><label for="kind" data-en="Sign-in method" data-ar="طريقة تسجيل الدخول">Sign-in method</label><select id="kind"><option value="username" data-en="Username" data-ar="اسم المستخدم">Username</option><option value="email" data-en="Email" data-ar="البريد الإلكتروني">Email</option></select><label for="identifier" data-en="Username or email" data-ar="اسم المستخدم أو البريد الإلكتروني">Username or email</label><input id="identifier" autocomplete="username" required maxlength="254"><label for="password" data-en="Password" data-ar="كلمة المرور">Password</label><input id="password" type="password" autocomplete="current-password" required maxlength="128"><div class="actions"><button data-en="Sign in" data-ar="تسجيل الدخول">Sign in</button></div></form></details><p id="error" class="error" role="alert"></p><small data-en="Only approve applications you trust." data-ar="وافق فقط على التطبيقات التي تثق بها.">Only approve applications you trust.</small></main>
<script nonce="${nonce}">
const isConsent = ${consent};
const query = location.search.slice(1);
const byId = id => document.getElementById(id);
let arabic = false;
let activeId = '';
const tr = (en, ar) => arabic ? ar : en;
function language(){document.documentElement.lang=arabic?'ar':'en';document.documentElement.dir=arabic?'rtl':'ltr';document.querySelectorAll('[data-en]').forEach(el=>{el.textContent=arabic?el.dataset.ar:el.dataset.en});byId('language').textContent=arabic?'English':'العربية';showClient();showPermissions()}
function showClient(){const client=new URLSearchParams(query).get('client_id') || '';byId('client').textContent=tr('Application ID: ','معرّف التطبيق: ')+client}
function showPermissions(){const scopes=new URLSearchParams(query).get('scope')?.split(' ') || [];const lines=[];if(scopes.includes('mcp:read'))lines.push(tr('Read data available to your account, including sensitive student details, attendance and notes.','قراءة البيانات المتاحة لحسابك، بما فيها بيانات الطلاب الحساسة والحضور والملاحظات.'));if(scopes.includes('mcp:write'))lines.push(tr('Change data available to your account. Changes may be permanent.','تغيير البيانات المتاحة لحسابك. قد تكون التغييرات دائمة.'));if(scopes.includes('mcp:read')&&scopes.includes('mcp:write'))lines.push(tr('Administrators may also grant access, manage accounts and reset passwords.','يمكن للمسؤولين أيضاً منح الوصول وإدارة الحسابات وإعادة تعيين كلمات المرور.'));if(scopes.includes('offline_access'))lines.push(tr('Maintain access while your session remains active.','الاحتفاظ بالوصول ما دامت جلستك نشطة.'));byId('permissions').textContent=lines.join(' ') || tr('No notebook permissions requested.','لم تُطلب صلاحيات للدفتر.')}
byId('language').onclick=()=>{arabic=!arabic;language()};showClient();showPermissions();
async function post(path, body, userId){const headers={'content-type':'application/json'};if(userId)headers['x-user-id']=userId;const response=await fetch(path,{method:'POST',headers,body:JSON.stringify(body),credentials:'same-origin'});if(!response.ok)throw new Error('request');return response.json()}
function redirect(result){if(!result || typeof result.url!=='string')throw new Error('redirect');const url=new URL(result.url,location.origin);if(['javascript:','data:','vbscript:'].includes(url.protocol))throw new Error('redirect');location.assign(url.href)}
async function run(action){byId('error').textContent='';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action()}catch{byId('error').textContent=tr('Could not complete the request. Check your details and try again.','تعذر إكمال الطلب. تحقق من البيانات وحاول مرة أخرى.')}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
async function load(){const [sessionResponse,accountsResponse]=await Promise.all([fetch('/api/auth/get-session',{cache:'no-store'}),fetch('/api/device-accounts',{cache:'no-store'})]);if(!sessionResponse.ok||!accountsResponse.ok)throw new Error('session');const session=await sessionResponse.json();const saved=await accountsResponse.json();activeId=session?.user?.id || '';if(activeId){byId('current').hidden=false;byId('current').textContent=tr('Signed in as: ','تم تسجيل الدخول باسم: ')+(session.user.name || session.user.email);byId(isConsent?'permission':'continue').hidden=false}else{byId('login').open=true}const accounts=Array.isArray(saved.accounts)?saved.accounts.filter(a=>a.userId!==activeId):[];if(accounts.length){byId('switch').hidden=false;for(const account of accounts){const option=document.createElement('option');option.value=account.userId;option.textContent=account.name+' · '+account.identifier;byId('accounts').append(option)}}}
const resume=()=>post('/api/auth/oauth2/continue',{oauth_query:query,selected:true});
byId('form').onsubmit=e=>{e.preventDefault();run(async()=>{const kind=byId('kind').value;const identifier=byId('identifier').value;const body={password:byId('password').value,oauth_query:query};body[kind]=identifier;const result=await post('/api/auth/sign-in/'+kind,body);byId('password').value='';redirect(result?.url ? result : await resume())})};
byId('switch-button').onclick=()=>run(async()=>{await post('/api/device-accounts/switch',{userId:byId('accounts').value});location.reload()});
byId('resume').onclick=()=>run(async()=>redirect(await resume()));
for(const [id,accept] of [['accept',true],['decline',false]])byId(id).onclick=()=>run(async()=>redirect(await post('/api/auth/oauth2/consent',{oauth_query:query,accept},activeId)));
run(load);
</script></body></html>`
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    },
  })
}
