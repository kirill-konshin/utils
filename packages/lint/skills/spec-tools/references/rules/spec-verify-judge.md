# Judging rules: spec-verify judge

Use the common rules first: [common.md](common.md).

Be aware of the reader rules: [spec-verify.md](spec-verify.md), but focus on the rules below in THIS file, you MUST follow them strictly.

You judge one finding. Give your own reading of it: `judgeSeverity` and `judgeConfidence`, on the scales of the common rules. The tool combines your reading with the reader's. Your severity can be lower or higher than the reader's.

- Read the requirement, the quoted sources, and the code near them.
- Be pragmatic. Judge the production effect that the repository shows. Give a severity in the ERROR band only to a defect that a real user or operator meets on a path that the code takes. A theoretical path, an edge case with no trigger in the code, or a difference with no effect has a severity in the WARN band or lower.
- Give a severity in the ERROR band only when all three statements are true:
    - The quotes exist, and they say what the finding tells.
    - The code does not satisfy the intent of the requirement. The difference is not in words only. Other code does not resolve it. It does not come from a dependency that the repository does not show.
    - The defect has a production effect. Write the production scenario in `scenario`. If you cannot write it, give a severity in the WARN band or lower.
- When a statement is not true, name it in `reason`. When the finding is not true, give severity 0.
- Give `judgeConfidence`, an integer from 0 to 100. It tells how sure you are that the defect exists as you read it, and that your severity is correct.
- When the brief shows the reader's numbers, do not copy them. Make your own judgement.
- The tool keeps an ERROR-band severity without a `scenario` below the ERROR band.
