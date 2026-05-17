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

# Find cloudflared.exe
$cloudflaredExe = $null
$candidates = @(
    "cloudflared",
    "D:\Cloudflared\cloudflared.exe",
    "D:\Cloud\cloudflared.exe",
    "C:\cloudflared\cloudflared.exe",
    (Join-Path $PSScriptRoot "cloudflared.exe")
)
foreach ($c in $candidates) {
    $found = Get-Command $c -ErrorAction SilentlyContinue
    if ($found) { $cloudflaredExe = $found.Source; break }
    if ($c -ne "cloudflared" -and (Test-Path $c)) { $cloudflaredExe = $c; break }
}
if (-not $cloudflaredExe) {
    Write-Host "[Tunnel] ERROR: cloudflared.exe not found."
    Write-Host "[Tunnel] Place cloudflared.exe in D:\Cloudflared\ or add it to PATH."
    pause; exit 1
}

# Start cloudflared, capture stderr where it prints the URL
$logFile = "$env:TEMP\cloudflared.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

Write-Host "[Tunnel] Starting Cloudflare Tunnel..."
$proc = Start-Process -FilePath $cloudflaredExe `
    -ArgumentList "tunnel --url http://localhost:8080" `
    -RedirectStandardError $logFile `
    -NoNewWindow -PassThru

# Wait up to 60 seconds for the URL to appear
Write-Host "[Tunnel] Waiting for tunnel URL..."
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}

if ($tunnelUrl) {
    Write-Host "[Tunnel] URL: $tunnelUrl"

    if ($GITHUB_TOKEN) {
        Write-Host "[Tunnel] Updating GitHub Pages redirect..."
        try {
            $ghHeaders = @{
                "Authorization" = "Bearer $GITHUB_TOKEN"
                "Accept"        = "application/vnd.github+json"
                "Content-Type"  = "application/json"
            }

            # Get current file SHA (required by GitHub API to update)
            $fileInfo = Invoke-RestMethod `
                -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" `
                -Headers $ghHeaders
            $sha = $fileInfo.sha

            # Build redirect HTML
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

            $body = @{
                message = "update redirect"
                content = $encoded
                sha     = $sha
            } | ConvertTo-Json

            Invoke-RestMethod `
                -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" `
                -Method Put -Headers $ghHeaders -Body $body | Out-Null

            Write-Host ""
            Write-Host "  ========================================="
            Write-Host "  Share this permanent link with members:"
            Write-Host "  https://diudiu67.github.io/BeggarClub"
            Write-Host "  ========================================="
            Write-Host ""
        } catch {
            Write-Host "[Tunnel] GitHub update failed: $_"
            Write-Host "[Tunnel] Share this directly: $tunnelUrl"
        }
    } else {
        Write-Host "[Tunnel] No GitHub token found. Share directly: $tunnelUrl"
    }
} else {
    Write-Host "[Tunnel] ERROR: Could not detect tunnel URL from cloudflared output."
}

Write-Host "[Tunnel] Tunnel is running. Press Ctrl+C to stop."
$proc.WaitForExit()
