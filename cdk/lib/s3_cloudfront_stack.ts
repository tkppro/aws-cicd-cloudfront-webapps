import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

interface S3StackProps extends cdk.StackProps {
  env: cdk.Environment;
  mode: string;
  route53: {
    domainName: string;
    hostedZoneName: string;
  }
  acm: {
    domainName: string;
    certificateARN: string;
  }
}

export class BucketStack extends cdk.Stack {
  readonly s3Bucket: s3.IBucket;
  readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    this.s3Bucket = new s3.Bucket(this, id + "-s3", {
      bucketName: id + "-s3",
      websiteErrorDocument: "index.html",
      websiteIndexDocument: "index.html",
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    const hostedZone = route53.HostedZone.fromLookup(this, id + "-hostedZone", {
      domainName: props.route53.hostedZoneName,
    });

    // const certificate = new acm.Certificate(this, id + "-cert", {
    //   domainName: props.acm.domainName,
    //   validation: acm.CertificateValidation.fromDns(hostedZone),
    // });

    // retrieve defined certificate
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      id + "-cert",
      props.acm.certificateARN
    );

    this.distribution = new cloudfront.Distribution(this, id + "-cfdis", {
      defaultBehavior: {
        origin: new origins.S3Origin(this.s3Bucket, {
          originId: id + "-origin"
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(10)
        },
      ],
      defaultRootObject: "index.html",
      domainNames: [props.route53.domainName],
      certificate: certificate,
    });

    new route53.ARecord(this, id + "-record", {
      zone: hostedZone,
      recordName: props.route53.domainName,
      target: route53.RecordTarget.fromAlias(
        new CloudFrontTarget(this.distribution)
      ),
    });
  }
}
