# watchdog-loop.ps1
# Runs monitor.ps1 every 5 minutes indefinitely.
# Started by launch.ps1 as a hidden background process on boot.
# Do NOT run this manually - it loops forever.

# ── Idempotency lock — ensure only one instance of this loop runs ─────────────
$lockFile = Join-Path $PSScriptRoot "watchdog-loop.lock"
if (Test-Path $lockFile) {
    $existingPid = [int](Get-Content $lockFile -ErrorAction SilentlyContinue)
    if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$ts  [LOOP] Already running as PID $existingPid — duplicate instance ($PID) exiting." |
            Add-Content "$PSScriptRoot\watchdog.log" -Encoding UTF8
        exit 0
    }
}
$PID | Set-Content $lockFile -Encoding UTF8

$watchdog = Join-Path $PSScriptRoot "monitor.ps1"

# Initial delay so the bot/tunnel have time to fully start up
Start-Sleep -Seconds 120

try {
    while ($true) {
        try {
            & $watchdog
        } catch {
            # Log the error and continue the loop
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            "$ts  [LOOP ERROR] monitor.ps1 threw: $_" | Add-Content "$PSScriptRoot\watchdog.log" -Encoding UTF8
        }
        # Wait 5 minutes before next check
        Start-Sleep -Seconds 300
    }
} finally {
    # Clean up the lock file so the next instance can start without waiting
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}
