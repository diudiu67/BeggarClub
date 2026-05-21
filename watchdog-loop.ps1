# watchdog-loop.ps1
# Runs watchdog.ps1 every 5 minutes indefinitely.
# Started by startup.ps1 as a hidden background process on boot.
# Do NOT run this manually - it loops forever.

$watchdog = Join-Path $PSScriptRoot "watchdog.ps1"

# Initial delay so the bot/tunnel have time to fully start up
Start-Sleep -Seconds 120

while ($true) {
    try {
        & $watchdog
    } catch {
        # Log the error and continue the loop
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$ts [LOOP ERROR] watchdog.ps1 threw: $_" | Add-Content "$PSScriptRoot\watchdog.log" -Encoding UTF8
    }
    # Wait 5 minutes before next check
    Start-Sleep -Seconds 300
}
