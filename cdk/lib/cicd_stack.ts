import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";

interface CICDStackProps extends cdk.StackProps {
  env: cdk.Environment;
  mode: string;
  bucket: s3.IBucket;
  githubInfo: {
    gitOwner: string,
    gitRepository: string,
    branch: string,
  };
  connectionARN: string;
  webEnv: {
    baseUrl?: string,
  }
  distributionId?: string;
}


export class CICDStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CICDStackProps) {
    super(scope, id, props);

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();
    
    const gitHubSource = codebuild.Source.gitHub({
      owner: props.githubInfo.gitOwner,
      repo: props.githubInfo.gitRepository,
      webhook: true,
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
        .andBranchIs(props.githubInfo.branch),
      ],
    });

    // codebuild role
    const codebuildRole = new iam.Role(this, "CodeBuildRole", {
      roleName: id + "-codebuild-role",
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('codebuild.amazonaws.com'),
        new iam.ServicePrincipal('codepipeline.amazonaws.com')
      )
    });

    codebuildRole.addToPolicy(
      new iam.PolicyStatement({ resources: ["*"], actions: ["s3:*"] })
    );

      // build project
    const buildProject = new codebuild.Project(this, id + '-codebuild', {
      projectName: id + '-codebuild',
      role: codebuildRole,
      badge: true,
      source: gitHubSource,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      environmentVariables: {
        VUE_APP_BASE_URL: {
          value: `${props.webEnv.baseUrl}`,
        },
      },
    });

    // source action
    const sourceAction = 
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "GitHub_Source",
        owner: props.githubInfo.gitOwner,
        repo: props.githubInfo.gitRepository,
        branch: props.githubInfo.branch,
        output: sourceOutput,
        connectionArn: props.connectionARN,
      })

    // manual approval action
    const manualApprovalAction =
      new codepipeline_actions.ManualApprovalAction({
        actionName: "BuildApproval",
      });

    // build action
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput]
    })

    // deploy action
    const deployAction = new codepipeline_actions.S3DeployAction({
      actionName: 'DeployToS3',
      input: buildOutput,
      bucket: props.bucket,
      runOrder: 1,
    })

    // invalidate cache codebuild
    // Ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_codepipeline_actions-readme.html#invalidating-the-cloudfront-cache-when-deploying-to-s3
    const invalidateBuildProject = new codebuild.PipelineProject(this, id + `-invalidate-codebuild`, {
      projectName: id + `-invalidate-codebuild`,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands:[
              'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"',
            ],
          },
        },
      }),
      environmentVariables: {
        CLOUDFRONT_ID: { value: props.distributionId },
      },
    });
    
    // Add Cloudfront invalidation permissions to the project
    const distributionArn = `arn:aws:cloudfront::${this.account}:distribution/${props.distributionId}`;
    invalidateBuildProject.addToRolePolicy(new iam.PolicyStatement({
      resources: [distributionArn],
      actions: [
        'cloudfront:CreateInvalidation',
      ],
    }));

    // invalidate cache action
    const invalidateAction = new codepipeline_actions.CodeBuildAction({
        actionName: 'InvalidateCache',
        project: invalidateBuildProject,
        input: buildOutput,
        runOrder: 2,
      })

    // pipeline
    new codepipeline.Pipeline(this, id + "-pipeline", {
      pipelineName: id + "-pipeline",
      stages: [
        {
          stageName: "Source",
          actions: [sourceAction]
        },
        {
          stageName: "Approve",
          actions: [manualApprovalAction]
        },
        {
          stageName: "Build",
          actions: [buildAction]
        },
        {
          stageName: "Deploy",
          actions: [deployAction, invalidateAction]
        },
      ]
    });
  }
}
