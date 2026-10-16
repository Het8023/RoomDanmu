$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $process = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit $process.ExitCode
}

try {
    $projectDir = Split-Path -Parent $PSScriptRoot
    $program = (Resolve-Path -LiteralPath (Join-Path $projectDir 'node_modules\electron\dist\electron.exe')).Path
    # Scope this rule to this installation, UDP 47779, and local subnets.
    # Public is needed when an office LAN is classified as Public by Windows.
    $sha = [Security.Cryptography.SHA256]::Create()
    $digest = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($program.ToLowerInvariant()))
    $sha.Dispose()
    $ruleName = 'LanDanmaku-UDP-' + ([BitConverter]::ToString($digest).Replace('-', '').Substring(0, 16))
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        $existing | Set-NetFirewallRule -Enabled True -Action Allow -Profile Any
    } else {
        New-NetFirewallRule -Name $ruleName -DisplayName 'LAN Danmaku (UDP 47779)' -Direction Inbound -Action Allow -Enabled True -Profile Any -Program $program -Protocol UDP -LocalPort 47779 -RemoteAddress LocalSubnet | Out-Null
    }
    exit 0
} catch {
    Write-Error $_
    exit 1
}
