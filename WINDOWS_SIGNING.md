# Windows Code Signing (Azure Trusted Signing)

This guide sets up Azure Trusted Signing for Milady Windows releases and fixes CI `403 Forbidden` errors.

## Start Here (Login Links)

- Azure Portal login: [https://portal.azure.com/](https://portal.azure.com/)
- Entra App Registrations: [https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
- Code Signing accounts page: [https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.CodeSigning%2FcodeSigningAccounts](https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.CodeSigning%2FcodeSigningAccounts)
- Trusted/Artifact Signing docs landing page: [https://learn.microsoft.com/azure/artifact-signing/](https://learn.microsoft.com/azure/artifact-signing/)

## What CI Uses

Windows build/sign config lives in:

- `/Users/shawwalters/eliza-workspace/milady/apps/app/electron/electron-builder.config.json`

Current values:

- `endpoint`: `https://eus.codesigning.azure.net/`
- `codeSigningAccountName`: `milady`
- `certificateProfileName`: `milady-code-sign`
- `publisherName`: `Milady AI`

CI expects these GitHub secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

## 1. Azure Resource Setup

1. Log into Azure Portal: [https://portal.azure.com/](https://portal.azure.com/)
2. Create or open your Code Signing account (`milady`) in the correct subscription/resource group.
3. Create or open certificate profile (`milady-code-sign`).
4. Confirm identity validation is complete/approved for the signer identity.
5. Ensure endpoint region matches your account/profile region (for this repo: `eus` endpoint).

## 2. Register Required Azure Provider

Run from any machine with Azure CLI logged into the same subscription:

```bash
az login
az account set --subscription "<SUBSCRIPTION_ID>"
az provider register --namespace Microsoft.CodeSigning
az provider show --namespace Microsoft.CodeSigning --query registrationState -o tsv
```

Expected result: `Registered`

## 3. Create/Use Service Principal for CI

If you already have one, skip creation and reuse its IDs.

```bash
az ad app create --display-name "milady-github-signing"
az ad sp create --id "<APP_CLIENT_ID>"
az ad app credential reset --id "<APP_CLIENT_ID>" --display-name "github-actions"
```

Capture:

- Tenant ID (`AZURE_TENANT_ID`)
- App/Client ID (`AZURE_CLIENT_ID`)
- Secret **value** (`AZURE_CLIENT_SECRET`)  
  Important: use secret value, not secret ID.

## 4. Grant Signing Permission on the Certificate Profile

Get the service principal object ID:

```bash
SP_OBJECT_ID=$(az ad sp show --id "<AZURE_CLIENT_ID>" --query id -o tsv)
echo "$SP_OBJECT_ID"
```

Set scope to your certificate profile:

```bash
SCOPE="/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RESOURCE_GROUP>/providers/Microsoft.CodeSigning/codeSigningAccounts/milady/certificateProfiles/milady-code-sign"
```

Assign signer role:

```bash
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Artifact Signing Certificate Profile Signer" \
  --scope "$SCOPE"
```

If your tenant still uses old naming, use:

- `Trusted Signing Certificate Profile Signer`

## 5. Add/Update GitHub Secrets

Repo settings:

- [https://github.com/milady-ai/milady/settings/secrets/actions](https://github.com/milady-ai/milady/settings/secrets/actions)

Set:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

Verify from CLI:

```bash
gh secret list --repo milady-ai/milady
```

## 6. CI Preflight in This Repo

Release workflow now includes:

- Windows signing secret validation.
- Trusted Signing preflight that signs a temporary probe executable before full packaging.

Workflow file:

- `/Users/shawwalters/eliza-workspace/milady/.github/workflows/release.yml`

If preflight fails, CI stops early with clear error hints before expensive packaging.

## 7. Trigger a Verification Run

1. Push a test tag (or use workflow dispatch).
2. Open Actions run logs.
3. In `Build Windows`, confirm:
   - `Preflight Azure Trusted Signing access` succeeds.
   - `Package desktop app` signs `.exe` without `Status: 403 (Forbidden)`.

## 8. Troubleshooting 403 Forbidden

Most common causes:

1. Wrong endpoint for your account/profile region.
2. Missing signer role assignment at certificate profile scope.
3. Wrong tenant/client/secret (especially secret ID vs secret value).
4. Certificate profile/account name mismatch.
5. `Microsoft.CodeSigning` provider not registered.

Quick check from logs:

- If failure occurs after `Submitting digest for signing...` with `Status: 403`, auth reached Azure but principal is not authorized for that profile/scope.

## 9. Local Sanity Check (Optional)

On Windows PowerShell (with secrets exported), run:

```powershell
Install-Module -Name TrustedSigning -Scope CurrentUser -Force -AllowClobber
Import-Module TrustedSigning
Copy-Item "$env:WINDIR\System32\notepad.exe" "$env:TEMP\trusted-signing-probe.exe" -Force
Invoke-TrustedSigning `
  -Endpoint "https://eus.codesigning.azure.net/" `
  -CertificateProfileName "milady-code-sign" `
  -CodeSigningAccountName "milady" `
  -TimestampRfc3161 "http://timestamp.acs.microsoft.com" `
  -TimestampDigest "SHA256" `
  -FileDigest "SHA256" `
  -Files "$env:TEMP\trusted-signing-probe.exe"
```

If this passes, CI signing should pass with the same account/profile/secrets.
