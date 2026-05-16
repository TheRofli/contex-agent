param(
  [switch]$InstallOnly
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = Resolve-Path (Join-Path $ScriptDir "..\..")
$BaseRequirementsPath = Join-Path $ScriptDir "requirements.txt"

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

function Test-AsciiPath {
  param([string]$DirectoryPath)

  return $DirectoryPath -and ($DirectoryPath -notmatch "[^\x00-\x7F]")
}

function Resolve-SttTempDir {
  param(
    [string]$Backend,
    [string]$RuntimeRootPath
  )

  $runtimeTemp = Join-Path $RuntimeRootPath "tmp"

  if ($Backend -ne "parakeet") {
    return $runtimeTemp
  }

  $candidateTemps = @()

  if ($env:TEMP) {
    $candidateTemps += $env:TEMP
  }

  if ($env:TMP -and ($candidateTemps -notcontains $env:TMP)) {
    $candidateTemps += $env:TMP
  }

  if ($env:LOCALAPPDATA) {
    $localTemp = Join-Path $env:LOCALAPPDATA "Temp"

    if ($candidateTemps -notcontains $localTemp) {
      $candidateTemps += $localTemp
    }
  }

  foreach ($candidateTemp in $candidateTemps) {
    if ((Test-AsciiPath $candidateTemp) -and (Test-WritableDirectory $candidateTemp)) {
      return $candidateTemp
    }
  }

  return $runtimeTemp
}

function Resolve-RuntimeRoot {
  if ($env:MINDO_STT_HOME) {
    return $env:MINDO_STT_HOME
  }

  $pluginRuntimeRoot = Join-Path $PluginDir ".mindo-stt-runtime"
  if (Test-Path $pluginRuntimeRoot) {
    return $pluginRuntimeRoot
  }

  if ($env:LOCALAPPDATA) {
    $localAppDataRoot = Join-Path $env:LOCALAPPDATA "Mindo\stt"

    if (Test-WritableDirectory $localAppDataRoot) {
      return $localAppDataRoot
    }
  }

  $tmpRoot = "C:\tmp\mindo-stt"

  if (Test-WritableDirectory $tmpRoot) {
    return $tmpRoot
  }

  return Join-Path $PluginDir ".mindo-stt-runtime"
}

function Resolve-SttBackend {
  $backend = if ($env:MINDO_STT_BACKEND) { $env:MINDO_STT_BACKEND.Trim() } else { "parakeet" }

  if ($backend -in @("faster-whisper", "parakeet")) {
    return $backend
  }

  return "parakeet"
}

function Resolve-BackendRequirementsPath {
  param([string]$Backend)

  switch ($Backend) {
    "parakeet" { return Join-Path $ScriptDir "requirements-parakeet.txt" }
    default { return Join-Path $ScriptDir "requirements-faster-whisper.txt" }
  }
}

function Resolve-DefaultModel {
  param([string]$Backend)

  switch ($Backend) {
    "parakeet" { return "nvidia/parakeet-tdt-0.6b-v3" }
    default { return "small" }
  }
}

function Get-BackendRuntimeName {
  param([string]$Backend)

  return ($Backend -replace "[^a-zA-Z0-9_-]", "-").ToLowerInvariant()
}

function Remove-DirectoryIfExists {
  param([string]$Path)

  if ($Path -and (Test-Path $Path)) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      Write-Host "Removed cache: $Path"
    } catch {
      Write-Host "Could not remove cache $Path`: $($_.Exception.Message)"
    }
  }
}

function Resolve-HuggingFaceModelCacheName {
  param([string]$ModelName)

  if (!$ModelName -or !$ModelName.Contains("/")) {
    return $null
  }

  return "models--$($ModelName -replace '/', '--')"
}

function Remove-OtherSttModelCaches {
  param(
    [string]$RuntimeRootPath,
    [string]$ActiveBackend,
    [string]$ActiveModelName
  )

  $activeRuntimeName = Get-BackendRuntimeName $ActiveBackend
  $activeModelDirName = "models-$activeRuntimeName"
  $activePythonDirName = "python-$activeRuntimeName"
  $activeHuggingFaceModelDirName = Resolve-HuggingFaceModelCacheName $ActiveModelName

  Get-ChildItem -LiteralPath $RuntimeRootPath -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -like "models-*") -and ($_.Name -ne $activeModelDirName)
    } |
    ForEach-Object { Remove-DirectoryIfExists $_.FullName }

  Get-ChildItem -LiteralPath $RuntimeRootPath -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -eq "python-whisper-cpp") -or ($_.Name -eq "models-whisper-cpp")
    } |
    ForEach-Object { Remove-DirectoryIfExists $_.FullName }

  $hfHub = Join-Path $RuntimeRootPath "huggingface\hub"
  Get-ChildItem -LiteralPath $hfHub -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -like "models--*") -and (!$activeHuggingFaceModelDirName -or ($_.Name -ne $activeHuggingFaceModelDirName))
    } |
    ForEach-Object { Remove-DirectoryIfExists $_.FullName }

  Write-Host "Active STT model cache kept: $activeModelDirName"
  if ($activeHuggingFaceModelDirName) {
    Write-Host "Active Hugging Face model cache kept: $activeHuggingFaceModelDirName"
  }
  Write-Host "Active STT package target kept: $activePythonDirName"
}

