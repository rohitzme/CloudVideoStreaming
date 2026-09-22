pipeline {
    agent any

    stages {

        stage('Checkout') {
    steps {
        checkout scm
        echo 'Automatic CI verification - Sprint 8 - Test 2'
    }
}

        stage('Build') {
            steps {
                echo 'Installing backend dependencies'
                sh 'cd backend && npm install --omit=dev'
            }
        }

        stage('Test / Validate') {
            steps {
                echo 'Validating Node.js backend syntax'
                sh 'cd backend && npm run check'
            }
        }

        stage('Docker Build') {
            steps {
                echo 'Building CloudStream Docker image'
                sh 'docker build -t cloudstream:sprint8 .'
            }
        }
    }

    post {
        success {
            echo 'CloudStream CI pipeline completed successfully!'
        }
        failure {
            echo 'CloudStream CI pipeline failed.'
        }
    }
}
