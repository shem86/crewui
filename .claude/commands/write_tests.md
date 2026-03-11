# Write Tests Command

Write tests for components or utilities in this CrewUI project.

## Steps

1. Identify the file(s) to test based on user input or recent changes
2. Create test file in a colocated `__tests__/` directory with `.test.ts` or `.test.tsx` extension
3. Use the project's testing stack:
   - **Vitest** for test runner and assertions
   - **React Testing Library** for component tests
   - **jsdom** environment (already configured)
4. Write tests covering:
   - Happy path functionality
   - Edge cases and error states
   - User interactions for components
5. Run `npm run test` to verify tests pass
6. If tests fail, fix issues and re-run until passing
7. Summarize what was tested and coverage added
