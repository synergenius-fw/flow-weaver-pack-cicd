import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Deploy S3
 * @color orange
 * @icon cloud_upload
 * @input bucket [order:0] - S3 bucket name
 * @input sourcePath [order:1] - Local path to upload
 * @input accessKey [order:2] - AWS access key ID
 * @input secretKey [order:3] - AWS secret access key
 * @input region [order:4] - AWS region (default: us-east-1)
 * @output url [order:0] - S3 URL of uploaded content
 */
export function deployS3(
  bucket: string = '',
  sourcePath: string = 'dist/',
  accessKey: string = '',
  secretKey: string = '',
  region: string = 'us-east-1',
): { url: string } {
  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKey,
    AWS_SECRET_ACCESS_KEY: secretKey,
    AWS_DEFAULT_REGION: region,
  };
  execSync(`aws s3 sync ${sourcePath} s3://${bucket}`, {
    encoding: 'utf-8',
    stdio: 'inherit',
    env,
  });
  return { url: `s3://${bucket}` };
}
