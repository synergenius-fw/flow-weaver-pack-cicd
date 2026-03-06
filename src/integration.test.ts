import { describe, it, expect } from 'vitest';
import { buildJobGraph } from './job-graph.js';
import type { TWorkflowAST, TNodeTypeAST } from '@synergenius/flow-weaver/ast';

// ---------------------------------------------------------------------------
// Fixture helpers (same pattern as generator.test.ts)
// ---------------------------------------------------------------------------

function makeNodeType(
  name: string,
  inputs: Record<string, any> = {},
  outputs: Record<string, any> = {},
  overrides: Partial<TNodeTypeAST> = {},
): TNodeTypeAST {
  return {
    type: 'NodeType',
    name,
    functionName: name,
    inputs,
    outputs,
    hasSuccessPort: false,
    hasFailurePort: false,
    executeWhen: 'ANY_INPUT',
    isAsync: false,
    expression: true,
    ...overrides,
  } as TNodeTypeAST;
}

function makeWorkflow(overrides?: Partial<TWorkflowAST>): TWorkflowAST {
  return {
    name: 'DeployPipeline',
    functionName: 'deployPipeline',
    nodeTypes: [],
    instances: [],
    connections: [],
    options: { cicd: {} },
    startPorts: {},
    exitPorts: {},
    ...overrides,
  } as TWorkflowAST;
}

// ---------------------------------------------------------------------------
// Multi-job fixture: build → test → deploy → notify
// ---------------------------------------------------------------------------

const checkoutNt = makeNodeType(
  'checkout',
  { workingDirectory: { dataType: 'string', default: '.' } },
  { repoPath: { dataType: 'string' } },
);

const npmInstallNt = makeNodeType(
  'npmInstall',
  { cwd: { dataType: 'string', default: '.' } },
  { nodeModulesPath: { dataType: 'string' } },
);

const npmBuildNt = makeNodeType(
  'npmBuild',
  { cwd: { dataType: 'string', default: '.' } },
  { output: { dataType: 'string' } },
);

const npmTestNt = makeNodeType(
  'npmTest',
  { buildDir: { dataType: 'string', default: '.' } },
  { testOutput: { dataType: 'string' } },
);

const deploySshNt = makeNodeType(
  'deploySsh',
  { sourcePath: { dataType: 'string' } },
  { result: { dataType: 'string' } },
);

const slackNotifyNt = makeNodeType(
  'slackNotify',
  { message: { dataType: 'string', default: 'Pipeline completed' } },
  { sent: { dataType: 'boolean' } },
  { isAsync: true },
);

const allNodeTypes = [checkoutNt, npmInstallNt, npmBuildNt, npmTestNt, deploySshNt, slackNotifyNt];

