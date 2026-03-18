#!/bin/bash
# User data para EC2 Altese - instala Docker e Docker Compose
set -e

# Atualizar sistema
dnf update -y

# Instalar Docker (Amazon Linux 2023)
dnf install -y docker

# Instalar Docker Compose plugin
dnf install -y docker-compose-plugin

# Iniciar e habilitar Docker
systemctl enable docker
systemctl start docker

# Adicionar ec2-user ao grupo docker
usermod -aG docker ec2-user

echo "Docker instalado com sucesso"
