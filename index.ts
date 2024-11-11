import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as path from 'path';
import * as mime from 'mime-types';
import * as fs from 'fs';

const config = new pulumi.Config();
const domain = config.require('domain');
const sitePath = config.require('sitePath');

// Create an S3 bucket for hosting the static website
const siteBucket = new aws.s3.Bucket('denvermullets-port', {
  bucket: domain,
  website: {
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },
});

const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
  'public-access-block',
  {
    bucket: siteBucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false,
  },
  { dependsOn: siteBucket }
);

// Create bucket policy to allow public read access
const bucketPolicy = new aws.s3.BucketPolicy(
  'bucket-policy',
  {
    bucket: siteBucket.id,
    policy: siteBucket.id.apply((bucketName) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      })
    ),
  },
  { dependsOn: publicAccessBlock }
);

// Create AWS provider specifically for us-east-1
const usEast1Provider = new aws.Provider('usEast1', {
  region: 'us-east-1',
});

// Request an SSL certificate in us-east-1
const certificate = new aws.acm.Certificate(
  'site-certificate',
  {
    domainName: domain,
    validationMethod: 'DNS',
  },
  { provider: usEast1Provider }
);

// Function to recursively upload files to S3
function uploadDirectory(directoryPath: string, bucketName: string) {
  const files = fs.readdirSync(directoryPath);

  files.forEach((file) => {
    const filePath = path.join(directoryPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      uploadDirectory(filePath, bucketName);
    } else {
      const relativePath = path.relative(sitePath, filePath);
      new aws.s3.BucketObject(
        `file-${relativePath}`,
        {
          bucket: bucketName,
          source: new pulumi.asset.FileAsset(filePath),
          contentType: mime.lookup(filePath) || undefined,
          key: relativePath,
        },
        { dependsOn: siteBucket }
      );
    }
  });
}

// Upload the website files
uploadDirectory(sitePath, domain);

// *** once domain is connected / validated we can run this to connect the cdn so we can get https
// *** comment out below

// Create CloudFront distribution
const distribution = new aws.cloudfront.Distribution('site-distribution', {
  enabled: true,
  aliases: [domain],
  origins: [
    {
      originId: siteBucket.arn,
      domainName: siteBucket.websiteEndpoint,
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: 'http-only',
        originSslProtocols: ['TLSv1.2'],
      },
    },
  ],
  defaultRootObject: 'index.html',
  defaultCacheBehavior: {
    targetOriginId: siteBucket.arn,
    viewerProtocolPolicy: 'redirect-to-https',
    allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
    cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
    forwardedValues: {
      queryString: false,
      cookies: {
        forward: 'none',
      },
    },
    minTtl: 0,
    defaultTtl: 3600,
    maxTtl: 86400,
  },
  restrictions: {
    geoRestriction: {
      restrictionType: 'none',
    },
  },
  viewerCertificate: {
    acmCertificateArn: certificate.arn,
    sslSupportMethod: 'sni-only',
    minimumProtocolVersion: 'TLSv1.2_2021',
  },
});

export const distributionDomain = distribution.domainName;
export const distributionId = distribution.id;
// *** comment out above

// Export the necessary values
export const bucketName = siteBucket.id;
export const bucketEndpoint = siteBucket.websiteEndpoint;
export const certificateArn = certificate.arn;
export const certificateValidationDomains = certificate.domainValidationOptions;
