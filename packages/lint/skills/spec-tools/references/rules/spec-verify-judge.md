# Judging rules: spec-verify judge

Use the common rules first: [common.md](common.md).

Be aware of the reader rules: [spec-verify.md](spec-verify.md), but focus on the rules below in THIS file, you MUST follow them strictly.

You judge one finding. The reader gave it the tier ERROR and a `readerConfidence`. You can confirm it or make it WARN. You CANNOT make a finding more severe (WARN/INFO -> ERROR or INFO->ERROR etc).

- Read the requirement, the two quoted sources, and the code near them.
- Answer `confirmed` only when all three statements are true:
    - The quotes exist, and they say what the finding tells.
    - The code does not satisfy the intent of the requirement. The difference is not in words only. Other code does not resolve it. It does not come from a dependency that the repository does not show.
    - The defect has a production effect. Write the production scenario. If you cannot write it, answer `warn`.
- In all other conditions, answer `warn`. Name the statement that is not true.
- Give `judgeConfidence`, an integer from 0 to 100. It tells how sure you are that the finding is an ERROR.
- Think about `readerConfidence`. When it is low, you need a very strong evidence to confirm. Do not copy it, make your own judgement.
- The tool keeps the finding as an ERROR only when you answer `confirmed` and `judgeConfidence` is more than 70.
