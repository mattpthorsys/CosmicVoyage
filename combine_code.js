const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { globSync } = require('glob'); // Use globSync for simplicity here

const outputFile = 'combined_code.txt';
const excludeDirs = ['node_modules', '.git', 'dist', '.vite', '.cache'];
const includeExtensions = [
    'ts', 'tsx', 'js', 'jsx', // Added js/jsx just in case
    'json', 'html', 'css', 'scss', 'md'
];
// Special files like vite.config.*
const includeFiles = ['vite.config.ts', 'vite.config.js']; // Add variants if needed

console.log('Generating project code snapshot (Node.js version)...');

// Helper function to run commands and capture output safely
function runCommand(command) {
    try {
        // Increase buffer size if commands output a lot (like git diff or npm audit)
        const output = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        return output.trim();
    } catch (error) {
        console.error(`Error running command "${command}":`, error.stderr || error.message || error);
        // Return specific error message or N/A based on command context
        if (command.startsWith('git')) return `N/A (Git command failed: ${command})`;
        if (command.startsWith('npm audit')) return `N/A (npm audit failed)`;
        if (command.startsWith('npx vite')) return `N/A (vite command failed)`;
        return 'N/A (Command failed)';
    }
}

// --- Environment & Tooling Info ---
console.log('(Gathering environment info...)');
const nodeVersion = runCommand('node -v');
const npmVersion = runCommand('npm -v');
const viteVersion = runCommand('npx vite --version'); // Assumes vite is locally installed
console.log('(Running npm audit --summary...)');
// npm audit can return non-zero exit code even on success with vulnerabilities, capture output regardless
const auditSummary = runCommand('npm audit --summary');

// --- Git Pre-check & Fetch ---
const isGitRepo = fs.existsSync('.git');
let gitFetchWarning = '';
if (isGitRepo) {
    console.log("(Fetching latest remote Git info from 'origin'...)");
    try {
        execSync('git fetch origin', { stdio: 'pipe' }); // Use pipe to suppress fetch output unless error
    } catch (error) {
        gitFetchWarning = "Warning: 'git fetch origin' failed. Remote info might be stale.";
        console.error(gitFetchWarning);
    }
} else {
    console.log('Warning: Not running inside a Git repository. Git-related info will be N/A.');
}

// --- Metadata Collection ---
const currentDateTime = new Date().toLocaleString('en-CA', { timeZoneName: 'short' }); // Or customize format

// Directory Listing (Basic - adjust if needed)
console.log('(Gathering directory listing...)');
let dirListing = 'N/A';
try {
    dirListing = fs.readdirSync('.', { withFileTypes: true })
        .map(dirent => `${dirent.isDirectory() ? 'd' : '-'} ${dirent.name}`)
        .join('\n');
} catch (e) {
    dirListing = 'N/A (Error reading directory)';
}


// --- Git Metadata ---
let remotePushUrl = 'N/A (Not a Git repo)';
let latestCommitInfo = 'N/A (Not a Git repo)';
let remoteCommitInfo = 'N/A (Not a Git repo)';
let upstreamRefName = 'N/A';
let syncStatus = 'N/A (Not a Git repo)';
let recentLog = 'N/A (Not a Git repo)';
let diffOutput = 'N/A (Not a Git repo)';
const diffOutputWarning = "(Note: Full diff output below can be large.)";