function Clear-SttInstallCaches {
  param(
    [string]$RuntimeRootPath
  )

  Remove-DirectoryIfExists (Join-Path $RuntimeRootPath "pip-cache")
  Remove-DirectoryIfExists (Join-Path $RuntimeRootPath "tmp")
  Remove-DirectoryIfExists (Join-Path $RuntimeRootPath "xdg-cache")
  Remove-DirectoryIfExists (Join-Path $RuntimeRootPath "numba-cache")

  $hfRoot = Join-Path $RuntimeRootPath "huggingface"
  Remove-DirectoryIfExists (Join-Path $hfRoot ".locks")
  Remove-DirectoryIfExists (Join-Path $hfRoot "downloads")
  Remove-DirectoryIfExists (Join-Path $hfRoot "tmp")
  Remove-DirectoryIfExists (Join-Path $hfRoot "hub\.locks")
}

function Ensure-SttRuntimeDirectories {
  $paths = @(
    $env:TEMP,
    $env:MPLCONFIGDIR,
    $env:NUMBA_CACHE_DIR,
    $env:TORCH_HOME,
    $env:XDG_CACHE_HOME,
    $env:MINDO_STT_USER_HOME,
    $env:HF_HOME,
    $env:HF_HUB_CACHE
  )

  foreach ($path in $paths) {
    if ($path) {
      New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
  }
}

$Backend = Resolve-SttBackend
$RuntimeRoot = Resolve-RuntimeRoot
$BackendRuntimeName = Get-BackendRuntimeName $Backend
$TargetDir = Join-Path $RuntimeRoot "python-$BackendRuntimeName"
$TempDir = Resolve-SttTempDir $Backend $RuntimeRoot
$ModelDir = Join-Path $RuntimeRoot "models-$BackendRuntimeName"
New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

$TranscriptPath = Join-Path $RuntimeRoot "stt-server.log"
try {
  Start-Transcript -Path $TranscriptPath -Append | Out-Null
} catch {
  Write-Host "Could not start transcript log: $($_.Exception.Message)"
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

function Invoke-MindoPythonAllowStderr {
  param(
    [string]$PythonPath,
    [string[]]$PythonArguments
  )

  $oldErrorActionPreference = $ErrorActionPreference

  try {
    $ErrorActionPreference = "Continue"

    if ((Split-Path -Leaf $PythonPath) -eq "py.exe") {
      & $PythonPath -3 @PythonArguments
    } else {
      & $PythonPath @PythonArguments
    }

    if ($LASTEXITCODE -ne 0) {
      throw "Python command failed with exit code $LASTEXITCODE."
    }
  } finally {
    $ErrorActionPreference = $oldErrorActionPreference
  }
}

function Test-SttDependencies {
  param(
    [string]$PythonPath,
    [string]$Backend
  )

  $oldPythonPath = $env:PYTHONPATH
  $oldErrorActionPreference = $ErrorActionPreference
  $env:PYTHONPATH = if ($oldPythonPath) { "$TargetDir;$oldPythonPath" } else { $TargetDir }

  $importScript = @"
import fastapi, uvicorn, multipart, imageio_ffmpeg
backend = '$Backend'
if backend == 'faster-whisper':
    import faster_whisper
elif backend == 'parakeet':
    import nemo.collections.asr
"@

  try {
    $ErrorActionPreference = "Continue"

    if ((Split-Path -Leaf $PythonPath) -eq "py.exe") {
      & $PythonPath -3 -c $importScript 1> $null 2> $null
    } else {
      & $PythonPath -c $importScript 1> $null 2> $null
    }

    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $env:PYTHONPATH = $oldPythonPath
    $ErrorActionPreference = $oldErrorActionPreference
  }
}

function Initialize-SttModel {
  param(
    [string]$PythonPath,
    [string]$Backend
  )

  if ($Backend -ne "parakeet") {
    return
  }

  $oldPythonPath = $env:PYTHONPATH
  $env:PYTHONPATH = if ($oldPythonPath) { "$TargetDir;$ScriptDir;$oldPythonPath" } else { "$TargetDir;$ScriptDir" }

  $preloadScript = @"
from server import get_parakeet_model
print('Preloading Parakeet model...')
model = get_parakeet_model()
print('Parakeet model ready:', type(model).__name__)
"@

  try {
    Invoke-MindoPythonAllowStderr $PythonPath @("-c", $preloadScript)
  } finally {
    $env:PYTHONPATH = $oldPythonPath
  }
}

function Install-Requirements {
  param(
    [string]$PythonPath,
    [string]$RequirementsPath
  )

  if (!(Test-Path $RequirementsPath)) {
    throw "Requirements file not found: $RequirementsPath"
  }

  Invoke-MindoPython $PythonPath @(
    "-m",
    "pip",
    "install",
    "--no-cache-dir",
    "--target",
    $TargetDir,
    "-r",
    $RequirementsPath
  )
}

$Python = Resolve-Python
$env:PYTHONIOENCODING = "utf-8"
$env:PIP_CACHE_DIR = Join-Path $RuntimeRoot "pip-cache"
$env:PIP_NO_CACHE_DIR = "1"
$env:HF_HOME = Join-Path $RuntimeRoot "huggingface"
$env:HF_HUB_CACHE = Join-Path $RuntimeRoot "huggingface\hub"
$env:MPLCONFIGDIR = Join-Path $RuntimeRoot "matplotlib"
$env:NUMBA_CACHE_DIR = Join-Path $RuntimeRoot "numba-cache"
$env:TORCH_HOME = Join-Path $RuntimeRoot "torch"
$env:XDG_CACHE_HOME = Join-Path $RuntimeRoot "xdg-cache"
$env:MINDO_STT_USER_HOME = Join-Path $RuntimeRoot "home"
$env:MINDO_STT_BACKEND = $Backend
$env:MINDO_STT_RUNTIME_ROOT = $RuntimeRoot
$env:MINDO_STT_MODEL_DIR = $ModelDir
$env:TEMP = $TempDir
$env:TMP = $env:TEMP
Ensure-SttRuntimeDirectories

if ($Backend -eq "parakeet") {
  $env:HOME = $env:MINDO_STT_USER_HOME
  $env:USERPROFILE = $env:MINDO_STT_USER_HOME
}

Write-Host "Using Python: $Python"
Write-Host "Using STT runtime: $RuntimeRoot"
Write-Host "Using STT package target: $TargetDir"
Write-Host "Using STT model cache: $ModelDir"
Write-Host "Using STT backend: $Backend"
Set-Content -LiteralPath (Join-Path $RuntimeRoot "python-path.txt") -Value $Python

Invoke-MindoPython $Python @("-c", "import sys; print(sys.version)")

if (!$env:MINDO_STT_MODEL) {
  $env:MINDO_STT_MODEL = Resolve-DefaultModel $Backend
}

if (!$env:MINDO_STT_LANGUAGE) {
  $env:MINDO_STT_LANGUAGE = "auto"
}

if (!$env:MINDO_STT_BEAM_SIZE) {
  $env:MINDO_STT_BEAM_SIZE = "5"
}

if (!$env:MINDO_STT_INITIAL_PROMPT) {
  $env:MINDO_STT_INITIAL_PROMPT = "Russian speech with technical terms: Mindo, Obsidian, Markdown, BitNet, vault, rollback, Kokoro, Silero, Whisper, local LLM."
}

if (!(Test-SttDependencies $Python $Backend)) {
  Write-Host "Installing/updating base STT dependencies into $TargetDir..."
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Install-Requirements $Python $BaseRequirementsPath

  $BackendRequirementsPath = Resolve-BackendRequirementsPath $Backend
  Write-Host "Installing/updating $Backend dependencies from $BackendRequirementsPath..."
  Install-Requirements $Python $BackendRequirementsPath
} else {
  Write-Host "STT dependencies are already installed for $Backend."
}

if (!(Test-SttDependencies $Python $Backend)) {
  throw "STT dependencies for $Backend are still not importable after installation."
}

if ($InstallOnly) {
  Initialize-SttModel $Python $Backend
  Remove-OtherSttModelCaches $RuntimeRoot $Backend $env:MINDO_STT_MODEL
  Clear-SttInstallCaches $RuntimeRoot
  Write-Host "Mindo Local STT dependencies are installed for $Backend."
  exit 0
}

Remove-OtherSttModelCaches $RuntimeRoot $Backend $env:MINDO_STT_MODEL
Clear-SttInstallCaches $RuntimeRoot
Ensure-SttRuntimeDirectories

$oldPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = if ($oldPythonPath) { "$TargetDir;$oldPythonPath" } else { $TargetDir }

$HostValue = if ($env:MINDO_STT_HOST) { $env:MINDO_STT_HOST } else { "127.0.0.1" }
$PortValue = if ($env:MINDO_STT_PORT) { $env:MINDO_STT_PORT } else { "9000" }

Write-Host ""
Write-Host "Mindo Local STT is starting."
Write-Host "Endpoint: http://$HostValue`:$PortValue/transcribe"
Write-Host "Health: http://$HostValue`:$PortValue/health"
Write-Host "Backend: $Backend"
Write-Host "Model: $env:MINDO_STT_MODEL"
Write-Host "Language: $env:MINDO_STT_LANGUAGE"
Write-Host "Beam size: $env:MINDO_STT_BEAM_SIZE"
Write-Host "First transcription may download/load the selected model."
Write-Host ""

Invoke-MindoPython $Python @(
  "-m",
  "uvicorn",
  "server:app",
  "--host",
  $HostValue,
  "--port",
  $PortValue,
  "--app-dir",
  $ScriptDir
)
