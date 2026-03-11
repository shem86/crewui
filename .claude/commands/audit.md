# Dependency Audit Command

Audit and update vulnerable dependencies in this CrewUI project.

## Steps

1. Run `npm audit` to identify vulnerabilities
2. Review the severity levels (critical, high, moderate, low)
3. For each vulnerability:
   - Check if `npm audit fix` can resolve it automatically
   - For breaking changes, evaluate if the update is safe by checking changelogs
   - Test that `npm run build` and `npm run test` pass after updates
4. If manual intervention is needed, update package.json and run `npm install`
5. Summarize what was fixed and any remaining issues that need manual review
