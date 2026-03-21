const fs = require("fs");

const replaceInFile = (filePath) => {
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;

  const rules = [
    {
      from: /"(\.\.\/)+src\/(.*?)"/g,
      to: (match, dots, rest) => `"${dots}packages/app-core/src/${rest}"`,
    },
    {
      from: /'(\.\.\/)+src\/(.*?)'/g,
      to: (match, dots, rest) => `'${dots}packages/app-core/src/${rest}'`,
    },
  ];

  for (const rule of rules) {
    if (content.match(rule.from)) {
      content = content.replace(rule.from, rule.to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log("Updated " + filePath);
  }
};

const walk = (dir) => {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const path = dir + "/" + file.name;
    if (
      file.isDirectory() &&
      file.name !== "node_modules" &&
      file.name !== "dist" &&
      file.name !== ".git"
    ) {
      walk(path);
    } else if (
      file.isFile() &&
      (path.endsWith(".ts") ||
        path.endsWith(".tsx") ||
        path.endsWith(".js") ||
        path.endsWith(".html"))
    ) {
      replaceInFile(path);
    }
  }
};

walk("apps");
walk("test");
walk("scripts");
walk("packages/ui");

// Also update milady entry
replaceInFile("milady.mjs");
console.log("Done!");
