# BeggarClub Watchdog - runs every 5 minutes via Task Scheduler
# Monitors: Cloudflare tunnel, uvicorn backend, disk space
# Auto-restarts failed services, sends Discord DM alerts, rotates logs, backs up DB

$logFile        = "$env:TEMP\cloudflared.log"
$cloudflared    = "D:\Cloudflared\cloudflared.exe"
$backendDir     = "D:\Test\discord-music\backend"
$GITHUB_REPO    = "diudiu67/BeggarClub"
$GITHUB_FILE    = "docs/index.html"
$watchLog       = "D:\Test\discord-music\watchdog.log"
$trackerFile    = "D:\Test\discord-music\restart_tracker.json"
$dbPath         = "$backendDir\music.db"
$dbBackupDir    = "$backendDir\db_backups"
$cookiePath     = "D:\Test\discord-music\youtube_cookies.txt"
$voiceLog       = "$backendDir\voice_events.log"

$LOG_MAX_LINES  = 2000   # keep last ~1 week of watchdog entries
$DISK_WARN_PCT  = 90     # alert when D: exceeds this %
$MAX_RESTARTS   = 3      # max auto-restarts per service per window
$RESTART_WINDOW = 600    # 10-minute window in seconds
$COOKIE_MAX_AGE = 30     # days before warning about cookie expiry

# ── Logging ──────────────────────────────────────────────────────────────────
function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $watchLog -Value "$ts  $msg" -Encoding UTF8
}

# ── Load .env ─────────────────────────────────────────────────────────────────
$envVars = @{}
Get-Content "D:\Test\discord-music\.env" | ForEach-Object {
    if ($_ -match '^([^#\s][^=]*)=(.*)$') { $envVars[$Matches[1].Trim()] = $Matches[2].Trim() }
}
$GITHUB_TOKEN = $envVars["GITHUB_TOKEN"]
$BOT_TOKEN    = $envVars["DISCORD_TOKEN"]
$OWNER_ID     = $envVars["OWNER_ID"]

# ── Discord DM (with retry) ───────────────────────────────────────────────────
function Send-DiscordDM($message) {
    if (-not $BOT_TOKEN -or -not $OWNER_ID) {
        Write-Log "Discord DM skipped - BOT_TOKEN or OWNER_ID missing"
        return
    }
    $headers = @{
        "Authorization" = "Bot $BOT_TOKEN"
        "Content-Type"  = "application/json"
        "User-Agent"    = "DiscordBot (BeggarClubWatchdog, 1.0)"
    }
    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            # Step 1: open DM channel
            $dmBody    = @{ recipient_id = "$OWNER_ID" } | ConvertTo-Json
            $dmChannel = Invoke-RestMethod -Uri "https://discord.com/api/v10/users/@me/channels" `
                             -Method Post -Headers $headers -Body $dmBody -ErrorAction Stop
            # Step 2: send message
            $msgBody = @{ content = $message } | ConvertTo-Json
            Invoke-RestMethod -Uri "https://discord.com/api/v10/channels/$($dmChannel.id)/messages" `
                -Method Post -Headers $headers -Body $msgBody -ErrorAction Stop | Out-Null
            Write-Log "Discord DM sent (attempt $attempt)"
            return
        } catch {
            Write-Log "Discord DM attempt $attempt FAILED: $_"
            if ($attempt -lt $maxAttempts) { Start-Sleep -Seconds 10 }
        }
    }
    Write-Log "Discord DM gave up after $maxAttempts attempts"
}

# ── Crash loop tracker ────────────────────────────────────────────────────────
function Get-RestartTracker {
    if (Test-Path $trackerFile) {
        try {
            $json = Get-Content $trackerFile -Raw | ConvertFrom-Json
            return @{
                cloudflared_count  = [int]$json.cloudflared_count
                cloudflared_window = [long]$json.cloudflared_window
                uvicorn_count      = [int]$json.uvicorn_count
                uvicorn_window     = [long]$json.uvicorn_window
            }
        } catch {}
    }
    return @{
        cloudflared_count = 0; cloudflared_window = 0
        uvicorn_count     = 0; uvicorn_window     = 0
    }
}

function Save-RestartTracker($t) {
    [PSCustomObject]$t | ConvertTo-Json | Set-Content $trackerFile -Encoding UTF8
}

function Test-CanRestart($t, $svc) {
    $now   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $cKey  = "${svc}_count"
    $wKey  = "${svc}_window"
    # Reset window if expired
    if (($now - $t[$wKey]) -gt $RESTART_WINDOW) {
        $t[$cKey] = 0
        $t[$wKey] = $now
    }
    if ($t[$cKey] -ge $MAX_RESTARTS) { return $false }
    $t[$cKey]++
    if ($t[$cKey] -eq 1) { $t[$wKey] = $now }
    Save-RestartTracker $t
    return $true
}

function Reset-RestartCount($t, $svc) {
    $t["${svc}_count"]  = 0
    $t["${svc}_window"] = 0
    Save-RestartTracker $t
}

