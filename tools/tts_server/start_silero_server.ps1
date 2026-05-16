param(
  [switch]$InstallOnly
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

function Test-WritableDirectory {
  param([string]$DirectoryPath)

  try {
    New-Item -ItemType Directory -Force -Path $DirectoryPath | Out-Null
    $testFile = Join-Path $DirectoryPath "write-test.txt"
    Set-Content -LiteralPath $testFile -Value "ok"
    Remove-Item -LiteralPath $testFile -Force
    return $true
  } catch {
    return $false
  }
}

function Resolve-SileroRuntime {
  if ($env:MINDO_SILERO_HOME) {
    return $env:MINDO_SILERO_HOME
  }

  if ($env:LOCALAPPDATA) {
    $localAppDataRoot = Join-Path $env:LOCALAPPDATA "Mindo\silero"

    if (Test-WritableDirectory $localAppDataRoot) {
      return $localAppDataRoot
    }
  }

  $tmpRoot = "C:\tmp\mindo-silero"

  if (Test-WritableDirectory $tmpRoot) {
    return $tmpRoot
  }

  return Join-Path $PluginDir ".mindo-silero"
}

function Resolve-Python {
  if ($env:MINDO_PYTHON -and (Test-Path $env:MINDO_PYTHON)) {
    return $env:MINDO_PYTHON
  }

  $storedPythonPathFile = Join-Path $RuntimeRoot "python-path.txt"

  if (Test-Path $storedPythonPathFile) {
    $storedPythonPath = (Get-Content -Raw $storedPythonPathFile).Trim()

    if ($storedPythonPath -and (Test-Path $storedPythonPath)) {
      return $storedPythonPath
    }
  }

  $commandPython = Get-Command python -ErrorAction SilentlyContinue
  if ($commandPython) {
    return $commandPython.Source
  }

  $commandPy = Get-Command py -ErrorAction SilentlyContinue
  if ($commandPy) {
    return $commandPy.Source
  }

  $codexPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  if (Test-Path $codexPython) {
    return $codexPython
  }

  $unrealPython = "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\ThirdParty\Python3\Win64\python.exe"
  if (Test-Path $unrealPython) {
    return $unrealPython
  }

  throw "Python was not found. Install Python 3.10+ or set MINDO_PYTHON to python.exe."
}

function Invoke-MindoPython {
  param(
    [string]$PythonPath,
    [string[]]$PythonArguments
  )

  if ((Split-Path -Leaf $PythonPath) -eq "py.exe") {
    & $PythonPath -3 @PythonArguments
  } else {
    & $PythonPath @PythonArguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Python command failed with exit code $LASTEXITCODE."
  }
}

$RuntimeRoot = Resolve-SileroRuntime
$TempDir = Join-Path $RuntimeRoot "tmp"
New-Item -ItemType Directory -Force -Path $RuntimeRoot, $TempDir | Out-Null

$TranscriptPath = Join-Path $RuntimeRoot "silero-server.log"
try {
  Start-Transcript -Path $TranscriptPath -Append | Out-Null
} catch {
  Write-Host "Could not start transcript log: $($_.Exception.Message)"
}

$Python = Resolve-Python
$env:PYTHONIOENCODING = "utf-8"
$env:MINDO_SILERO_HOME = $RuntimeRoot
$env:TORCH_HOME = Join-Path $RuntimeRoot "torch"
$env:TEMP = $TempDir
$env:TMP = $env:TEMP

Write-Host "Using Python: $Python"
Write-Host "Using Silero runtime: $RuntimeRoot"
Set-Content -LiteralPath (Join-Path $RuntimeRoot "python-path.txt") -Value $Python

Invoke-MindoPython $Python @("-c", "import sys; print(sys.version); import torch; print('torch', torch.__version__)")

if ($InstallOnly) {
  Write-Host "Mindo Local Silero dependencies are installed."
  exit 0
}

$HostValue = if ($env:MINDO_SILERO_HOST) { $env:MINDO_SILERO_HOST } else { "127.0.0.1" }
$PortValue = if ($env:MINDO_SILERO_PORT) { $env:MINDO_SILERO_PORT } else { "9100" }

if (!$env:MINDO_SILERO_VOICE) {
  $env:MINDO_SILERO_VOICE = "baya"
}

Write-Host ""
Write-Host "Mindo Local Silero TTS is starting."
Write-Host "Endpoint: http://$HostValue`:$PortValue/speech"
Write-Host "Health: http://$HostValue`:$PortValue/health"
Write-Host "Voice: $env:MINDO_SILERO_VOICE"
Write-Host "First speech may download/load the selected Silero Russian v5.5 model."
Write-Host ""

Invoke-MindoPython $Python @(
  (Join-Path $ScriptDir "silero_server.py")
)
