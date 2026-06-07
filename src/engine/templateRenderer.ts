/**
 * Template Renderer Module
 *
 * Provides safe template variable substitution with injection prevention.
 * Converts Handlebars-style {{variable}} placeholders into actual values
 * using an allowlist-based substitution strategy.
 *
 * Design Principles:
 * - No eval() or code execution
 * - Allowlist-based variable validation
 * - GitHub Actions syntax preserved (${{ }} untouched)
 * - Strict undefined variable handling
 * - Deterministic output (no random values)
 */

import { GeneratorError } from '../utils/errors';

/**
 * Represents a single template variable substitution
 */
export interface TemplateVariable {
  key: string;
  value: string;
}

/**
 * Allowlist of variables that can be substituted in templates
 * Additional variables require explicit whitelisting
 */
const ALLOWED_VARIABLES = new Set([
  'devforgeVersion',
  'nodeVersion',
  'packageManager',
  'installCommand',
  'buildCommand',
  'testCommand',
  'framework',
  'environments',
  'environment',
  'major',
  'minor',
  'hasTests',
  'hasLinting',
  'deploymentTarget',
  'ECR_REGISTRY',
  'IMAGE_NAME',
  'TRIVY_EXIT_CODE',
]);

/**
 * Validates a variable name against allowed characters and allowlist
 * @param varName - The variable name to validate
 * @returns true if valid, false otherwise
 * @internal
 */
function isValidVariableName(varName: string): boolean {
  // Check name format: must start with letter, contain only alphanumeric and underscore
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(varName)) {
    return false;
  }
  // Check allowlist
  return ALLOWED_VARIABLES.has(varName);
}

/**
 * Extracts all {{variable}} placeholders from a template string
 * Returns empty array if no placeholders found
 * @internal
 */
function extractPlaceholders(template: string): string[] {
  // Match {{ ... }} with optional whitespace inside
  const handlebarsRegex = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
  const placeholders: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = handlebarsRegex.exec(template)) !== null) {
    // match[1] is guaranteed to be captured (it's the variable name)
    const varName = match[1]!;
    // Only collect if not preceded by $ (to exclude ${{ }} GitHub Actions syntax)
    const beforeMatch = match.index > 0 ? template.substring(match.index - 1, match.index) : '';
    if (!beforeMatch.includes('$')) {
      placeholders.push(varName);
    }
  }

  return [...new Set(placeholders)]; // Remove duplicates
}

/**
 * Validates that all variables in template are in the allowlist
 * @throws {GeneratorError} if unknown variable found
 * @internal
 */
function validateTemplateVariables(
  placeholders: string[],
  providedVariables: Map<string, string>,
): void {
  for (const placeholder of placeholders) {
    if (!isValidVariableName(placeholder)) {
      throw new GeneratorError(
        `Invalid variable name in template: ${placeholder}. ` +
          `Variable names must match /^[a-zA-Z][a-zA-Z0-9_]*$/ and be in allowlist.`,
      );
    }

    if (!providedVariables.has(placeholder)) {
      throw new GeneratorError(
        `Undefined template variable: {{${placeholder}}}. ` +
          `Must provide value for all template variables.`,
      );
    }
  }
}

/**
 * Renders a template by substituting {{variable}} placeholders with provided values
 *
 * Features:
 * - Safe variable substitution (no eval, no code execution)
 * - Allowlist-based validation of variable names
 * - Strict undefined variable handling (throws error)
 * - GitHub Actions ${{ }} syntax preserved untouched
 * - Deterministic output (same input always produces same output)
 *
 * Example:
 * ```typescript
 * const template = 'node: {{nodeVersion}}, command: {{buildCommand}}';
 * const variables = new Map([
 *   ['nodeVersion', '18'],
 *   ['buildCommand', 'npm run build']
 * ]);
 * const rendered = renderTemplate(template, variables);
 * // Result: 'node: 18, command: npm run build'
 * ```
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Map of variable names to values
 * @returns Rendered template string with all placeholders substituted
 * @throws {GeneratorError} if variable not in allowlist or undefined
 */
