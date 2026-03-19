#!/usr/bin/env bash
# Azure Trusted Signing setup via CLI
# Run: bash scripts/azure-trusted-signing-setup.sh
# Prerequisites: az login, subscription must be enabled (not disabled/read-only)

set -e

RESOURCE_GROUP="${MILADY_SIGNING_RG:-milady-signing-rg}"
ACCOUNT_NAME="${MILADY_SIGNING_ACCOUNT:-milady-signing-account}"
PROFILE_NAME="${MILADY_SIGNING_PROFILE:-milady-release-profile}"
APP_NAME="${MILADY_SIGNING_APP:-GitHubActions-TrustedSigning}"
LOCATION="${MILADY_SIGNING_LOCATION:-eastus}"
AZURE_SIGN_ENDPOINT="${AZURE_SIGN_ENDPOINT:-https://eus.codesigning.azure.net/}"

echo "=== Azure Trusted Signing Setup ==="
echo "Resource group: $RESOURCE_GROUP"
echo "Account: $ACCOUNT_NAME"
echo "Profile: $PROFILE_NAME"
echo "App: $APP_NAME"
echo "Location: $LOCATION"
echo ""

# Check subscription is writable
echo "[1/8] Checking Azure subscription..."
if ! az account show &>/dev/null; then
  echo "ERROR: Not logged in. Run: az login"
  exit 1
fi
if az account show --query "state" -o tsv 2>/dev/null | grep -qi disabled; then
  echo "ERROR: Subscription is disabled/read-only. Re-enable it in Azure Portal before continuing."
  exit 1
fi
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "  Subscription OK: $SUBSCRIPTION_ID"

# Register provider and add extension
echo ""
echo "[2/8] Registering provider and adding extension..."
az provider register --namespace "Microsoft.CodeSigning"
echo "  Waiting for provider registration (may take 1-2 min)..."
while true; do
  state=$(az provider show --namespace "Microsoft.CodeSigning" --query "registrationState" -o tsv 2>/dev/null || true)
  if [[ "$state" == "Registered" ]]; then break; fi
  sleep 10
done
az extension add --name artifact-signing 2>/dev/null || true
echo "  Done"

# Create resource group and account
echo ""
echo "[3/8] Creating resource group and Trusted Signing account..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none
az artifact-signing create -n "$ACCOUNT_NAME" -l "$LOCATION" -g "$RESOURCE_GROUP" --sku Basic -o none
echo "  Account created"

# Identity validation (portal only)
echo ""
echo "[4/8] Identity Validation (PORTAL REQUIRED)"
echo "  Open: https://portal.azure.com -> Trusted Signing -> $ACCOUNT_NAME -> Identity validations"
echo "  Create a new identity, complete Microsoft's vetting process (1-7 business days)."
echo "  When status is 'Completed', copy the Identity validation Id (GUID)."
echo ""
read -p "  Paste Identity validation Id (or press Enter to skip and add later): " IDENTITY_VALIDATION_ID

if [[ -n "$IDENTITY_VALIDATION_ID" ]]; then
  echo ""
  echo "[5/8] Creating certificate profile..."
  az artifact-signing certificate-profile create \
    -g "$RESOURCE_GROUP" --account-name "$ACCOUNT_NAME" \
    -n "$PROFILE_NAME" --profile-type PublicTrust \
    --identity-validation-id "$IDENTITY_VALIDATION_ID" -o none
  echo "  Profile created"
else
  echo "  Skipped. Run certificate profile creation manually after identity is validated."
fi

# App registration
echo ""
echo "[6/8] Creating App Registration and service principal..."
APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience "AzureADMyOrg" \
  --query appId -o tsv)
az ad sp create --id "$APP_ID" -o none
AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)
echo "  App ID: $APP_ID"
echo "  Tenant ID: $AZURE_TENANT_ID"

# Client secret
echo ""
echo "[7/8] Creating client secret..."
echo "  >>> SAVE THE PASSWORD BELOW — it cannot be retrieved later <<<"
AZURE_CLIENT_SECRET=$(az ad app credential reset --id "$APP_ID" --append --display-name "github-actions-secret" --years 1 --query password -o tsv)
echo ""
echo "  AZURE_CLIENT_SECRET (copy now): $AZURE_CLIENT_SECRET"

# Role assignment
echo ""
echo "[8/8] Assigning role to service principal..."
SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CodeSigning/codeSigningAccounts/$ACCOUNT_NAME/certificateProfiles/$PROFILE_NAME"
az role assignment create \
  --assignee "$SP_OBJECT_ID" \
  --role "Artifact Signing Certificate Profile Signer" \
  --scope "$SCOPE" \
  -o none 2>/dev/null || echo "  Note: Role assignment may fail if certificate profile not yet created. Assign manually in IAM."
echo "  Done"

# Summary
echo ""
echo "=== GitHub Secrets (add in repo Settings -> Secrets and variables -> Actions) ==="
echo ""
echo "AZURE_TENANT_ID=$AZURE_TENANT_ID"
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_CLIENT_SECRET=<value from above - copy it now>"
echo "AZURE_SIGN_ENDPOINT=$AZURE_SIGN_ENDPOINT"
echo "AZURE_SIGN_ACCOUNT_NAME=$ACCOUNT_NAME"
echo "AZURE_SIGN_PROFILE_NAME=$PROFILE_NAME"
echo ""
