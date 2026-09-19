terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# ---- SSH key pair (public key generated locally) ----
resource "aws_key_pair" "vortex" {
  key_name_prefix = "vortex-"
  public_key      = file("/tmp/vortex-ec2.pub")
  tags = { Project = "vortex" }
}

# ---- Base networking (default VPC) ----
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  my_ip = "49.36.136.201/32"
}

# Security: expose backing-store ports to the Render backend (dynamic egress =>
# 0.0.0.0/0) but lock SSH to my current IP. Credentials are the throwaway
# defaults from docker-compose.yml; TLS/SASL for prod is tracked separately.
resource "aws_security_group" "vortex" {
  name        = "vortex-sg"
  description = "Vortex backing services (postgres, redis, kafka)"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [local.my_ip]
  }
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 9092
    to_port     = 9092
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "vortex-sg", Project = "vortex" }
}

# ---- Latest Ubuntu 22.04 LTS (ARM64) via SSM ----
data "aws_ssm_parameter" "ubuntu_arm64_ami" {
  name = "/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id"
}

# ---- t4g.small instance ----
resource "aws_instance" "vortex" {
  ami                    = data.aws_ssm_parameter.ubuntu_arm64_ami.value
  instance_type          = "t4g.small"
  key_name               = aws_key_pair.vortex.key_name
  vpc_security_group_ids = [aws_security_group.vortex.id]
  subnet_id              = data.aws_subnets.default.ids[0]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = file("${path.module}/userdata.sh")

  tags = {
    Name   = "vortex-backing-services"
    Role   = "infra"
    Project = "vortex"
  }
}

# ---- Cost guardrail: CPU-credit alarm (t4g.small is burstable) ----
resource "aws_cloudwatch_metric_alarm" "cpu_credits" {
  alarm_name          = "vortex-cpu-credits-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUCreditBalance"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 40
  alarm_description   = "t4g.small CPU credit balance below 40 — capacity risk for the backing stack"
  dimensions = {
    InstanceId = aws_instance.vortex.id
  }
}
