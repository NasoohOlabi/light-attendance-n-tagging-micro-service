import { WartaqIcon, WartaqLogo } from './brand/components'
import { LanguageSwitch, useLanguage } from './i18n'
import './home.css'

const copy = {
  en: {
    features: 'Features',
    how: 'How access works',
    signIn: 'Sign in',
    intro:
      'A practical notebook for Quran halaqa teachers to record attendance, share context and pick up where another teacher left off.',
    sample: 'Illustrative sample',
    notebook: 'Halaqa notebook',
    attendance: 'Attendance',
    notes: 'Shared notes',
    present: 'Present',
    late: 'Late',
    student1: 'Ahmad',
    student2: 'Yusuf',
    note: 'Continue revision from the last lesson.',
    tag: 'revision',
    featureTitle: 'The details that carry a halaqa forward',
    featureIntro:
      'Keep the daily record and the context around it together, ready for the next teacher.',
    attendanceTitle: 'Mark attendance',
    attendanceBody:
      'Record attendance for the students in your notebook and return to the overview when you need it.',
    notesTitle: 'Leave a useful note',
    notesBody: 'Write a note for a student, add tags and find it again later.',
    historyTitle: 'Keep the history clear',
    historyBody: 'Review the record and append a correction when something needs to be undone.',
    accessTitle: 'From account to notebook',
    accessIntro: 'Your manager connects your account to the students you teach.',
    step1: 'Create an account or sign in',
    step1Body: 'Use your own account to enter the notebook.',
    step2: 'Get teacher approval',
    step2Body:
      'Your manager approves access. Creating an account alone does not grant notebook access.',
    step3: 'Open your assigned roster',
    step3Body:
      'Once approved, work with the active students assigned to you and the access your manager has granted.',
    faq: 'Questions before you begin',
    q1: 'Can I try it first?',
    a1: 'Yes. Explore the sample notebook without an account. Sample changes stay in memory and disappear when you leave.',
    q2: 'What can another teacher see?',
    a2: 'Approved access and student assignments determine which notebook records a teacher can work with. Ask your manager about your access.',
    q3: 'What if I make a mistake?',
    a3: 'Use History & corrections to append a correction to an existing record. The history remains available.',
    finalTitle: 'A little more continuity for every halaqa.',
    finalBody: 'Explore the notebook with sample students, or sign in to your account.',
    trySample: 'Open the sample notebook',
    openNotebook: 'Open your notebook',
    footer: 'Attendance and shared notes for halaqa teachers.',
  },
  ar: {
    features: 'المزايا',
    how: 'كيف يعمل الوصول',
    signIn: 'تسجيل الدخول',
    intro:
      'دفتر عملي لمعلمي حلقات القرآن لتسجيل الحضور ومشاركة الملاحظات ومتابعة ما بدأه المعلم الآخر.',
    sample: 'مثال توضيحي',
    notebook: 'دفتر الحلقة',
    attendance: 'الحضور',
    notes: 'الملاحظات المشتركة',
    present: 'حاضر',
    late: 'متأخر',
    student1: 'أحمد',
    student2: 'يوسف',
    note: 'متابعة المراجعة من الدرس السابق.',
    tag: 'مراجعة',
    featureTitle: 'التفاصيل التي تساعد الحلقة على الاستمرار',
    featureIntro: 'احتفظ بالسجل اليومي والملاحظات المصاحبة معاً، ليطلع عليها المعلم التالي.',
    attendanceTitle: 'سجّل الحضور',
    attendanceBody: 'سجّل حضور الطلاب في دفترك وارجع إلى الملخص عند الحاجة.',
    notesTitle: 'اترك ملاحظة مفيدة',
    notesBody: 'اكتب ملاحظة لطالب، وأضف وسوماً لتجدها لاحقاً.',
    historyTitle: 'احتفظ بسجل واضح',
    historyBody: 'راجع السجل وأضف تصحيحاً عندما تحتاج إلى التراجع عن خطأ.',
    accessTitle: 'من الحساب إلى الدفتر',
    accessIntro: 'يربط المسؤول حسابك بالطلاب الذين تدرّسهم.',
    step1: 'أنشئ حساباً أو سجّل الدخول',
    step1Body: 'استخدم حسابك الخاص للدخول إلى الدفتر.',
    step2: 'احصل على موافقة المسؤول',
    step2Body: 'يوافق المسؤول على الوصول. إنشاء الحساب وحده لا يمنحك الوصول إلى الدفتر.',
    step3: 'افتح قائمة طلابك المعيّنين',
    step3Body: 'بعد الموافقة، يمكنك العمل مع الطلاب النشطين المعيّنين لك حسب صلاحياتك.',
    faq: 'أسئلة قبل البدء',
    q1: 'هل يمكنني التجربة أولاً؟',
    a1: 'نعم، يمكنك استكشاف الدفتر التجريبي دون حساب. تبقى التغييرات في الذاكرة وتختفي عند المغادرة.',
    q2: 'ماذا يرى المعلم الآخر؟',
    a2: 'تحدد الصلاحيات المعتمدة والطلاب المعيّنون السجلات التي يمكن للمعلم التعامل معها. اسأل المسؤول عن صلاحياتك.',
    q3: 'ماذا لو أخطأت؟',
    a3: 'استخدم السجل والتصحيحات لإضافة تصحيح إلى سجل موجود. يبقى السجل متاحاً.',
    finalTitle: 'استمرارية أكبر لكل حلقة.',
    finalBody: 'استكشف الدفتر بطلاب تجريبيين، أو سجّل الدخول إلى حسابك.',
    trySample: 'افتح الدفتر التجريبي',
    openNotebook: 'افتح دفترك',
    footer: 'الحضور والملاحظات المشتركة لمعلمي الحلقات.',
  },
}

