# Cloud-Native Distributed Enterprise Video Streaming Platform

CloudStream is an enterprise-style video streaming platform built for the Agile Development Process and DevOps Lab. The application combines a responsive web frontend with a Node.js API, JWT authentication, role-based access, persistent video metadata, file storage, HTTP range streaming, audit activity and an administrator control center.

## Architecture

```text
Browser
   |
   | HTTP / JWT
   v
Node.js + Express API (port 3000)
   |-- Authentication / RBAC
   |-- Video upload service (Multer)
   |-- HTTP Range streaming
   |-- Admin metrics / audit activity
   |
   +--> JSON persistence (development/demo)
   +--> Local video storage

Docker / AWS EC2
   |
   +--> Public IP:3000
```

## Features

- Secure login with bcrypt password hashing and JWT sessions
- Admin and viewer roles
- Video upload with 100 MB validation limit
- Persistent video metadata and local file storage
- HTTP `Range`/206 streaming for browser playback
- View-count tracking and audit activity
- Admin metrics, user search, video deletion and maintenance toggle
- Helmet security headers, CORS and login rate limiting
- Responsive enterprise dashboard
- Dockerfile and Docker Compose deployment
- `/api/health` endpoint for deployment verification

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `admin123` |
| Viewer | `viewer` | `viewer123` |

Change the JWT secret and demo credentials before any real production use.

## Run locally with Node.js

Requirements: Node.js 20+

```bash
git clone https://github.com/rohitzme/CloudVideoStreaming.git
cd CloudVideoStreaming
cd backend
npm install
set JWT_SECRET=replace-with-a-long-random-secret
npm start
```

On Linux/macOS:

```bash
export JWT_SECRET="replace-with-a-long-random-secret"
npm start
```

Open `http://localhost:3000`.

## Run with Docker

```bash
git clone https://github.com/rohitzme/CloudVideoStreaming.git
cd CloudVideoStreaming
```

Create a `.env` file from `.env.example`, then:

```bash
docker compose up -d --build
```

Open `http://localhost:3000`.

The Compose setup keeps application metadata and uploaded videos in named Docker volumes.

## AWS EC2 deployment for Sprint 5

1. Create an Ubuntu EC2 instance.
2. Configure the Security Group with SSH `22` and application port `3000` only when direct port access is required.
3. Connect through SSH.
4. Install Git, Docker and Docker Compose.
5. Clone this repository.
6. Create `.env` and set a strong `JWT_SECRET`.
7. Run `docker compose up -d --build`.
8. Verify `http://<EC2-PUBLIC-IP>:3000/api/health` returns a JSON status of `ok`.
9. Open `http://<EC2-PUBLIC-IP>:3000` in a browser.
10. Demonstrate login, upload and video playback for the Sprint 5 evidence.

For a stricter production deployment, place the service behind HTTPS/reverse proxy and use managed object storage/database services instead of local JSON/file storage.

## Sprint 5 verification checklist

- EC2 instance running
- Latest code cloned from GitHub
- Container/application starts without critical errors
- Health endpoint responds
- Login works remotely
- Video upload works remotely
- Video appears in the streaming library
- Browser playback works through HTTP range requests
- Admin dashboard shows live metrics and activity

## Project structure

```text
CloudVideoStreaming/
├── backend/
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── app.js
│   ├── login.html
│   ├── admin.html
│   ├── upload.html
│   ├── stream.html
│   └── styles.css
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```
