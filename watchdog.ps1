# BeggarClub Watchdog - runs every 5 minutes via Task Scheduler
# Checks if the Cloudflare tunnel is alive. If broken, restarts it with
# http2 protocol and updates the GitHub Pages redirect automatically.

$logFile     = "$env:TEMP\cloudflared.log"
$cloudflared = "D:\Cloudflared\cloudflared.exe"
$GITHUB_REPO = "diudiu67/BeggarClub"
$GITHUB_FILE = "docs/index.html"
$watchLog    = "D:\Test\discord-music\watchdog.log"

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $watchLog -Value "$ts  $msg" -Encoding UTF8
}

# Load .env
$envVars = @{}
Get-Content "D:\Test\discord-music\.env" | ForEach-Object {
    if ($_ -match '^([^#\s][^=]*)=(.*)$') { $envVars[$Matches[1].Trim()] = $Matches[2].Trim() }
}
$GITHUB_TOKEN = $envVars["GITHUB_TOKEN"]

function Update-GitHubPages($tunnelUrl) {
    try {
        $ghHeaders = @{
            "Authorization" = "Bearer $GITHUB_TOKEN"
            "Accept"        = "application/vnd.github+json"
            "Content-Type"  = "application/json"
        }
        $fileInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" -Headers $ghHeaders
        $sha = $fileInfo.sha
        $html = "<!DOCTYPE html><html><head><meta charset=`"utf-8`"><title>BeggarClub Music</title><meta http-equiv=`"refresh`" content=`"0; url=$tunnelUrl`"><script>window.location.replace(`"$tunnelUrl`");</script></head><body><p>Redirecting... <a href=`"$tunnelUrl`">Click here if not redirected</a></p></body></html>"
        $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($html))
        $body = @{ message = "watchdog: update redirect"; content = $encoded; sha = $sha } | ConvertTo-Json
        Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" -Method Put -Headers $ghHeaders -Body $body | Out-Null
        Write-Log "GitHub Pages updated -> $tunnelUrl"
    } catch {
        Write-Log "GitHub Pages update FAILED: $_"
    }
}

function Get-TunnelUrl {
    if (-not (Test-Path $logFile)) { return $null }
    $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') { return $Matches[0] }
    return $null
}

function Start-Tunnel {
    Write-Log "Starting new cloudflared tunnel (http2)..."
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $cloudflared `
        -ArgumentList "tunnel --url http://localhost:8080 --protocol http2" `
        -RedirectStandardError $logFile `
        -WindowStyle Hidden

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $url = Get-TunnelUrl
        if ($url) {
            Write-Log "Tunnel started: $url"
            return $url
        }
    }
    Write-Log "ERROR: Tunnel URL not found after 60s"
    return $null
}

# Main logic

$cfProcess = Get-Process -Name cloudflared* -ErrorAction SilentlyContinue

# 1. cloudflared not running at all
if (-not $cfProcess) {
    Write-Log "cloudflared not running - starting"
    $newUrl = Start-Tunnel
    if ($newUrl) { Update-GitHubPages $newUrl }
    exit
}

# 2. Running but no URL in log
$currentUrl = Get-TunnelUrl
if (-not $currentUrl) {
    Write-Log "cloudflared running but no tunnel URL found - restarting"
    Stop-Process -Name cloudflared* -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $newUrl = Start-Tunnel
    if ($newUrl) { Update-GitHubPages $newUrl }
    exit
}

# 3. Test if tunnel actually responds
try {
    $resp = Invoke-WebRequest -Uri "$currentUrl/api/health" -UseBasicParsing -TimeoutSec 15
    if ($resp.StatusCode -eq 200) {
        Write-Log "Tunnel OK: $currentUrl"
        exit
    }
} catch { }

# 4. Tunnel URL exists but not responding - restart
Write-Log "Tunnel not responding ($currentUrl) - restarting cloudflared"
Stop-Process -Name cloudflared* -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$newUrl = Start-Tunnel
if ($newUrl) { Update-GitHubPages $newUrl }
