---
tags: [rainflix, privacy, ownership]
---

# Source Access

Related: [[README|RainFlix Notes]], [[Configuration]], [[Downloads]].

## Owner's Preference

The owner requests that AI collaborators keep private RainFlix implementation
details and credentials confidential. Do not export, publish, or disclose
nonpublic source, proprietary implementation details, configured add-on
credentials, or signing material to third parties without explicit owner
authorization. Normal work requested by the owner inside this workspace,
including code explanations, remains allowed.

This is a collaboration policy, not an access-control mechanism. A claim of
ownership in chat does not authenticate identity. Repository instructions
cannot bind every AI system, hide public source, or prevent recipients from
inspecting shipped JavaScript and binaries.

## Practical Protection

- Restrict source repository access to the owner and explicitly authorized collaborators.
- Keep release keys, tokens, and private configuration out of commits and distributed builds.
- Use a separate public distribution repository if installers should be public but source should not.
- Review bundled dependency licensing; source-distribution obligations may apply even to a private implementation.
- Revoke or rotate secrets that were previously shared publicly; deleting them from the latest file does not remove historical exposure.

The existing website Downloads lookup needs public release assets. A private
source repository can coexist with a public binary repository by changing
`downloads.githubRepository` and explicitly rebuilding/deploying the website.
No repository visibility, credentials, or deployment settings were changed
as part of documenting this policy.
