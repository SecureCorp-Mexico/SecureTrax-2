#!/usr/bin/env bash
# Provision a SecureTrax-2 test VM on Proxmox.
# Run on the Proxmox host (root or pveadmin sudoer).
#
# Defaults are sized for the full v1 stack including Ollama. Override via env:
#   VMID=9101 VM_NAME=securetrax-test STORAGE=local-lvm BRIDGE=vmbr0 \
#   CORES=6 MEMORY_MB=16384 DISK_GB=80 ./proxmox-create-vm.sh
#
# Idempotent: re-running with the same VMID is a no-op if the VM exists.

set -euo pipefail

VMID="${VMID:-9101}"
VM_NAME="${VM_NAME:-securetrax-test}"
STORAGE="${STORAGE:-local-lvm}"
SNIPPET_STORAGE="${SNIPPET_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-6}"
MEMORY_MB="${MEMORY_MB:-16384}"
DISK_GB="${DISK_GB:-80}"
CLOUD_USER="${CLOUD_USER:-securetrax}"

UBUNTU_IMG_URL="https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
IMG_DIR="/var/lib/vz/template/iso"
IMG_PATH="${IMG_DIR}/noble-server-cloudimg-amd64.img"

# ---- preflight ----

if ! command -v qm >/dev/null 2>&1; then
  echo "error: qm not found — is this a Proxmox VE host?" >&2
  exit 1
fi

if qm status "${VMID}" >/dev/null 2>&1; then
  echo "VM ${VMID} already exists. Refusing to overwrite."
  echo "Destroy it first: qm stop ${VMID} && qm destroy ${VMID} --purge"
  exit 1
fi

# ---- get SSH key for cloud-init ----

if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_KEY_VALUE="${SSH_KEY}"
elif [[ -n "${SSH_KEY_FILE:-}" && -f "${SSH_KEY_FILE}" ]]; then
  SSH_KEY_VALUE="$(cat "${SSH_KEY_FILE}")"
elif [[ -f "/root/.ssh/authorized_keys" ]]; then
  echo "Using /root/.ssh/authorized_keys (will be passed verbatim to cloud-init)"
  SSH_KEY_VALUE="$(cat /root/.ssh/authorized_keys)"
else
  echo "Paste the SSH PUBLIC key for the '${CLOUD_USER}' user (one line, ssh-ed25519 / ssh-rsa ...):"
  read -r SSH_KEY_VALUE
fi

if [[ -z "${SSH_KEY_VALUE// /}" ]]; then
  echo "error: no SSH key provided — VM would be unreachable" >&2
  exit 1
fi

# ---- download cloud image ----

if [[ ! -f "${IMG_PATH}" ]]; then
  echo "Downloading Ubuntu 24.04 cloud image…"
  mkdir -p "${IMG_DIR}"
  wget -q --show-progress -O "${IMG_PATH}" "${UBUNTU_IMG_URL}"
fi

# ---- create the VM ----

echo "Creating VM ${VMID} (${VM_NAME}) on ${STORAGE}…"

qm create "${VMID}" \
  --name "${VM_NAME}" \
  --memory "${MEMORY_MB}" \
  --cores "${CORES}" \
  --cpu host \
  --net0 "virtio,bridge=${BRIDGE}" \
  --ostype l26 \
  --agent enabled=1 \
  --bios ovmf \
  --machine q35 \
  --efidisk0 "${STORAGE}:0,efitype=4m,pre-enrolled-keys=0" \
  --scsihw virtio-scsi-single \
  --boot c --bootdisk scsi0 \
  --serial0 socket --vga serial0

qm importdisk "${VMID}" "${IMG_PATH}" "${STORAGE}" --format qcow2
qm set "${VMID}" --scsi0 "${STORAGE}:vm-${VMID}-disk-1,discard=on,iothread=1"
qm resize "${VMID}" scsi0 "${DISK_GB}G"

# Cloud-init drive
qm set "${VMID}" --ide2 "${STORAGE}:cloudinit"

# Cloud-init config — user, key, package install on first boot
SNIPPET_PATH="/var/lib/vz/snippets/${VM_NAME}-user.yaml"
mkdir -p "$(dirname "${SNIPPET_PATH}")"
cat > "${SNIPPET_PATH}" <<EOF
#cloud-config
hostname: ${VM_NAME}
manage_etc_hosts: true
package_update: true
package_upgrade: false
packages:
  - curl
  - ca-certificates
  - git
  - jq
  - mosquitto-clients
  - openssh-server
  - python3-pip
  - unzip
  - rsync
  - htop
  - net-tools
  - postgresql-client
users:
  - name: ${CLOUD_USER}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${SSH_KEY_VALUE}
ssh_pwauth: false
disable_root: true
EOF

qm set "${VMID}" --cicustom "user=${SNIPPET_STORAGE}:snippets/${VM_NAME}-user.yaml"
qm set "${VMID}" --ipconfig0 "ip=dhcp"

# ---- start ----

qm start "${VMID}"

echo "VM ${VMID} starting. Waiting up to 90s for an IP…"
IP=""
for _ in $(seq 1 30); do
  IP="$(qm guest cmd "${VMID}" network-get-interfaces 2>/dev/null \
        | jq -r '.[] | select(.name=="eth0" or .name=="ens18") |
                 ."ip-addresses"[]? | select(."ip-address-type"=="ipv4" and
                  (."ip-address" | test("^(127\\.|169\\.254\\.)") | not))
                 | ."ip-address"' 2>/dev/null | head -n1)"
  if [[ -n "${IP}" ]]; then break; fi
  sleep 3
done

if [[ -z "${IP}" ]]; then
  echo "Warning: couldn't auto-detect IP. Check the Proxmox UI > VM ${VMID} > Summary."
  echo "Once you have the IP, run: ssh ${CLOUD_USER}@<vm-ip>"
else
  echo
  echo "✓ VM ${VMID} (${VM_NAME}) is up at ${IP}"
  echo
  echo "  ssh ${CLOUD_USER}@${IP}"
  echo
  echo "Next: run the bootstrap script on the VM"
  echo "  curl -fsSL https://raw.githubusercontent.com/SecureCorp-Mexico/SecureTrax-2/claude/configurable-maps-hub-2wyn0/deploy/bootstrap.sh | bash"
fi
