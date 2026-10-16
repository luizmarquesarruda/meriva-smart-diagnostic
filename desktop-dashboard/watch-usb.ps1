$ErrorActionPreference = 'SilentlyContinue'
$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
  Write-Host 'ADB nao encontrado. Instale Android Platform Tools para ativar USB automatico.'
  exit 2
}
$lastDevices = ''
Write-Host 'Monitor USB ativo. Conecte o Android e autorize a depuracao USB quando solicitado.'
while ($true) {
  $lines = & adb devices 2>$null | Select-Object -Skip 1
  $devices = @($lines | ForEach-Object {
    $parts = ($_ -split '\s+')
    if ($parts.Length -ge 2 -and $parts[1] -eq 'device') { $parts[0] }
  } | Where-Object { $_ })
  $fingerprint = ($devices | Sort-Object) -join ','
  if ($fingerprint -ne $lastDevices) {
    $lastDevices = $fingerprint
    if ($devices.Count -gt 0) {
      foreach ($serial in $devices) {
        & adb -s $serial reverse tcp:8765 tcp:8765 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "Canal USB ativo para $serial (porta 8765)." }
        else { Write-Host "Nao foi possivel configurar $serial. Confira autorizacao USB." }
      }
    } else {
      Write-Host 'Nenhum Android autorizado conectado; aguardando USB...'
    }
  }
  Start-Sleep -Seconds 5
}
