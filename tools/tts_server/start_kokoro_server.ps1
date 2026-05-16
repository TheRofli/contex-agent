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

function Resolve-KokoroRuntime {
  if ($env:MINDO_KOKORO_JS_HOME) {
    return $env:MINDO_KOKORO_JS_HOME
  }

  if ($env:LOCALAPPDATA) {
    $localRoot = Join-Path $env:LOCALAPPDATA "Mindo\kokoro-js"

    if (Test-WritableDirectory $localRoot) {
      return $localRoot
    }
  }

  $tmpRoot = "C:\tmp\mindo-kokoro-js"

  if (Test-WritableDirectory $tmpRoot) {
    return $tmpRoot
  }

  return Join-Path $PluginDir ".mindo-kokoro-js"
}

function Resolve-Node {
  if ($env:MINDO_NODE -and (Test-Path $env:MINDO_NODE)) {
    return $env:MINDO_NODE
  }

  $storedNodePathFile = Join-Path $RuntimeRoot "node-path.txt"

  if (Test-Path $storedNodePathFile) {
    $storedNodePath = (Get-Content -Raw $storedNodePathFile).Trim()

    if ($storedNodePath -and (Test-Path $storedNodePath)) {
      return $storedNodePath
    }
  }

  $commandNode = Get-Command node -ErrorAction SilentlyContinue
  if ($commandNode) {
    return $commandNode.Source
  }

  $codexNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $codexNode) {
    return $codexNode
  }

  throw "Node.js was not found. Install Node.js 18+ or set MINDO_NODE to node.exe."
}

function Resolve-Npm {
  $commandNpm = Get-Command npm -ErrorAction SilentlyContinue
  if ($commandNpm) {
    return $commandNpm.Source
  }

  $nodeDir = Split-Path -Parent $Node
  $npmCmd = Join-Path $nodeDir "npm.cmd"
  if (Test-Path $npmCmd) {
    return $npmCmd
  }

  throw "npm was not found. Install Node.js with npm."
}

function Invoke-Npm {
  param([string[]]$NpmArguments)

  & $Npm @NpmArguments

  if ($LASTEXITCODE -ne 0) {
    throw "npm failed with exit code $LASTEXITCODE."
  }
}

$RuntimeRoot = Resolve-KokoroRuntime
$TempDir = Join-Path $RuntimeRoot "tmp"
$CacheDir = Join-Path $RuntimeRoot "hf-cache"
New-Item -ItemType Directory -Force -Path $RuntimeRoot, $TempDir, $CacheDir | Out-Null

$TranscriptPath = Join-Path $RuntimeRoot "kokoro-server.log"
try {
  Start-Transcript -Path $TranscriptPath -Append | Out-Null
} catch {
  Write-Host "Could not start transcript log: $($_.Exception.Message)"
}

$Node = Resolve-Node
$Npm = Resolve-Npm
$PackagePath = Join-Path $RuntimeRoot "node_modules\kokoro-js\package.json"

Write-Host "Using Node: $Node"
Write-Host "Using npm: $Npm"
Write-Host "Using Kokoro JS runtime: $RuntimeRoot"
Set-Content -LiteralPath (Join-Path $RuntimeRoot "node-path.txt") -Value $Node

if (!(Test-Path $PackagePath)) {
  Write-Host "Installing kokoro-js into local runtime."
  Invoke-Npm @(
    "install",
    "--ignore-scripts",
    "--cache",
    (Join-Path $RuntimeRoot "npm-cache"),
    "--prefix",
    $RuntimeRoot,
    "kokoro-js@1.2.1"
  )
}

Copy-Item -LiteralPath (Join-Path $ScriptDir "kokoro_js_server.mjs") -Destination (Join-Path $RuntimeRoot "kokoro_js_server.mjs") -Force

if ($InstallOnly) {
  Write-Host "Mindo Local Kokoro JS dependencies are installed."
  exit 0
}

$HostValue = if ($env:MINDO_KOKORO_JS_HOST) { $env:MINDO_KOKORO_JS_HOST } else { "127.0.0.1" }
$PortValue = if ($env:MINDO_KOKORO_JS_PORT) { $env:MINDO_KOKORO_JS_PORT } else { "9200" }

if (!$env:MINDO_KOKORO_MODEL) {
  $env:MINDO_KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"
}

if (!$env:MINDO_KOKORO_VOICE) {
  $env:MINDO_KOKORO_VOICE = "af_heart"
}

if (!$env:HF_HOME) {
  $env:HF_HOME = $CacheDir
}

if (!$env:TRANSFORMERS_CACHE) {
  $env:TRANSFORMERS_CACHE = $CacheDir
}

$env:MINDO_KOKORO_JS_HOME = $RuntimeRoot
$env:MINDO_KOKORO_TMP = $TempDir
$env:TEMP = $TempDir
$env:TMP = $TempDir

Write-Host ""
Write-Host "Mindo Local Kokoro JS TTS is starting."
Write-Host "Endpoint: http://$HostValue`:$PortValue/v1/audio/speech"
Write-Host "Health: http://$HostValue`:$PortValue/health"
Write-Host "Voice: $env:MINDO_KOKORO_VOICE"
Write-Host "Model: $env:MINDO_KOKORO_MODEL"
Write-Host "First speech may download/load the ONNX model."
Write-Host ""

& $Node (Join-Path $RuntimeRoot "kokoro_js_server.mjs")