if (isGitRepo) {
    remotePushUrl = runCommand('git remote get-url --push origin') || 'N/A (origin push URL not set)';
    latestCommitInfo = runCommand('git log -1 --pretty="format:Hash ----> %H%nSubject -> %s"');
    recentLog = runCommand('git log -n 5 --pretty=oneline');

    // Determine upstream branch (simplified logic compared to bash, might need refinement)
    let upstreamRef = runCommand(`git rev-parse --abbrev-ref --symbolic-full-name "@{u}"`);
    if (upstreamRef.startsWith('N/A')) { // If symbolic ref failed
         if (runCommand('git show-ref --quiet refs/remotes/origin/main') !== 'N/A (Git command failed: git show-ref --quiet refs/remotes/origin/main)') upstreamRef = 'origin/main';
         else if (runCommand('git show-ref --quiet refs/remotes/origin/master') !== 'N/A (Git command failed: git show-ref --quiet refs/remotes/origin/master)') upstreamRef = 'origin/master';
         else upstreamRef = '';
    }
     upstreamRefName = upstreamRef || 'N/A (Upstream not found)';


    if (upstreamRef) {
        remoteCommitInfo = runCommand(`git log "${upstreamRef}" -1 --pretty="format:Hash ----> %H%nSubject -> %s"`);

        const counts = runCommand(`git rev-list --left-right --count HEAD...${upstreamRef}`);
        if (counts && !counts.startsWith('N/A')) {
            const [ahead, behind] = counts.split('\t').map(Number);
            if (ahead === 0 && behind === 0) syncStatus = `In sync with ${upstreamRefName}`;
            else if (ahead > 0 && behind === 0) syncStatus = `${ahead} commit(s) ahead of ${upstreamRefName}`;
            else if (ahead === 0 && behind > 0) syncStatus = `${behind} commit(s) behind ${upstreamRefName}`;
            else syncStatus = `${ahead} commit(s) ahead, ${behind} commit(s) behind ${upstreamRefName} (Diverged)`;
        } else {
            syncStatus = `N/A (Could not compare HEAD with ${upstreamRefName})`;
        }

        diffOutput = runCommand(`git diff "${upstreamRef}"`);
         // Check if diff is empty using a simple length check after ensuring it wasn't an error
        if (diffOutput === '') { // Simple check, assumes empty string means no diff if command succeeded
            diffOutput = `(No differences compared to ${upstreamRefName})`;
        } else if (diffOutput.startsWith('N/A')) {
             diffOutput = `(Could not compute differences against ${upstreamRefName})`;
        }

    } else {
        remoteCommitInfo = 'N/A (Upstream branch not found/configured)';
        syncStatus = 'N/A (Upstream branch not found/configured)';
        diffOutput = 'N/A (Upstream branch not found/configured)';
    }
}

// --- File Generation ---
console.log(`Writing snapshot to ${outputFile}...`);

let outputContent = `--- Project Code Snapshot ---
Generated: ${currentDateTime}
${gitFetchWarning ? '\n' + gitFetchWarning + '\n' : ''}
--- Environment & Tools ---
Node.js: ${nodeVersion}
npm:     ${npmVersion}
Vite:    ${viteVersion}

--- Git Repository Info ---
Repository Push URL (origin): ${remotePushUrl}
Local HEAD Commit:
${latestCommitInfo}
Remote HEAD Commit (${upstreamRefName}):
${remoteCommitInfo}
Sync Status: ${syncStatus}

--- Recent Commits (Last 5) ---
${recentLog}

--- Dependency Audit Summary ---
${auditSummary}

--- Directory Listing (Project Root) ---
${dirListing}

--- Code Differences vs ${upstreamRefName} ---
${diffOutputWarning}
${diffOutput}

--- Source Code Files ---

`;

// Append file contents
console.log('Finding and appending source files...');

const globPattern = `**/*.{${includeExtensions.join(',')}}`;
const filesToInclude = globSync(globPattern, {
    ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.vite/**',
        '**/.cache/**'
        // Add other specific files/dirs from .gitignore if needed
    ],
    nodir: true, // Only match files
    dot: false   // Don't match dotfiles unless explicitly included
});

// Add specific files like vite.config.js/ts if they exist
includeFiles.forEach(f => {
    if (fs.existsSync(f) && !filesToInclude.includes(f)) {
        filesToInclude.push(f);
    }
});


filesToInclude.forEach(file => {
    console.log(`  Adding: ${file}`);
    const relativePath = path.relative('.', file).replace(/\\/g, '/'); // Use relative path with forward slashes
    try {
        const content = fs.readFileSync(file, 'utf8');
        outputContent += `==================================================\n`;
        outputContent += `FILE: ${relativePath}\n`;
        outputContent += `==================================================\n\n`;
        outputContent += content;
        outputContent += `\n\n`; // Add newline after file content
    } catch (readError) {
        outputContent += `==================================================\n`;
        outputContent += `FILE: ${relativePath}\n`;
        outputContent += `==================================================\n\n`;
        outputContent += `!!! Error reading file: ${readError.message} !!!\n\n`;
        console.error(`  Error reading ${file}:`, readError.message);
    }
});

try {
    fs.writeFileSync(outputFile, outputContent);
    console.log(`Done. Output saved to ${outputFile}`);
} catch (writeError) {
    console.error(`!!! Failed to write output file "${outputFile}":`, writeError.message);
}