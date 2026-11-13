# Headless manager

Run in the trusted repository workspace. The following PowerShell uses the default address; do not point it at a remote host. Start `bun run manager` in a separate terminal, or start it hidden on Windows from the repository directory:

```powershell
$managerProcess = Start-Process -FilePath 'bun' -ArgumentList 'manager/server.ts' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
```

Use an existing manager if one is already running. Do not run multiple managers against the same state. The manager serializes writes; never edit `.local/manager.json` directly. Set these helpers in the same PowerShell session. They suppress raw errors and responses that might contain secrets; investigate failures safely without recording request bodies or provider URLs.

```powershell
$managerUrl = 'http://127.0.0.1:4174'
$managerHeaders = @{ Origin = $managerUrl; 'x-manager-request' = '1' }
function Send-ManagerJson($path, $body) {
  try {
    Invoke-RestMethod -Method Post -Uri "$managerUrl/api/$path" -Headers $managerHeaders -ContentType 'application/json; charset=utf-8' -Body $body -ErrorAction Stop
  } catch { throw 'Manager request failed; inspect manager state and provider configuration safely.' }
}
```

State contains profile metadata but no bearer or link. Share only details appropriate to the request:

```powershell
Invoke-RestMethod -Uri "$managerUrl/api/state"
```

Save the teacher app URL (HTTPS, or localhost HTTP for development):

```powershell
$body = @{ siteUrl = 'https://example.github.io/notebook/' } | ConvertTo-Json -Compress
$null = Send-ManagerJson 'settings' $body
```

For import, the owner securely supplies `.local/profile-input.json`, protected by OS permissions. It must contain the following fields with real values substituted privately; `permissionsConfirmed` may be true only after the owner has confirmed the endpoint's actual Read/Create-only permissions. Do not put actual secrets in a prompt or source file. The endpoint must use bearer authentication and point at the intended workbook; the manager cannot prove separate endpoints share a workbook.

```json
{
  "version": 1,
  "username": "Teacher A",
  "apiId": "example123",
  "token": "SYNTHETIC_TOKEN",
  "sheet": "Events",
  "permissionsConfirmed": true
}
```

Read and send the private file inside the process without displaying its contents. This makes provider requests and saves a plaintext credential in the ignored manager state:

```powershell
$body = [IO.File]::ReadAllText((Join-Path (Get-Location) '.local/profile-input.json'))
$null = Send-ManagerJson 'profile' $body
Remove-Variable body
```

Write a generated link to an ignored private file without echoing it; protect the file and arrange owner delivery. The username must match the saved profile. Do not put the link in chat unless explicitly requested in a private channel.

```powershell
$body = @{ username = 'Teacher A' } | ConvertTo-Json -Compress
$result = Send-ManagerJson 'link' $body
[IO.File]::WriteAllText((Join-Path (Get-Location) '.local/teacher-link.txt'), $result.link)
Remove-Variable body, result
```

For authorized Global revocation, the owner supplies `SHEETDB_APP_ID` and `SHEETDB_GLOBAL_KEY` through an approved secret mechanism into this shell's process environment. Keep management credentials in process memory, never in a project file or command literal. This manager does not support optional Global-key second-factor authentication. If credentials are already loaded in the manager, omit `connect` and the environment inputs.

```powershell
if (!$env:SHEETDB_APP_ID -or !$env:SHEETDB_GLOBAL_KEY) { throw 'Supply management credentials privately first.' }
try {
  $body = @{ appId = $env:SHEETDB_APP_ID; apiKey = $env:SHEETDB_GLOBAL_KEY } | ConvertTo-Json -Compress
  $null = Send-ManagerJson 'connect' $body
  $body = @{ username = 'Teacher A'; confirmApiId = 'example123'; manual = $false } | ConvertTo-Json -Compress
  $null = Send-ManagerJson 'revoke' $body
} finally {
  Remove-Variable body -ErrorAction SilentlyContinue
  $null = Send-ManagerJson 'disconnect' '{}'
}
```

For manual revocation, the owner first deletes the exact endpoint in SheetDB, then use the same `revoke` request with `manual = $true`; no Global credentials are needed. The manager requires a 404/410 observation before completing, but that alone does not prove append denial. Verify provider deletion and append denial on disposable data. If a revoke is uncertain or fails, inspect provider state and the manager's pending status before deciding the next action; do not automatically repeat it. Resolve old browser pending batches before retiring their endpoint.

After your task, disconnect account credentials and stop only the instance you started. Leave an existing owner instance running. Keep private capability files outside evidence, source and commit staging; remove temporary input files once imported if they are no longer needed. Do not clear unresolved browser pending batches.

```powershell
$null = Send-ManagerJson 'disconnect' '{}'
# Only when $managerProcess was created by this task:
Stop-Process -Id $managerProcess.Id
```
