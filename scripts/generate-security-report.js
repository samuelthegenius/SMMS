/**
 * Security Report Generator
 * Generates comprehensive security reports from scan results
 */

const fs = require('fs');
const path = require('path');

class SecurityReportGenerator {
  constructor() {
    this.reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0
      },
      categories: {
        dependencies: { issues: [], score: 0 },
        codeQuality: { issues: [], score: 0 },
        secrets: { issues: [], score: 0 },
        configuration: { issues: [], score: 0 },
        headers: { issues: [], score: 0 },
        ssl: { issues: [], score: 0 }
      }
    };
  }

  /**
   * Generate HTML security report
   */
  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMMS Security Report - ${new Date().toLocaleDateString()}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 2em; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 30px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #6c757d; }
        .metric.critical { border-left-color: #dc3545; }
        .metric.high { border-left-color: #fd7e14; }
        .metric.medium { border-left-color: #ffc107; }
        .metric.low { border-left-color: #28a745; }
        .metric h3 { margin: 0 0 10px 0; font-size: 2em; }
        .metric p { margin: 0; color: #6c757d; }
        .content { padding: 0 30px 30px; }
        .category { margin-bottom: 30px; }
        .category h2 { color: #495057; border-bottom: 2px solid #e9ecef; padding-bottom: 10px; }
        .issue { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; margin-bottom: 10px; }
        .issue.critical { border-left: 4px solid #dc3545; }
        .issue.high { border-left: 4px solid #fd7e14; }
        .issue.medium { border-left: 4px solid #ffc107; }
        .issue.low { border-left: 4px solid #28a745; }
        .issue-title { font-weight: 600; margin-bottom: 5px; }
        .issue-description { color: #6c757d; margin-bottom: 10px; }
        .issue-recommendation { background: #e7f5ff; padding: 10px; border-radius: 4px; font-size: 0.9em; }
        .score { float: right; background: #6c757d; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        .score.good { background: #28a745; }
        .score.warning { background: #ffc107; }
        .score.danger { background: #dc3545; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; border-radius: 0 0 8px 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 SMMS Security Report</h1>
            <p>Generated on ${new Date().toLocaleString()} | Mountain Top University Smart Maintenance System</p>
        </div>
        
        <div class="summary">
            <div class="metric critical">
                <h3>${this.reportData.summary.criticalIssues}</h3>
                <p>Critical Issues</p>
            </div>
            <div class="metric high">
                <h3>${this.reportData.summary.highIssues}</h3>
                <p>High Issues</p>
            </div>
            <div class="metric medium">
                <h3>${this.reportData.summary.mediumIssues}</h3>
                <p>Medium Issues</p>
            </div>
            <div class="metric low">
                <h3>${this.reportData.summary.lowIssues}</h3>
                <p>Low Issues</p>
            </div>
        </div>
        
        <div class="content">
            ${this.generateCategoryHTML()}
        </div>
        
        <div class="footer">
            <p>This report was generated automatically. Review and address issues according to your security policies.</p>
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync('security-report.html', html);
    console.log('✅ Security report generated: security-report.html');
  }

  /**
   * Generate HTML for each category
   */
  generateCategoryHTML() {
    let html = '';
    
    for (const [category, data] of Object.entries(this.reportData.categories)) {
      const scoreClass = data.score >= 80 ? 'good' : data.score >= 60 ? 'warning' : 'danger';
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      
      html += `
        <div class="category">
            <h2>${categoryName} <span class="score ${scoreClass}">${data.score}/100</span></h2>
            ${data.issues.map(issue => this.generateIssueHTML(issue)).join('')}
        </div>
      `;
    }
    
    return html;
  }

  /**
   * Generate HTML for individual issues
   */
  generateIssueHTML(issue) {
    return `
      <div class="issue ${issue.severity}">
        <div class="issue-title">${issue.title}</div>
        <div class="issue-description">${issue.description}</div>
        <div class="issue-recommendation">
            <strong>Recommendation:</strong> ${issue.recommendation}
        </div>
      </div>
    `;
  }

  /**
   * Load and analyze scan results
   */
  async loadScanResults() {
    // Load dependency scan results
    try {
      const auditResult = this.runCommand('npm audit --json');
      const auditData = JSON.parse(auditResult);
      this.analyzeDependencies(auditData);
    } catch (error) {
      console.log('Dependency scan failed:', error.message);
    }

    // Load secrets scan results
    try {
      if (fs.existsSync('security-scan-results.json')) {
        const secretsData = JSON.parse(fs.readFileSync('security-scan-results.json', 'utf8'));
        this.analyzeSecrets(secretsData);
      }
    } catch (error) {
      console.log('Secrets scan failed:', error.message);
    }

    // Analyze code quality
    this.analyzeCodeQuality();

    // Analyze configuration
    this.analyzeConfiguration();
  }

  /**
   * Analyze dependency vulnerabilities
   */
  analyzeDependencies(auditData) {
    const vulnerabilities = auditData.vulnerabilities || [];
    
    vulnerabilities.forEach(vuln => {
      this.addIssue('dependencies', {
        title: `Dependency Vulnerability: ${vuln.package}`,
        description: `${vuln.title} - Severity: ${vuln.severity}`,
        severity: this.mapSeverity(vuln.severity),
        recommendation: `Update ${vuln.package} to version ${vuln.fixAvailable?.version || 'latest'}`
      });
    });

    const score = Math.max(0, 100 - (vulnerabilities.length * 10));
    this.reportData.categories.dependencies.score = score;
  }

  /**
   * Analyze secrets detection results
   */
  analyzeSecrets(secretsData) {
    if (Array.isArray(secretsData)) {
      secretsData.forEach(secret => {
        this.addIssue('secrets', {
          title: `Potential secret detected: ${secret.type || 'Unknown'}`,
          description: `Found in ${secret.file} at line ${secret.line}`,
          severity: 'critical',
          recommendation: 'Remove secret from code and use environment variables or secret management'
        });
      });
    }

    this.reportData.categories.secrets.score = secretsData.length === 0 ? 100 : 0;
  }

  /**
   * Analyze code quality
   */
  analyzeCodeQuality() {
    // Check for common security anti-patterns
    const securityPatterns = [
      {
        pattern: /dangerouslySetInnerHTML/,
        title: 'Use of dangerouslySetInnerHTML',
        severity: 'high',
        recommendation: 'Use safe HTML sanitization libraries instead'
      },
      {
        pattern: /eval\(/,
        title: 'Use of eval() function',
        severity: 'critical',
        recommendation: 'Avoid eval() and use safer alternatives'
      },
      {
        pattern: /innerHTML\s*=/,
        title: 'Direct innerHTML assignment',
        severity: 'medium',
        recommendation: 'Use textContent or safe HTML manipulation'
      }
    ];

    const files = this.getAllFiles('src', ['.js', '.jsx', '.ts', '.tsx']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      securityPatterns.forEach(({ pattern, title, severity, recommendation }) => {
        if (pattern.test(content)) {
          this.addIssue('codeQuality', {
            title,
            description: `Found in ${file}`,
            severity,
            recommendation
          });
        }
      });
    });

    const issueCount = this.reportData.categories.codeQuality.issues.length;
    this.reportData.categories.codeQuality.score = Math.max(0, 100 - (issueCount * 15));
  }

  /**
   * Analyze configuration security
   */
  analyzeConfiguration() {
    // Check CSP configuration
    const indexHtml = fs.readFileSync('index.html', 'utf8');
    if (!indexHtml.includes('Content-Security-Policy')) {
      this.addIssue('configuration', {
        title: 'Missing Content Security Policy',
        description: 'No CSP header found in index.html',
        severity: 'high',
        recommendation: 'Implement a strict CSP policy to prevent XSS attacks'
      });
    }

    // Check for HTTPS enforcement
    if (!indexHtml.includes('Strict-Transport-Security')) {
      this.addIssue('configuration', {
        title: 'Missing HSTS header',
        description: 'No HSTS header found for HTTPS enforcement',
        severity: 'medium',
        recommendation: 'Add HSTS header to enforce HTTPS connections'
      });
    }

    const issueCount = this.reportData.categories.configuration.issues.length;
    this.reportData.categories.configuration.score = Math.max(0, 100 - (issueCount * 20));
  }

  /**
   * Add issue to report
   */
  addIssue(category, issue) {
    this.reportData.categories[category].issues.push(issue);
    this.reportData.summary.totalIssues++;
    this.reportData.summary[`${issue.severity}Issues`]++;
  }

  /**
   * Map npm audit severity to our severity levels
   */
  mapSeverity(severity) {
    const mapping = {
      'critical': 'critical',
      'high': 'high',
      'moderate': 'medium',
      'low': 'low'
    };
    return mapping[severity] || 'medium';
  }

  /**
   * Get all files with specific extensions
   */
  getAllFiles(dir, extensions) {
    const files = [];
    
    function traverse(currentDir) {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      });
    }
    
    traverse(dir);
    return files;
  }

  /**
   * Run shell command and return output
   */
  runCommand(command) {
    const { execSync } = require('child_process');
    return execSync(command, { encoding: 'utf8' });
  }

  /**
   * Generate complete security report
   */
  async generateReport() {
    console.log('🔍 Starting security scan...');
    
    await this.loadScanResults();
    this.generateHTMLReport();
    
    console.log(`✅ Security scan complete!`);
    console.log(`📊 Summary: ${this.reportData.summary.totalIssues} issues found`);
    console.log(`   Critical: ${this.reportData.summary.criticalIssues}`);
    console.log(`   High: ${this.reportData.summary.highIssues}`);
    console.log(`   Medium: ${this.reportData.summary.mediumIssues}`);
    console.log(`   Low: ${this.reportData.summary.lowIssues}`);
  }
}

// Run the security scan
if (require.main === module) {
  const generator = new SecurityReportGenerator();
  generator.generateReport().catch(console.error);
}

module.exports = SecurityReportGenerator;
