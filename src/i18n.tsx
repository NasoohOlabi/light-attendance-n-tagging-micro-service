import { createContext, useContext, useEffect, useState } from 'react'

const arabic = {
  'Your account is awaiting approval or no longer has access. Contact your manager.':
    'حسابك ينتظر الموافقة أو لم يعد لديه صلاحية. تواصل مع المسؤول.',
  early: 'مبكر',
  'Explore with sample students': 'استكشف باستخدام طلاب تجريبيين',
  'Explore assigned teacher sample': 'استكشف نموذج المعلم المعيّن',
  'Your halaqa, one shared notebook.': 'حلقتك، دفتر مشترك واحد.',
  'Record attendance. Leave a note. Keep the next teacher in the loop.':
    'سجّل الحضور واترك ملاحظة ليبقى المعلم التالي على اطلاع.',
  'Open your personal access link': 'افتح رابط الوصول الشخصي',
  'Your manager sends you a link with your name and access. Keep it somewhere private and open it whenever you return.':
    'يرسل إليك المسؤول رابطاً باسمك وصلاحياتك. احتفظ به في مكان خاص وافتحه عند العودة.',
  'الحضور والملاحظات · Arabic names, notes and tags are supported.':
    'الحضور والملاحظات · الأسماء والملاحظات والوسوم العربية مدعومة.',
  'Halaqa notebook': 'دفتر الحلقة',
  'Attendance & notes · الحضور والملاحظات': 'الحضور والملاحظات',
  'Demo teacher': 'معلم تجريبي',
  'Sign out': 'تسجيل الخروج',
  'Close session': 'إغلاق الجلسة',
  'Assigned teacher sample notebook.': 'دفتر تجريبي للمعلم المعيّن.',
  'Sample notebook.': 'دفتر تجريبي.',
  'Changes stay in memory and disappear when you leave. No SheetDB requests are made.':
    'تبقى التغييرات في الذاكرة وتختفي عند المغادرة. لا تُرسل طلبات إلى SheetDB.',
  Notebook: 'الدفتر',
  Attendance: 'الحضور',
  Notes: 'الملاحظات',
  Students: 'الطلاب',
  Summary: 'الملخص',
  'History & corrections': 'السجل والتصحيحات',
  'Find a student': 'ابحث عن طالب',
  'Name / اسم الطالب': 'اسم الطالب',
  Group: 'المجموعة',
  'All groups': 'كل المجموعات',
  'Include inactive': 'إظهار غير النشطين',
  'All my students': 'كل طلابي',
  Refresh: 'تحديث',
  'Retry pending batch': 'إعادة محاولة الدفعة المعلّقة',
  'Discard pending retry': 'إلغاء إعادة المحاولة المعلّقة',
  'Loading the shared notebook…': 'جارٍ تحميل الدفتر المشترك…',
  'Every change leaves a record. Use History & corrections to undo a mistake.':
    'يترك كل تغيير سجلاً. استخدم السجل والتصحيحات للتراجع عن خطأ.',
  'Who is here today?': 'من حاضر اليوم؟',
  'Only marked students are saved. To remove an existing mark, use History & corrections; undoing the latest mark may reveal an earlier one.':
    'يُحفظ الطلاب المحددون فقط. لإزالة علامة استخدم السجل والتصحيحات؛ قد يُظهر التراجع عن أحدث علامة علامة سابقة.',
  'Session date': 'تاريخ الجلسة',
  'Add your students in Students, or adjust the group filter.':
    'أضف طلابك في قسم الطلاب أو غيّر مرشح المجموعة.',
  'Mark displayed students present': 'تحديد الطلاب المعروضين حاضرين',
  'Not marked': 'غير محدد',
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'معذور',
  'Save attendance': 'حفظ الحضور',
  'Attendance for': 'الحضور للطالب',
  'Leave a note': 'اترك ملاحظة',
  Student: 'الطالب',
  'Choose a student': 'اختر طالباً',
  'General note': 'ملاحظة عامة',
  Date: 'التاريخ',
  'Tags, separated by commas': 'الوسوم، مفصولة بفواصل',
  'revision, follow-up / مراجعة': 'مراجعة، متابعة',
  Note: 'الملاحظة',
  'What should the next teacher know?': 'ما الذي ينبغي أن يعرفه المعلم التالي؟',
  'Plain text or your own structured format. Tags make it easy to find later.':
    'نص عادي أو بالتنسيق الذي تختاره. تساعد الوسوم في العثور عليه لاحقاً.',
  'Save note': 'حفظ الملاحظة',
  'Shared notes': 'الملاحظات المشتركة',
  From: 'من',
  To: 'إلى',
  'Filter tag': 'تصفية حسب الوسم',
  'All tags': 'كل الوسوم',
  'No notes match this view. Add the first one.': 'لا توجد ملاحظات تطابق هذا العرض. أضف الأولى.',
  'Unknown student': 'طالب غير معروف',
  'Your students': 'طلابك',
  'Student name': 'اسم الطالب',
  'Add student': 'إضافة طالب',
  'Open student': 'فتح الطالب',
  'No assigned students match this view.': 'لا يوجد طلاب معينون يطابقون هذا العرض.',
  'No students yet. Add a name and optional group above.':
    'لا يوجد طلاب بعد. أضف اسماً ومجموعة اختيارية أعلاه.',
  Name: 'الاسم',
  'Save changes': 'حفظ التغييرات',
  'Make inactive': 'تعطيل',
  Activate: 'تفعيل',
  'Attendance overview': 'نظرة عامة على الحضور',
  'The end date must be on or after the start date.':
    'يجب أن يكون تاريخ النهاية في تاريخ البداية أو بعده.',
  'Attendance totals': 'إجمالي الحضور',
  'Scroll sideways to see all columns.': 'مرّر أفقياً لرؤية جميع الأعمدة.',
  'Undo record': 'التراجع عن السجل',
  Reason: 'السبب',
  'Append correction': 'إضافة تصحيح',
  Cancel: 'إلغاء',
  'New attendance, notes and student changes will appear here.':
    'ستظهر هنا سجلات الحضور والملاحظات وتغييرات الطلاب الجديدة.',
  'Record details': 'تفاصيل السجل',
  Undo: 'تراجع',
  Correction: 'تصحيح',
  'General / unknown student': 'طالب عام / غير معروف',
  'No group': 'بلا مجموعة',
  active: 'نشط',
  inactive: 'غير نشط',
  device: 'الجهاز',
  Undone: 'تم التراجع',
  'Loading your session…': 'جارٍ تحميل جلستك…',
  'Loading your notebook…': 'جارٍ تحميل دفترك…',
  'Your account has write-only access. The notebook requires read access; contact your manager.':
    'حسابك يسمح بالكتابة فقط. يتطلب الدفتر صلاحية القراءة؛ تواصل مع المسؤول.',
  'Create an account': 'إنشاء حساب',
  'Reset password': 'إعادة تعيين كلمة المرور',
  Email: 'البريد الإلكتروني',
  Password: 'كلمة المرور',
  'Please wait…': 'يرجى الانتظار…',
  'Create account': 'إنشاء حساب',
  'Send reset email': 'إرسال رسالة إعادة التعيين',
  'Update password': 'تحديث كلمة المرور',
  'Sign in': 'تسجيل الدخول',
  'Forgot password?': 'هل نسيت كلمة المرور؟',
  'Your manager must approve your account before you can open the notebook.':
    'يجب أن يوافق المسؤول على حسابك قبل فتح الدفتر.',
  'Unable to request a reset. Please try again.': 'تعذر طلب إعادة التعيين. حاول مجدداً.',
  'If the account exists, a password reset email has been sent.':
    'إذا كان الحساب موجوداً فقد أُرسلت رسالة لإعادة تعيين كلمة المرور.',
  'Unable to reset your password. Request a new link.':
    'تعذرت إعادة تعيين كلمة المرور. اطلب رابطاً جديداً.',
  'Password updated. Please sign in.': 'تم تحديث كلمة المرور. سجّل الدخول.',
  'Invalid email or password. Check your details and try again.':
    'البريد الإلكتروني أو كلمة المرور غير صحيحين. تحقق من بياناتك وحاول مجدداً.',
  'Unable to create the account. Check your details and try again.':
    'تعذر إنشاء الحساب. تحقق من بياناتك وحاول مجدداً.',
  'The authentication service is unavailable. Please try again.':
    'خدمة المصادقة غير متاحة. حاول مجدداً.',
  'Could not load your teacher account. Please try again.': 'تعذر تحميل حساب المعلم. حاول مجدداً.',
  'Could not load your account. Please try again.': 'تعذر تحميل حسابك. حاول مجدداً.',
  'Your account is awaiting teacher approval. Contact your manager.':
    'حسابك بانتظار موافقة المسؤول. تواصل معه.',
  'Your session has expired. Please sign in again.': 'انتهت جلستك. سجّل الدخول مجدداً.',
  'The notebook request failed. Please try again.': 'فشل طلب الدفتر. حاول مجدداً.',
  'Notebook configuration is unavailable.': 'إعدادات الدفتر غير متاحة.',
  'Your session changed. Please sign in again.': 'تغيرت جلستك. سجّل الدخول مجدداً.',
  'This record is outside your assigned active students.':
    'هذا السجل خارج قائمة طلابك النشطين المعيّنين.',
  'The request failed.': 'فشل الطلب.',
  'Your account has read-only access.': 'حسابك للقراءة فقط.',
  'Open your access link first.': 'افتح رابط الوصول أولاً.',
  'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.':
    'لا يمكن لهذا المتصفح تنسيق الحفظ بأمان بين علامات التبويب. استخدم متصفحاً حديثاً يدعم Web Locks.',
  'A pending batch belongs to another access link. Reopen that link and reconcile it before saving here.':
    'توجد دفعة معلّقة لرابط وصول آخر. افتح ذلك الرابط وسوّها قبل الحفظ هنا.',
  'Pending storage is unavailable or a saved batch is corrupted. Keep a copy of browser storage and ask the manager for help before saving.':
    'التخزين المعلّق غير متاح أو أن دفعة محفوظة تالفة. احتفظ بنسخة من تخزين المتصفح واطلب المساعدة من المسؤول قبل الحفظ.',
  'Another tab is saving this access link. Wait for it to finish, then refresh and try again. No write was sent from this tab.':
    'تقوم علامة تبويب أخرى بالحفظ. انتظر انتهاءها ثم حدّث وحاول مجدداً. لم تُرسل كتابة من علامة التبويب هذه.',
  'Another pending batch exists for this link. Reload and reconcile it before saving.':
    'توجد دفعة معلّقة أخرى لهذا الرابط. أعد التحميل وسوّها قبل الحفظ.',
  'Could not persist the pending batch. No write was sent; restore browser storage before saving.':
    'تعذر حفظ الدفعة المعلّقة. لم تُرسل كتابة؛ أصلح تخزين المتصفح قبل الحفظ.',
  'A pending ID conflicts with a saved record. Ask the manager to inspect it before retrying.':
    'يتعارض معرّف معلّق مع سجل محفوظ. اطلب من المسؤول فحصه قبل إعادة المحاولة.',
  'A pending ID conflicts with a sheet record. Ask the manager to inspect it before retrying.':
    'يتعارض معرّف معلّق مع سجل في الجدول. اطلب من المسؤول فحصه قبل إعادة المحاولة.',
  'Another tab is saving this access link. Wait for it to finish before discarding.':
    'تقوم علامة تبويب أخرى بالحفظ. انتظر انتهاءها قبل الإلغاء.',
  'The pending batch changed in another tab. Reload before discarding.':
    'تغيرت الدفعة المعلّقة في علامة تبويب أخرى. أعد التحميل قبل الإلغاء.',
  'This link is invalid or session storage is unavailable. Reopen it in a regular browser window, or ask the manager for a new link.':
    'الرابط غير صالح أو تخزين الجلسة غير متاح. أعد فتحه في نافذة متصفح عادية أو اطلب رابطاً جديداً من المسؤول.',
  'Session storage is unavailable or invalid. Reopen your access link.':
    'تخزين الجلسة غير متاح أو غير صالح. أعد فتح رابط الوصول.',
  'Stop retrying this batch? It may already exist in the sheet. Refresh and inspect history before entering it again.':
    'هل تريد إيقاف إعادة محاولة هذه الدفعة؟ قد تكون موجودة في الجدول. حدّث وافحص السجل قبل إدخالها مجدداً.',
  'The save may already have reached the sheet. Retry the same pending batch to avoid counting it twice.':
    'قد يكون الحفظ وصل إلى الجدول بالفعل. أعد محاولة الدفعة نفسها لتجنب احتسابها مرتين.',
  'Skip to main content': 'انتقل إلى المحتوى الرئيسي',
  'Retry reuses their original IDs. Even if a request reached the sheet twice, summaries count each record once.':
    'تعيد المحاولة استخدام المعرّفات الأصلية. حتى إذا وصل الطلب إلى الجدول مرتين، يحسب الملخص كل سجل مرة واحدة.',
  'Undo appends a correction. The original stays in the sheet. Undoing the latest attendance restores the previous status.':
    'يضيف التراجع تصحيحاً ويبقى الأصل في الجدول. يعيد التراجع عن أحدث حضور الحالة السابقة.',
  'SheetDB could not be reached. Check your connection and the endpoint CORS settings.':
    'تعذر الوصول إلى SheetDB. تحقق من الاتصال وإعدادات CORS للنقطة.',
  'This link has lost access, or the endpoint permissions are incorrect. Ask the manager for a replacement.':
    'فقد هذا الرابط صلاحية الوصول أو أن صلاحيات النقطة غير صحيحة. اطلب رابطاً بديلاً من المسؤول.',
  'Events sheet headers do not match. Open the setup guide before submitting records.':
    'عناوين جدول الأحداث غير متطابقة. افتح دليل الإعداد قبل إرسال السجلات.',
  'SheetDB did not confirm every row. Keep this batch and retry after checking the sheet.':
    'لم يؤكد SheetDB جميع الصفوف. احتفظ بالدفعة وأعد المحاولة بعد فحص الجدول.',
  'Duplicate student ID in roster': 'معرّف طالب مكرر في القائمة',
  'Conflicting teacher names in roster': 'أسماء معلمين متعارضة في القائمة',
}
export type TranslationKey = keyof typeof arabic
type Language = 'en' | 'ar'
const LanguageContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
}>({ language: 'en', setLanguage: () => {} })
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('halaqa-language') === 'ar' ? 'ar' : 'en'
    } catch {
      return 'en'
    }
  })
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.title = language === 'ar' ? 'وارتق · دفتر الحلقة' : 'Wartaq · Halaqa notebook'
    try {
      localStorage.setItem('halaqa-language', language)
    } catch {
      /* Preference is optional. */
    }
  }, [language])
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}
export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext)
  const t = (text: TranslationKey) => (language === 'ar' ? arabic[text] : text)
  const errorMessage = (message: string) => {
    const warning =
      ' The save may already have reached the sheet. Retry the same pending batch to avoid counting it twice.'
    const hasWarning = message.endsWith(warning)
    const base = hasWarning ? message.slice(0, -warning.length) : message
    const known = Object.entries(arabic).find(([key]) => key === base)
    let result = known ? (language === 'ar' ? known[1] : base) : t('The request failed.')
    const rate =
      /^SheetDB request limit reached\. Wait at least (\d+) seconds before retrying\.$/.exec(base)
    const status = /^SheetDB returned (\d+)\. Check the endpoint and Events tab\.$/.exec(base)
    if (rate)
      result =
        language === 'ar'
          ? `تم بلوغ حد طلبات SheetDB. انتظر ${rate[1]} ثانية على الأقل قبل إعادة المحاولة.`
          : base
    else if (base === 'SheetDB request limit reached. Wait before retrying.')
      result = language === 'ar' ? 'تم بلوغ حد طلبات SheetDB. انتظر قبل إعادة المحاولة.' : base
    else if (status)
      result =
        language === 'ar' ? `أرجع SheetDB الرمز ${status[1]}. تحقق من النقطة وجدول الأحداث.` : base
    return (
      result +
      (hasWarning
        ? ` ${t('The save may already have reached the sheet. Retry the same pending batch to avoid counting it twice.')}`
        : '')
    )
  }
  return { language, setLanguage, t, errorMessage }
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage()
  return (
    <div className="language-switch" role="group" aria-label="Language / اللغة">
      <button
        type="button"
        lang="en"
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        English
      </button>
      <button
        type="button"
        lang="ar"
        aria-pressed={language === 'ar'}
        onClick={() => setLanguage('ar')}
      >
        العربية
      </button>
    </div>
  )
}
