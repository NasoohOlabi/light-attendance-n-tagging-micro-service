import { Globe } from 'lucide-react'
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'

const arabic = {
  'Your account is awaiting approval or no longer has access. Contact your manager.':
    'حسابك ينتظر الموافقة أو لم يعد لديه صلاحية. تواصل مع المسؤول.',
  'Explore with sample students': 'استكشف باستخدام طلاب تجريبيين',
  'Explore assigned teacher sample': 'استكشف نموذج المعلم المعيّن',
  'Your halaqa, one shared notebook.': 'حلقتك، دفتر مشترك واحد.',
  'Record attendance. Leave a note. Keep the next teacher in the loop.':
    'سجّل الحضور واترك ملاحظة ليبقى المعلم التالي على اطلاع.',
  'الحضور والملاحظات · Arabic names, notes and tags are supported.':
    'الحضور والملاحظات · الأسماء والملاحظات والوسوم العربية مدعومة.',
  'Halaqa notebook': 'دفتر الحلقة',
  'Attendance & notes · الحضور والملاحظات': 'الحضور والملاحظات',
  'Demo teacher': 'معلم تجريبي',
  'Sign out': 'تسجيل الخروج',
  'Close session': 'إغلاق الجلسة',
  'Assigned teacher sample notebook.': 'دفتر تجريبي للمعلم المعيّن.',
  'Sample notebook.': 'دفتر تجريبي.',
  'Changes stay in memory and disappear when you leave. No server requests are made.':
    'تبقى التغييرات في الذاكرة وتختفي عند المغادرة. لا تُرسل طلبات إلى الخادم.',
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
  'Could not check your session. Please try again.': 'تعذّر التحقق من جلستك. حاول مجدداً.',
  'Try again': 'حاول مجدداً',
  'Loading your session…': 'جارٍ تحميل جلستك…',
  'Loading your notebook…': 'جارٍ تحميل دفترك…',
  'Your account has write-only access. The notebook requires read access; contact your manager.':
    'حسابك يسمح بالكتابة فقط. يتطلب الدفتر صلاحية القراءة؛ تواصل مع المسؤول.',
  'Create an account': 'إنشاء حساب',
  Email: 'البريد الإلكتروني',
  Password: 'كلمة المرور',
  'Please wait…': 'يرجى الانتظار…',
  'Create account': 'إنشاء حساب',
  'Update password': 'تحديث كلمة المرور',
  'Sign in': 'تسجيل الدخول',
  'Your manager must approve your account before you can open the notebook.':
    'يجب أن يوافق المسؤول على حسابك قبل فتح الدفتر.',
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
  'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.':
    'لا يمكن لهذا المتصفح تنسيق الحفظ بأمان بين علامات التبويب. استخدم متصفحاً حديثاً يدعم Web Locks.',
  'A pending batch belongs to another account or an old link. Copy the pending batch from browser storage and contact your administrator to reconcile it before saving.':
    'توجد دفعة معلّقة لرابط وصول آخر. افتح ذلك الرابط وسوّها قبل الحفظ هنا.',
  'Pending storage is unavailable or a saved batch is corrupted. Keep a copy of browser storage and ask the manager for help before saving.':
    'التخزين المعلّق غير متاح أو أن دفعة محفوظة تالفة. احتفظ بنسخة من تخزين المتصفح واطلب المساعدة من المسؤول قبل الحفظ.',
  'Another tab is saving this account. Wait for it to finish, then refresh and try again. No write was sent from this tab.':
    'تقوم علامة تبويب أخرى بالحفظ. انتظر انتهاءها ثم حدّث وحاول مجدداً. لم تُرسل كتابة من علامة التبويب هذه.',
  'Another pending batch exists for this account. Reload and reconcile it before saving.':
    'توجد دفعة معلّقة أخرى لهذا الرابط. أعد التحميل وسوّها قبل الحفظ.',
  'Could not persist the pending batch. No write was sent; restore browser storage before saving.':
    'تعذر حفظ الدفعة المعلّقة. لم تُرسل كتابة؛ أصلح تخزين المتصفح قبل الحفظ.',
  'A pending ID conflicts with a saved record. Ask the manager to inspect it before retrying.':
    'يتعارض معرّف معلّق مع سجل محفوظ. اطلب من المسؤول فحصه قبل إعادة المحاولة.',
  'Another tab is saving this account. Wait for it to finish before discarding.':
    'تقوم علامة تبويب أخرى بالحفظ. انتظر انتهاءها قبل الإلغاء.',
  'The pending batch changed in another tab. Reload before discarding.':
    'تغيرت الدفعة المعلّقة في علامة تبويب أخرى. أعد التحميل قبل الإلغاء.',
  'Stop retrying this batch? It may already exist on the server. Refresh and inspect history before entering it again.':
    'هل تريد إيقاف إعادة محاولة هذه الدفعة؟ قد تكون موجودة في الجدول. حدّث وافحص السجل قبل إدخالها مجدداً.',
  'The save may already have reached the server. Retry the same pending batch to avoid counting it twice.':
    'قد يكون الحفظ وصل إلى الجدول بالفعل. أعد محاولة الدفعة نفسها لتجنب احتسابها مرتين.',
  'Skip to main content': 'انتقل إلى المحتوى الرئيسي',
  'Retry reuses the original IDs, so each record is counted once.':
    'تعيد المحاولة استخدام المعرّفات الأصلية. حتى إذا وصل الطلب إلى الجدول مرتين، يحسب الملخص كل سجل مرة واحدة.',
  'Undo appends a correction. The original stays in the record. Undoing the latest attendance restores the previous status.':
    'يضيف التراجع تصحيحاً ويبقى الأصل في الجدول. يعيد التراجع عن أحدث حضور الحالة السابقة.',
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
      ' The save may already have reached the server. Retry the same pending batch to avoid counting it twice.'
    const hasWarning = message.endsWith(warning)
    const base = hasWarning ? message.slice(0, -warning.length) : message
    const known = Object.entries(arabic).find(([key]) => key === base)
    const result = known ? (language === 'ar' ? known[1] : base) : t('The request failed.')
    return (
      result +
      (hasWarning
        ? ` ${t('The save may already have reached the server. Retry the same pending batch to avoid counting it twice.')}`
        : '')
    )
  }
  return { language, setLanguage, t, errorMessage }
}
function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-preference'],
  })
  return () => observer.disconnect()
}
function themePreference() {
  const value = document.documentElement.dataset.themePreference
  return value === 'light' || value === 'dark' ? value : 'system'
}
export function ThemeSelect() {
  const { language } = useLanguage()
  const theme = useSyncExternalStore(subscribeTheme, themePreference)
  return (
    <label className="theme-select">
      <span className="sr-only">
        {language === 'ar' ? '\u0627\u0644\u0645\u0638\u0647\u0631' : 'Color theme'}
      </span>
      <select
        aria-label={language === 'ar' ? '\u0627\u0644\u0645\u0638\u0647\u0631' : 'Color theme'}
        value={theme}
        onChange={(event) => {
          const value = event.target.value
          if (value !== 'light' && value !== 'dark' && value !== 'system') return
          document.documentElement.dataset.themePreference = value
          document.documentElement.dataset.theme =
            value === 'system'
              ? matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
              : value
          try {
            if (value === 'system') localStorage.removeItem('halaqa-theme')
            else localStorage.setItem('halaqa-theme', value)
          } catch {
            /* Preference is optional. */
          }
        }}
      >
        <option value="system">
          {language === 'ar' ? '\u062d\u0633\u0628 \u0627\u0644\u062c\u0647\u0627\u0632' : 'Device'}
        </option>
        <option value="light">{language === 'ar' ? '\u0641\u0627\u062a\u062d' : 'Light'}</option>
        <option value="dark">{language === 'ar' ? '\u062f\u0627\u0643\u0646' : 'Dark'}</option>
      </select>
    </label>
  )
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage()
  const target = language === 'en' ? 'ar' : 'en'
  return (
    <div className="language-switch" role="group" aria-label="Language / اللغة">
      <ThemeSelect />
      <button
        type="button"
        className="icon-button"
        lang={target}
        aria-label={target === 'ar' ? 'العربية' : 'English'}
        title={target === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
        onClick={() => setLanguage(target)}
      >
        <Globe size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
      </button>
    </div>
  )
}
