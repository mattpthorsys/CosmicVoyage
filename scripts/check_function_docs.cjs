const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/** Recursively returns every TypeScript file beneath the supplied directory. */
function collectTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

/** Returns whether the node has a leading JSDoc documentation block. */
function hasDocumentationComment(sourceText, node) {
  return (ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? []).some((range) =>
    sourceText.slice(range.pos, range.end).startsWith('/**')
  );
}

/** Returns the statement that should carry documentation for a named function value. */
function getNamedFunctionDocumentationNode(node) {
  if (ts.isVariableDeclaration(node)) return node.parent.parent;
  return node;
}

const missingDocumentation = [];

for (const filePath of collectTypeScriptFiles('src')) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  /** Records undocumented function-like declarations in the current source file. */
  function visit(node) {
    const isDeclaration =
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      node.body;

    if (isDeclaration && !hasDocumentationComment(sourceText, node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      missingDocumentation.push(`${filePath}:${position.line + 1}`);
    }

    const hasFunctionInitializer =
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      node.name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));

    if (hasFunctionInitializer) {
      const documentationNode = getNamedFunctionDocumentationNode(node);
      if (!hasDocumentationComment(sourceText, documentationNode)) {
        const position = sourceFile.getLineAndCharacterOfPosition(documentationNode.getStart(sourceFile));
        missingDocumentation.push(`${filePath}:${position.line + 1}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (missingDocumentation.length > 0) {
  console.error('Missing function documentation:');
  console.error(missingDocumentation.join('\n'));
  process.exit(1);
}

console.log('All function and method declarations have documentation comments.');
