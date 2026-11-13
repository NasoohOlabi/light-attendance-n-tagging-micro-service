import { WartaqLogo } from './brand/components'
import { LanguageSwitch, useLanguage } from './i18n'
import './home.css'

const copy = {
  en: {
    nav: 'Main navigation',
    outline: 'Course outline',
    details: 'Course details',
    signIn: 'Sign in',
    eyebrow: 'A journey with the Quran',
    title: 'Recite with care. Grow with every verse.',
    intro:
      'A course in Quran recitation, built around attentive practice and a steady relationship with the words we read.',
    explore: 'Explore the course',
    enrollment: 'Enrollment information',
    notice:
      'Course preview: the outline, teachers, dates, fees, enrollment and contact details are placeholders awaiting confirmation.',
    outcomes: 'A practice to return to',
    outcomesIntro:
      'The proposed course makes space to listen, practise and grow in confidence at a thoughtful pace.',
    outcome1: 'Read with attention',
    outcome1Body: 'Develop a more mindful approach to pronunciation and recitation.',
    outcome2: 'Practise consistently',
    outcome2Body: 'Build a regular rhythm of reading and review.',
    outcome3: 'Learn together',
    outcome3Body: 'Make room for guidance, questions and reflection.',
    curriculum: 'A proposed path through the course',
    curriculumIntro: 'The final curriculum and level will be confirmed before enrollment opens.',
    lesson1: 'Foundations',
    lesson1Body: 'Begin with the building blocks of clear recitation.',
    lesson2: 'Guided recitation',
    lesson2Body: 'Listen and practise passages with attention to detail.',
    lesson3: 'Review and reflection',
    lesson3Body: 'Revisit what you have learned and continue practising.',
    audience: 'Who is it for?',
    audienceBody:
      'For anyone interested in making time for Quran recitation. The intended level and prerequisites are to be confirmed.',
    teacher: 'Your teacher',
    teacherBody: 'Teacher information will be shared once confirmed.',
    schedule: 'Time and place',
    scheduleBody: 'Dates, schedule, location or online format, and fees are yet to be confirmed.',
    register: 'Enrollment',
    registerBody: 'Enrollment is not open yet. Registration details will be shared when confirmed.',
    faq: 'Questions',
    q1: 'When does the course start?',
    a1: 'The start date and schedule are awaiting confirmation.',
    q2: 'Do I need previous experience?',
    a2: 'The intended level and prerequisites will be confirmed with the course details.',
    q3: 'How can I get in touch?',
    a3: 'Contact details will be shared once confirmed.',
    contact: 'Contact',
    contactBody: 'Contact information is awaiting confirmation.',
    tools: 'Already part of a halaqa?',
    toolsBody: 'Open your notebook or explore it with sample students.',
    footer: 'A space for a thoughtful journey with the Quran.',
  },
  ar: {
    nav: 'التنقل الرئيسي',
    outline: 'محاور الدورة',
    details: 'تفاصيل الدورة',
    signIn: 'تسجيل الدخول',
    eyebrow: 'رحلة مع القرآن',
    title: 'تلاوة بعناية، ونمو مع كل آية.',
    intro: 'دورة في تلاوة القرآن الكريم، تقوم على الممارسة المتأنية والصلة المستمرة بكلمات الله.',
    explore: 'استكشف الدورة',
    enrollment: 'معلومات التسجيل',
    notice:
      'معاينة للدورة: المحاور والمعلمون والمواعيد والرسوم والتسجيل وبيانات التواصل معلومات أولية بانتظار التأكيد.',
    outcomes: 'ممارسة نعود إليها',
    outcomesIntro: 'تمنح الدورة المقترحة مساحة للاستماع والتدرب والنمو في الثقة بخطوات متأنية.',
    outcome1: 'اقرأ بانتباه',
    outcome1Body: 'نمِّ عنايتك بالنطق والتلاوة.',
    outcome2: 'تدرّب باستمرار',
    outcome2Body: 'ابنِ عادة منتظمة للقراءة والمراجعة.',
    outcome3: 'تعلّم مع الآخرين',
    outcome3Body: 'أفسح مجالاً للتوجيه والأسئلة والتأمل.',
    curriculum: 'مسار مقترح للدورة',
    curriculumIntro: 'سيُؤكّد المنهج النهائي ومستوى الدورة قبل فتح التسجيل.',
    lesson1: 'الأساسيات',
    lesson1Body: 'ابدأ بأسس التلاوة الواضحة.',
    lesson2: 'التلاوة الموجّهة',
    lesson2Body: 'استمع وتدرّب على مقاطع مع الانتباه للتفاصيل.',
    lesson3: 'المراجعة والتأمل',
    lesson3Body: 'راجع ما تعلمته وواصل الممارسة.',
    audience: 'لمن هذه الدورة؟',
    audienceBody:
      'لكل من يرغب في تخصيص وقت لتلاوة القرآن. المستوى المطلوب والمتطلبات السابقة بانتظار التأكيد.',
    teacher: 'المعلم',
    teacherBody: 'ستُنشر معلومات المعلم بعد تأكيدها.',
    schedule: 'الزمان والمكان',
    scheduleBody: 'المواعيد والجدول والمكان أو طريقة المشاركة عن بُعد والرسوم بانتظار التأكيد.',
    register: 'التسجيل',
    registerBody: 'التسجيل غير مفتوح بعد. ستُنشر تفاصيل التسجيل عند تأكيدها.',
    faq: 'أسئلة شائعة',
    q1: 'متى تبدأ الدورة؟',
    a1: 'موعد البدء والجدول بانتظار التأكيد.',
    q2: 'هل أحتاج إلى خبرة سابقة؟',
    a2: 'سيُؤكّد مستوى الدورة والمتطلبات السابقة مع تفاصيلها.',
    q3: 'كيف أتواصل معكم؟',
    a3: 'ستُنشر بيانات التواصل بعد تأكيدها.',
    contact: 'التواصل',
    contactBody: 'بيانات التواصل بانتظار التأكيد.',
    tools: 'هل أنت من أهل الحلقات؟',
    toolsBody: 'افتح دفترك أو استكشفه باستخدام طلاب تجريبيين.',
    footer: 'مساحة لرحلة متأنية مع القرآن الكريم.',
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
          <nav aria-label={c.nav}>
            <a href="#how-it-works">{c.outline}</a>
            <a href="#enrollment">{c.details}</a>
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
          <div>
            <p className="home-kicker">{c.eyebrow}</p>
            <h1>{c.title}</h1>
            <p className="home-lede">{c.intro}</p>
            {error && (
              <p role="alert" className="home-error">
                {error}
              </p>
            )}
            <div className="home-actions">
              <a className="home-primary" href="#how-it-works">
                {c.explore}
              </a>
              <a href="#enrollment">{c.enrollment}</a>
            </div>
          </div>
          <div className="home-illustration">
            <img src={`${import.meta.env.BASE_URL}brand/wartaq/quran-book.svg`} alt="" />
          </div>
        </section>
        <div className="home-wrap">
          <p className="home-notice">{c.notice}</p>
        </div>
        <section id="features" className="home-section home-wrap">
          <div className="home-section-heading">
            <h2>{c.outcomes}</h2>
            <p>{c.outcomesIntro}</p>
          </div>
          <div className="home-outcomes">
            <article>
              <h3>{c.outcome1}</h3>
              <p>{c.outcome1Body}</p>
            </article>
            <article>
              <h3>{c.outcome2}</h3>
              <p>{c.outcome2Body}</p>
            </article>
            <article>
              <h3>{c.outcome3}</h3>
              <p>{c.outcome3Body}</p>
            </article>
          </div>
        </section>
        <section id="how-it-works" className="home-curriculum">
          <div className="home-wrap home-split">
            <div>
              <h2>{c.curriculum}</h2>
              <p>{c.curriculumIntro}</p>
            </div>
            <ol>
              <li>
                <h3>{c.lesson1}</h3>
                <p>{c.lesson1Body}</p>
              </li>
              <li>
                <h3>{c.lesson2}</h3>
                <p>{c.lesson2Body}</p>
              </li>
              <li>
                <h3>{c.lesson3}</h3>
                <p>{c.lesson3Body}</p>
              </li>
            </ol>
          </div>
        </section>
        <section id="enrollment" className="home-section home-wrap">
          <div className="home-details">
            <article>
              <h2>{c.audience}</h2>
              <p>{c.audienceBody}</p>
            </article>
            <article>
              <h2>{c.teacher}</h2>
              <p>{c.teacherBody}</p>
            </article>
            <article>
              <h2>{c.schedule}</h2>
              <p>{c.scheduleBody}</p>
            </article>
            <article>
              <h2>{c.register}</h2>
              <p>{c.registerBody}</p>
            </article>
          </div>
        </section>
        <section className="home-faq home-wrap">
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
            <h3>{c.contact}</h3>
            <p>{c.contactBody}</p>
          </div>
        </section>
        <section className="home-tools home-wrap">
          <div>
            <h2>{c.tools}</h2>
            <p>{c.toolsBody}</p>
          </div>
          <div className="home-tool-actions">
            <button onClick={onExplore}>{t('Explore with sample students')}</button>
            <button onClick={onExploreAssigned}>{t('Explore assigned teacher sample')}</button>
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
