export const TRIVY_IMAGE_JOB = `
  # Set exit-code to '1' to fail the pipeline on CRITICAL vulnerabilities
  security-scan:
    name: Trivy Vulnerability Scan
    runs-on: ubuntu-latest
    needs: [build]
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy on built image
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: '{{ECR_REGISTRY}}/{{IMAGE_NAME}}:\${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '{{TRIVY_EXIT_CODE}}'
      - name: Upload Trivy SARIF to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
`.trimStart();

export const TRIVY_FS_JOB = `
  # Set exit-code to '1' to fail the pipeline on CRITICAL vulnerabilities
  security-scan:
    name: Trivy Vulnerability Scan
    runs-on: ubuntu-latest
    needs: [build]
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0.28.0
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'table'
          severity: 'CRITICAL,HIGH'
          exit-code: '{{TRIVY_EXIT_CODE}}'
`.trimStart();

export interface TrivyJobVars {
  ecrRegistry?: string;
  imageName?: string;
  trivyExitCode?: string;
}

export function renderTrivyJob(isDocker: boolean, vars: TrivyJobVars = {}): string {
  const template = isDocker ? TRIVY_IMAGE_JOB : TRIVY_FS_JOB;
  return template
    .replace('{{ECR_REGISTRY}}', vars.ecrRegistry ?? '<ECR_REGISTRY>')
    .replace('{{IMAGE_NAME}}', vars.imageName ?? '<IMAGE_NAME>')
    .replace(/\{\{TRIVY_EXIT_CODE\}\}/g, vars.trivyExitCode ?? '0');
}
