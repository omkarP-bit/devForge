import { validateWorkflowYaml } from '../../src/validator/yamlValidator';

describe('YAML Validator', () => {
  it('valid workflow passes', () => {
    const content = `on: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n`;
    const res = validateWorkflowYaml(content, '.github/workflows/ci.yml');
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('missing trigger flagged', () => {
    const content = `jobs:\n  build:\n    runs-on: ubuntu-latest\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.code === 'MISSING_TRIGGER')).toBe(true);
  });

  it('missing jobs flagged', () => {
    const content = `on: [push]\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.code === 'MISSING_JOBS')).toBe(true);
  });

  it('missing runs-on flagged', () => {
    const content = `on: [push]\njobs:\n  build:\n    steps:\n      - run: echo hi\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.code === 'MISSING_RUNS_ON')).toBe(true);
  });

  it('detects hardcoded secret token as warning', () => {
    const longToken = 'a'.repeat(40);
    const content = `on: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${longToken}\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.warnings.some(w => w.code === 'POSSIBLE_HARDCODED_SECRET')).toBe(true);
  });

  it('detects hardcoded credential error', () => {
    const content = `on: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hello\n      - name: Set token\n        env:\n          token: mysecrettoken\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.errors.some(e => e.code === 'HARDCODED_CREDENTIAL')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('flags unpinned actions', () => {
    const content = `on: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.warnings.some(w => w.code === 'UNPINNED_ACTION')).toBe(true);
  });

  it('recommends npm ci over npm install', () => {
    const content = `on: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm install\n`;
    const res = validateWorkflowYaml(content, 'a.yml');
    expect(res.warnings.some(w => w.code === 'PREFER_NPM_CI')).toBe(true);
  });
});
