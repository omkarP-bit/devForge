export interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion: string;
  Severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  Title: string;
  Description: string;
  References: string[];
}

export interface TrivyMisconfiguration {
  Type: string;
  ID: string;
  Title: string;
  Severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  Message: string;
  Resolution: string;
}

export interface TrivyResult {
  Target: string;
  Class: 'os-pkgs' | 'lang-pkgs' | 'config';
  Type: string;
  Vulnerabilities: TrivyVulnerability[] | null;
  Misconfigurations: TrivyMisconfiguration[] | null;
}

export interface TrivyScanResult {
  SchemaVersion: number;
  ArtifactName: string;
  ArtifactType: 'container_image' | 'filesystem' | 'config';
  Results: TrivyResult[];
}

export interface TrivySummary {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  fixableCount: number;
  topPackages: string[];
}
