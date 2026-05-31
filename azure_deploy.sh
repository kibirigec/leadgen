#!/bin/bash

# ==============================================================================
# Automated Azure Deployment Script for LeadGen
# Run this script from the root of your LeadGen project directory.
# ==============================================================================

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting LeadGen Azure Deployment..."

# 1. Variables (Feel free to edit these before running)
RESOURCE_GROUP="leadgen-rg-free"
LOCATION="eastus"
APP_SERVICE_PLAN="leadgen-plan"
WEB_APP_NAME="leadgen-web-$RANDOM" # Random suffix to ensure unique name
VM_NAME="leadgen-worker-vm"
VM_SIZE="Standard_B1s" # Free tier eligible size
ADMIN_USERNAME="azureuser"

echo "📌 Configuration:"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location: $LOCATION"
echo "   Web App Name: $WEB_APP_NAME"
echo "   VM Name: $VM_NAME"
echo "------------------------------------------------------"

# 2. Check if logged in
if ! az account show > /dev/null 2>&1; then
    echo "⚠️  You are not logged in to Azure CLI."
    echo "Please run 'az login' first, then run this script again."
    exit 1
fi

# 3. Create Resource Group
echo "📦 Creating Resource Group ($RESOURCE_GROUP)..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none
echo "✅ Resource Group created."

# ==============================================================================
# PHASE 1: FRONTEND (Azure App Service)
# ==============================================================================

echo "🌐 Creating App Service Plan ($APP_SERVICE_PLAN)..."
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku F1 \
  --is-linux -o none

echo "🌐 Creating Web App ($WEB_APP_NAME)..."
DEPLOYMENT_URL=$(az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --name "$WEB_APP_NAME" \
  --runtime "NODE:20-lts" \
  --deployment-local-git \
  --query deploymentLocalGitUrl -o tsv)

echo "✅ Web App created."
echo "🔗 Deployment URL: $DEPLOYMENT_URL"

# Extract env vars from .env file and format them for Azure CLI
echo "🔑 Configuring Environment Variables for Web App..."
if [ -f ".env" ]; then
    # Read .env, ignore comments and empty lines, extract KEY=VALUE
    ENV_SETTINGS=""
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        if [[ $line =~ ^#.*$ ]] || [[ -z $line ]]; then
            continue
        fi
        
        # Handle the multiline FIREBASE_PRIVATE_KEY specifically to ensure it stays intact
        if [[ $line == FIREBASE_PRIVATE_KEY=* ]]; then
            # We will handle this separately below to avoid escaping issues in CLI
            continue 
        fi

        # Format as KEY=VALUE for az cli
        KEY=$(echo "$line" | cut -d '=' -f 1)
        VALUE=$(echo "$line" | cut -d '=' -f 2-)
        
        # Strip quotes if present
        VALUE="${VALUE%\"}"
        VALUE="${VALUE#\"}"
        
        ENV_SETTINGS="$ENV_SETTINGS $KEY=\"$VALUE\""
    done < .env

    # Add NEXT_PUBLIC_WORKER_URL (will point to VM, updated later) and NODE_ENV
    ENV_SETTINGS="$ENV_SETTINGS NODE_ENV=production"

    # Set standard app settings
    eval "az webapp config appsettings set --resource-group \"$RESOURCE_GROUP\" --name \"$WEB_APP_NAME\" --settings $ENV_SETTINGS -o none"
    
    # Handle Firebase Private Key separately using a temporary JSON file to preserve newlines
    PRIVATE_KEY=$(grep "FIREBASE_PRIVATE_KEY=" .env | cut -d '=' -f 2-)
    # Remove surrounding quotes if they exist
    PRIVATE_KEY="${PRIVATE_KEY%\"}"
    PRIVATE_KEY="${PRIVATE_KEY#\"}"
    
    echo '[{"name": "FIREBASE_PRIVATE_KEY", "value": "'"$PRIVATE_KEY"'"}]' > temp_settings.json
    az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings @temp_settings.json -o none
    rm temp_settings.json

    echo "✅ Environment variables configured."
else
    echo "⚠️  No .env file found in current directory. Skipping env var configuration."
fi

echo "⚙️  Configuring Startup Command..."
az webapp config set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --startup-file "node_modules/.bin/next start" -o none

# ==============================================================================
# PHASE 2: WORKER (Linux VM)
# ==============================================================================

echo "🖥️  Creating Linux VM ($VM_NAME)... This will take a couple of minutes."
VM_IP=$(az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image Ubuntu2204 \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USERNAME" \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --query publicIpAddress -o tsv)

echo "✅ VM created."
echo "🌍 VM Public IP: $VM_IP"

echo "🔓 Opening Port 4000 on VM..."
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 4000 \
  --priority 1010 -o none

echo "🔄 Updating NEXT_PUBLIC_WORKER_URL on Web App to point to the new VM..."
az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --settings NEXT_PUBLIC_WORKER_URL="http://$VM_IP:4000" -o none

# ==============================================================================
# SUMMARY & NEXT STEPS
# ==============================================================================

echo ""
echo "🎉 Azure Infrastructure Provisioned Successfully!"
echo "======================================================"
echo "🌐 Frontend App URL: https://$WEB_APP_NAME.azurewebsites.net"
echo "🌍 Worker VM IP:     $VM_IP"
echo ""
echo "🚀 NEXT STEPS:"
echo "1. Deploy your Frontend code:"
echo "   git remote add azure $DEPLOYMENT_URL"
echo "   git push azure main"
echo ""
echo "2. Setup your Worker VM. SSH into the VM:"
echo "   ssh $ADMIN_USERNAME@$VM_IP"
echo ""
echo "   Then run these commands on the VM to install dependencies and run the worker:"
echo "   (You can copy-paste the block below)"
echo "------------------------------------------------------"
cat << 'EOF'
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs xvfb git
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google.list
sudo apt-get update
sudo apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-freefont-ttf libxss1 --no-install-recommends
sudo npm install -g pm2

mkdir -p ~/apps && cd ~/apps
# Note: You'll need to clone your repo or scp the files here
git clone <your-repo-url> leadgen
cd leadgen

# Install and build
npm ci
cd worker && npm ci && npm run build && cd ..

# Setup PM2 config
cat > ecosystem.config.json << 'PM2_EOF'
{
    "apps": [
        {
            "name": "worker",
            "script": "node",
            "args": "dist/worker/src/index.js",
            "cwd": "/home/azureuser/apps/leadgen",
            "interpreter": "none",
            "env": {
                "NODE_ENV": "production",
                "HEADLESS": "true",
                "WORKER_PORT": "4000"
            }
        }
    ]
}
PM2_EOF

pm2 start ecosystem.config.json
pm2 save
EOF
echo "------------------------------------------------------"
echo ""
echo "3. Remember to create your .env file on the VM inside the leadgen folder!"
echo "4. Copy your local ~/.wweb_session to the VM if you don't want to scan the QR code again:"
echo "   scp -r ~/.wweb_session $ADMIN_USERNAME@$VM_IP:~/.wweb_session"
echo "======================================================"