# ── Log rotation ──────────────────────────────────────────────────────────────
function Invoke-LogRotation($path) {
    if (-not (Test-Path $path)) { return }
    $lines = Get-Content $path -ErrorAction SilentlyContinue
    if ($lines -and $lines.Count -gt $LOG_MAX_LINES) {
        ($lines | Select-Object -Last $LOG_MAX_LINES) | Set-Content $path -Encoding UTF8
        Write-Log "Log rotated: $(Split-Path $path -Leaf) trimmed to $LOG_MAX_LINES lines"
    }
}

# ── GitHub Pages update ───────────────────────────────────────────────────────
function Update-GitHubPages($tunnelUrl) {
    try {
        $ghHeaders = @{
            "Authorization" = "Bearer $GITHUB_TOKEN"
            "Accept"        = "application/vnd.github+json"
            "Content-Type"  = "application/json"
        }
        $fileInfo = Invoke-RestMethod `
            -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" `
            -Headers $ghHeaders
        $sha  = $fileInfo.sha
        $html = "<!DOCTYPE html><html><head><meta charset=`"utf-8`"><title>BeggarClub Music</title>" +
                "<meta http-equiv=`"refresh`" content=`"0; url=$tunnelUrl`">" +
                "<script>window.location.replace(`"$tunnelUrl`");</script></head>" +
                "<body><p>Redirecting... <a href=`"$tunnelUrl`">Click here if not redirected</a></p></body></html>"
        $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($html))
        $body    = @{ message = "watchdog: update redirect"; content = $encoded; sha = $sha } | ConvertTo-Json
        Invoke-RestMethod `
            -Uri "https://api.github.com/repos/$GITHUB_REPO/contents/$GITHUB_FILE" `
            -Method Put -Headers $ghHeaders -Body $body | Out-Null
        Write-Log "GitHub Pages updated -> $tunnelUrl"
    } catch {
        Write-Log "GitHub Pages update FAILED: $_"
    }
}

# ── Tunnel helpers ────────────────────────────────────────────────────────────
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
        if ($url) { Write-Log "Tunnel started: $url"; return $url }
    }
    Write-Log "ERROR: Tunnel URL not found after 60s"
    return $null
}

# ── Uvicorn helpers ───────────────────────────────────────────────────────────
function Stop-Port8080 {
    try {
        $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
                Select-Object -First 1
        if ($conn) {
            Write-Log "Killing process on :8080 (PID $($conn.OwningProcess))"
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    } catch {}
}

function Start-Uvicorn {
    Write-Log "Starting uvicorn backend..."
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH","User")
    Start-Process -FilePath "python" `
        -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8080" `
        -WorkingDirectory $backendDir `
        -RedirectStandardOutput "$backendDir\bot.log" `
        -RedirectStandardError  "$backendDir\bot_err.log" `
        -WindowStyle Hidden
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:8080/api/health" `
                     -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { Write-Log "Uvicorn started OK"; return $true }
        } catch {}
    }
    Write-Log "ERROR: Uvicorn did not respond after 30s"
    return $false
}

# =============================================================================
# MAIN
# =============================================================================
$tracker = Get-RestartTracker

# ── 1. Log rotation ───────────────────────────────────────────────────────────
Invoke-LogRotation $watchLog
Invoke-LogRotation $voiceLog

# ── 2. Disk space check ───────────────────────────────────────────────────────
try {
    $disk    = Get-PSDrive -Name D -ErrorAction Stop
    $usedPct = [math]::Round(($disk.Used / ($disk.Used + $disk.Free)) * 100, 1)
    $freeGB  = [math]::Round($disk.Free / 1GB, 1)
    if ($usedPct -ge $DISK_WARN_PCT) {
        Write-Log "DISK WARNING: D: is $usedPct% full - $freeGB GB free"
        Send-DiscordDM "[DISK WARNING] D: drive is $usedPct% full with only $freeGB GB remaining. Please clean up files to prevent a server crash."
    }
} catch {
    Write-Log "Disk check failed: $_"
}

# ── 3. Daily database backup ──────────────────────────────────────────────────
if (Test-Path $dbPath) {
    try {
        if (-not (Test-Path $dbBackupDir)) { New-Item -ItemType Directory -Path $dbBackupDir | Out-Null }
        $today      = Get-Date -Format "yyyy-MM-dd"
        $backupPath = "$dbBackupDir\music_$today.db"
        if (-not (Test-Path $backupPath)) {
            Copy-Item $dbPath $backupPath
            Write-Log "Database backed up: music_$today.db"
            # Keep only last 7 daily backups
            Get-ChildItem $dbBackupDir -Filter "music_*.db" |
                Sort-Object LastWriteTime -Descending |
                Select-Object -Skip 7 |
                Remove-Item -Force
        }
    } catch {
        Write-Log "Database backup failed: $_"
    }
}

# ── 4. YouTube cookie age check ───────────────────────────────────────────────
if (Test-Path $cookiePath) {
    $cookieAge = ((Get-Date) - (Get-Item $cookiePath).LastWriteTime).TotalDays
    if ($cookieAge -gt $COOKIE_MAX_AGE) {
        $days = [math]::Round($cookieAge)
        Write-Log "Cookie file is $days days old - may be expired"
        Send-DiscordDM "[COOKIE WARNING] youtube_cookies.txt is $days days old and may be expired. YouTube playback might start failing. Please refresh your cookies."
    }
}

