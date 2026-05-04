# Grants IAM so labor-catalog@... can run Cloud Build (push AR, deploy Run, write logs).
# Run once from PowerShell after: gcloud auth login && gcloud config set project gen-lang-client-0568373820
#
# Your trigger uses this SA as the Cloud Build service account. Without these roles,
# docker push fails (Step 2) and logs stay empty.

$Project = "gen-lang-client-0568373820"
$Member = "serviceAccount:labor-catalog@gen-lang-client-0568373820.iam.gserviceaccount.com"
$Region = "europe-west1"
$Repo = "cloud-run-source-deploy"
$RuntimeSa = "serviceAccount:353363250924-compute@developer.gserviceaccount.com"

Write-Host "Project: $Project"
Write-Host "Granting roles to $Member ..."

# Push images (fixes: Step 2 push Failed)
# --condition=None: required when project/repo policies already use conditional bindings (Dev Connect / Cloud Build setup).
gcloud artifacts repositories add-iam-policy-binding $Repo `
  --project=$Project `
  --location=$Region `
  --member=$Member `
  --role="roles/artifactregistry.writer" `
  --condition=None

# Deploy Cloud Run
gcloud projects add-iam-policy-binding $Project `
  --member=$Member `
  --role="roles/run.admin" `
  --condition=None

# Act as the Cloud Run runtime service account (required for gcloud run deploy --service-account)
gcloud iam service-accounts add-iam-policy-binding 353363250924-compute@developer.gserviceaccount.com `
  --project=$Project `
  --member=$Member `
  --role="roles/iam.serviceAccountUser" `
  --condition=None

# Build logs in Cloud Console (fixes empty log panes)
gcloud projects add-iam-policy-binding $Project `
  --member=$Member `
  --role="roles/logging.logWriter" `
  --condition=None

Write-Host "Done. Re-run your Cloud Build trigger."
