<#
.SYNOPSIS
  Creates or updates Google Secret Manager secrets from a .env-style file (e.g. .env.local).

.DESCRIPTION
  Only keys listed in $SecretKeys are uploaded. Values are sent to gcloud via stdin (not echoed).
  Requires: gcloud CLI, Secret Manager API enabled, and IAM to create/add secret versions.

  GOOGLE_SERVICE_ACCOUNT is expected as a single-line JSON value in the env file if you use it.

.EXAMPLE
  .\scripts\push-gcp-secrets-from-env.ps1 -ProjectId gen-lang-client-0568373820 -EnvFile ..\.env.local
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $false)][string]$EnvFile = '.env.local'
)

$ErrorActionPreference = 'Stop'

$SecretKeys = [ordered]@{
  'GEMINI_API_KEY'                = $true
  'GOOGLE_GEMINI_API_KEY'         = $true
  'DATABASE_URL'                  = $true
  'DIRECT_URL'                    = $true
  'SUPABASE_URL'                  = $true
  'SUPABASE_ANON_KEY'             = $true
  'SUPABASE_SERVICE_ROLE_KEY'     = $true
  'SUPABASE_JWT_SECRET'           = $true
  'OPENAI_API_KEY'                = $true
  'AUTH_SESSION_SECRET'           = $true
  'DIV10_BRAIN_ADMIN_SECRET'      = $true
  'GOOGLE_SERVICE_ACCOUNT'        = $true
  'GOOGLE_PRIVATE_KEY'            = $true
  'GOOGLE_SERVICE_ACCOUNT_EMAIL'  = $true
  'GOOGLE_CLIENT_EMAIL'           = $true
  'GOOGLE_MAPS_GROUNDING_API_KEY' = $true
  'GOOGLE_MAPS_API_KEY'           = $true
  'DOCUMENT_AI_PROCESSOR_ID'      = $true
}

function Read-DotEnvFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
  }
  $map = @{}
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or $line -eq '') { return }
    $ix = $line.IndexOf('=')
    if ($ix -lt 1) { return }
    $k = $line.Substring(0, $ix).Trim()
    $v = $line.Substring($ix + 1).Trim()
    if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

$envMap = Read-DotEnvFile -Path $EnvFile
Write-Host "Project: $ProjectId"
Write-Host "Source:  $EnvFile"

foreach ($key in $SecretKeys.Keys) {
  if (-not $envMap.ContainsKey($key)) { continue }
  $value = [string]$envMap[$key]
  if ([string]::IsNullOrWhiteSpace($value)) { continue }
  if ($value -match '^PASTE_|^CHANGE_ME|^your-|^YOUR_') {
    Write-Warning "Skipping $key (still looks like a placeholder)"
    continue
  }

  $exists = $false
  & gcloud secrets describe $key --project=$ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $exists = $true }

  if (-not $exists) {
    Write-Host "Creating secret: $key"
    $value | & gcloud secrets create $key --project=$ProjectId --data-file=-
    if ($LASTEXITCODE -ne 0) { throw "gcloud secrets create failed for $key" }
  }
  else {
    Write-Host "Adding version: $key"
    $value | & gcloud secrets versions add $key --project=$ProjectId --data-file=-
    if ($LASTEXITCODE -ne 0) { throw "gcloud secrets versions add failed for $key" }
  }
}

Write-Host "Done. Next: grant secretAccessor to your Cloud Build SA and Cloud Run runtime SA, then set _CLOUDRUN_SECRETS on your trigger (see docs/SUPABASE_CLOUD_RUN.md section 7)."
