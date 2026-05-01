# AutoDeploy Lite – DevOps CI/CD Project 🚀

## Overview
AutoDeploy Lite is a DevOps project that automates the process of building, deploying, and running a Dockerized Node.js application on an AWS EC2 instance.

Whenever code is pushed to GitHub, GitHub Actions automatically builds a Docker image, pushes it to Docker Hub, connects to EC2, pulls the latest image, and restarts the application container.

## Features
- Automated CI/CD pipeline using GitHub Actions
- Docker image creation and containerized deployment
- Docker Hub integration for image storage
- AWS EC2 deployment
- Nginx reverse proxy configuration
- Secure server setup with restricted SSH access
- Public app access through port 80
- Internal app port hidden from public access
- Basic version tagging and rollback planning

## Architecture

```text
Developer
   ↓
GitHub Repository
   ↓
GitHub Actions
   ↓
Docker Image Build
   ↓
Docker Hub
   ↓
AWS EC2 Instance
   ↓
Docker Container running on port 5000
   ↓
Nginx Reverse Proxy on port 80
   ↓
User Browser

CI/CD Workflow
Developer pushes code to GitHub.
GitHub Actions workflow starts automatically.
Docker image is built from the project files.
Docker image is pushed to Docker Hub.
GitHub Actions connects to AWS EC2 using SSH.
EC2 pulls the latest Docker image.
Existing container is stopped and removed.
New container is started.
Application becomes live automatically.
Security Improvements
SSH access restricted to My IP only.
HTTP port 80 opened for public users.
Application port 5000 hidden from public access.
Nginx used as a reverse proxy.
Sensitive values stored using GitHub Secrets.
.pem, .env, and node_modules are not committed.
Important Commands
Run container locally inside EC2
docker run -d \
  --name meena-app \
  -p 127.0.0.1:5000:5000 \
  santhiya2185/autodeploy-lite:latest
Test app inside EC2
curl http://127.0.0.1:5000
Test Nginx reverse proxy
curl http://localhost
Check running containers
docker ps
Restart Nginx
sudo systemctl restart nginx
Versioning and Rollback

Docker image tags:

latest - current deployed version
v1 - stable backup version
Rollback command

Use this only if the latest deployment fails:

docker stop meena-app
docker rm meena-app

docker run -d \
  --name meena-app \
  -p 127.0.0.1:5000:5000 \
  santhiya2185/autodeploy-lite:v1
Tech Stack
Node.js
Docker
Docker Hub
GitHub Actions
AWS EC2
Nginx
Linux
Live Application
http://13.49.238.186
Learning Outcome

Through this project, I learned:

How CI/CD pipelines work in real projects
How to build and push Docker images
How to deploy containers on AWS EC2
How to configure Nginx as a reverse proxy
How to secure SSH and hide internal ports
How to plan rollback using Docker image tags
Interview Explanation

I built an end-to-end DevOps CI/CD pipeline where every GitHub push automatically builds a Docker image, pushes it to Docker Hub, and deploys it to an AWS EC2 instance. The application runs inside a Docker container, and Nginx is used as a reverse proxy to expose the app through port 80. I also improved security by restricting SSH access and hiding the internal application port.

Author

Santhiya 
Cloud & DevOps Learner