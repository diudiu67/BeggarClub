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
$TINYURL_ALIAS = $envVars["TINYURL_ALIAS"]
$TINYURL_TOKEN = $envVars["TINYURL_TOKEN"]

# Find cloudflared.exe
$cloudflaredExe = $null
$candidates = @(
    "cloudflared",
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
    Write-Host "[Tunnel] Place cloudflared.exe in D:\Cloud\ or add it to your system PATH."
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

    if ($TINYURL_TOKEN -and $TINYURL_ALIAS) {
        Write-Host "[Tunnel] Updating TinyURL..."
        try {
            $headers = @{
                "Authorization" = "Bearer $TINYURL_TOKEN"
                "Content-Type"  = "application/json"
            }
            $body = @{ url = $tunnelUrl } | ConvertTo-Json
            Invoke-RestMethod -Uri "https://api.tinyurl.com/alias/tinyurl/$TINYURL_ALIAS" `
                -Method Patch -Headers $headers -Body $body | Out-Null
            Write-Host ""
            Write-Host "  =================================="
            Write-Host "  Share this link with your members:"
            Write-Host "  https://tinyurl.com/$TINYURL_ALIAS"
            Write-Host "  =================================="
            Write-Host ""
        } catch {
            Write-Host "[Tunnel] TinyURL update failed: $_"
            Write-Host "[Tunnel] Share this directly: $tunnelUrl"
        }
    } else {
        Write-Host "[Tunnel] No TinyURL config found. Share directly: $tunnelUrl"
    }
} else {
    Write-Host "[Tunnel] ERROR: Could not detect tunnel URL from cloudflared output."
    Write-Host "[Tunnel] Check $logFile for details."
}

Write-Host "[Tunnel] Tunnel is running. Press Ctrl+C to stop."
$proc.WaitForExit()
