/**
 * Simple Security Scanner
 * Runs basic security checks without requiring external services
 */

const fs = require('fs');
const path = require('path');

class SimpleSecurityScanner {
  constructor() {
    this.issues = [];
    this.scanResults = {
      timestamp: new Date().toISOString(),
      totalIssues: 0,
      categories: {
        secrets: [],
        xss: [],
        sql: [],
        insecure: [],
        config: []
      }
    };
  }

  /**
   * Scan for potential secrets in source code
   */
  scanForSecrets() {
    console.log('🔍 Scanning for potential secrets...');
    
    const secretPatterns = [
      /password\s*=\s*['"][^'"]{8,}['"]/, // password = "something"
      /api[_-]?key\s*=\s*['"][^'"]{20,}['"]/, // api_key = "longstring"
      /secret[_-]?key\s*=\s*['"][^'"]{20,}['"]/, // secret_key = "longstring"
      /token\s*=\s*['"][^'"]{20,}['"]/, // token = "longstring"
      /sk-[a-zA-Z0-9]{48}/, // Stripe keys
      /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access tokens
      /xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/, // Slack bot tokens
      /[A-Z0-9]{20}:/ // Basic auth pattern
    ];

    const files = this.getAllFiles('src', ['.js', '.jsx', '.ts', '.tsx', '.json']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        secretPatterns.forEach(pattern => {
          const match = line.match(pattern);
          if (match) {
            this.addIssue('secrets', {
              file,
              line: index + 1,
              type: 'potential-secret',
              match: match[0],
              severity: 'high'
            });
          }
        });
      });
    });
  }

  /**
   * Scan for XSS vulnerabilities
   */
  scanForXSS() {
    console.log('🔍 Scanning for XSS vulnerabilities...');
    
    const xssPatterns = [
      /dangerouslySetInnerHTML/,
      /innerHTML\s*=/,
      /outerHTML\s*=/,
      /document\.write/,
      /eval\s*\([^)]*['"`]/,
      /Function\s*\([^)]*['"`]/,
      /setTimeout\s*\(\s*['"`]/,
      /setInterval\s*\(\s*['"`]/
    ];

    const files = this.getAllFiles('src', ['.js', '.jsx', '.ts', '.tsx']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        xssPatterns.forEach(pattern => {
          const match = line.match(pattern);
          if (match && !line.includes('//') && !line.includes('*')) {
            this.addIssue('xss', {
              file,
              line: index + 1,
              type: 'xss-risk',
              match: match[0],
              severity: pattern.test(/dangerouslySetInnerHTML|eval|Function/) ? 'high' : 'medium'
            });
          }
        });
      });
    });
  }

  /**
   * Scan for SQL injection patterns
   */
  scanForSQLInjection() {
    console.log('🔍 Scanning for SQL injection patterns...');
    
    const sqlPatterns = [
      /SELECT.*FROM.*WHERE.*\+/i,
      /INSERT.*INTO.*\+/i,
      /UPDATE.*SET.*\+/i,
      /DELETE.*FROM.*\+/i,
      /DROP.*TABLE/i,
      /UNION.*SELECT/i,
      /['"]\s*\+\s*['"]\s*\+/,
      /\$\{.*\}.*\+/i
    ];

    const files = this.getAllFiles('src', ['.js', '.jsx', '.ts', '.tsx']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        sqlPatterns.forEach(pattern => {
          const match = line.match(pattern);
          if (match && !line.includes('//') && !line.includes('*')) {
            this.addIssue('sql', {
              file,
              line: index + 1,
              type: 'sql-injection-risk',
              match: match[0],
              severity: 'medium'
            });
          }
        });
      });
    });
  }

  /**
   * Scan for insecure configurations
   */
  scanForInsecureConfig() {
    console.log('🔍 Scanning for insecure configurations...');
    
    // Check CSP
    const indexHtml = fs.readFileSync('index.html', 'utf8');
    if (!indexHtml.includes('Content-Security-Policy')) {
      this.addIssue('config', {
        file: 'index.html',
        type: 'missing-csp',
        message: 'Content Security Policy not found',
        severity: 'high'
      });
    }

    if (indexHtml.includes('unsafe-eval')) {
      this.addIssue('config', {
        file: 'index.html',
        type: 'unsafe-eval-csp',
        message: 'CSP allows unsafe-eval',
        severity: 'medium'
      });
    }

    // Check for hardcoded URLs
    const configFiles = ['src/config/security.js', 'src/lib/supabase.js'];
    configFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('http://localhost')) {
          this.addIssue('config', {
            file,
            type: 'localhost-in-config',
            message: 'Localhost URL found in config',
            severity: 'low'
          });
        }
      }
    });
  }

  /**
   * Get all files with specific extensions
   */
  getAllFiles(dir, extensions) {
    const files = [];
    
    function traverse(currentDir) {
      if (!fs.existsSync(currentDir)) return;
      
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
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
   * Add issue to results
   */
  addIssue(category, issue) {
    this.scanResults.categories[category].push(issue);
    this.scanResults.totalIssues++;
  }

  /**
   * Generate report
   */
  generateReport() {
    console.log('\n📊 Security Scan Results');
    console.log('========================');
    console.log(`Total Issues Found: ${this.scanResults.totalIssues}`);
    
    Object.entries(this.scanResults.categories).forEach(([category, issues]) => {
      if (issues.length > 0) {
        console.log(`\n${category.toUpperCase()} (${issues.length}):`);
        issues.forEach(issue => {
          const severity = issue.severity.toUpperCase();
          const location = issue.file ? `${issue.file}:${issue.line || ''}` : issue.file;
          console.log(`  [${severity}] ${location} - ${issue.message || issue.type}`);
          if (issue.match) {
            console.log(`    Match: ${issue.match}`);
          }
        });
      }
    });

    // Generate HTML report
    this.generateHTMLReport();
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Scan Report - ${new Date().toLocaleDateString()}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .summary { padding: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .content { padding: 0 30px 30px; }
        .category { margin-bottom: 30px; }
        .category h2 { color: #495057; border-bottom: 2px solid #e9ecef; padding-bottom: 10px; }
        .issue { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; margin-bottom: 10px; }
        .issue.high { border-left: 4px solid #dc3545; }
        .issue.medium { border-left: 4px solid #ffc107; }
        .issue.low { border-left: 4px solid #28a745; }
        .issue-title { font-weight: 600; margin-bottom: 5px; }
        .issue-details { color: #6c757d; font-family: monospace; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Security Scan Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>${this.scanResults.totalIssues}</h3>
                <p>Total Issues</p>
            </div>
            <div class="metric">
                <h3>${this.scanResults.categories.secrets.length}</h3>
                <p>Potential Secrets</p>
            </div>
            <div class="metric">
                <h3>${this.scanResults.categories.xss.length}</h3>
                <p>XSS Risks</p>
            </div>
            <div class="metric">
                <h3>${this.scanResults.categories.config.length}</h3>
                <p>Config Issues</p>
            </div>
        </div>
        
        <div class="content">
            ${Object.entries(this.scanResults.categories).map(([category, issues]) => 
              issues.length > 0 ? `
                <div class="category">
                    <h2>${category.charAt(0).toUpperCase() + category.slice(1)}</h2>
                    ${issues.map(issue => `
                        <div class="issue ${issue.severity}">
                            <div class="issue-title">${issue.type}</div>
                            <div class="issue-details">
                                ${issue.file ? `File: ${issue.file}${issue.line ? `:${issue.line}` : ''}` : ''}
                                ${issue.match ? `<br>Match: ${issue.match}` : ''}
                                ${issue.message ? `<br>${issue.message}` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
              ` : ''
            ).join('')}
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync('security-scan-report.html', html);
    console.log('\n✅ HTML report generated: security-scan-report.html');
  }

  /**
   * Run complete scan
   */
  runScan() {
    console.log('🚀 Starting security scan...\n');
    
    this.scanForSecrets();
    this.scanForXSS();
    this.scanForSQLInjection();
    this.scanForInsecureConfig();
    
    this.generateReport();
    
    console.log('\n🎉 Security scan complete!');
    
    if (this.scanResults.totalIssues === 0) {
      console.log('✅ No security issues found!');
    } else {
      console.log(`⚠️  Found ${this.scanResults.totalIssues} issues that need attention.`);
    }
  }
}

// Run the scan
if (require.main === module) {
  const scanner = new SimpleSecurityScanner();
  scanner.runScan();
}

module.exports = SimpleSecurityScanner;
