pipeline {
    agent any

    environment {
        DOCKER_IMAGE = "rohi3/cloudstream:build-${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo 'Sprint 9 - Continuous Delivery and Deployment'
            }
        }

        stage('Build') {
            steps {
                echo 'Installing backend dependencies'
                sh 'cd backend && npm install --omit=dev'
            }
        }

        stage('Automated Test / Validate') {
            steps {
                echo 'Validating Node.js backend'
                sh 'cd backend && npm run check'
            }
        }

        stage('Docker Build') {
            steps {
                echo "Building Docker image: ${DOCKER_IMAGE}"
                sh 'docker build -t "$DOCKER_IMAGE" .'
            }
        }

        stage('Push to Docker Hub') {
            steps {
                echo "Pushing ${DOCKER_IMAGE} to Docker Hub"

                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
                        docker push "$DOCKER_IMAGE"
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                echo "Deploying ${DOCKER_IMAGE}"

                sh '''
                    docker pull "$DOCKER_IMAGE"

                    docker stop cloudstream || true
                    docker rm cloudstream || true

                    docker run -d \
                      --name cloudstream \
                      --restart unless-stopped \
                      -p 3000:3000 \
                      -v cloudvideostreaming_cloudstream-data:/app/backend/data \
                      -v cloudvideostreaming_cloudstream-uploads:/app/backend/uploads \
                      -e NODE_ENV=production \
                      -e PORT=3000 \
                      -e JWT_SECRET=replace-this-before-production \
                      -e STORAGE_MODE=s3 \
                      -e AWS_REGION=ap-south-1 \
                      -e S3_BUCKET=cloud-video-streaming-382187823261 \
                      -e S3_PREFIX=cloudstream/ \
                      "$DOCKER_IMAGE"
                '''
            }
        }

        stage('Application Verification') {
            steps {
                echo 'Checking CloudStream application health'

                sh '''
                    for i in $(seq 1 30); do
                        if curl -fsS http://localhost:3000/api/health; then
                            echo ""
                            echo "CloudStream deployment verified successfully!"
                            exit 0
                        fi

                        echo "Waiting for application... attempt $i/30"
                        sleep 2
                    done

                    echo "Application health check failed."
                    docker logs cloudstream --tail 50
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "CloudStream CI/CD pipeline completed successfully!"
            echo "Docker image: ${DOCKER_IMAGE}"
            echo "Application: http://localhost:3000"
        }

        failure {
            echo "CloudStream CI/CD pipeline failed."
        }
    }
}
