const $ = (selector) => document.querySelector(selector)
let busy = false
let selectedProfile = null
let rosterTeachers = []
function feedback(text, error = false) {
  const box = $('#feedback')
  box.hidden = false
  box.textContent = text
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
  $('#connection').textContent = state.connected
    ? 'Management credentials are loaded in memory.'
    : 'No management credentials loaded.'
  const container = $('#profiles')
  container.replaceChildren()
  if (!state.profiles.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'No teachers yet. Add your first teacher below.'
    container.append(empty)
  }
  for (const profile of state.profiles) {
    const row = document.createElement('div')
    row.className = 'profile'
    const details = document.createElement('div')
    const name = document.createElement('h3')
    name.textContent = profile.username
    const meta = document.createElement('p')
    meta.className = 'muted'
    meta.textContent = `${profile.apiId} · ${profile.sheet} · ${profile.revoked ? 'Revoked' : profile.revokePending ? 'Revocation pending: check SheetDB' : 'Active'}`
    details.append(name, meta)
    const actions = document.createElement('div')
    actions.className = 'actions'
    const edit = document.createElement('button')
    edit.className = 'secondary'
    edit.textContent = profile.revoked ? 'Set replacement access' : 'Replace token'
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
      link.textContent = 'Get link'
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
            select.replaceChildren(new Option('Teacher link', ''))
            for (const student of students) select.add(new Option(student.name, student.studentId))
          }
          $('#link-title').textContent = `Personal link for ${profile.username}`
          $('#link-value').value = result.link
          $('#link-panel').hidden = false
          $('#link-panel').scrollIntoView({ behavior: 'smooth' })
        })
      const revoke = document.createElement('button')
      revoke.className = 'secondary'
      revoke.textContent = 'Revoke'
      revoke.onclick = () => {
        hideLink()
        $('#revoke-panel').hidden = false
        $('#revoke-form').reset()
        $('#revoke-form').elements.username.value = profile.username
        $('#revoke-description').textContent =
          `Revoke ${profile.username}'s endpoint ${profile.apiId}. The spreadsheet and its records will be preserved.`
        $('#revoke-panel').scrollIntoView({ behavior: 'smooth' })
      }
      if (!profile.revokePending) actions.append(link)
      actions.append(revoke)
    }
    row.append(details, actions)
    container.append(row)
  }
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
    select.replaceChildren(new Option('Select a teacher', ''))
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
void run(load)
