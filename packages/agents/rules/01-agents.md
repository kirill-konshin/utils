# Agent Task Management

ALWAYS create tasks and subtasks for any non-trivial work to ensure progress is visible and trackable. This includes:

- Breaking down complex requests into individual subtasks
- Creating a task for each file or component that needs to be modified
- Marking tasks as IN_PROGRESS when starting work and COMPLETE when finished
- Adding new subtasks as they are discovered during work

Do not wait for the user to ask for task tracking - proactively use task management tools.

# Build and Test Verification

ALWAYS verify that the package builds successfully and tests pass after making changes:

1. Run the package build using your project's build system
2. Run the package tests using your project's test runner
3. You may use grep or similar filtering to limit tests when you are confident the filter covers all relevant tests
4. If in doubt about test coverage, the final verification step should be to run all tests in the affected package

Do not consider work complete until build and tests pass.
