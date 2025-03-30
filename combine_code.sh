#!/bin/bash

# This script finds relevant source code files, excludes specified directories,
# adds file markers, and concatenates the content into a single file.
# It also prepends snapshot metadata (date, env, tools, commit, remote, status, audit, log, diff) to the output.

output_file="combined_code.txt" # Define the output filename
diff_output_warning="(Note: Full diff output below can be large. Consider 'git diff --stat' in script for summary)"

echo "Generating project code snapshot..."

# --- Environment & Tooling Info ---
echo "(Gathering environment info...)"
node_version=$(node -v 2>/dev/null || echo "N/A (node command error)")
npm_version=$(npm -v 2>/dev/null || echo "N/A (npm command error)")
# Use npx to ensure project's local vite is checked
vite_version=$(npx vite --version 2>/dev/null || echo "N/A (vite command error)")
# Capture npm audit summary (includes counts and errors if any)
# Redirect stderr to stdout to capture everything npm audit says
# Note: npm audit might exit with non-zero status even with summary, so capture output regardless
echo "(Running npm audit --summary...)"
audit_summary=$(npm audit --summary 2>&1)

# --- Git Pre-check & Fetch ---
if [ ! -d .git ]; then
  echo "Warning: Not running inside a Git repository. Git-related info will be N/A." >&2
  is_git_repo=false
else
  is_git_repo=true
  echo "(Fetching latest remote Git info from 'origin'...)"
  # Run fetch in background to avoid blocking if network is slow? No, keep it simple.
  git fetch origin || echo "Warning: 'git fetch origin' failed. Remote info might be stale." >&2
fi

# --- Metadata Collection ---
current_datetime=$(date '+%Y-%m-%d %H:%M:%S %Z') # Get current date/time

# Directory Listing (root level, show permissions, type, hidden files)
dir_listing=$(ls -lap)

# --- Git Metadata ---
if ! $is_git_repo; then
  remote_push_url="N/A (Not a Git repo)"
  latest_commit_info="N/A (Not a Git repo)"
  remote_commit_info="N/A (Not a Git repo)"
  upstream_ref_name="N/A"
  sync_status="N/A (Not a Git repo)"
  recent_log="N/A (Not a Git repo)"
  diff_output="N/A (Not a Git repo)"
else
  # Get remote push URL
  remote_push_url=$(git remote get-url --push origin 2>/dev/null)
  [ -z "$remote_push_url" ] && remote_push_url="N/A (git remote 'origin' push URL not configured or remote doesn't exist)"

  # Get local commit info
  latest_commit_info=$(git log -1 --pretty="format:Hash ----> %H%nSubject -> %s" 2>/dev/null || echo "Error fetching local commit info")
  [[ "$latest_commit_info" == "Error fetching local commit info" ]] || [ -z "$latest_commit_info" ] && latest_commit_info="N/A (Could not retrieve local commit info)"

  # Get recent commit log
  recent_log=$(git log -n 5 --pretty=oneline 2>/dev/null || echo "N/A (Could not retrieve recent log)")
  [ -z "$recent_log" ] && recent_log="N/A (No commits found or git log error)" # Handle empty log case

  # Determine upstream branch (e.g., origin/main)
  upstream_ref=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
  upstream_ref_name=${upstream_ref:-"N/A"} # Use N/A if empty for display
  if [ -z "$upstream_ref" ]; then
      # Fallback: Check common names if upstream not explicitly set
      if git show-ref --quiet refs/remotes/origin/main; then upstream_ref="origin/main"; upstream_ref_name="origin/main";
      elif git show-ref --quiet refs/remotes/origin/master; then upstream_ref="origin/master"; upstream_ref_name="origin/master";
      else upstream_ref=""; upstream_ref_name="N/A (Upstream not found)"; fi
  fi

  # Get info relative to upstream if found
  if [ -z "$upstream_ref" ]; then
      remote_commit_info="N/A (Upstream branch not found/configured)"
      sync_status="N/A (Upstream branch not found/configured)"
      diff_output="N/A (Upstream branch not found/configured)"
  else
      # Get remote commit info for the determined upstream branch
      remote_commit_info=$(git log "$upstream_ref" -1 --pretty="format:Hash ----> %H%nSubject -> %s" 2>/dev/null || echo "Error fetching remote commit info")
      [[ "$remote_commit_info" == "Error fetching remote commit info" ]] || [ -z "$remote_commit_info" ] && remote_commit_info="N/A (Could not retrieve remote commit info for $upstream_ref_name)"

      # Get sync status (ahead/behind) vs upstream
      count_output=$(git rev-list --left-right --count HEAD..."$upstream_ref" 2>/dev/null)
      if [ -n "$count_output" ]; then
          read -r ahead behind <<< "$count_output"
          if [ "$ahead" -eq 0 ] && [ "$behind" -eq 0 ]; then sync_status="In sync with $upstream_ref_name";
          elif [ "$ahead" -gt 0 ] && [ "$behind" -eq 0 ]; then sync_status="$ahead commit(s) ahead of $upstream_ref_name";
          elif [ "$ahead" -eq 0 ] && [ "$behind" -gt 0 ]; then sync_status="$behind commit(s) behind $upstream_ref_name";
          else sync_status="$ahead commit(s) ahead, $behind commit(s) behind $upstream_ref_name (Diverged)"; fi
      else
          sync_status="N/A (Could not compare HEAD with $upstream_ref_name)"
      fi

      # Get diff output vs upstream
      diff_output=$(git diff "$upstream_ref")
      # Check if diff is empty *and* both refs exist (avoids saying "No diff" if a ref is missing)
      if [ -z "$diff_output" ] && git rev-parse --verify HEAD >/dev/null 2>&1 && git rev-parse --verify "$upstream_ref" >/dev/null 2>&1 ; then
        diff_output="(No differences compared to $upstream_ref_name)"
      elif [ -z "$diff_output" ]; then # Handle cases where diff might be empty because refs don't exist or other errors
        diff_output="(Could not compute differences against $upstream_ref_name)"
      fi
  fi # End upstream_ref check