const pipelineAST = makeWorkflow({
  nodeTypes: allNodeTypes,
  instances: [
    // Job: build (checkout → npmInstall → npmBuild)
    { id: 'checkout1', nodeType: 'checkout', job: 'build' } as any,
    { id: 'install1', nodeType: 'npmInstall', job: 'build' } as any,
    { id: 'build1', nodeType: 'npmBuild', job: 'build' } as any,
    // Job: test (npmTest, reads artifact from build)
    { id: 'test1', nodeType: 'npmTest', job: 'test' } as any,
    // Job: deploy (deploySsh, reads artifact from test)
    { id: 'deploy1', nodeType: 'deploySsh', job: 'deploy' } as any,
    // Job: notify (slackNotify, reads artifact from deploy, async)
    { id: 'notify1', nodeType: 'slackNotify', job: 'notify' } as any,
  ],
  connections: [
    // Start → checkout (Start connection)
    { from: { node: 'Start', port: 'branch' }, to: { node: 'checkout1', port: 'workingDirectory' } } as any,
    // Within build job: checkout → npmInstall → npmBuild
    { from: { node: 'checkout1', port: 'repoPath' }, to: { node: 'install1', port: 'cwd' } } as any,
    { from: { node: 'install1', port: 'nodeModulesPath' }, to: { node: 'build1', port: 'cwd' } } as any,
    // Cross-job: build.output → test.buildDir
    { from: { node: 'build1', port: 'output' }, to: { node: 'test1', port: 'buildDir' } } as any,
    // Cross-job: test.testOutput → deploy.sourcePath
    { from: { node: 'test1', port: 'testOutput' }, to: { node: 'deploy1', port: 'sourcePath' } } as any,
    // Cross-job: deploy.result → notify.message
    { from: { node: 'deploy1', port: 'result' }, to: { node: 'notify1', port: 'message' } } as any,
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CI/CD job graph integration', () => {
  const jobs = buildJobGraph(pipelineAST);

  it('builds 4 jobs in dependency order with correct needs chains', () => {
    expect(jobs).toHaveLength(4);

    const ids = jobs.map((j) => j.id);
    expect(ids).toEqual(['build', 'test', 'deploy', 'notify']);

    expect(jobs[0].needs).toEqual([]);
    expect(jobs[1].needs).toEqual(['build']);
    expect(jobs[2].needs).toEqual(['test']);
    expect(jobs[3].needs).toEqual(['deploy']);
  });

  it('assigns correct steps to each job', () => {
    const buildJob = jobs.find((j) => j.id === 'build')!;
    const testJob = jobs.find((j) => j.id === 'test')!;
    const deployJob = jobs.find((j) => j.id === 'deploy')!;
    const notifyJob = jobs.find((j) => j.id === 'notify')!;

    expect(buildJob.steps.map((s) => s.id)).toEqual(['checkout1', 'install1', 'build1']);
    expect(testJob.steps.map((s) => s.id)).toEqual(['test1']);
    expect(deployJob.steps.map((s) => s.id)).toEqual(['deploy1']);
    expect(notifyJob.steps.map((s) => s.id)).toEqual(['notify1']);
  });

  it('preserves step node types', () => {
    const buildJob = jobs.find((j) => j.id === 'build')!;
    expect(buildJob.steps.map((s) => s.nodeType)).toEqual(['checkout', 'npmInstall', 'npmBuild']);
  });

  it('handles single-node jobs', () => {
    const deployJob = jobs.find((j) => j.id === 'deploy')!;
    expect(deployJob.steps).toHaveLength(1);
    expect(deployJob.steps[0].nodeType).toBe('deploySsh');
  });

  it('creates transitive dependency chains from cross-job connections', () => {
    // notify depends on deploy, which depends on test, which depends on build
    // Each link is from a cross-job data connection, not explicitly declared
    const notifyJob = jobs.find((j) => j.id === 'notify')!;
    expect(notifyJob.needs).toEqual(['deploy']);

    const deployJob = jobs.find((j) => j.id === 'deploy')!;
    expect(deployJob.needs).toEqual(['test']);
  });

  it('applies @job config overrides', () => {
    const configuredAST = makeWorkflow({
      ...pipelineAST,
      options: {
        cicd: {
          jobs: [
            { id: 'build', runner: 'ubuntu-22.04', timeout: '30m' } as any,
            { id: 'deploy', allowFailure: true, retry: 2 } as any,
          ],
        },
      } as any,
    });

    const configuredJobs = buildJobGraph(configuredAST);
    const buildJob = configuredJobs.find((j) => j.id === 'build')!;
    const deployJob = configuredJobs.find((j) => j.id === 'deploy')!;

    expect(buildJob.runner).toBe('ubuntu-22.04');
    expect(buildJob.timeout).toBe('30m');
    expect(deployJob.allowFailure).toBe(true);
    expect(deployJob.retry).toBe(2);
  });

  it('applies @stage assignments', () => {
    const stagedAST = makeWorkflow({
      ...pipelineAST,
      options: {
        cicd: {
          stages: [
            { name: 'compile' },
            { name: 'verify' },
            { name: 'release' },
            { name: 'post' },
          ],
          jobs: [
            { id: 'build', stage: 'compile' } as any,
            { id: 'test', stage: 'verify' } as any,
            { id: 'deploy', stage: 'release' } as any,
            { id: 'notify', stage: 'post' } as any,
          ],
        },
      } as any,
    });

    const stagedJobs = buildJobGraph(stagedAST);
    expect(stagedJobs.find((j) => j.id === 'build')!.stage).toBe('compile');
    expect(stagedJobs.find((j) => j.id === 'test')!.stage).toBe('verify');
    expect(stagedJobs.find((j) => j.id === 'deploy')!.stage).toBe('release');
    expect(stagedJobs.find((j) => j.id === 'notify')!.stage).toBe('post');
  });
});
