param(
  [int]$Port = 9000
)

$ErrorActionPreference = "Stop"

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)

if (!$processIds.Count) {
  $netstatLines = @(netstat -ano | Select-String ":$Port")
  $processIds = @(
    $netstatLines |
      ForEach-Object {
        $parts = ($_.Line.Trim() -split "\s+")

        if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
          [int]$parts[4]
        }
      } |
      Select-Object -Unique
  )
}

if (!$processIds.Count) {
  Write-Host "No Mindo Local STT listener found on port $Port."
  exit 0
}

foreach ($processId in $processIds) {
  try {
    Stop-Process -Id $processId -Force
    Write-Host "Stopped process $processId on port $Port."
  } catch {
    Write-Host "Could not stop process $processId on port $Port`: $($_.Exception.Message)"
  }
}
