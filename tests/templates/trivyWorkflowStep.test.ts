import { renderTrivyJob } from '../../src/templates/security/trivyWorkflowStep';

describe('renderTrivyJob', () => {
  it('renders image job for Docker projects', () => {
    const output = renderTrivyJob(true, { ecrRegistry: '123.dkr.ecr.us-east-1.amazonaws.com', imageName: 'my-app', trivyExitCode: '0' });
    expect(output).toContain('aquasecurity/trivy-action@0.28.0');
    expect(output).toContain('image-ref');
    expect(output).toContain('123.dkr.ecr.us-east-1.amazonaws.com');
    expect(output).toContain('my-app');
    expect(output).toContain("exit-code: '0'");
    expect(output).toContain('upload-sarif');
  });

  it('renders filesystem job for non-Docker projects', () => {
    const output = renderTrivyJob(false);
    expect(output).toContain("scan-type: 'fs'");
    expect(output).not.toContain('upload-sarif');
    expect(output).not.toContain('image-ref');
  });

  it('uses default exit-code 0 when not specified', () => {
    const output = renderTrivyJob(true);
    expect(output).toContain("exit-code: '0'");
  });

  it('renders security-scan job name', () => {
    expect(renderTrivyJob(false)).toContain('security-scan:');
  });
});