export function renderTemplate(template: string, variables: Map<string, string>): string {
  /* eslint-disable security/detect-object-injection */
  if (template === null || template === undefined || typeof template !== 'string') {
    throw new GeneratorError('Template must be a string');
  }

  if (!variables || !(variables instanceof Map)) {
    throw new GeneratorError('Variables must be a Map<string, string>');
  }

  // Allow empty template
  if (!template) {
    return '';
  }

  // Extract all {{variable}} placeholders
  const placeholders = extractPlaceholders(template);

  // Validate that all placeholders are in allowlist and have values
  validateTemplateVariables(placeholders, variables);

  // Build result by processing the template and replacing placeholders
  let result = '';
  let i = 0;

  while (i < template.length) {
    // Check for {{ at current position but not preceded by $
    const char = template[i];
    const nextChar = i + 1 < template.length ? template[i + 1] : '';
    const prevChar = i > 0 ? template[i - 1] : '';

    if (char === '{' && nextChar === '{' && prevChar !== '$') {
      // Look for closing }}
      let j = i + 2;
      // Skip whitespace
      while (j < template.length) {
        const ch = template[j];
        if (!ch || !/\s/.test(ch)) break;
        j++;
      }
      // Extract variable name
      let varNameEnd = j;
      while (varNameEnd < template.length) {
        const ch = template[varNameEnd];
        if (!ch || !/[a-zA-Z0-9_]/.test(ch)) break;
        varNameEnd++;
      }
      // Get the variable name
      const varName = template.substring(j, varNameEnd);
      // Skip trailing whitespace
      let k = varNameEnd;
      while (k < template.length) {
        const ch = template[k];
        if (!ch || !/\s/.test(ch)) break;
        k++;
      }
      // Check for closing }}
      const closingChar = k < template.length ? template[k] : '';
      const closingChar2 = k + 1 < template.length ? template[k + 1] : '';

      if (closingChar === '}' && closingChar2 === '}') {
        // Valid placeholder found
        if (placeholders.includes(varName) && variables.has(varName)) {
          // Replace with value
          const value = variables.get(varName);
          result += value || '';
          i = k + 2;
          continue;
        }
      }
    }

    // Not a placeholder, just append character
    result += char;
    i++;
  }

  return result;
  /* eslint-enable security/detect-object-injection */
}

/**
 * Renders a template using an array of TemplateVariable objects instead of a Map
 * Convenience function for callers who work with arrays
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Array of TemplateVariable objects
 * @returns Rendered template string
 * @throws {GeneratorError} if variable not valid or undefined
 */
export function renderTemplateFromArray(template: string, variables: TemplateVariable[]): string {
  const variableMap = new Map<string, string>();
  for (const variable of variables) {
    variableMap.set(variable.key, variable.value);
  }
  return renderTemplate(template, variableMap);
}

/**
 * Checks if a template contains unrendered placeholders (for validation)
 * Useful for detecting if renderTemplate was called correctly
 *
 * @param rendered - The rendered template string
 * @returns true if there are unrendered {{variable}} placeholders
 */
export function hasUnrenderedPlaceholders(rendered: string): boolean {
  // Check for {{...}} but not ${{...}}
  const pattern = /(?<!\$)\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/g;
  return pattern.test(rendered);
}

/**
 * Gets the list of allowed variable names that can be substituted in templates
 * Useful for documentation and validation
 *
 * @returns Array of allowed variable names
 */
export function getAllowedVariables(): string[] {
  return Array.from(ALLOWED_VARIABLES).sort();
}

/**
 * Validates that a variable name would be accepted by renderTemplate
 * Useful for pre-validation before attempting to render
 *
 * @param varName - The variable name to check
 * @returns true if the variable name is valid and in allowlist
 */
export function isAllowedVariable(varName: string): boolean {
  return isValidVariableName(varName);
}
