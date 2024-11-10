import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';

const domainName = 'denvermullets.com';

// 1. Create an S3 bucket for static website
const siteBucket = new aws.s3.Bucket('siteBucket', {
  bucket: domainName,
  website: {
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },
  // Optional: removes bucket even if it contains objects
  forceDestroy: true,
});

// Define the public access block settings
// this should be set for the user
const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
  'siteBucketPublicAccessBlock',
  {
    bucket: siteBucket.bucket,
    blockPublicAcls: false, // Allow public ACLs
    ignorePublicAcls: false, // Ignore public ACL restrictions
    blockPublicPolicy: false, // Allow public policies
    restrictPublicBuckets: false, // Don't restrict public bucket access
  }
);

// Step 2: Define the IAM Policy to allow necessary actions on this bucket
// i feel like this might be uneeded since the user is attached to a group
// const bucketPolicyDocument = pulumi.output({
//   Version: '2012-10-17',
//   Statement: [
//     {
//       Effect: 'Allow',
//       Action: [
//         's3:PutBucketPolicy',
//         's3:GetBucketPolicy',
//         's3:PutBucketAcl',
//         's3:ListBucket',
//         's3:GetObject',
//         's3:PutObject',
//       ],
//       Resource: [
//         pulumi.interpolate`arn:aws:s3:::${siteBucket.bucket}`,
//         pulumi.interpolate`arn:aws:s3:::${siteBucket.bucket}/*`,
//       ],
//     },
//   ],
// });

// // 2. Set up a policy to make the S3 bucket publicly accessible
const bucketPolicy = new aws.s3.BucketPolicy('bucketPolicy', {
  bucket: siteBucket.bucket,
  policy: siteBucket.bucket.apply((bucketName) =>
    JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: '*',
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    })
  ),
});

// 3. Upload files to S3
const siteDir = './site';

// Helper function to recursively upload all files in a directory
function uploadDirectory(directory: string, bucket: aws.s3.Bucket) {
  const files = fs.readdirSync(directory);
  files.forEach((file) => {
    const filePath = path.join(directory, file);
    const isDirectory = fs.lstatSync(filePath).isDirectory();

    if (isDirectory) {
      // Recursively upload subdirectories
      uploadDirectory(filePath, bucket);
    } else {
      // Upload file to S3
      const relativePath = path.relative(siteDir, filePath);
      new aws.s3.BucketObject(relativePath, {
        bucket: bucket,
        source: new pulumi.asset.FileAsset(filePath),
        contentType: mime.lookup(filePath) || undefined,
      });
    }
  });
}

uploadDirectory(siteDir, siteBucket);

// there's no real way for pulumi to setup a cert for namecheap so skipping
// you have to manually go in and create the route53 dns cert stuff
// then copy the host/value to namecheap cname record

// 4. Create a certificate for the domain (must be in us-east-1 for CloudFront)
// const cert = new aws.acm.Certificate(
//   'cert',
//   {
//     domainName: domainName,
//     validationMethod: 'DNS',
//     tags: {
//       Environment: 'Production',
//     },
//   },
//   { provider: new aws.Provider('us-east-1-provider', { region: 'us-east-1' }) }
// );

// 5. Create a DNS validation record (using Route 53)
// const hostedZone = new aws.route53.Zone('exampleZone', {
//   name: domainName,
// });

// const certValidation = new aws.route53.Record('certValidation', {
//   zoneId: hostedZone.zoneId,
//   name: cert.domainValidationOptions[0].resourceRecordName,
//   type: cert.domainValidationOptions[0].resourceRecordType,
//   records: [cert.domainValidationOptions[0].resourceRecordValue],
//   ttl: 60,
// });

// 6. Wait for certificate validation
// const validatedCert = new aws.acm.CertificateValidation('validatedCert', {
//   certificateArn: cert.arn,
//   validationRecordFqdns: [certValidation.fqdn],
// });

// 7. Create a CloudFront distribution for the S3 website
// const cdn = new aws.cloudfront.Distribution('cdn', {
//   enabled: true,
//   origins: [
//     {
//       domainName: siteBucket.websiteEndpoint,
//       originId: siteBucket.arn,
//       customOriginConfig: {
//         originProtocolPolicy: 'http-only',
//         httpPort: 80,
//         httpsPort: 443,
//         originSslProtocols: ['TLSv1.2'],
//       },
//     },
//   ],
//   defaultCacheBehavior: {
//     targetOriginId: siteBucket.arn,
//     viewerProtocolPolicy: 'redirect-to-https',
//     allowedMethods: ['GET', 'HEAD'],
//     cachedMethods: ['GET', 'HEAD'],
//     forwardedValues: {
//       queryString: false,
//       cookies: { forward: 'none' },
//     },
//   },
//   priceClass: 'PriceClass_100',
//   viewerCertificate: {
//     acmCertificateArn: validatedCert.certificateArn,
//     sslSupportMethod: 'sni-only',
//     minimumProtocolVersion: 'TLSv1.2_2021',
//   },
//   aliases: [domainName],
//   restrictions: {
//     geoRestriction: {
//       restrictionType: 'none',
//     },
//   },
// });

// 8. Create a Route 53 DNS record to point the domain to the CloudFront distribution
// new aws.route53.Record('cdnRecord', {
//   zoneId: hostedZone.id,
//   name: domainName,
//   type: 'A',
//   aliases: [
//     {
//       name: cdn.domainName,
//       zoneId: cdn.hostedZoneId,
//       evaluateTargetHealth: false,
//     },
//   ],
// });

// Export the bucket name and CloudFront URL
export const bucketName = siteBucket.bucket;
// export const cdnUrl = cdn.domainName;
