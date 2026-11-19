// Apply the stored choice before styles paint, and follow device changes in system mode.
const preference = matchMedia('(prefers-color-scheme: dark)')
function readChoice() {
  try {
    const saved = localStorage.getItem('halaqa-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}
function applyTheme() {
  const choice = document.documentElement.dataset.themePreference
  document.documentElement.dataset.theme =
    choice === 'light' || choice === 'dark' ? choice : preference.matches ? 'dark' : 'light'
}
document.documentElement.dataset.themePreference = readChoice()
preference.addEventListener('change', applyTheme)
window.addEventListener('storage', (event) => {
  if (event.key === 'halaqa-theme' || event.key === null) {
    document.documentElement.dataset.themePreference = readChoice()
    applyTheme()
  }
})
applyTheme()

const themeColor = document.querySelector('meta[name="theme-color"]')
if (themeColor) {
  const lightThemeColor = themeColor.content
  const syncThemeColor = () => {
    themeColor.content =
      document.documentElement.dataset.theme === 'dark' ? '#1e2022' : lightThemeColor
  }
  syncThemeColor()
  new MutationObserver(syncThemeColor).observe(document.documentElement, {
    attributeFilter: ['data-theme'],
  })
}
