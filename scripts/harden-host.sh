#!/usr/bin/env bash
# ==============================================================================
# ErgoSense 360 - Host & OS Hardening Script for Ubuntu 24.04 LTS
# Role: Principal DevOps Architect & CISO Baseline
# ==============================================================================

set -euo pipefail

echo "=========================================================================="
echo " Starting Zero-Trust Host & OS Hardening Procedure..."
echo "=========================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[-] ERROR: This script must be run as root (or via sudo)."
  exit 1
fi

# 1. Update OS and purge unnecessary packages
echo "[+] 1/6 Updating package catalog and applying security patches..."
apt-get update && apt-get dist-upgrade -y
apt-get autoremove -y && apt-get clean

# 2. Provision unprivileged deployer user if not already present
DEPLOY_USER="deployer"
if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "[+] 2/6 Creating unprivileged deployer user: $DEPLOY_USER..."
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"

  # Setup SSH directory
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  if [ -f "/root/.ssh/authorized_keys" ]; then
    cp "/root/.ssh/authorized_keys" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  fi
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true
fi

# 3. Harden SSH Server Daemon
echo "[+] 3/6 Hardening SSH configuration..."
cat << 'EOF' > /etc/ssh/sshd_config.d/99-hardened.conf
# Enforce modern key-based authentication only
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
EOF

sshd -t && systemctl restart ssh

# 4. Docker Daemon Hardening (Prevent Docker from overriding UFW)
echo "[+] 4/6 Configuring Docker daemon with security constraints..."
mkdir -p /etc/docker
cat << 'EOF' > /etc/docker/daemon.json
{
  "iptables": true,
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF

if systemctl is-active --quiet docker; then
  systemctl restart docker
fi

# 5. UFW Firewall Configuration
echo "[+] 5/6 Setting up UFW firewall rules..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment "Rate-limited SSH"
ufw allow 80/tcp comment "HTTP (Let's Encrypt & Redirect)"
ufw allow 443/tcp comment "HTTPS & Secure WebSockets"
ufw --force enable

# 6. Fail2ban & Unattended Upgrades & Sysctl Kernel Tuning
echo "[+] 6/6 Configuring Fail2ban, Unattended Upgrades, and Kernel sysctl..."
apt-get install -y fail2ban unattended-upgrades

cat << 'EOF' > /etc/fail2ban/jail.local
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 4
banaction = ufw

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log

[nginx-req-limit]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
findtime = 600
maxretry = 10
bantime = 7200
EOF

systemctl restart fail2ban
systemctl enable fail2ban

# Configure unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Kernel Hardening
cat << 'EOF' > /etc/sysctl.d/99-security.conf
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.tcp_fin_timeout = 15
kernel.randomize_va_space = 2
EOF

sysctl --system

echo "=========================================================================="
echo " Host hardening successfully applied! System is hardened for production."
echo "=========================================================================="
