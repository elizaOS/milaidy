# Azure Trusted Signing Setup Guide

To use Azure Trusted Signing in the GitHub Actions pipeline, you need to configure an Azure environment and extract several values as GitHub repository secrets. This guide walks you through the entire process.

You can use either the **Azure Portal** (Steps 1–6 below) or the **Azure CLI** (see [CLI Setup](#cli-setup)). One exception: **Identity Validation** (Step 2) must be completed in the portal — Microsoft's vetting process is not available via CLI.

## Prerequisites
- An active Azure Subscription.
- Sufficient permissions to create resources, app registrations, and assign roles in the Azure portal (or CLI).

## Step 1: Create a Trusted Signing Account
1. Log in to the [Azure Portal](https://portal.azure.com/).
2. Search for **Trusted Signing** in the search bar and select it.
3. Click **Create**.
4. Choose your Subscription and Resource Group (or create a new one).
5. Enter an **Account Name** (e.g., `milady-signing-account`).
   - *Keep track of this value!* This is your **`AZURE_SIGN_ACCOUNT_NAME`**.
6. Select a Region (e.g., `East US`). The URI format for your endpoint will be based on the region. For `East US`, the endpoint is usually `https://eus.codesigning.azure.net/`.
   - *Keep track of this value!* This is your **`AZURE_SIGN_ENDPOINT`**. You can verify the exact endpoint URL in your Trusted Signing account's Overview page later.
7. Click **Review + Create**, then **Create**.

## Step 2: Set up Identity Validation and a Certificate Profile
1. Go to the newly created Trusted Signing Account resource.
2. Under the **Settings** menu on the left, click **Identity Validation**.
3. Create a new Identity Validation. You will need to provide your organizational details and pass Microsoft's vetting process.
4. Once your identity is validated, go to **Certificate Profiles** in the left menu.
5. Click **Create** to create a new profile (e.g., `milady-release-profile`), linked to your verified identity.
   - *Keep track of this name!* This is your **`AZURE_SIGN_PROFILE_NAME`**.

## Step 3: Create an App Registration for GitHub Actions
To allow GitHub Actions to communicate with your Azure account securely, you need an App Registration (Service Principal).

1. In the Azure Portal, search for and select **Microsoft Entra ID**.
2. Click **App registrations** in the left menu.
3. Click **New registration**.
4. Name the application (e.g., `GitHubActions-TrustedSigning`).
5. Choose "Accounts in this organizational directory only" for Supported account types.
6. Click **Register**.
7. Once registered, you will be taken to the Overview page of the new app.
   - Copy the **Application (client) ID**. This is your **`AZURE_CLIENT_ID`**.
   - Copy the **Directory (tenant) ID**. This is your **`AZURE_TENANT_ID`**.

## Step 4: Generate a Client Secret
1. While still in the App Registration, click **Certificates & secrets** in the left menu.
2. Click **New client secret**.
3. Add a description (e.g., `github-actions-secret`) and choose an expiration timeline.
4. Click **Add**.
5. **Immediately copy the "Value"** column of the new secret. It will be hidden if you leave the page.
   - This value is your **`AZURE_CLIENT_SECRET`**.

> **Alternative (More Secure):** You can also use OpenID Connect (OIDC) through **Federated credentials** instead of a Client Secret to avoid managing long-lived secrets.

## Step 5: Assign Permissions to the App Registration
The App Registration needs permission to actually sign files using your Certificate Profile.

1. Navigate back to your **Trusted Signing Account** resource (from Step 1).
2. Click **Access control (IAM)** in the left menu.
3. Click **Add** -> **Add role assignment**.
4. Search for the role **Trusted Signing Certificate Profile Signer** and select it. Click Next.
5. Choose **User, group, or service principal**.
6. Click **Select members** and search for the name of the App Registration you created in Step 3 (e.g., `GitHubActions-TrustedSigning`).
7. Select it, click **Review + assign**, and then assign the role.

## Step 6: Add the GitHub Secrets
Now that you have gathered all the necessary values, go to your GitHub repository:

1. Navigate to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret** for each of the following:

| Secret Name | Where to find it |
|---|---|
| `AZURE_TENANT_ID` | Microsoft Entra ID -> App registrations -> Overview |
| `AZURE_CLIENT_ID` | Microsoft Entra ID -> App registrations -> Overview |
| `AZURE_CLIENT_SECRET` | Microsoft Entra ID -> App registrations -> Certificates & secrets |
| `AZURE_SIGN_ENDPOINT` | The region-specific URI (e.g., `https://eus.codesigning.azure.net/`) |
| `AZURE_SIGN_ACCOUNT_NAME` | The name of your Trusted Signing Account |
| `AZURE_SIGN_PROFILE_NAME` | The name of the Certificate Profile you created |

**Unsigned builds (while waiting for identity validation):** Set `SKIP_WINDOWS_SIGNING=1` as a repository secret to produce unsigned Windows artifacts. Remove it once your certificate profile is ready to enable signing.

Once all six Azure secrets are set and `SKIP_WINDOWS_SIGNING` is not set, the `release-electrobun.yml` workflow automatically uses Azure Trusted Signing for Windows builds:
- **Executables**: `.exe` files in `apps/app/electrobun` (Setup, launcher, etc.)
- **MSIX**: `.msix` package for Microsoft Store / sideload
- When Azure secrets are present, PFX-based signing (`WINDOWS_SIGN_CERT_*`) is skipped.

---

## CLI Setup

Most of the setup can be automated with the Azure CLI. **Identity Validation (Step 2) must still be done in the portal** — it cannot be completed via CLI.

### 1. Install extension and register provider

```bash
az login
az account set --subscription "<subscription-id>"
az provider register --namespace "Microsoft.CodeSigning"
az extension add --name artifact-signing
```

### 2. Create Trusted Signing account

```bash
RESOURCE_GROUP="milady-signing-rg"
ACCOUNT_NAME="milady-signing-account"
LOCATION="eastus"

az group create --name $RESOURCE_GROUP --location $LOCATION
az artifact-signing create -n $ACCOUNT_NAME -l $LOCATION -g $RESOURCE_GROUP --sku Basic
```

- **`AZURE_SIGN_ACCOUNT_NAME`**: `$ACCOUNT_NAME`
- **`AZURE_SIGN_ENDPOINT`**: Region-specific (e.g. East US → `https://eus.codesigning.azure.net/`). See [Microsoft docs](https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart?tabs=registerrp-cli%2Caccount-cli%2Ccertificateprofile-cli%2Cdeleteresources-cli#azure-regions-that-support-artifact-signing) for endpoints.

### 3. Identity validation (Portal only)

Complete Identity Validation in the portal as in Step 2 above. When it is **Completed**, copy the **Identity validation Id** (a GUID) from the Trusted Signing account → Identity validations → select your entity.

### 4. Create certificate profile

```bash
PROFILE_NAME="milady-release-profile"
IDENTITY_VALIDATION_ID="<paste-guid-from-portal>"

az artifact-signing certificate-profile create \
  -g $RESOURCE_GROUP --account-name $ACCOUNT_NAME \
  -n $PROFILE_NAME --profile-type PublicTrust \
  --identity-validation-id $IDENTITY_VALIDATION_ID
```

- **`AZURE_SIGN_PROFILE_NAME`**: `$PROFILE_NAME`

### 5. Create App Registration and client secret

```bash
APP_NAME="GitHubActions-TrustedSigning"

APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience "AzureADMyOrg" \
  --query appId -o tsv)

# Create service principal (required for role assignment)
az ad sp create --id $APP_ID

# Client secret — copy the "password" value immediately; it cannot be retrieved later
az ad app credential reset --id $APP_ID --append --display-name "github-actions-secret" --years 1

# Get tenant ID
AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)
```

- **`AZURE_CLIENT_ID`**: `$APP_ID`
- **`AZURE_TENANT_ID`**: `$AZURE_TENANT_ID`
- **`AZURE_CLIENT_SECRET`**: The `password` from `az ad app credential reset`

### 6. Assign role to the app

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id -o tsv)

az role assignment create \
  --assignee $SP_OBJECT_ID \
  --role "Artifact Signing Certificate Profile Signer" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CodeSigning/codeSigningAccounts/$ACCOUNT_NAME/certificateProfiles/$PROFILE_NAME"
```

Then add the six GitHub secrets (Step 6) as described above.
