import { describe, it, expect } from 'vitest';
import { generateCICDRuntime } from './generator.js';
import { buildJobGraph } from './job-graph.js';
import type { TWorkflowAST, TNodeTypeAST } from '@synergenius/flow-weaver/ast';

// ---------------------------------------------------------------------------
// Fixtures
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
    name: 'TestPipeline',
    functionName: 'testPipeline',
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
// Tests
// ---------------------------------------------------------------------------

describe('generateCICDRuntime', () => {
  it('generates a valid CLI entry with --job= parsing', () => {
    const checkoutNt = makeNodeType('checkout', {}, { repoPath: { dataType: 'string' } }, {
      functionText: `export function checkout() { return { repoPath: process.cwd() }; }`,
    });

    const ast = makeWorkflow({
      nodeTypes: [checkoutNt],
      instances: [
        { id: 'checkout1', nodeType: 'checkout', job: 'build' } as any,
      ],
      connections: [],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [checkoutNt]);

    expect(output).toContain('#!/usr/bin/env node');
    expect(output).toContain("--job=");
    expect(output).toContain("process.argv.find");
    expect(output).toContain("job_build");
    expect(output).toContain("process.exit(0)");
    expect(output).toContain("process.exit(1)");
  });

  it('emits artifact helpers for cross-job data flow', () => {
    const buildNt = makeNodeType('npmBuild', {}, { output: { dataType: 'string' } }, {
      functionText: `export function npmBuild() { return { output: 'dist' }; }`,
    });
    const testNt = makeNodeType('npmTest', {}, { exitCode: { dataType: 'number' } }, {
      functionText: `export function npmTest() { return { exitCode: 0, testOutput: '' }; }`,
    });

    const ast = makeWorkflow({
      nodeTypes: [buildNt, testNt],
      instances: [
        { id: 'build1', nodeType: 'npmBuild', job: 'build' } as any,
        { id: 'test1', nodeType: 'npmTest', job: 'test' } as any,
      ],
      connections: [
        { from: { node: 'build1', port: 'output' }, to: { node: 'test1', port: 'buildDir' } } as any,
      ],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [buildNt, testNt]);

    expect(output).toContain('writeArtifact');
    expect(output).toContain('readArtifact');
    expect(output).toContain('.fw-artifacts');
    expect(output).toContain('fs.mkdirSync');
    expect(output).toContain('fs.writeFileSync');
    expect(output).toContain('fs.readFileSync');
  });

  it('inlines function bodies from functionText', () => {
    const shellNt = makeNodeType('shellCommand',
      {
        command: { dataType: 'string', default: 'echo "hello"' },
        workingDirectory: { dataType: 'string', default: '.' },
      },
      { stdout: { dataType: 'string' }, exitCode: { dataType: 'number' } },
      {
        functionText: `import { execSync } from 'node:child_process';
export function shellCommand(command: string = 'echo "hello"', workingDirectory: string = '.') {
  const stdout = execSync(command, { cwd: workingDirectory, encoding: 'utf-8' });
  return { stdout, exitCode: 0 };
}`,
      },
    );

    const ast = makeWorkflow({
      nodeTypes: [shellNt],
      instances: [
        { id: 'shell1', nodeType: 'shellCommand', job: 'build' } as any,
      ],
      connections: [],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [shellNt]);

    // The import should be at top level
    expect(output).toContain("import { execSync } from 'node:child_process'");
    // The function body should be inlined (without import statements)
    expect(output).toContain('function shellCommand');
    expect(output).toContain('execSync(command');
  });

  it('generates per-job functions in topological order', () => {
    const checkoutNt = makeNodeType('checkout', {}, { repoPath: { dataType: 'string' } }, {
      functionText: `export function checkout() { return { repoPath: process.cwd() }; }`,
    });
    const installNt = makeNodeType('npmInstall', {}, { nodeModulesPath: { dataType: 'string' } }, {
      functionText: `export function npmInstall() { return { nodeModulesPath: 'node_modules' }; }`,
    });

    const ast = makeWorkflow({
      nodeTypes: [checkoutNt, installNt],
      instances: [
        { id: 'checkout1', nodeType: 'checkout', job: 'build' } as any,
        { id: 'install1', nodeType: 'npmInstall', job: 'build' } as any,
      ],
      connections: [
        { from: { node: 'checkout1', port: 'repoPath' }, to: { node: 'install1', port: 'cwd' } } as any,
      ],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [checkoutNt, installNt]);

    // checkout1 should appear before install1 in the generated code
    const checkoutIdx = output.indexOf('checkout1_result');
    const installIdx = output.indexOf('install1_result');
    expect(checkoutIdx).toBeLessThan(installIdx);
  });

  it('resolves within-job port connections as local variable references', () => {
    const checkoutNt = makeNodeType('checkout', {}, { repoPath: { dataType: 'string' } }, {
      functionText: `export function checkout() { return { repoPath: process.cwd() }; }`,
    });
    const shellNt = makeNodeType('shellCommand',
      { command: { dataType: 'string' }, workingDirectory: { dataType: 'string' } },
      { stdout: { dataType: 'string' }, exitCode: { dataType: 'number' } },
      {
        functionText: `export function shellCommand(command, workingDirectory) { return { stdout: '', exitCode: 0 }; }`,
      },
    );

    const ast = makeWorkflow({
      nodeTypes: [checkoutNt, shellNt],
      instances: [
        { id: 'checkout1', nodeType: 'checkout', job: 'ci' } as any,
        { id: 'shell1', nodeType: 'shellCommand', job: 'ci' } as any,
      ],
      connections: [
        { from: { node: 'checkout1', port: 'repoPath' }, to: { node: 'shell1', port: 'workingDirectory' } } as any,
      ],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [checkoutNt, shellNt]);

    // The shell command call should reference checkout1_result.repoPath
    expect(output).toContain('checkout1_result.repoPath');
  });

  it('resolves cross-job connections as readArtifact calls', () => {
    const buildNt = makeNodeType('npmBuild', {}, { output: { dataType: 'string' } }, {
      functionText: `export function npmBuild() { return { output: 'dist' }; }`,
    });
    const deployNt = makeNodeType('deploySsh',
      { sourcePath: { dataType: 'string' } },
      { result: { dataType: 'string' } },
      {
        functionText: `export function deploySsh(sourcePath) { return { result: 'ok' }; }`,
      },
    );

    const ast = makeWorkflow({
      nodeTypes: [buildNt, deployNt],
      instances: [
        { id: 'build1', nodeType: 'npmBuild', job: 'build' } as any,
        { id: 'deploy1', nodeType: 'deploySsh', job: 'deploy' } as any,
      ],
      connections: [
        { from: { node: 'build1', port: 'output' }, to: { node: 'deploy1', port: 'sourcePath' } } as any,
      ],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [buildNt, deployNt]);

    // deploy1 should use readArtifact to get build1's output
    expect(output).toContain("readArtifact('build', 'output')");
    // build1 should writeArtifact for its output
    expect(output).toContain("writeArtifact('build', 'output'");
  });

  it('resolves Start connections as params.<port>', () => {
    const shellNt = makeNodeType('shellCommand',
      { command: { dataType: 'string' } },
      { stdout: { dataType: 'string' }, exitCode: { dataType: 'number' } },
      {
        functionText: `export function shellCommand(command) { return { stdout: '', exitCode: 0 }; }`,
      },
    );

    const ast = makeWorkflow({
      nodeTypes: [shellNt],
      instances: [
        { id: 'shell1', nodeType: 'shellCommand', job: 'run' } as any,
      ],
      connections: [
        { from: { node: 'Start', port: 'userCommand' }, to: { node: 'shell1', port: 'command' } } as any,
      ],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [shellNt]);

    expect(output).toContain('params.userCommand');
  });

  it('uses default values when no connection exists', () => {
    const shellNt = makeNodeType('shellCommand',
      {
        command: { dataType: 'string', default: 'echo "hello"' },
        workingDirectory: { dataType: 'string', default: '.' },
      },
      { stdout: { dataType: 'string' }, exitCode: { dataType: 'number' } },
      {
        functionText: `export function shellCommand(command, workingDirectory) { return { stdout: '', exitCode: 0 }; }`,
      },
    );

    const ast = makeWorkflow({
      nodeTypes: [shellNt],
      instances: [
        { id: 'shell1', nodeType: 'shellCommand', job: 'run' } as any,
      ],
      connections: [],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [shellNt]);

    expect(output).toContain('"echo \\"hello\\""');
    expect(output).toContain('"."');
  });

  it('generates multiple job functions for multi-job workflows', () => {
    const checkoutNt = makeNodeType('checkout', {}, { repoPath: { dataType: 'string' } }, {
      functionText: `export function checkout() { return { repoPath: process.cwd() }; }`,
    });
    const testNt = makeNodeType('npmTest', {}, { exitCode: { dataType: 'number' } }, {
      functionText: `export function npmTest() { return { exitCode: 0, testOutput: '' }; }`,
    });
    const buildNt = makeNodeType('npmBuild', {}, { output: { dataType: 'string' } }, {
      functionText: `export function npmBuild() { return { output: 'dist' }; }`,
    });

    const ast = makeWorkflow({
      nodeTypes: [checkoutNt, testNt, buildNt],
      instances: [
        { id: 'checkout1', nodeType: 'checkout', job: 'test' } as any,
        { id: 'test1', nodeType: 'npmTest', job: 'test' } as any,
        { id: 'checkout2', nodeType: 'checkout', job: 'build' } as any,
        { id: 'build1', nodeType: 'npmBuild', job: 'build' } as any,
      ],
      connections: [],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [checkoutNt, testNt, buildNt]);

    expect(output).toContain('async function job_test');
    expect(output).toContain('async function job_build');
    expect(output).toContain("'test': job_test");
    expect(output).toContain("'build': job_build");
  });

  it('deduplicates inlined functions across jobs', () => {
    const checkoutNt = makeNodeType('checkout', {}, { repoPath: { dataType: 'string' } }, {
      functionText: `export function checkout() { return { repoPath: process.cwd() }; }`,
    });

    const ast = makeWorkflow({
      nodeTypes: [checkoutNt],
      instances: [
        { id: 'checkout1', nodeType: 'checkout', job: 'test' } as any,
        { id: 'checkout2', nodeType: 'checkout', job: 'build' } as any,
      ],
      connections: [],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [checkoutNt]);

    // The function should only appear once in the output
    const matches = output.match(/function checkout\(\)/g);
    expect(matches?.length).toBe(1);
  });

  it('strips JSDoc from inlined function bodies', () => {
    const nt = makeNodeType('npmBuild', {}, { output: { dataType: 'string' } }, {
      functionText: `/**
 * @flowWeaver nodeType
 * @expression
 * @label npm Build
 */
export function npmBuild() { return { output: 'dist' }; }`,
    });

    const ast = makeWorkflow({
      nodeTypes: [nt],
      instances: [
        { id: 'build1', nodeType: 'npmBuild', job: 'build' } as any,
      ],
      connections: [],
    });

    const jobs = buildJobGraph(ast);
    const output = generateCICDRuntime(ast, jobs, [nt]);

    expect(output).not.toContain('@flowWeaver');
    expect(output).not.toContain('@expression');
    expect(output).toContain('function npmBuild');
  });
});
