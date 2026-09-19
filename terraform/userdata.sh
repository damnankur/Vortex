#!/bin/bash
# Bootstraps the Vortex backing stack on a fresh Ubuntu 22.04 ARM64 instance.
set -euo pipefail

# --- 2GB swap (t4g.small is tiny; matches the cost-optimized profile) ---
fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# --- Docker Engine ---
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb-release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker
systemctl start docker

# --- Vortex backing services (postgres + redis + kafka; server stays on Render) ---
if [ ! -d /app/.git ]; then
  git clone https://github.com/damnankur/Vortex.git /app
else
  cd /app && git pull
fi
cd /app
docker compose up -d postgres redis kafka
