#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CICDStack } from '../lib/cicd_stack';
import { loadEnvironmentVariablesFile, configLocalEnvironmentFile as setDotEnvironmentFile } from "../utils/index";
import { BucketStack } from '../lib/s3_cloudfront_stack';

const app = new cdk.App();
const mode = process.env.MODE === "prod" ? "prod" : "dev";
const env = loadEnvironmentVariablesFile(mode);

setDotEnvironmentFile(mode)

const baseId = env.base_id + "-" + mode

const envUser = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: env.region,
}

const githubInfo = {
  gitOwner: env.githubInfo.owner,
  gitRepository: env.githubInfo.repo,
  branch: env.githubInfo.branch
};

const bucketStack = new BucketStack(app, baseId + "-web", {
  env: envUser,
  mode: mode,
  route53:{
    domainName: env.route53.domainName,
    hostedZoneName: env.route53.hostedZoneName,
  },
  acm: {
    domainName: env.acm.domainName,
    certificateARN: env.acm.certificateARN,
  }
})

new CICDStack(app, baseId + "-cicd", {
  env: envUser,
  mode: mode,
  bucket: bucketStack.s3Bucket,
  githubInfo: githubInfo,  
  connectionARN: env.connectionARN,
  webEnv: {
    baseUrl: process.env.VUE_APP_BASE_URL,
  },
  distributionId: bucketStack.distribution.distributionId
})

app.synth()