export function HomePage({
  onOpenApp,
  onExplore,
  onExploreAssigned,
  error,
}: {
  onOpenApp: () => void
  onExplore: () => void
  onExploreAssigned: () => void
  error?: string
}) {
  const { language, t } = useLanguage()
  const c = copy[language]
  return (
    <div
      className="wartaq-site wartaq-home"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      lang={language}
    >
      <header className="home-header">
        <div className="home-header-inner">
          <WartaqLogo />
          <nav aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
            <a href="#features">{c.features}</a>
            <a href="#how-it-works">{c.how}</a>
          </nav>
          <div className="home-header-actions">
            <LanguageSwitch />
            <button className="home-sign-in" onClick={onOpenApp}>
              {c.signIn}
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="home-hero home-wrap">
          <div className="home-hero-copy">
            <p className="home-kicker">{c.notebook}</p>
            <h1>{t('Your halaqa, one shared notebook.')}</h1>
            <p className="home-lede">{c.intro}</p>
            {error && (
              <p role="alert" className="home-error">
                {error}
              </p>
            )}
            <div className="home-actions">
              <button className="home-primary" onClick={onExplore}>
                {t('Explore with sample students')}
              </button>
              <a href="#how-it-works">{c.how}</a>
            </div>
          </div>
          <div className="home-illustration" aria-label={c.sample}>
            <div className="home-notebook">
              <div className="home-notebook-rail">
                <WartaqIcon name="book" size={24} />
                <span />
                <span />
                <span />
              </div>
              <div className="home-notebook-content">
                <div className="home-notebook-head">
                  <strong>{c.notebook}</strong>
                  <small>{c.sample}</small>
                </div>
                <h2>{c.attendance}</h2>
                <div className="home-student">
                  <span>{c.student1}</span>
                  <b>{c.present}</b>
                </div>
                <div className="home-student">
                  <span>{c.student2}</span>
                  <b>{c.late}</b>
                </div>
                <div className="home-note">
                  <span>
                    <WartaqIcon name="notes" size={18} /> {c.notes}
                  </span>
                  <p>{c.note}</p>
                  <small>{c.tag}</small>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="features" className="home-features home-wrap">
          <div className="home-section-intro">
            <h2>{c.featureTitle}</h2>
            <p>{c.featureIntro}</p>
          </div>
          <div className="home-feature-list">
            <article>
              <WartaqIcon name="attendance" size={25} />
              <div>
                <h3>{c.attendanceTitle}</h3>
                <p>{c.attendanceBody}</p>
              </div>
            </article>
            <article>
              <WartaqIcon name="notes" size={25} />
              <div>
                <h3>{c.notesTitle}</h3>
                <p>{c.notesBody}</p>
              </div>
            </article>
            <article>
              <WartaqIcon name="history" size={25} />
              <div>
                <h3>{c.historyTitle}</h3>
                <p>{c.historyBody}</p>
              </div>
            </article>
          </div>
        </section>
        <section id="how-it-works" className="home-access">
          <div className="home-wrap home-access-inner">
            <div>
              <h2>{c.accessTitle}</h2>
              <p>{c.accessIntro}</p>
            </div>
            <ol>
              <li>
                <div>
                  <h3>{c.step1}</h3>
                  <p>{c.step1Body}</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>{c.step2}</h3>
                  <p>{c.step2Body}</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>{c.step3}</h3>
                  <p>{c.step3Body}</p>
                </div>
              </li>
            </ol>
          </div>
        </section>
        <section id="questions" className="home-faq home-wrap">
          <h2>{c.faq}</h2>
          <div>
            <details>
              <summary>{c.q1}</summary>
              <p>{c.a1}</p>
            </details>
            <details>
              <summary>{c.q2}</summary>
              <p>{c.a2}</p>
            </details>
            <details>
              <summary>{c.q3}</summary>
              <p>{c.a3}</p>
            </details>
          </div>
        </section>
        <section className="home-final home-wrap">
          <div>
            <h2>{c.finalTitle}</h2>
            <p>{c.finalBody}</p>
          </div>
          <div className="home-final-actions">
            <button className="home-primary" onClick={onExplore}>
              {c.trySample}
            </button>
            <button className="home-assigned" onClick={onOpenApp}>
              {c.openNotebook}
            </button>
            <button className="home-assigned" onClick={onExploreAssigned}>
              {t('Explore assigned teacher sample')}
            </button>
          </div>
        </section>
      </main>
      <footer className="home-footer">
        <div className="home-wrap">
          <WartaqLogo />
          <p>{c.footer}</p>
        </div>
      </footer>
    </div>
  )
}
