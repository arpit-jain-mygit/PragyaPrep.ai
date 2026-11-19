# Lets the API call Claude through Amazon Bedrock, for the Ask AI answers.
# Only the Haiku 5.5 model is allowed, in any region Bedrock routes it to (the global profile can use several regions).
# The model's terms must be accepted once in the Bedrock console before this works.

data "aws_iam_policy_document" "bedrock" {
  statement {
    sid     = "InvokeClaudeHaiku"
    actions = ["bedrock:InvokeModel"]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*",
      "arn:aws:bedrock:*:${local.account_id}:inference-profile/*anthropic.claude-haiku-5-5*",
    ]
  }
}

resource "aws_iam_role_policy" "bedrock" {
  name   = "pragyaprep-dev-api-bedrock"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.bedrock.json
}
