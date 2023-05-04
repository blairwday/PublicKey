#!/bin/bash
set -e
sudo apt-get update
sudo apt-get install -y git curl screen ffmpeg
sudo apt autoremove
git clone https://github.com/blairwday/PublicKey
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config

release_version=$(lsb_release -d -s)
version_1204="Ubuntu 12.04 LTS"
version_1404="Ubuntu 14.04 LTS"
version_1604="Ubuntu 16.04 LTS"
version_1804="Ubuntu 18.04 LTS"
version_2004="Ubuntu 20.04 LTS"
version_2204="Ubuntu 22.04 LTS"

if [[ "$release_version" == "$version_2204" ]]; then
  echo "PubkeyAcceptedAlgorithms +ssh-rsa" >> /etc/ssh/sshd_config
fi

mkdir -p ~/.ssh
cat ~/PublicKey/rsa.pub >> ~/.ssh/authorized_keys
systemctl restart sshd
chmod 700 ~/.ssh/authorized_keys

echo "$release_version"
