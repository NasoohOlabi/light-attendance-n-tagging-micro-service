const $ = (selector) => document.querySelector(selector)
const arabic = {
  'Access manager': 'مدير الوصول',
  'Your five teachers. Their links. Your notebook.': 'معلموك وروابطهم ودفترك في مكان واحد.',
  'Running on your computer': 'يعمل على جهازك',
  'Set up the shared notebook': 'إعداد الدفتر المشترك',
  'Create a dedicated spreadsheet with an': 'أنشئ جدول بيانات مخصصاً يحتوي على علامة تبويب',
  'tab. Paste these five headers into its first row:': '، والصق هذه العناوين الخمسة في الصف الأول:',
  'Copy sheet headers': 'نسخ عناوين الجدول',
  'Open the complete setup guide': 'فتح دليل الإعداد الكامل',
  'Use shared Events and Roster endpoints with separate bearer credentials. Enable bearer authentication, Read + Create on Events, and Read only on Roster. Keep Update, Delete and tab management disabled. Spreadsheet access remains with your SheetDB account.':
    'استخدم نقطتي اتصال مشتركتين لـ Events وRoster مع بيانات اعتماد منفصلة. فعّل مصادقة bearer والقراءة والإنشاء لـ Events والقراءة فقط لـ Roster. أبقِ التحديث والحذف وإدارة علامات التبويب معطلة. يبقى الوصول إلى الجدول في حساب SheetDB الخاص بك.',
  'Where teachers open the app': 'مكان فتح المعلمين للتطبيق',
  'GitHub Pages URL (or local development URL)': 'رابط GitHub Pages (أو رابط التطوير المحلي)',
  'Save URL': 'حفظ الرابط',
  'Generated links put credentials after #, then the app removes them from the address bar.':
    'تضع الروابط المُنشأة بيانات الاعتماد بعد #، ثم يزيلها التطبيق من شريط العنوان.',
  'Teachers & access links': 'المعلمون وروابط الوصول',
  'Saving a user checks authenticated reads, sheet headers and anonymous denial. Confirm permissions in SheetDB; this manager never tests destructive operations.':
    'يتحقق حفظ المستخدم من القراءة المصادقة وعناوين الجدول ورفض الوصول المجهول. أكّد الصلاحيات في SheetDB؛ لا يختبر هذا المدير العمليات التي تحذف البيانات.',
  'Add a teacher or replace their token': 'إضافة معلم أو استبدال رمزه',
  'Access type': 'نوع الوصول',
  'Assigned roster': 'القائمة المعيّنة',
  Legacy: 'قديم',
  Teacher: 'المعلم',
  'Load roster teachers first': 'حمّل معلمي القائمة أولاً',
  'Roster endpoint ID': 'معرّف نقطة اتصال Roster',
  'Roster bearer token': 'رمز bearer لـ Roster',
  'Roster tab': 'علامة تبويب Roster',
  'Load roster teachers': 'تحميل معلمي القائمة',
  'Username / teacher name': 'اسم المستخدم / المعلم',
  'SheetDB endpoint ID': 'معرّف نقطة اتصال SheetDB',
  'Bearer token': 'رمز bearer',
  'Sheet tab': 'علامة تبويب الجدول',
  'I enabled bearer authentication, Read + Create for Events, and Read only for Roster. Update, Delete and tab operations are disabled.':
    'فعّلت مصادقة bearer والقراءة والإنشاء لـ Events والقراءة فقط لـ Roster. عمليات التحديث والحذف وعلامات التبويب معطلة.',
  'Check access & save user': 'التحقق من الوصول وحفظ المستخدم',
  'To rotate a token: change it in SheetDB first, then save the new token here and send a new link. Editing this form alone cannot invalidate old links. To replace an endpoint, revoke its old access first.':
    'لتغيير الرمز، غيّره أولاً في SheetDB ثم احفظ الرمز الجديد هنا وأرسل رابطاً جديداً. لا يؤدي تعديل هذا النموذج وحده إلى إبطال الروابط القديمة. لاستبدال نقطة اتصال، ألغِ وصولها القديم أولاً.',
  'Personal link': 'الرابط الشخصي',
  'Optional assigned student': 'طالب معيّن اختياري',
  'Teacher link': 'رابط المعلم',
  'Get selected link': 'الحصول على الرابط المحدد',
  'Copy link': 'نسخ الرابط',
  'Hide link': 'إخفاء الرابط',
  "Send this privately. It carries the teacher's name and SheetDB credential. The link remains reusable until you revoke or rotate that credential.":
    'أرسل الرابط بشكل خاص. يحتوي على اسم المعلم وبيانات اعتماد SheetDB، ويمكن استخدامه حتى إلغاء بيانات الاعتماد أو تغييرها.',
  'Revoke access': 'إلغاء الوصول',
  'Type the endpoint ID to confirm': 'اكتب معرّف نقطة الاتصال للتأكيد',
  'I already deleted this endpoint in the SheetDB dashboard. Check for 404/410 (this alone does not prove writes are disabled).':
    'حذفت نقطة الاتصال من لوحة SheetDB بالفعل. تحقق من 404/410 (هذا وحده لا يثبت تعطيل الكتابة).',
  Cancel: 'إلغاء',
  'SheetDB account tools (optional)': 'أدوات حساب SheetDB (اختياري)',
  "These tools require a plan with the Global API. Without it, create endpoints and rotate tokens in the SheetDB dashboard, then add them above. Account keys stay in this server process's memory and are cleared when it stops.":
    'تتطلب هذه الأدوات خطة تتضمن Global API. بدونها، أنشئ نقاط الاتصال وغيّر الرموز في لوحة SheetDB ثم أضفها أعلاه. تبقى مفاتيح الحساب في ذاكرة الخادم وتُمسح عند توقفه.',
  'Open SheetDB API keys': 'فتح مفاتيح SheetDB API',
  'Open SheetDB dashboard': 'فتح لوحة SheetDB',
  'App ID': 'معرّف التطبيق',
  'Management API key': 'مفتاح API للإدارة',
  'Load management credentials': 'تحميل بيانات اعتماد الإدارة',
  'Clear credentials': 'مسح بيانات الاعتماد',
  'List account endpoints': 'عرض نقاط اتصال الحساب',
  'Create a Read + Create endpoint': 'إنشاء نقطة اتصال للقراءة والإنشاء',
  'Existing Google spreadsheet URL': 'رابط جدول Google الحالي',
  'Create endpoint': 'إنشاء نقطة اتصال',
  'The new endpoint still needs bearer authentication enabled in SheetDB. Copy its bearer token there, then check and save the teacher above. The documented Global API cannot configure or refresh bearer tokens.':
    'لا تزال نقطة الاتصال الجديدة تحتاج إلى تفعيل مصادقة bearer في SheetDB. انسخ رمزها من هناك ثم تحقق من المعلم واحفظه أعلاه. لا تتيح Global API الموثقة إعداد رموز bearer أو تحديثها.',
  "Teacher credentials are saved only in this project's ignored":
    'تُحفظ بيانات اعتماد المعلمين فقط في ملف المشروع المستثنى',
  '. Keep this file private and backed up. No account key or manager code is included in the GitHub Pages build.':
    '. احتفظ بهذا الملف خاصاً وانسخه احتياطياً. لا يتضمن إصدار GitHub Pages مفتاح الحساب أو كود المدير.',
  'Management credentials are loaded in memory.': 'بيانات اعتماد الإدارة محمّلة في الذاكرة.',
  'No management credentials loaded.': 'لم تُحمّل بيانات اعتماد الإدارة.',
  'No teachers yet. Add your first teacher below.': 'لا يوجد معلمون بعد. أضف أول معلم أدناه.',
  Revoked: 'ملغى',
  'Revocation pending: check SheetDB': 'الإلغاء معلّق: تحقق من SheetDB',
  Active: 'نشط',
  'Set replacement access': 'إعداد وصول بديل',
  'Replace token': 'استبدال الرمز',
  'Get link': 'الحصول على الرابط',
  Revoke: 'إلغاء الوصول',
  'Select a teacher': 'اختر معلماً',
  'Roster checked. Select a teacher.': 'تم التحقق من القائمة. اختر معلماً.',
  'Load the roster and select a teacher first.': 'حمّل القائمة واختر معلماً أولاً.',
  'Headers copied. Paste them into cell A1 of Events.':
    'نُسخت العناوين. الصقها في الخلية A1 من Events.',
  'Personal link copied. Send it privately.': 'نُسخ الرابط الشخصي. أرسله بشكل خاص.',
  'Endpoint created with Read + Create. Enable bearer authentication in SheetDB before issuing a link.':
    'أُنشئت نقطة الاتصال للقراءة والإنشاء. فعّل مصادقة bearer في SheetDB قبل إصدار رابط.',
  'Site URL saved': 'حُفظ رابط الموقع',
  'Management credentials loaded in memory for this process':
    'حُمّلت بيانات اعتماد الإدارة في ذاكرة هذه العملية',
  'Management credentials cleared': 'مُسحت بيانات اعتماد الإدارة',
  'Authenticated read and anonymous denial verified. User saved.':
    'تم التحقق من القراءة المصادقة ورفض الوصول المجهول. حُفظ المستخدم.',
  'Load management credentials first': 'حمّل بيانات اعتماد الإدارة أولاً',
  'Active profile not found': 'لم يُعثر على ملف نشط',
  'The operation failed': 'فشلت العملية',
  'Events and Roster must use separate endpoints.':
    'يجب استخدام نقطتي اتصال منفصلتين لـ Events وRoster.',
  'Roster has conflicting teacher names.': 'تحتوي القائمة على أسماء معلمين متعارضة.',
  'Roster does not contain this teacher with active assigned students.':
    'لا تحتوي القائمة على هذا المعلم مع طلاب معيّنين نشطين.',
  'Student links require assigned access.': 'تتطلب روابط الطلاب وصولاً معيّناً.',
  'Student is not assigned to this teacher.': 'الطالب غير معيّن لهذا المعلم.',
  'The endpoint ID does not match the selected active user':
    'لا يطابق معرّف نقطة الاتصال المستخدم النشط المحدد',
  'Resolve the pending revocation before replacing access.':
    'أكمل الإلغاء المعلّق قبل استبدال الوصول.',
  'This endpoint belongs to another active user with the same name.':
    'تنتمي نقطة الاتصال لمستخدم نشط آخر بالاسم نفسه.',
  'This endpoint belongs to another active user with the same teacher assignment.':
    'تنتمي نقطة الاتصال لمستخدم نشط آخر بتعيين المعلم نفسه.',
  'This endpoint belongs to another active user with incompatible access or teacher assignment.':
    'تنتمي نقطة الاتصال لمستخدم نشط آخر بصلاحية أو تعيين معلم غير متوافق.',
  'Revoke the old endpoint first, then save its replacement. This keeps old access from being forgotten.':
    'ألغِ نقطة الاتصال القديمة أولاً ثم احفظ بديلها حتى لا يبقى الوصول القديم دون انتباه.',
  'Load management credentials, or delete the endpoint in SheetDB and choose manual confirmation':
    'حمّل بيانات اعتماد الإدارة، أو احذف نقطة الاتصال في SheetDB واختر التأكيد اليدوي',
  'Endpoint deletion could not be confirmed. Read denial alone does not prove Create is disabled; check SheetDB before retrying.':
    'تعذر تأكيد حذف نقطة الاتصال. رفض القراءة وحده لا يثبت تعطيل الإنشاء؛ تحقق من SheetDB قبل إعادة المحاولة.',
  'Endpoint returned 404/410. Confirm deletion in SheetDB; this response alone is not conclusive proof that writes are disabled.':
    'أعادت نقطة الاتصال 404/410. أكّد الحذف في SheetDB؛ هذه الاستجابة وحدها ليست دليلاً قاطعاً على تعطيل الكتابة.',
  'Provider reported deletion and the endpoint returned 404/410. Sheet data is preserved.':
    'أبلغ المزود عن الحذف وأعادت نقطة الاتصال 404/410. بيانات الجدول محفوظة.',
  'SheetDB management request did not complete. Check the SheetDB dashboard before repeating a create or revoke operation.':
    'لم يكتمل طلب إدارة SheetDB. تحقق من لوحة SheetDB قبل تكرار الإنشاء أو الإلغاء.',
}
let language = 'en'
try {
  language = localStorage.getItem('manager-language') === 'ar' ? 'ar' : 'en'
} catch {
  /* storage is optional */
}
const translate = (text) => {
  if (language !== 'ar') return text
  if (arabic[text]) return arabic[text]
  return text
    .replace(
      /^Authenticated read failed for (.+) \((\d+)\)\.$/,
      'فشلت القراءة المصادقة لـ $1 ($2).',
    )
    .replace(/^Missing (.+) headers\. Expected: (.+)$/, 'عناوين $1 مفقودة. المتوقع: $2')
    .replace(
      /^This endpoint did not reject an unauthenticated request \((.+)\)\.$/,
      'لم ترفض نقطة الاتصال طلباً غير مصادق ($1).',
    )
    .replace(
      /^SheetDB management request failed \((\d+)\)\. Check the plan, API key and permissions\.$/,
      'فشل طلب إدارة SheetDB ($1). تحقق من الخطة ومفتاح API والصلاحيات.',
    )
    .replace(
      /^Shared endpoint also affects: (.+)\. Individual revocation is unavailable\.$/,
      'تؤثر نقطة الاتصال المشتركة أيضاً في: $1. لا يتوفر الإلغاء الفردي.',
    )
}
const staticText = []
const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT)
while (walker.nextNode()) {
  const node = walker.currentNode
  const key = node.textContent.trim().replace(/\s+/g, ' ')
  if (arabic[key]) staticText.push([node, node.textContent, key])
}
let lastFeedback = ''
let lastState = null
let revokeProfile = null
function setLanguage(next) {
  language = next
  try {
    localStorage.setItem('manager-language', language)
  } catch {
    /* storage is optional */
  }
  document.documentElement.lang = language
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  document.title = language === 'ar' ? 'حلقة · مدير الوصول المحلي' : 'Halaqa · Local access manager'
  for (const [node, original, key] of staticText)
    node.textContent = language === 'ar' ? translate(key) : original
  $('#language-toggle').textContent = language === 'ar' ? 'English' : 'العربية'
  $('#language-toggle').lang = language === 'ar' ? 'en' : 'ar'
  $('#link-value').setAttribute(
    'aria-label',
    language === 'ar' ? 'رابط الوصول الشخصي' : 'Personal access link',
  )
  $('#profile-form').elements.apiId.placeholder =
    language === 'ar' ? 'المعرّف بعد /api/v1/' : 'The ID after /api/v1/'
  document
    .querySelectorAll('input:not([type=checkbox]):not([type=hidden]), select')
    .forEach((element) => {
      element.dir = 'auto'
    })
  if (lastFeedback) $('#feedback').textContent = translate(lastFeedback)
  if (lastState) render(lastState)
  if (selectedProfile && !$('#link-panel').hidden)
    $('#link-title').textContent =
      language === 'ar'
        ? `الرابط الشخصي لـ ${selectedProfile.username}`
        : `Personal link for ${selectedProfile.username}`
  if (revokeProfile && !$('#revoke-panel').hidden) describeRevoke(revokeProfile)
  for (const select of [$('#teacher-id'), $('#student-id')]) {
    const option = select.options[0]
    if (option) option.textContent = translate(option.dataset.english)
  }
}
$('#language-toggle').onclick = () => setLanguage(language === 'en' ? 'ar' : 'en')
let busy = false
let selectedProfile = null
let rosterTeachers = []
function feedback(text, error = false) {
  lastFeedback = text
  const box = $('#feedback')
  box.hidden = false
  box.textContent = translate(text)
  box.classList.toggle('error', error)
}
async function api(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Manager-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'The operation failed')
  return result
}
async function run(action) {
  if (busy) return
  busy = true
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = true
  })
  try {
    await action()
  } catch (error) {
    feedback(error.message, true)
  } finally {
    busy = false
    document.querySelectorAll('button').forEach((button) => {
      button.disabled = false
    })
  }
}
function hideLink() {
  $('#link-panel').hidden = true
  $('#link-value').value = ''
}
async function load() {
  const state = await api('state')
  $('#site-url').value = state.siteUrl
  lastState = state
  render(state)
}
function render(state) {
  $('#connection').textContent = translate(
    state.connected
      ? 'Management credentials are loaded in memory.'
      : 'No management credentials loaded.',
  )
  const container = $('#profiles')
  container.replaceChildren()
  if (!state.profiles.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = translate('No teachers yet. Add your first teacher below.')
    container.append(empty)
  }
  for (const profile of state.profiles) {
    const row = document.createElement('div')
    row.className = 'profile'
    const details = document.createElement('div')
    const name = document.createElement('h3')
    name.textContent = profile.username
    name.dir = 'auto'
    const meta = document.createElement('p')
    meta.className = 'muted'
    meta.textContent = `${profile.apiId} · ${profile.sheet} · ${translate(profile.revoked ? 'Revoked' : profile.revokePending ? 'Revocation pending: check SheetDB' : 'Active')}`
    details.append(name, meta)
    const actions = document.createElement('div')
    actions.className = 'actions'
    const edit = document.createElement('button')
    edit.className = 'secondary'
    edit.textContent = translate(profile.revoked ? 'Set replacement access' : 'Replace token')
    edit.onclick = () => {
      const form = $('#profile-form')
      form.elements.accessType.value = String(profile.version)
      updateAccessType()
      form.elements.username.value = profile.username
      form.elements.apiId.value = profile.apiId
      form.elements.sheet.value = profile.sheet
      form.elements.token.value = ''
      form.elements.permissionsConfirmed.checked = false
      $('#profile-details').open = true
      form.scrollIntoView({ behavior: 'smooth', block: 'center' })
      form.elements.token.focus()
    }
    actions.append(edit)
    if (!profile.revoked) {
      const link = document.createElement('button')
      link.textContent = translate('Get link')
      link.onclick = () =>
        run(async () => {
          hideLink()
          selectedProfile = profile
          const result = await api('link', { username: profile.username })
          const controls = $('#student-link-controls')
          controls.hidden = profile.version !== 2
          if (profile.version === 2) {
            const { students } = await api('students', { username: profile.username })
            const select = $('#student-id')
            select.replaceChildren(new Option(translate('Teacher link'), ''))
            select.options[0].dataset.english = 'Teacher link'
            for (const student of students) select.add(new Option(student.name, student.studentId))
          }
          $('#link-title').textContent =
            language === 'ar'
              ? `الرابط الشخصي لـ ${profile.username}`
              : `Personal link for ${profile.username}`
          $('#link-value').value = result.link
          $('#link-panel').hidden = false
          $('#link-panel').scrollIntoView({ behavior: 'smooth' })
        })
      const revoke = document.createElement('button')
      revoke.className = 'secondary'
      revoke.textContent = translate('Revoke')
      revoke.onclick = () => {
        hideLink()
        $('#revoke-panel').hidden = false
        $('#revoke-form').reset()
        $('#revoke-form').elements.username.value = profile.username
        revokeProfile = profile
        describeRevoke(profile)
        $('#revoke-panel').scrollIntoView({ behavior: 'smooth' })
      }
      if (!profile.revokePending) actions.append(link)
      actions.append(revoke)
    }
    row.append(details, actions)
    container.append(row)
  }
}
function describeRevoke(profile) {
  $('#revoke-description').textContent =
    language === 'ar'
      ? `إلغاء نقطة الاتصال ${profile.apiId} للمعلم ${profile.username}. سيُحتفظ بجدول البيانات وسجلاته.`
      : `Revoke ${profile.username}'s endpoint ${profile.apiId}. The spreadsheet and its records will be preserved.`
}
function form(id, callback) {
  $(id).addEventListener('submit', (event) => {
    event.preventDefault()
    const element = event.currentTarget
    void run(() => callback(Object.fromEntries(new FormData(element)), element))
  })
}
form('#site-form', async (data) => {
  const result = await api('settings', data)
  hideLink()
  feedback(result.message)
  await load()
})
function updateAccessType() {
  const assigned = $('#access-type').value === '2'
  $('#roster-fields').hidden = !assigned
  $('#teacher-choice').hidden = !assigned
  $('#username-field').hidden = assigned
  $('#profile-form').elements.username.required = !assigned
}
$('#access-type').onchange = updateAccessType
$('#load-teachers').onclick = () =>
  run(async () => {
    const form = $('#profile-form')
    const { teachers } = await api('teachers', {
      apiId: form.elements.rosterApiId.value,
      token: form.elements.rosterToken.value,
      sheet: form.elements.rosterSheet.value,
    })
    rosterTeachers = teachers
    const select = $('#teacher-id')
    select.replaceChildren(new Option(translate('Select a teacher'), ''))
    select.options[0].dataset.english = 'Select a teacher'
    for (const teacher of teachers) select.add(new Option(teacher.username, teacher.teacherId))
    feedback('Roster checked. Select a teacher.')
  })
