# Cloud-Native Distributed Enterprise Video Streaming Platform

CloudStream is an enterprise-style video streaming platform built for the Agile Development Process and DevOps Lab. The application combines a responsive web frontend with a Node.js API, JWT authentication, role-based access, persistent video metadata, HTTP range streaming, audit activity, cloud object storage and an administrator control center.

## Architecture

```text
Browser
   |
   | HTTP / JWT
   v
Node.js + Express API (port 3000)
   |-- Authentication / RBAC
   |-- Video upload service (Multer)
   |-- HTTP Range / 206 streaming
   |-- Admin metrics / audit activity
   |
   +--> JSON metadata persistence (demo)
   +--> Local Docker volume OR Amazon S3 object storage

Docker / AWS EC2
   |
   +--> Public IP:3000
   |
   +--> Amazon S3 (Sprint 6 cloud video storage)
```

## Features

- Secure login with bcrypt password hashing and JWT sessions
- Admin and viewer roles
- Video upload with 100 MB validation limit
- Persistent video metadata
- HTTP `Range`/206 streaming for browser playback
- Optional Amazon S3 video storage with AES256 server-side encryption
- View-count tracking and audit activity
- Admin metrics, user search, video deletion and maintenance toggle
- Cloud storage provider/region shown in the admin dashboard
- Helmet security headers, CORS and login rate limiting
- Responsive enterprise dashboard
- Dockerfile and Docker Compose deployment
- `/api/health` endpoint with storage status
- GitHub Actions CI validation for backend syntax and Docker builds

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

The Compose setup keeps application metadata and local video assets in named Docker volumes when `STORAGE_MODE=local`.

## Sprint 6 — Amazon S3 cloud storage

Sprint 6 adds a cloud object-storage path while preserving local Docker storage as the default development mode. Set the following in `.env` on EC2:

```text
STORAGE_MODE=s3
AWS_REGION=ap-south-1
S3_BUCKET=your-unique-bucket-name
S3_PREFIX=cloudstream/
```

The Node.js AWS SDK v3 uses the EC2 instance's IAM role credentials automatically, so long-lived AWS access keys do not need to be placed in the repository or `.env` file. The application uploads new video assets to S3, serves authenticated byte ranges from S3, and deletes the S3 object when an administrator deletes a video.

The bucket should remain private; application authentication controls access to the streaming endpoint.

### Sprint 6 deployment flow

1. Create or use an Amazon Linux 2023 EC2 instance.
2. Attach an IAM role to EC2 with only the S3 permissions required for the CloudStream bucket (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:HeadObject`/`s3:GetObject` as appropriate).
3. Create a private S3 bucket in the same AWS Region used by the application.
4. Pull the `sprint-6-cloud-infrastructure` branch on EC2.
5. Create `.env` with a strong `JWT_SECRET`, `STORAGE_MODE=s3`, `AWS_REGION` and `S3_BUCKET`.
6. Run `docker compose up -d --build`.
7. Verify `/api/health` and confirm the response reports `Amazon S3` as the storage provider.
8. Log in as `admin`, upload a video and verify that the object appears under the configured S3 prefix.
9. Play the uploaded video and demonstrate HTTP byte-range streaming.
10. Use the admin dashboard to show cloud storage status, views, activity and operational health.

For a stricter production deployment, place the service behind HTTPS/reverse proxy and move JSON metadata to a managed database.

## Sprint 6 verification checklist

- Sprint 6 branch pushed to GitHub
- S3 storage integration present in backend
- Docker Compose exposes cloud-storage configuration
- EC2 IAM role can access the private S3 bucket
- Container builds successfully
- `/api/health` reports operational status and storage provider
- Admin dashboard shows cloud storage and AWS Region
- New video uploads reach S3
- Authenticated video playback works through S3 byte ranges
- Video deletion removes the S3 object
- GitHub Actions validates backend syntax and Docker image build

## Project structure

```text
CloudVideoStreaming/
├── backend/
│   ├── package.json
│   ├── server.js
│   └── storage.js
├── frontend/
│   ├── app.js
│   ├── login.html
│   ├── admin.html
│   ├── upload.html
│   ├── stream.html
│   └── styles.css
├── .github/
│   └── workflows/
│       └── sprint6-ci.yml
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```
