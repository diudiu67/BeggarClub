# Read .env file
$envVars = @{}
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#\s][^=]*)=(.*)$') {
            $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
        }
    }
}
$GITHUB_TOKEN = $envVars["GITHUB_TOKEN"]
$GITHUB_REPO  = "diudiu67/BeggarClub"
$GITHUB_FILE  = "docs/index.html"

$projectDir  = $PSScriptRoot
$backendDir  = Join-Path $projectDir "backend"
$cloudflared = "D:\Cloudflared\cloudflared.exe"
$logFile     = "$env:TEMP\cloudflared.log"

# ── 1. Start bot server (hidden) ─────────────────────────────────────────────
Start-Process -FilePath "python" `
    -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8080" `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden

# Wait for server to initialise
Start-Sleep -Seconds 12

# ── 2. Start Cloudflare tunnel (hidden) ──────────────────────────────────────
if (Test-Path $logFile) { Remove-Item $logFile -Force }
Start-Process -FilePath $cloudflared `
    -ArgumentList "tunnel --url http://localhost:8080" `
    -RedirectStandardError $logFile `
    -WindowStyle Hidden

# Wait for tunnel URL (up to 60s)
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]; break
        }
    }
}

# ── 3. Update GitHub Pages redirect ──────────────────────────────────────────
if ($tunnelUrl -and $GITHUB_TOKEN) {
    try {
        $ghHeaders = @{
            "Authorization" = "Bearer $GITHUB_TOKEN"
            "Accept"        = "application/vnd.github+json"
            "Content-Type"  = "application/json"
        }
        $fileInfo = Invoke-RestMethod `
            -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" `
            -Headers $ghHeaders
        $sha = $fileInfo.sha

        $html = @"
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BeggarClub Music</title>
  <meta http-equiv="refresh" content="0; url=$tunnelUrl">
  <script>window.location.replace("$tunnelUrl");</script>
</head>
<body>
  <p>Redirecting... <a href="$tunnelUrl">Click here if not redirected</a></p>
</body>
</html>
"@
        $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($html))
        $body = @{ message = "update redirect"; content = $encoded; sha = $sha } | ConvertTo-Json
        Invoke-RestMethod `
            -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" `
            -Method Put -Headers $ghHeaders -Body $body | Out-Null
    } catch { }
}
