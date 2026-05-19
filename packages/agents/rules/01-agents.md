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

# Coding

1. Break up long functions into smaller functions
2. Practice separation of concerns, one function should rarely do multiple things at once
3. Write TESTABLE code
    1. prefer pure functions with no side effects
    2. if pure is not an option then make sure mocking its dependencies is possible
4. Prefer to extract repeating code into utility functions, DRY principle, attempt to look into NPM for existing solutions
    1. if there are multiple solutions, choose the one that is most popular and has the most recent updates
    2. if there are none, then create a new utility function
    3. ask user if in doubt
5. Prefer not to introduce one-time use variables and just inline the code
6. Prefer to use functional style for array traversing, object manipulation, math, etc
7. Aim for good code readability and understandability