# ── 5. Uvicorn / backend check ────────────────────────────────────────────────
$uvicornOk = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8080/api/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $uvicornOk = $true }
} catch {}

if (-not $uvicornOk) {
    Write-Log "Uvicorn not responding on :8080"
    $lastErr = ""
    if (Test-Path "$backendDir\bot_err.log") {
        $lastErr = (Get-Content "$backendDir\bot_err.log" -ErrorAction SilentlyContinue | Select-Object -Last 5) -join " | "
    }
    if (Test-CanRestart $tracker "uvicorn") {
        Stop-Port8080
        $restarted  = Start-Uvicorn
        $restartNum = $tracker["uvicorn_count"]
        if ($restarted) {
            Write-Log "Uvicorn restart #$restartNum succeeded"
            $dmMsg = "[BACKEND RESTARTED] Uvicorn was not responding on :8080. Restart #$restartNum - Service restored."
            if ($lastErr) { $dmMsg = $dmMsg + "`nLast error: " + $lastErr }
            Send-DiscordDM $dmMsg
        } else {
            Write-Log "Uvicorn restart #$restartNum FAILED"
            $dmMsg = "[BACKEND FAILED] Uvicorn restart #$restartNum did not recover. Manual intervention required."
            if ($lastErr) { $dmMsg = $dmMsg + "`nLast error: " + $lastErr }
            Send-DiscordDM $dmMsg
        }
    } else {
        Write-Log "Uvicorn crash loop detected - auto-restart suspended"
        Send-DiscordDM "[BACKEND CRASH LOOP] Uvicorn has crashed $MAX_RESTARTS times in 10 minutes. Auto-restart suspended - please check manually."
    }
    exit
}

Reset-RestartCount $tracker "uvicorn"

# ── 6. Cloudflared process check ──────────────────────────────────────────────
$cfProcess = Get-Process -Name cloudflared* -ErrorAction SilentlyContinue

if (-not $cfProcess) {
    Write-Log "cloudflared not running"
    if (Test-CanRestart $tracker "cloudflared") {
        $newUrl = Start-Tunnel
        $n = $tracker["cloudflared_count"]
        if ($newUrl) {
            Update-GitHubPages $newUrl
            Send-DiscordDM "[TUNNEL RESTARTED] Cloudflared was not running. Restart #$n. New URL: $newUrl"
        } else {
            Send-DiscordDM "[TUNNEL FAILED] Cloudflared restart #$n failed - no URL obtained."
        }
    } else {
        Write-Log "Cloudflared crash loop detected - auto-restart suspended"
        Send-DiscordDM "[TUNNEL CRASH LOOP] Cloudflared has failed $MAX_RESTARTS times in 10 minutes. Auto-restart suspended - please check manually."
    }
    exit
}

# -- Tunnel URL check --
$currentUrl = Get-TunnelUrl
if (-not $currentUrl) {
    Write-Log "cloudflared running but no tunnel URL found - restarting"
    Stop-Process -Name cloudflared* -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Test-CanRestart $tracker "cloudflared") {
        $newUrl = Start-Tunnel
        $n = $tracker["cloudflared_count"]
        if ($newUrl) {
            Update-GitHubPages $newUrl
            Send-DiscordDM "[TUNNEL RESTARTED] Tunnel URL was missing from logs. Restart #$n. New URL: $newUrl"
        } else {
            Send-DiscordDM "[TUNNEL FAILED] Cloudflared restart #$n failed - no URL obtained."
        }
    } else {
        Send-DiscordDM "[TUNNEL CRASH LOOP] Cloudflared has failed $MAX_RESTARTS times in 10 minutes. Auto-restart suspended - please check manually."
    }
    exit
}

# -- Tunnel health check (external) --
try {
    $resp = Invoke-WebRequest -Uri "$currentUrl/api/health" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-Log "Tunnel OK: $currentUrl"
        Reset-RestartCount $tracker "cloudflared"
        exit
    }
} catch {}

# Tunnel URL exists but not responding - restart
Write-Log "Tunnel not responding ($currentUrl) - restarting cloudflared"
Stop-Process -Name cloudflared* -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if (Test-CanRestart $tracker "cloudflared") {
    $newUrl = Start-Tunnel
    $n = $tracker["cloudflared_count"]
    if ($newUrl) {
        Update-GitHubPages $newUrl
        Send-DiscordDM "[TUNNEL RESTARTED] Tunnel was not responding at $currentUrl. Restart #$n. New URL: $newUrl"
    } else {
        Send-DiscordDM "[TUNNEL FAILED] Cloudflared restart #$n failed - no URL obtained."
    }
} else {
    Write-Log "Cloudflared crash loop detected - auto-restart suspended"
    Send-DiscordDM "[TUNNEL CRASH LOOP] Cloudflared has failed $MAX_RESTARTS times in 10 minutes. Auto-restart suspended - please check manually."
}
