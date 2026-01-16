import { supabase } from '@/integrations/supabase/client';

export interface CodeQualityIssue {
  filePath: string;
  issueType: 'typescript' | 'eslint' | 'strictNullChecks' | 'noImplicitAny';
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
  message: string;
  ruleName?: string;
}

export interface SelfHealingResult {
  success: boolean;
  fixedCode?: string;
  errorsFixed: number;
  error?: string;
}

export interface CodeQualityIssueRecord {
  id: string;
  user_id: string;
  file_path: string;
  issue_type: string;
  severity: string;
  line_number: number | null;
  column_number: number | null;
  message: string;
  rule_name: string | null;
  auto_fix_attempted: boolean;
  fixed_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Parse TypeScript compiler errors
 */
export function parseTypeScriptErrors(errorOutput: string): CodeQualityIssue[] {
  const issues: CodeQualityIssue[] = [];
  const errorRegex = /(.+?)\((\d+),(\d+)\): error TS\d+: (.+)/g;
  
  let match;
  while ((match = errorRegex.exec(errorOutput)) !== null) {
    const [, filePath, line, column, message] = match;
    
    let issueType: CodeQualityIssue['issueType'] = 'typescript';
    if (message.includes('strictNullChecks')) {
      issueType = 'strictNullChecks';
    } else if (message.includes('implicitly has an \'any\' type')) {
      issueType = 'noImplicitAny';
    }
    
    issues.push({
      filePath: filePath.trim(),
      issueType,
      severity: 'error',
      line: parseInt(line),
      column: parseInt(column),
      message: message.trim(),
      ruleName: 'typescript',
    });
  }
  
  return issues;
}

/**
 * Parse ESLint errors
 */
export function parseESLintErrors(errorOutput: string): CodeQualityIssue[] {
  const issues: CodeQualityIssue[] = [];
  const errorRegex = /(.+?):(\d+):(\d+): (error|warning) (.+?) \[(.+?)\]/g;
  
  let match;
  while ((match = errorRegex.exec(errorOutput)) !== null) {
    const [, filePath, line, column, severity, message, ruleName] = match;
    
    issues.push({
      filePath: filePath.trim(),
      issueType: 'eslint',
      severity: severity as 'error' | 'warning',
      line: parseInt(line),
      column: parseInt(column),
      message: message.trim(),
      ruleName: ruleName.trim(),
    });
  }
  
  return issues;
}

/**
 * Store code quality issues in database
 */
export async function storeCodeQualityIssues(issues: CodeQualityIssue[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    const records = issues.map(issue => ({
      user_id: user.id,
      file_path: issue.filePath,
      issue_type: issue.issueType,
      severity: issue.severity,
      line_number: issue.line,
      column_number: issue.column,
      message: issue.message,
      rule_name: issue.ruleName,
    }));

    // Use type assertion for unsynced table
    const { error } = await supabase
      .from('code_quality_issues' as 'tasks')
      .insert(records as never);

    if (error) {
      console.error('Failed to store quality issues:', error);
    }
  } catch (error) {
    console.error('Error storing quality issues:', error);
  }
}

/**
 * Request AI to fix code quality issues
 */
export async function selfHealCode(
  filePath: string,
  fileContent: string,
  errors: CodeQualityIssue[],
  repoContext?: string
): Promise<SelfHealingResult> {
  try {
    const { data, error } = await supabase.functions.invoke('self-heal-code', {
      body: {
        filePath,
        fileContent,
        errors: errors.map(e => ({
          line: e.line,
          column: e.column,
          message: e.message,
          rule: e.ruleName,
        })),
        issueType: errors[0]?.issueType || 'typescript',
        repoContext,
      },
    });

    if (error) {
      console.error('Failed to self-heal code:', error);
      return {
        success: false,
        errorsFixed: 0,
        error: error.message,
      };
    }

    return {
      success: true,
      fixedCode: data.fixedCode,
      errorsFixed: data.errorsFixed,
    };
  } catch (error) {
    console.error('Error in self-heal:', error);
    return {
      success: false,
      errorsFixed: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get unfixed quality issues
 */
export async function getUnfixedIssues(): Promise<CodeQualityIssueRecord[]> {
  try {
    // Query tasks table and filter for code quality issues
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch unfixed issues:', error);
      return [];
    }

    // Filter for code quality tasks
    return (data || [])
      .filter((t): t is typeof t => t.metadata && typeof t.metadata === 'object' && 'issue_type' in (t.metadata as object))
      .map(t => t as unknown as CodeQualityIssueRecord);
  } catch (error) {
    console.error('Error fetching unfixed issues:', error);
    return [];
  }
}

/**
 * Enable stricter TypeScript rules incrementally
 */
export const stricterRulesConfig = {
  phase1: {
    name: 'Enable strictNullChecks',
    tsconfig: {
      strictNullChecks: true,
    },
  },
  phase2: {
    name: 'Enable noImplicitAny',
    tsconfig: {
      strictNullChecks: true,
      noImplicitAny: true,
    },
  },
  phase3: {
    name: 'Enable strict mode',
    tsconfig: {
      strict: true,
    },
  },
};