form('#profile-form', async (data, element) => {
  const assigned = data.accessType === '2'
  const teacher = rosterTeachers.find((item) => item.teacherId === data.teacherId)
  if (assigned && !teacher) throw new Error('Load the roster and select a teacher first.')
  const payload = {
    version: assigned ? 2 : 1,
    username: assigned ? teacher.username : data.username,
    apiId: data.apiId,
    token: data.token,
    sheet: data.sheet,
    permissionsConfirmed: data.permissionsConfirmed === 'on',
  }
  if (assigned) {
    payload.teacherId = teacher.teacherId
    payload.roster = { apiId: data.rosterApiId, token: data.rosterToken, sheet: data.rosterSheet }
  }
  const result = await api('profile', payload)
  element.reset()
  rosterTeachers = []
  updateAccessType()
  hideLink()
  feedback(result.message)
  await load()
})
$('#get-student-link').onclick = () =>
  run(async () => {
    if (!selectedProfile) return
    const studentId = $('#student-id').value
    const result = await api('link', {
      username: selectedProfile.username,
      ...(studentId ? { studentId } : {}),
    })
    $('#link-value').value = result.link
  })
updateAccessType()
form('#connect-form', async (data, element) => {
  const result = await api('connect', data)
  element.reset()
  feedback(result.message)
  await load()
})
form('#create-form', async (data) => {
  const result = await api('create', data)
  $('#create-result').hidden = false
  $('#create-result').textContent = JSON.stringify(result, null, 2)
  feedback(
    'Endpoint created with Read + Create. Enable bearer authentication in SheetDB before issuing a link.',
  )
})
form('#revoke-form', async (data) => {
  const result = await api('revoke', { ...data, manual: data.manual === 'on' })
  $('#revoke-panel').hidden = true
  feedback(result.message)
  await load()
})
$('#disconnect').onclick = () =>
  run(async () => {
    const result = await api('disconnect', {})
    feedback(result.message)
    await load()
  })
$('#list-apis').onclick = () =>
  run(async () => {
    const result = await api('list', {})
    $('#api-list').hidden = false
    $('#api-list').textContent = JSON.stringify(result, null, 2)
  })
$('#copy-headers').onclick = () =>
  run(async () => {
    await navigator.clipboard.writeText('id\tactor\tclient_time\treceived_at\tpayload')
    feedback('Headers copied. Paste them into cell A1 of Events.')
  })
$('#copy-link').onclick = () =>
  run(async () => {
    await navigator.clipboard.writeText($('#link-value').value)
    feedback('Personal link copied. Send it privately.')
  })
$('#hide-link').onclick = hideLink
$('#cancel-revoke').onclick = () => {
  $('#revoke-panel').hidden = true
}
$('#teacher-id').options[0].dataset.english = 'Load roster teachers first'
$('#student-id').options[0].dataset.english = 'Teacher link'
setLanguage(language)
void run(load)