fi # End .git check

# --- File Generation ---
echo "Writing snapshot to $output_file..."

# Write header information (overwrite the file)
echo "--- Project Code Snapshot ---" > "$output_file"
echo "Generated: $current_datetime" >> "$output_file"
echo "" >> "$output_file"

echo "--- Environment & Tools ---" >> "$output_file"
echo "Node.js: $node_version" >> "$output_file"
echo "npm:     $npm_version" >> "$output_file"
echo "Vite:    $vite_version" >> "$output_file"
echo "" >> "$output_file"

echo "--- Git Repository Info ---" >> "$output_file"
echo "Repository Push URL (origin): $remote_push_url" >> "$output_file"
echo "Local HEAD Commit:" >> "$output_file"; echo "$latest_commit_info" >> "$output_file"
echo "Remote HEAD Commit ($upstream_ref_name):" >> "$output_file"; echo "$remote_commit_info" >> "$output_file"
echo "Sync Status: $sync_status" >> "$output_file"
echo "" >> "$output_file"

echo "--- Recent Commits (Last 5) ---" >> "$output_file"
echo "$recent_log" >> "$output_file"
echo "" >> "$output_file"

echo "--- Dependency Audit Summary ---" >> "$output_file"
echo "$audit_summary" >> "$output_file"
echo "" >> "$output_file"

echo "--- Directory Listing (Project Root) ---" >> "$output_file"
echo "$dir_listing" >> "$output_file"
echo "" >> "$output_file"

echo "--- Code Differences vs $upstream_ref_name ---" >> "$output_file"
echo "$diff_output_warning" >> "$output_file"
echo "$diff_output" >> "$output_file" # Contains the full diff
echo "" >> "$output_file"

echo "--- Source Code Files ---" >> "$output_file"
echo "" >> "$output_file"

echo "Appending source files..."
# Find and append file contents (append to the file)
find . \( -path ./node_modules -o -path ./.git -o -path ./dist -o -path ./.vite -o -path ./.cache \) -prune -o \
-type f \( -name '*.ts' -o -name '*.tsx' -o -name 'vite.config.*' -o -name '*.json' -o -name '*.html' -o -name '*.css' -o -name '*.scss' -o -name '*.md' \) -print0 | \
xargs -0 -I {} sh -c 'echo "=================================================="; echo "FILE: {}"; echo "=================================================="; echo; cat "{}"; echo; echo;' >> "$output_file"

echo "Done. Output saved to $output_file"

exit 0