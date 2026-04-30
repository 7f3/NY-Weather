$ErrorActionPreference = "Stop"

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = "C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path $bundledNode) { $bundledNode } else { "node" }

Set-Location $project
Write-Host "Starting Weather..."
Write-Host "Open http://127.0.0.1:5173 in your browser."
Write-Host "Leave this window open while using the app. Press Ctrl+C to stop it."
& $node "server.mjs"
