import { createContext, useContext } from 'react'

const arabic = {
  'Signing out…': 'جارٍ تسجيل الخروج…',
  'Could not confirm sign-out. Please try again.': 'تعذّر تأكيد تسجيل الخروج. حاول مجدداً.',
  'Your account is awaiting approval or no longer has access. Contact your manager.':
    'حسابك ينتظر الموافقة أو لم يعد لديه صلاحية. تواصل مع المسؤول.',
  'Explore with sample students': 'استكشف باستخدام طلاب تجريبيين',
  'Explore assigned teacher sample': 'استكشف نموذج المعلم المعيّن',
  'الحضور والملاحظات · Arabic names, notes and tags are supported.':
    'الحضور والملاحظات · الأسماء والملاحظات والوسوم العربية مدعومة.',
  'Attendance & notes': 'الحضور والملاحظات',
  'Demo teacher': 'معلم تجريبي',
  'Sign out': 'تسجيل الخروج',
  'Close session': 'إغلاق الجلسة',
  'Assigned teacher sample.': 'نموذج تجريبي للمعلم المعيّن.',
  'Sample data.': 'بيانات تجريبية.',
  'Changes stay in memory and disappear when you leave. No server requests are made.':
    'تبقى التغييرات في الذاكرة وتختفي عند المغادرة. لا تُرسل طلبات إلى الخادم.',
  'Main navigation': 'التنقل الرئيسي',
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
  'Loading records…': 'جارٍ تحميل السجلات…',
  'Who is here today?': 'من حاضر اليوم؟',
  'Only marked students are saved.': 'يُحفظ الحضور للطلاب الذين حُدّدت حالتهم فقط.',
  'Session date': 'تاريخ الجلسة',
  'Add your students in Students, or adjust the group filter.':
    'أضف طلابك في قسم الطلاب أو غيّر مرشح المجموعة.',
  'Mark displayed students present': 'تحديد الطلاب المعروضين حاضرين',
  'Not marked': 'غير محدد',
  present: 'حاضر',
  absent: 'غائب',
  excused: 'معذور',
  'Save attendance': 'حفظ الحضور',
  'Add note': 'إضافة ملاحظة',
  'Add note for': 'إضافة ملاحظة للطالب',
  'Note for': 'ملاحظة للطالب',
  'Attendance for': 'الحضور للطالب',
  Student: 'الطالب',
  Date: 'التاريخ',
  'Tags, separated by commas': 'الوسوم، مفصولة بفواصل',
  Optional: 'اختياري',
  Note: 'الملاحظة',
  'Save note': 'حفظ الملاحظة',
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
  'Checking your access…': 'جارٍ التحقق من صلاحياتك…',
  'Your account has write-only access. Contact your manager for permission to view records.':
    'حسابك يسمح بالكتابة فقط. تواصل مع المسؤول للحصول على صلاحية عرض السجلات.',
  'Create an account': 'إنشاء حساب',
  Email: 'البريد الإلكتروني',
  Password: 'كلمة المرور',
  'Please wait…': 'يرجى الانتظار…',
  'Create account': 'إنشاء حساب',
  'Update password': 'تحديث كلمة المرور',
  'Sign in': 'تسجيل الدخول',
  'Your manager must approve your account before you can use the app.':
    'يجب أن يوافق المسؤول على حسابك قبل استخدام التطبيق.',
  'Password updated. Please sign in.': 'تم تحديث كلمة المرور. سجّل الدخول.',
  'Invalid username or password.': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'Five accounts are signed in. Sign out of one to add another.':
    'تم تسجيل الدخول إلى خمسة حسابات. سجّل الخروج من أحدها لإضافة حساب آخر.',
  'Sign in to another account': 'تسجيل الدخول إلى حساب آخر',
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
  'The request failed. Please try again.': 'تعذّر إكمال الطلب. حاول مجدداً.',
  'App configuration is unavailable.': 'إعدادات التطبيق غير متاحة.',
  'Your session changed. Please sign in again.': 'تغيرت جلستك. سجّل الدخول مجدداً.',
  'This record is outside your assigned active students.':
    'هذا السجل خارج قائمة طلابك النشطين المعيّنين.',
  'The request failed.': 'فشل الطلب.',
  'Your account has read-only access.': 'حسابك للقراءة فقط.',
  'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.':
    'لا يمكن لهذا المتصفح تنسيق الحفظ بأمان بين علامات التبويب. استخدم متصفحاً حديثاً يدعم Web Locks.',
  'A pending batch belongs to another account or an old link. Copy the pending batch from browser storage and contact your administrator to reconcile it before saving.':
    'توجد دفعة معلّقة لحساب آخر أو لرابط قديم. انسخ الدفعة من تخزين المتصفح وتواصل مع المسؤول لتسويتها قبل الحفظ.',
  'Pending storage is unavailable or a saved batch is corrupted. Keep a copy of browser storage and ask the manager for help before saving.':
    'التخزين المعلّق غير متاح أو أن دفعة محفوظة تالفة. احتفظ بنسخة من تخزين المتصفح واطلب المساعدة من المسؤول قبل الحفظ.',
  'Another tab is saving this account. Wait and try again.':
    'يجري الحفظ في علامة تبويب أخرى. انتظر ثم أعد المحاولة.',
  'The pending batch changed in another tab. Reload before retrying.':
    'تغيّرت الدفعة المعلّقة في علامة تبويب أخرى. أعد تحميل الصفحة قبل المحاولة مجدداً.',
  'Could not persist the pending batch. No write was sent; restore browser storage before saving.':
    'تعذر حفظ الدفعة المعلّقة. لم تُرسل كتابة؛ أصلح تخزين المتصفح قبل الحفظ.',
  'A pending ID conflicts with a saved record. Ask the manager to inspect it before retrying.':
    'يتعارض معرّف معلّق مع سجل محفوظ. اطلب من المسؤول فحصه قبل إعادة المحاولة.',
  'The pending batch changed in another tab. Reload before discarding.':
    'تغيرت الدفعة المعلّقة في علامة تبويب أخرى. أعد التحميل قبل الإلغاء.',
  'Stop retrying this batch? It may already exist on the server. Refresh and check the saved records before entering it again.':
    'هل تريد إيقاف إعادة محاولة هذه الدفعة؟ قد تكون موجودة في الخادم. حدّث الصفحة وتحقق من السجلات المحفوظة قبل إدخالها مجدداً.',
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
export type Language = 'en' | 'ar'
export const LanguageContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
}>({ language: 'en', setLanguage: () => {} })

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
