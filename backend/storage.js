const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const STORAGE_MODE = String(process.env.STORAGE_MODE || 'local').toLowerCase();
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_PREFIX = (process.env.S3_PREFIX || 'cloudstream/').replace(/^\/+/, '').replace(/\/*$/, '/');
const s3 = STORAGE_MODE === 's3' && S3_BUCKET ? new S3Client({ region: AWS_REGION }) : null;

function isS3Enabled() {
  return Boolean(s3 && S3_BUCKET);
}

function storageStatus() {
  return {
    mode: isS3Enabled() ? 's3' : 'local',
    provider: isS3Enabled() ? 'Amazon S3' : 'Docker volume',
    region: AWS_REGION,
    bucket: isS3Enabled() ? S3_BUCKET : null,
    prefix: isS3Enabled() ? S3_PREFIX : null
  };
}

function objectKey(filename) {
  return `${S3_PREFIX}${filename}`;
}

async function uploadFile(filePath, key, contentType) {
  if (!isS3Enabled()) return;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: contentType || 'application/octet-stream',
    ServerSideEncryption: 'AES256'
  }));
}

async function headFile(key) {
  if (!isS3Enabled()) return null;
  return s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

async function getFile(key, range) {
  if (!isS3Enabled()) return null;
  return s3.send(new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ...(range ? { Range: range } : {})
  }));
}

async function deleteFile(key) {
  if (!isS3Enabled()) return;
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

module.exports = { isS3Enabled, storageStatus, objectKey, uploadFile, headFile, getFile, deleteFile };
